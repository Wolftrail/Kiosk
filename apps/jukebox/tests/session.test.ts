import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSession, restoreQueue } from '../src/session.ts'

test('session round trip retains filters, selection, queue, and playback settings', () => {
  const session = {
    tagFilters: { Jazz: 'include', Pop: 'exclude' }, showTagFilters: true,
    selectedTrackId: 'second', queue: ['third', 'second', 'first'],
    playbackTime: 83.25, volume: 0.4, muted: true,
  }
  assert.deepEqual(parseSession(JSON.stringify(session)), session)
})

test('missing and malformed sessions fall back safely', () => {
  const defaults = parseSession(null)
  for (const raw of ['invalid', 'null', '[]', '42']) assert.deepEqual(parseSession(raw), defaults)
  assert.deepEqual(parseSession(JSON.stringify({
    tagFilters: { Jazz: 'include', Pop: 'exclude', Bad: 'other' },
    selectedTrackId: 42, queue: ['first', null, 'first', 42, 'second'],
    playbackTime: -1, volume: 2, muted: 'true', showTagFilters: 'true',
  })), { ...defaults, tagFilters: { Jazz: 'include', Pop: 'exclude' }, queue: ['first', 'second'] })
})

test('restoring preserves exact ordering even when the library is ordered differently', () => {
  assert.deepEqual(restoreQueue(['third', 'second', 'first'], ['first', 'second', 'third']), ['third', 'second', 'first'])
})

test('restoring removes missing tracks and appends new tracks without reordering survivors', () => {
  assert.deepEqual(restoreQueue(['third', 'deleted', 'first', 'third'], ['first', 'second', 'third']), ['third', 'first', 'second'])
  assert.deepEqual(restoreQueue(['first'], []), [])
})