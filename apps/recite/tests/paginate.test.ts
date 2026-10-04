import assert from 'node:assert/strict'
import test from 'node:test'
import { paginateText } from '../src/paginate.ts'

test('paginates long text without loss and keeps pages within measured bounds', () => {
  const text = 'A long answer with several words and line breaks.\n'.repeat(10)
  const pages = paginateText(text, (candidate) => candidate.length <= 60)
  assert.ok(pages.length > 1)
  assert.equal(pages.join(''), text)
  assert.ok(pages.every((page) => page.length <= 60))
})

test('handles long unbroken words and preserves graphemes', () => {
  const text = 'abcdefghij'.repeat(12)
  const pages = paginateText(text, (candidate) => candidate.length <= 16)
  assert.equal(pages.join(''), text)
  assert.ok(pages.every((page) => page.length <= 16))
  const unicode = String.fromCodePoint(0x1f600).repeat(10)
  const emojiPages = paginateText(unicode, (candidate) => candidate.length <= 6)
  assert.equal(emojiPages.join(''), unicode)
  assert.ok(emojiPages.every((page) => page.length % 2 === 0))
  assert.deepEqual(paginateText('short', () => true), ['short'])
})