import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'cheerio'

const source = 'https://www.catholicgallery.org/yearly-plan/'
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const days = new Map()
for (const month of months) {
  const response = await fetch(`${source}${month}/`)
  if (!response.ok) throw new Error(`Plan download failed: ${month}: ${response.status}`)
  const document = load(await response.text())
  const content = document('.entry-content')
  content.find('script, style').remove()
  const text = content.text().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ')
  for (const match of text.matchAll(/Day\s+(\d+)\s+Old Testament:\s*(.*?)Psalms:\s*(.*?)New Testament:\s*(.*?)Read Bible in a Year/g)) {
    const oldTestament = match[2].split(/\s*&\s*/)
    const readings = [...oldTestament, match[3], match[4]].map((reference) => reference.trim().replace(/\s+-\s+/g, ' '))
    if (readings.length !== 4) throw new Error(`Expected four readings on day ${match[1]}: ${readings}`)
    days.set(Number(match[1]), readings)
  }
  console.log(`${month}: ${days.size} days imported`)
}
if (days.size !== 365) throw new Error(`Expected 365 days, found ${days.size}`)
const plan = Array.from({ length: 365 }, (_, index) => {
  const readings = days.get(index + 1)
  if (!readings) throw new Error(`Missing day ${index + 1}`)
  return readings
})
writeFileSync(resolve(import.meta.dirname, '../public/data/catholic-plan.json'), JSON.stringify(plan))
console.log('First day:', plan[0], 'Last day:', plan.at(-1))
console.log('Books:', [...new Set(plan.flat().map((reference) => reference.replace(/\s+\d.*$/, '')))].join(', '))