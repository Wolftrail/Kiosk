import { useEffect, useState } from 'react'
import { Check, Clock3, X } from 'lucide-react'
import { ConfirmationDialog } from './ConfirmationDialog'
import { deferDueOccurrences, dueOccurrence, occurrenceStorageKey, readOccurrenceHistory, readSchedules, recordOccurrence, scheduleStorageKey, schedulableApps, type Occurrence, type Schedule } from './scheduler'
import { clearAbandonedScheduledLaunch, getActiveScheduledLaunch, launchScheduledApp, listenForScheduledCompletion } from './scheduledLaunch'

export const testScheduleEvent = 'kiosk:test-schedule'

export function ScheduleReminder() {
  const [pending, setPending] = useState<{ schedule: Schedule; occurrence?: Occurrence } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    clearAbandonedScheduledLaunch()
    const stopListening = listenForScheduledCompletion()
    let active = true
    let ready = false
    let refreshing = false
    const check = () => {
      if (!ready || document.hidden) return
      if (location.pathname.startsWith('/manage')) return
      try {
        const schedules = readSchedules(localStorage)
        const now = new Date()
        const savedHistory = readOccurrenceHistory(localStorage)
        const history = deferDueOccurrences(schedules, savedHistory, now)
        if (JSON.stringify(history) !== JSON.stringify(savedHistory)) {
          localStorage.setItem(occurrenceStorageKey, JSON.stringify(history))
        }
        if (getActiveScheduledLaunch() || document.querySelector('[role="dialog"]')) return
        const occurrence = dueOccurrence(schedules, history, now)
        const schedule = schedules.find((item) => item.id === occurrence?.scheduleId)
        if (schedule && occurrence) setPending({ schedule, occurrence })
      } catch {
      }
    }
    const refresh = async () => {
      if (refreshing || document.hidden) return
      refreshing = true
      try {
        const response = await fetch('/api/schedules', { cache: 'no-store' })
        if (response.ok && active) {
          const result = await response.json()
          const schedules = readSchedules({ getItem: () => JSON.stringify(result.schedules) })
          localStorage.setItem(scheduleStorageKey, JSON.stringify(schedules))
        }
      } catch {
      } finally {
        refreshing = false
        if (active) { ready = true; check() }
      }
    }
    const test = (event: Event) => {
      if (getActiveScheduledLaunch() || document.querySelector('[role="dialog"]')) return
      const id = (event as CustomEvent<string>).detail
      const schedule = readSchedules(localStorage).find((item) => item.id === id)
      if (schedule) setPending({ schedule })
    }
    void refresh()
    const timer = window.setInterval(check, 1000)
    const refreshTimer = window.setInterval(() => void refresh(), 30_000)
    window.addEventListener(testScheduleEvent, test)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      stopListening()
      active = false
      window.clearInterval(timer)
      window.clearInterval(refreshTimer)
      window.removeEventListener(testScheduleEvent, test)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  if (!pending) return null
  const app = schedulableApps.find((item) => item.id === pending.schedule.appId)!
  const answer = (action: 'dismiss' | 'snooze' | 'launch') => {
    try {
      if (pending.occurrence) {
        const history = recordOccurrence(readOccurrenceHistory(localStorage), pending.occurrence,
          action === 'snooze' ? 'snooze' : 'dismiss', Date.now())
        localStorage.setItem(occurrenceStorageKey, JSON.stringify(history))
      } else if (action === 'snooze') {
        const occurrence = { scheduleId: pending.schedule.id, key: `${pending.schedule.id}:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}` }
        localStorage.setItem(occurrenceStorageKey, JSON.stringify(recordOccurrence(readOccurrenceHistory(localStorage), occurrence, 'snooze', Date.now())))
      }
      if (action === 'launch') launchScheduledApp(app.id)
      setPending(null)
      setError('')
    } catch {
      setError('Could not save this reminder. Check browser storage and try again.')
    }
  }

  return <ConfirmationDialog
    className="remote-schedule-reminder"
    title={app.prompt}
    context={<><span className="remote-schedule-reminder__brand">KIOSK<span>{app.name}</span></span><time>{pending.schedule.time}</time></>}
    icon={<span className="remote-schedule-reminder__mark">K</span>}
    message={error ? <p role="alert">{error}</p> : undefined}
    cancelLabel="No"
    cancelIcon={<X size={20} />}
    confirmLabel="Yes"
    confirmIcon={<Check size={20} />}
    secondaryAction={{ label: 'Snooze 10 minutes', icon: <Clock3 size={20} />, onClick: () => answer('snooze') }}
    onCancel={() => answer('dismiss')}
    onConfirm={() => answer('launch')}
  />
}