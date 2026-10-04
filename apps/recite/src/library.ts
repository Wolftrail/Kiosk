export type Deck = { id: string; name: string; enabled: boolean }
export type Flashcard = {
  id: string
  deckId: string
  front: string
  back: string
  interval: number
  repetitions: number
  easeFactor: number
  lastReviewDate: string | null
}
export type Library = { decks: Deck[]; flashcards: Flashcard[] }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid library entry.')
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Cards and decks need non-empty text and IDs.')
  return value
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function parseLibrary(value: unknown): Library {
  const source = record(value)
  if (!Array.isArray(source.decks) || !Array.isArray(source.flashcards)) {
    throw new Error('Expected a Recite export with decks and flashcards.')
  }
  const deckIds = new Set<string>()
  const decks = source.decks.map((entry) => {
    const deck = record(entry)
    const id = text(deck.id)
    if (deckIds.has(id)) throw new Error('Duplicate deck ID.')
    deckIds.add(id)
    return { id, name: text(deck.name), enabled: deck.enabled !== false }
  })
  const cardIds = new Set<string>()
  const flashcards = source.flashcards.map((entry) => {
    const card = record(entry)
    const id = text(card.id)
    const deckId = text(card.deckId)
    if (cardIds.has(id)) throw new Error('Duplicate card ID.')
    if (!deckIds.has(deckId)) throw new Error('A card references a missing deck.')
    cardIds.add(id)
    const lastReviewDate = typeof card.lastReviewDate === 'string' && Number.isFinite(Date.parse(card.lastReviewDate))
      ? new Date(card.lastReviewDate).toISOString() : null
    return {
      id, deckId, front: text(card.front), back: text(card.back),
      interval: number(card.interval, 0),
      repetitions: Math.floor(number(card.repetitions, 0)),
      easeFactor: Math.max(1.3, number(card.easeFactor, 2.5)),
      lastReviewDate,
    }
  })
  return { decks, flashcards }
}

export function isDue(card: Flashcard, now = Date.now()): boolean {
  return !card.lastReviewDate || Date.parse(card.lastReviewDate) + card.interval * 86_400_000 <= now
}

export function selectCards(library: Library, deckIds: string[], dueOnly: boolean, now = Date.now()): Flashcard[] {
  const enabled = new Set(library.decks.filter((deck) => deck.enabled && deckIds.includes(deck.id)).map((deck) => deck.id))
  return library.flashcards.filter((card) => enabled.has(card.deckId) && (!dueOnly || isDue(card, now)))
}