import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dayForDate, resolveReading, type Bible } from '../src/reading.ts'

const plan: string[][] = JSON.parse(readFileSync(new URL('../public/data/catholic-plan.json', import.meta.url), 'utf8'))
const english: Bible = JSON.parse(readFileSync(new URL('../public/data/en.json', import.meta.url), 'utf8'))
const dutch: Bible = JSON.parse(readFileSync(new URL('../public/data/nl.json', import.meta.url), 'utf8'))

test('365 complete days resolve in both editions without empty source verses', () => {
  assert.equal(plan.length, 365)
  for (const [bible, language] of [[english, 'en'], [dutch, 'nl']] as const) {
    for (const [index, day] of plan.entries()) {
      assert.equal(day.length, 4)
      for (const [section, reference] of day.entries()) {
        const reading = resolveReading(reference, section, bible, language)
        assert.ok(reading.reference, `Day ${index + 1}: ${reference}`)
        assert.ok(reading.verses.length, `Day ${index + 1}: ${reference}`)
        assert.ok(reading.verses.every((verse) => verse.text.length > 0 && !/^[.\u2026]+$/.test(verse.text)))
      }
    }
  }
})
test('Catholic book aliases map correctly, including both short Johannine letters', () => {
  assert.equal(resolveReading('First Kings 1-2', 0, english, 'en').book, 'I Kings')
  const reading = resolveReading('Second John 1, Third John 1', 3, english, 'en')
  assert.deepEqual([...new Set(reading.verses.map((verse) => verse.book))], ['II John', 'III John'])
})
test('Esther additions follow CPDV order instead of substituting standard chapter numbers', () => {
  const beginning = resolveReading('Esther 1-3', 0, english, 'en')
  assert.equal(beginning.reference, 'Additions to Esther 11; Additions to Esther 12; Esther 1')
  assert.equal(beginning.verses[0].book, 'Additions to Esther')
  assert.equal(beginning.verses[0].chapter, 11)
  const ending = resolveReading('Esther 13-15', 0, dutch, 'nl')
  assert.equal(ending.reference, 'Esther (Grieks) 16; Esther 9; Esther 10; Esther (Grieks) 10:4-13')
  assert.equal(ending.verses.at(-1)?.verse, 13)
})
test('Every imported Catholic-canon verse is included over the year', () => {
  for (const [bible, language] of [[english, 'en'], [dutch, 'nl']] as const) {
    const scheduled = plan.flatMap((day) => day.flatMap((reference, index) => resolveReading(reference, index, bible, language).verses))
    for (const book of Object.keys(bible).filter((name) => !['I Esdras', 'II Esdras', 'Prayer of Manasses', 'III Maccabees', 'IV Maccabees', 'Additional Psalm'].includes(name))) {
      const covered = new Set(scheduled.filter((verse) => verse.book === book).map((verse) => `${verse.chapter}:${verse.verse}`))
      const missing = bible[book].filter((verse) => !/^[\s.\u2026]+$/.test(verse.text)).filter((verse) => !covered.has(`${verse.chapter}:${verse.verse}`))
      assert.deepEqual(missing.map((verse) => `${verse.chapter}:${verse.verse}`), [], `${language}: ${book}`)
    }
  }
})
test('Day selection is stable across local dates and bounded to the plan', () => {
  assert.equal(dayForDate('2026-10-04', new Date(2026, 9, 4)), 1)
  assert.equal(dayForDate('2026-10-04', new Date(2026, 9, 5)), 2)
  assert.equal(dayForDate('2026-10-04', new Date(2027, 11, 5)), 365)
  assert.equal(dayForDate('invalid'), 1)
})
test('Dutch Psalm offsets apply independently across chapter boundaries', () => {
  const reading = resolveReading('Psalms 6:7-7:3', 2, dutch, 'nl')
  assert.equal(reading.reference, 'Psalmen 6:8-7:4')
  assert.ok(reading.verses.some((verse) => verse.chapter === 7 && verse.verse === 4))
})
test('Daniel splits and Dutch prayer offsets preserve the scheduled portions', () => {
  assert.equal(resolveReading('Daniel 13:16-36', 1, english, 'en').reference, 'Susanna 1:16-36')
  assert.equal(resolveReading('Daniel 14:13-42', 1, english, 'en').reference, 'Bel and the Dragon 1:13-42')
  assert.equal(resolveReading('Daniel 3:31-55', 1, dutch, 'nl').reference, 'Gebed van Azaria 1:8-31')
  assert.equal(resolveReading('Daniel 3:56-76', 1, dutch, 'nl').reference, 'Gebed van Azaria 1:32-52')
  const firstEnglish = resolveReading('Psalms 7:4-10', 2, english, 'en').verses[0]
  const firstDutch = resolveReading('Psalms 7:4-10', 2, dutch, 'nl').verses[0]
  assert.equal(firstEnglish.location, firstDutch.location)
})