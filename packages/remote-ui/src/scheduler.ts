export const scheduleStorageKey = 'kiosk.schedules.v1'
export const occurrenceStorageKey = 'kiosk.schedule-occurrences.v1'

export const schedulableApps = [
  { id: 'workout', name: 'Workout', url: '/apps/workout/', prompt: 'Ready to start your workout?' },
  { id: 'jukebox', name: 'Jukebox', url: '/apps/jukebox/', prompt: 'Ready to listen to music?' },
  { id: 'recite', name: 'Recite', url: '/apps/recite/', prompt: 'Ready to practice your flashcards?' },
  { id: 'scripture', name: 'Scripture', url: '/apps/scripture/', prompt: 'Ready to read Scripture?' },
] as const

export type Schedule = {
  id: string
  appId: string
  time: string
  days: number[]
  enabled: boolean
}
export type Occurrence = { scheduleId: string; key: string; snoozedUntil?: number }
export type OccurrenceHistory = Record<string, { handled: boolean; snoozedUntil?: number; deferredAt?: number }>
const snoozeLifetime = 24 * 60 * 60_000

function deferredExpiry(deferredAt: number) {
  const date = new Date(deferredAt)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
}

export function readSchedules(storage: Pick<Storage, 'getItem'>): Schedule[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(scheduleStorageKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is Schedule => item && typeof item.id === 'string'
      && schedulableApps.some((app) => app.id === item.appId)
      && typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)
      && Array.isArray(item.days) && item.days.length > 0
      && item.days.every((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)
      && typeof item.enabled === 'boolean')
  } catch {
    return []
  }
}

export function readOccurrenceHistory(storage: Pick<Storage, 'getItem'>): OccurrenceHistory {
  try {
    const value: unknown = JSON.parse(storage.getItem(occurrenceStorageKey) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry
      && typeof entry.handled === 'boolean'
      && (entry.snoozedUntil === undefined || Number.isFinite(entry.snoozedUntil))
      && (entry.deferredAt === undefined || Number.isFinite(entry.deferredAt))))
  } catch {
    return {}
  }
}

export function dueOccurrence(schedules: Schedule[], history: OccurrenceHistory, now: Date): Occurrence | undefined {
  for (const schedule of schedules) {
    if (!schedule.enabled) continue
    const pending = Object.entries(history).find(([key, entry]) => key.startsWith(`${schedule.id}:`)
      && !entry.handled && (entry.deferredAt ?? entry.snoozedUntil) !== undefined
      && (entry.deferredAt ?? entry.snoozedUntil)! <= now.getTime()
      && (entry.deferredAt !== undefined
        ? now.getTime() < deferredExpiry(entry.deferredAt)
        : now.getTime() - entry.snoozedUntil! <= snoozeLifetime))
    if (pending) return { scheduleId: schedule.id, key: pending[0], snoozedUntil: pending[1].snoozedUntil }
    if (!schedule.days.includes(now.getDay())) continue
    const [hours, minutes] = schedule.time.split(':').map(Number)
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const key = `${schedule.id}:${date}`
    const delay = now.getTime() - due.getTime()
    if (delay >= 0 && delay <= 5 * 60_000 && !history[key]) return { scheduleId: schedule.id, key }
  }
}

export function deferDueOccurrences(schedules: Schedule[], history: OccurrenceHistory, now: Date): OccurrenceHistory {
  const next = { ...history }
  for (const [key, entry] of Object.entries(next)) {
    if (entry.handled || entry.deferredAt === undefined) continue
    const schedule = schedules.find((item) => key.startsWith(`${item.id}:`))
    if (!schedule?.enabled || now.getTime() >= deferredExpiry(entry.deferredAt)) next[key] = { handled: true }
  }
  const captureHistory = Object.fromEntries(Object.entries(next).map(([key, entry]) =>
    [key, entry.deferredAt === undefined ? entry : { handled: true }]))
  for (const schedule of schedules) {
    const occurrence = dueOccurrence([schedule], captureHistory, now)
    if (!occurrence) continue
    next[occurrence.key] = { handled: false, deferredAt: now.getTime() }
  }
  return next
}

export function recordOccurrence(history: OccurrenceHistory, occurrence: Occurrence, action: 'dismiss' | 'snooze', now: number): OccurrenceHistory {
  const recent = Object.fromEntries(Object.entries(history).filter(([key]) => {
    const date = Date.parse(key.slice(key.lastIndexOf(':') + 1))
    return Number.isFinite(date) && now - date < 8 * 24 * 60 * 60_000
  }))
  return { ...recent, [occurrence.key]: action === 'snooze'
    ? { handled: false, snoozedUntil: now + 10 * 60_000 }
    : { handled: true } }
}

