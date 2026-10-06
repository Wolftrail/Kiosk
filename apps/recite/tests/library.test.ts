import assert from 'node:assert/strict'
import test from 'node:test'
import { isDue, parseLibrary, selectCards } from '../src/library.ts'

const source = {
  decks: [{ id: 'one', name: 'First deck' }, { id: 'two', name: 'Disabled', enabled: false }],
  flashcards: [
    { id: 'a', deckId: 'one', front: 'Question', back: 'Answer' },
    { id: 'b', deckId: 'one', front: 'Later', back: 'Answer', interval: 2, lastReviewDate: '2026-10-04T00:00:00Z' },
    { id: 'c', deckId: 'two', front: 'Disabled', back: 'Answer' },
  ],
}

test('loads Recite exports and supplies defaults for new cards', () => {
  const library = parseLibrary(source)
  assert.equal(library.decks[0].enabled, true)
  assert.equal(library.flashcards[0].easeFactor, 2.5)
  assert.equal(library.flashcards[0].lastReviewDate, null)
})

test('selects due cards only from enabled, selected decks', () => {
  const library = parseLibrary(source)
  const now = Date.parse('2026-10-05T00:00:00Z')
  assert.deepEqual(selectCards(library, ['one', 'two'], true, now).map((card) => card.id), ['a'])
  assert.deepEqual(selectCards(library, ['one'], false, now).map((card) => card.id), ['a', 'b'])
  assert.deepEqual(selectCards(library, [], false, now), [])
  assert.equal(isDue(library.flashcards[1], Date.parse('2026-10-06T00:00:00Z')), true)
})

test('rejects malformed libraries, duplicate IDs and orphaned cards', () => {
  assert.throws(() => parseLibrary({}))
  assert.throws(() => parseLibrary({ ...source, decks: [source.decks[0], source.decks[0]] }))
  assert.throws(() => parseLibrary({ ...source, flashcards: [source.flashcards[0], source.flashcards[0]] }))
  assert.throws(() => parseLibrary({ ...source, flashcards: [{ ...source.flashcards[0], deckId: 'missing' }] }))
  assert.throws(() => parseLibrary({ ...source, flashcards: [{ ...source.flashcards[0], front: ' ' }] }))
})

test('preserves optional deck images and rejects unsafe image links', () => {
  const image = { id: 'photo-one', url: 'https://images.unsplash.com/photo-one?ixid=app', thumbnailUrl: 'https://images.unsplash.com/photo-one?w=400&ixid=app', alt: 'Forest', photographer: 'Alex', photographerUrl: 'https://unsplash.com/@alex?utm_source=kiosk&utm_medium=referral', photoUrl: 'https://unsplash.com/photos/photo-one' }
  const library = parseLibrary({ ...source, decks: [{ ...source.decks[0], image }, source.decks[1]] })
  assert.deepEqual(library.decks[0].image, image)
  assert.deepEqual(parseLibrary(JSON.parse(JSON.stringify(library))), library)
  assert.equal(library.decks[1].image, undefined)
  for (const url of ['javascript:alert(1)', 'https://example.com/photo', 'https://images.unsplash.com.evil.test/photo']) {
    assert.throws(() => parseLibrary({ ...source, decks: [{ ...source.decks[0], image: { ...image, url } }, source.decks[1]] }))
  }
})