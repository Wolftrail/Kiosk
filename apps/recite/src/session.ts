import { supermemo } from 'supermemo'
import type { Flashcard, Library } from './library.ts'

export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type Progress = Record<string, { content: string; card: Flashcard }>
export type Session = {
  cards: Flashcard[]
  index: number
  retried: string[]
  results: Record<string, Rating>
  practice: boolean
}

const grades = { again: 0, hard: 3, good: 4, easy: 5 } as const

function contentKey(card: Flashcard): string {
  return JSON.stringify([card.deckId, card.front, card.back])
}

export function reviewCard(card: Flashcard, rating: Rating, now = Date.now()): Flashcard {
  const schedule = supermemo({ interval: card.interval, repetition: card.repetitions, efactor: card.easeFactor }, grades[rating])
  return {
    ...card,
    interval: rating === 'again' ? 0 : schedule.interval,
    repetitions: schedule.repetition,
    easeFactor: schedule.efactor,
    lastReviewDate: new Date(now).toISOString(),
  }
}

export function rememberCard(progress: Progress, card: Flashcard): Progress {
  return { ...progress, [card.id]: { content: contentKey(card), card } }
}

export function applyProgress(library: Library, value: unknown): Library {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return library
  const entries = value as Record<string, unknown>
  return {
    ...library,
    flashcards: library.flashcards.map((card) => {
      const entry = entries[card.id]
      if (!entry || typeof entry !== 'object') return card
      const saved = entry as { content?: unknown; card?: Partial<Flashcard> }
      const schedule = saved.card
      if (saved.content !== contentKey(card) || !schedule
        || typeof schedule.interval !== 'number' || !Number.isFinite(schedule.interval) || schedule.interval < 0
        || typeof schedule.repetitions !== 'number' || !Number.isInteger(schedule.repetitions) || schedule.repetitions < 0
        || typeof schedule.easeFactor !== 'number' || !Number.isFinite(schedule.easeFactor) || schedule.easeFactor < 1.3
        || typeof schedule.lastReviewDate !== 'string' || !Number.isFinite(Date.parse(schedule.lastReviewDate))) return card
      return { ...card, interval: schedule.interval, repetitions: schedule.repetitions, easeFactor: schedule.easeFactor, lastReviewDate: schedule.lastReviewDate }
    }),
  }
}

export function createSession(cards: Flashcard[], practice: boolean, random = Math.random): Session {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
  }
  return { cards: shuffled.slice(0, 20), index: 0, retried: [], results: {}, practice }
}

export function advanceSession(session: Session, rating: Rating, reviewed: Flashcard): Session {
  const retry = rating === 'again' && !session.retried.includes(reviewed.id)
  return {
    ...session,
    index: session.index + 1,
    cards: retry ? [...session.cards, reviewed] : session.cards,
    retried: retry ? [...session.retried, reviewed.id] : session.retried,
    results: { ...session.results, [reviewed.id]: rating },
  }
}