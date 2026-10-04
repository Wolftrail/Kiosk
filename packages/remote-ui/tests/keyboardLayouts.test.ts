import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deleteKeyboardText, insertKeyboardText, keyboardLayouts } from '../src/keyboardLayouts.ts'

test('English and Thai layouts retain physical key positions through Shift', () => {
  for (const rows of Object.values(keyboardLayouts)) {
    assert.deepEqual(rows.map((row) => Array.from(row.normal).length), [12, 13, 11, 10])
    for (const row of rows) assert.equal(Array.from(row.normal).length, Array.from(row.shifted).length)
  }
  assert.equal(Array.from(keyboardLayouts.th[1].normal)[0], 'ๆ')
  assert.equal(Array.from(keyboardLayouts.th[2].normal)[2], 'ก')
  assert.equal(Array.from(keyboardLayouts.th[1].shifted)[0], '๐')
})

test('insertion honors the caret and replaces selected text', () => {
  assert.deepEqual(insertKeyboardText('abcd', 'ก', 2), { value: 'abกcd', caret: 3 })
  assert.deepEqual(insertKeyboardText('abcd', 'ข', 1, 3), { value: 'aขd', caret: 2 })
  assert.deepEqual(insertKeyboardText('ก', '้'), { value: 'ก้', caret: 2 })
})

test('length limits reject whole insertions without splitting Unicode', () => {
  assert.deepEqual(insertKeyboardText('abc', '\u{1f600}', 3, 3, 4), { value: 'abc', caret: 3 })
  assert.deepEqual(insertKeyboardText('abcd', 'ก', 1, 3, 4), { value: 'aกd', caret: 2 })
})

test('Backspace removes complete graphemes including Thai marks and emoji', () => {
  assert.deepEqual(deleteKeyboardText('ก้'), { value: '', caret: 0 })
  assert.deepEqual(deleteKeyboardText('a\u{1f600}'), { value: 'a', caret: 1 })
  assert.deepEqual(deleteKeyboardText('a\u0301'), { value: '', caret: 0 })
  assert.deepEqual(deleteKeyboardText('aก้b', 3), { value: 'ab', caret: 1 })
})

test('Backspace deletes selections and safely handles empty text', () => {
  assert.deepEqual(deleteKeyboardText('abcd', 1, 3), { value: 'ad', caret: 1 })
  assert.deepEqual(deleteKeyboardText('abc', 0), { value: 'abc', caret: 0 })
  assert.deepEqual(deleteKeyboardText(''), { value: '', caret: 0 })
})