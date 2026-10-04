import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLibrary, isDue } from '../src/library.ts'
import { advanceSession, applyProgress, createSession, rememberCard, reviewCard } from '../src/session.ts'

const library = parseLibrary({ decks: [{ id: 'deck', name: 'Deck' }], flashcards: [{ id: 'card', deckId: 'deck', front: 'Front', back: 'Back' }] })
const card = library.flashcards[0]
const now = Date.parse('2026-10-04T12:00:00Z')

test('SM2 schedules successful answers and leaves missed answers due', () => {
  const good = reviewCard(card, 'good', now)
  assert.equal(good.repetitions, 1)
  assert.equal(good.interval, 1)
  assert.equal(isDue(good, now), false)
  assert.equal(reviewCard(good, 'good', now).interval, 6)
  const again = reviewCard(good, 'again', now)
  assert.equal(again.repetitions, 0)
  assert.equal(isDue(again, now), true)
  assert.ok(reviewCard(card, 'easy', now).easeFactor > reviewCard(card, 'hard', now).easeFactor)
})

test('local progress survives exports but edited content becomes due again', () => {
  const reviewed = reviewCard(card, 'good', now)
  const progress = rememberCard({}, reviewed)
  assert.equal(applyProgress(library, progress).flashcards[0].interval, 1)
  const edited = { ...library, flashcards: [{ ...card, back: 'Changed' }] }
  assert.equal(applyProgress(edited, progress).flashcards[0].interval, 0)
  assert.equal(applyProgress(library, { card: { content: progress.card.content, card: { ...reviewed, interval: 'bad' } } }).flashcards[0].interval, 0)
  assert.deepEqual(applyProgress(library, null), library)
})

test('sessions are capped, shuffled without mutation and retry each miss once', () => {
  const cards = Array.from({ length: 30 }, (_, index) => ({ ...card, id: `card-${index}` }))
  const session = createSession(cards, false, () => 0.5)
  assert.equal(session.cards.length, 20)
  assert.equal(new Set(session.cards.map((entry) => entry.id)).size, 20)
  assert.equal(cards[0].id, 'card-0')
  const short = createSession([card], true)
  const first = advanceSession(short, 'again', card)
  assert.equal(first.cards.length, 2)
  const second = advanceSession(first, 'again', card)
  assert.equal(second.cards.length, 2)
  assert.equal(second.index, 2)
  assert.equal(second.practice, true)
})