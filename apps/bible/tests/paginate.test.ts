import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginate } from '../src/paginate.ts'

test('Pagination splits long verses without losing text or exceeding available space', () => {
  const verses = [
    { chapter: 1, verse: 1, text: 'one two three four five six seven eight nine ten' },
    { chapter: 1, verse: 2, text: 'eleven twelve thirteen' },
  ]
  const pages = paginate(verses, (fragments) => fragments.map((part) => part.text).join(' ').split(' ').length <= 4)
  assert.equal(pages.flat().map((part) => part.text).join(' '), verses.map((verse) => verse.text).join(' '))
  assert.ok(pages.every((page) => page.map((part) => part.text).join(' ').split(' ').length <= 4))
  assert.equal(pages[0][0].index, 0)
  assert.equal(pages.at(-1)?.at(-1)?.index, 1)
})
test('Empty readings and impossibly short viewports terminate safely', () => {
  assert.deepEqual(paginate([], () => true), [])
  assert.equal(paginate([{ chapter: 1, verse: 1, text: 'one two' }], () => false).flat().length, 2)
})
test('Fragment offsets locate the same saved word after repagination', () => {
  const verses = [{ chapter: 1, verse: 1, text: 'one two three four five six seven eight nine ten' }]
  const original = paginate(verses, (fragments) => fragments.map((part) => part.text).join(' ').split(' ').length <= 4)
  assert.deepEqual(original.flat().map((part) => part.offset), [0, 4, 8])
  const saved = original[2][0]
  const resized = paginate(verses, (fragments) => fragments.map((part) => part.text).join(' ').split(' ').length <= 3)
  const restored = resized.find((page) => page.some((part) => part.offset <= saved.offset && saved.offset < part.offset + part.text.split(' ').length))
  assert.equal(restored?.[0].text, 'seven eight nine')
  assert.equal(restored?.[0].offset, 6)
})