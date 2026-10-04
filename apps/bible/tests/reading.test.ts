import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dayForDate, resolveReading, type Bible } from '../src/reading.ts'

const plan: string[][] = JSON.parse(readFileSync(new URL('../public/data/plan.json', import.meta.url), 'utf8'))
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
        if (!reading.verses.length) assert.match(reading.note, /not in this edition|ontbreekt|not yet been verified|nog niet geverifieerd/, `Day ${index + 1}: ${reference}`)
        assert.ok(reading.verses.every((verse) => verse.text.length > 0))
      }
    }
  }
})
test('Orthodox Kings and Ezra names map to the correct edition books', () => {
  assert.equal(resolveReading('1Kg 1:1-2:17', 0, english, 'en').book, 'I Samuel')
  assert.equal(resolveReading('3Kg 1:1-2:25', 0, english, 'en').book, 'I Kings')
  assert.equal(resolveReading('2Ez 1-3', 0, english, 'en').book, 'Ezra')
})
test('Unverified Septuagint passages are not replaced with arbitrary chapters', () => {
  for (const [original, section] of [['118:1-16', 1], ['6:37-40', 2], ['3Mc 1; 2', 0]] as const) {
    const reading = resolveReading(original, section, english, 'en')
    assert.equal(reading.original, original)
    assert.equal(reading.verses.length, 0)
    assert.match(reading.note, /not yet been verified/)
  }
  assert.ok(resolveReading('2Jn', 3, dutch, 'nl').verses.length)
})
test('Day selection is stable across local dates and bounded to the plan', () => {
  assert.equal(dayForDate('2026-10-04', new Date(2026, 9, 4)), 1)
  assert.equal(dayForDate('2026-10-04', new Date(2026, 9, 5)), 2)
  assert.equal(dayForDate('2026-10-04', new Date(2027, 11, 5)), 365)
  assert.equal(dayForDate('invalid'), 1)
})