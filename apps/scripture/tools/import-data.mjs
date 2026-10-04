import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const [sourceDirectory, planFile] = process.argv.slice(2)
if (!sourceDirectory || !planFile) throw new Error('Usage: node tools/import-data.mjs <sources directory> <plan.pdf>')
const destination = resolve(import.meta.dirname, '../public/data')
mkdirSync(destination, { recursive: true })
for (const [language, filename] of [['en', 'en-kjva.txt'], ['nl', 'nl-svva.txt']]) {
  const source = readFileSync(resolve(sourceDirectory, filename), 'utf8')
  const books = {}
  for (const section of source.split(/^### /m).slice(1)) {
    const newline = section.indexOf('\n')
    const name = section.slice(0, newline).trim()
    const verses = [...section.slice(newline).matchAll(/\[(\d+):(\d+)\]\s*([\s\S]*?)(?=\[\d+:\d+\]|$)/g)]
    books[name] = verses.map((match) => ({ chapter: Number(match[1]), verse: Number(match[2]), text: match[3].trim().replace(/\s+/g, ' ') })).filter((verse) => verse.text)
  }
  if (!books.Genesis?.some((verse) => verse.chapter === 1 && verse.verse === 1)) throw new Error(`Missing Genesis in ${language}`)
  writeFileSync(resolve(destination, `${language}.json`), JSON.stringify(books))
  console.log(language, Object.entries(books).map(([name, verses]) => `${name}: ${verses.length}`).join(', '))
}
const text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', planFile, '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
const days = new Map()
for (const line of text.split('\n')) {
  for (const match of line.matchAll(/(?:^|\s)(\d{1,3})\.\s+([\s\S]*?)(?=\s+\d{1,3}\.\s+|$)/g)) {
    const readings = match[2].split('\u2610').slice(1).map((value) => value.trim().replaceAll('\u00d0', '-').replaceAll('\u00d1', '-').replaceAll('\u2013', '-').replaceAll('\u2014', '-'))
    if (readings.length !== 4) throw new Error(`Expected four readings on day ${match[1]}: ${match[2]}`)
    days.set(Number(match[1]), readings)
  }
}
if (days.size !== 365) throw new Error(`Expected 365 days, found ${days.size}`)
writeFileSync(resolve(destination, 'plan.json'), JSON.stringify(Array.from({ length: 365 }, (_, index) => days.get(index + 1))))
console.log('Imported 365 days. First day:', days.get(1), 'Last day:', days.get(365))