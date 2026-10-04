import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'cheerio'

const source = 'https://readthecatholicbibleinayear.wordpress.com/302-2/'
const response = await fetch(source)
if (!response.ok) throw new Error(`Plan download failed: ${response.status}`)
const document = load(await response.text())
const days = new Map()
for (const element of document('.entry-content a').toArray()) {
  const link = document(element)
  const day = link.text().trim().match(/^Day\s+(\d+)$/i)
  if (!day) continue
  let line = ''
  for (let sibling = element.nextSibling; sibling && sibling.name !== 'br'; sibling = sibling.nextSibling) line += document(sibling).text()
  const references = line.trim().replace(/\s*\*Note.*$/i, '').split(/\s*\|\s*/).map((reference) => reference.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim())
  if (Number(day[1]) === 272 && references.length === 2) references.splice(1, 0, null)
  if (references.length !== 3) throw new Error(`Day ${day[1]} does not have three reading slots: ${references}`)
  days.set(Number(day[1]), references.map((reference) => reference.trim()))
}
if (days.size !== 365) throw new Error(`Expected 365 daily readings, found ${days.size}`)
const plan = Array.from({ length: 365 }, (_, index) => days.get(index + 1))
const destination = resolve(import.meta.dirname, '../public/data')
writeFileSync(resolve(destination, 'catholic-source-plan.json'), JSON.stringify(plan))
console.log('First day:', plan[0], 'Last day:', plan.at(-1))
console.log('Book references:', [...new Set(plan.flat().filter(Boolean).map((reference) => reference.replace(/\s+\d.*$/, '')))].join(', '))
const bible = JSON.parse(readFileSync(resolve(destination, 'en.json'), 'utf8'))
console.log('Available English books:', Object.keys(bible).join(', '))