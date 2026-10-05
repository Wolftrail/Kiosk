import assert from 'node:assert/strict'
import test from 'node:test'
import { deferDueOccurrences, dueOccurrence, readOccurrenceHistory, readSchedules, recordOccurrence, type Schedule } from '../src/scheduler.ts'

const schedules: Schedule[] = [{ id: 'morning', appId: 'workout', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true }]
const morning = new Date(2026, 9, 5, 9, 0)

test('fires at local time, only on enabled weekdays, with a five-minute grace window', () => {
  assert.ok(dueOccurrence(schedules, {}, morning))
  assert.equal(dueOccurrence(schedules, {}, new Date(2026, 9, 5, 8, 59)), undefined)
  assert.equal(dueOccurrence(schedules, {}, new Date(2026, 9, 5, 9, 6)), undefined)
  assert.equal(dueOccurrence([{ ...schedules[0], enabled: false }], {}, morning), undefined)
  assert.equal(dueOccurrence([{ ...schedules[0], days: [2] }], {}, morning), undefined)
})

test('dismissal survives navigation without suppressing tomorrow', () => {
  const occurrence = dueOccurrence(schedules, {}, morning)!
  const history = recordOccurrence({}, occurrence, 'dismiss', morning.getTime())
  assert.equal(dueOccurrence(schedules, history, morning), undefined)
  assert.ok(dueOccurrence(schedules, history, new Date(2026, 9, 6, 9, 0)))
})

test('snooze fires ten minutes later and can be snoozed repeatedly', () => {
  const occurrence = dueOccurrence(schedules, {}, morning)!
  const history = recordOccurrence({}, occurrence, 'snooze', morning.getTime())
  assert.equal(dueOccurrence(schedules, history, new Date(2026, 9, 5, 9, 9)), undefined)
  const next = dueOccurrence(schedules, history, new Date(2026, 9, 5, 9, 10))!
  assert.equal(next.key, occurrence.key)
  const repeated = recordOccurrence(history, next, 'snooze', new Date(2026, 9, 5, 9, 10).getTime())
  assert.equal(dueOccurrence(schedules, repeated, new Date(2026, 9, 5, 9, 19)), undefined)
  assert.ok(dueOccurrence(schedules, repeated, new Date(2026, 9, 5, 9, 20)))
})

test('snooze crosses midnight and ignores deleted or disabled schedules', () => {
  const occurrence = { scheduleId: 'morning', key: 'morning:2026-10-05' }
  const history = recordOccurrence({}, occurrence, 'snooze', new Date(2026, 9, 5, 23, 55).getTime())
  assert.ok(dueOccurrence(schedules, history, new Date(2026, 9, 6, 0, 5)))
  assert.equal(dueOccurrence([], history, new Date(2026, 9, 6, 0, 5)), undefined)
})

test('invalid saved schedules are ignored', () => {
  assert.deepEqual(readSchedules({ getItem: () => '{broken' }), [])
  assert.deepEqual(readSchedules({ getItem: () => JSON.stringify([{ ...schedules[0], time: '25:00' }]) }), [])
  assert.deepEqual(readSchedules({ getItem: () => JSON.stringify(schedules) }), schedules)
})

test('blocked reminders persist beyond the grace window without extending their expiry', () => {
  const history = deferDueOccurrences(schedules, {}, morning)
  const restored = readOccurrenceHistory({ getItem: () => JSON.stringify(history) })
  assert.deepEqual(restored, history)
  assert.deepEqual(deferDueOccurrences(schedules, restored, new Date(2026, 9, 5, 9, 10)), history)
  assert.ok(dueOccurrence(schedules, restored, new Date(2026, 9, 5, 9, 10)))
  assert.ok(dueOccurrence(schedules, restored, new Date(2026, 9, 5, 23, 59, 59, 999)))
  assert.equal(dueOccurrence(schedules, restored, new Date(2026, 9, 6, 0, 0)), undefined)
  assert.equal(dueOccurrence(schedules, restored, new Date(2026, 9, 6, 8, 59)), undefined)
  assert.equal(dueOccurrence(schedules, restored, new Date(2026, 9, 6, 9, 6)), undefined)
  assert.equal(dueOccurrence(schedules, restored, new Date(2026, 9, 6, 9, 1))?.key, 'morning:2026-10-06')
  assert.deepEqual(deferDueOccurrences(schedules, {}, new Date(2026, 9, 5, 9, 6)), {})
})

test('all simultaneous reminders are deferred and delivered one at a time', () => {
  const multiple = [...schedules, { ...schedules[0], id: 'reading', appId: 'scripture' }]
  const history = deferDueOccurrences(multiple, {}, morning)
  assert.equal(Object.keys(history).length, 2)
  const later = new Date(2026, 9, 5, 9, 15)
  const first = dueOccurrence(multiple, history, later)!
  const dismissed = recordOccurrence(history, first, 'dismiss', later.getTime())
  assert.equal(dueOccurrence(multiple, dismissed, later)?.scheduleId, 'reading')
})

test('disabled or deleted deferred reminders are discarded and do not revive', () => {
  const history = deferDueOccurrences(schedules, {}, morning)
  for (const changed of [[], [{ ...schedules[0], enabled: false }]]) {
    const discarded = deferDueOccurrences(changed, history, morning)
    assert.equal(dueOccurrence(schedules, discarded, morning), undefined)
  }
})

test('due snoozes can be deferred, then snoozed again with a fresh ten-minute delay', () => {
  const occurrence = dueOccurrence(schedules, {}, morning)!
  const snoozed = recordOccurrence({}, occurrence, 'snooze', morning.getTime())
  assert.deepEqual(deferDueOccurrences(schedules, snoozed, new Date(2026, 9, 5, 9, 9)), snoozed)
  const deferred = deferDueOccurrences(schedules, snoozed, new Date(2026, 9, 5, 9, 10))
  const later = new Date(2026, 9, 5, 9, 30)
  const pending = dueOccurrence(schedules, deferred, later)!
  const again = recordOccurrence(deferred, pending, 'snooze', later.getTime())
  assert.equal(dueOccurrence(schedules, again, new Date(2026, 9, 5, 9, 39)), undefined)
  assert.ok(dueOccurrence(schedules, again, new Date(2026, 9, 5, 9, 40)))
})

test('a pending occurrence does not prevent tomorrow from being queued at the due time', () => {
  const history = deferDueOccurrences(schedules, {}, morning)
  const tomorrow = new Date(2026, 9, 6, 9, 0)
  const both = deferDueOccurrences(schedules, history, tomorrow)
  assert.equal(Object.keys(both).length, 2)
  assert.deepEqual(both['morning:2026-10-05'], { handled: true })
  assert.equal(dueOccurrence(schedules, both, tomorrow)?.key, 'morning:2026-10-06')
})

test('late-night deferred reminders expire at local midnight rather than after 24 hours', () => {
  const lateSchedules = [{ ...schedules[0], time: '23:58' }]
  const history = deferDueOccurrences(lateSchedules, {}, new Date(2026, 9, 5, 23, 58))
  assert.ok(dueOccurrence(lateSchedules, history, new Date(2026, 9, 5, 23, 59)))
  const midnight = new Date(2026, 9, 6, 0, 0)
  assert.equal(dueOccurrence(lateSchedules, history, midnight), undefined)
  assert.deepEqual(deferDueOccurrences(lateSchedules, history, midnight)['morning:2026-10-05'], { handled: true })
})