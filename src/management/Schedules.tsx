import { useEffect, useState, type FormEvent } from 'react'
import { AlarmClock, Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { ConfirmationDialog, schedulableApps, testScheduleEvent, useToast, scheduleStorageKey, type Schedule } from '@kiosk/remote-ui'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayOrder = [1, 2, 3, 4, 5, 6, 0]
const newSchedule = (): Schedule => ({ id: crypto.randomUUID(), appId: 'workout', time: '09:00', days: dayOrder, enabled: true })

export default function Schedules() {
  const { toast } = useToast()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [draft, setDraft] = useState<Schedule>(newSchedule)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Schedule | null>(null)

  useEffect(() => {
    let active = true
    void fetch('/api/schedules').then(async (response) => {
      if (!response.ok) throw new Error('Could not load schedules.')
      const result = await response.json()
      if (active) { setSchedules(result.schedules); setLoaded(true) }
    }).catch(() => { if (active) toast('Could not load schedules. Reopen the Schedules tab to retry.', { variant: 'error' }) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [toast])

  async function save(next: Schedule[]) {
    setBusy(true)
    try {
      const response = await fetch('/api/schedules', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
      if (!response.ok) throw new Error((await response.json()).error)
      setSchedules(next)
      try { localStorage.setItem(scheduleStorageKey, JSON.stringify(next)) } catch { }
      setDraft(newSchedule())
      setEditing(false)
      setPendingDelete(null)
      toast('Schedules saved.', { variant: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save schedules.', { variant: 'error' })
    } finally { setBusy(false) }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void save(editing ? schedules.map((item) => item.id === draft.id ? draft : item) : [...schedules, draft])
  }

  return <section className="management__schedules" aria-labelledby="schedules-title">
    <div className="management__heading"><div><h1 id="schedules-title">Schedules</h1><p>Local kiosk time</p></div><AlarmClock size={26} /></div>
    <form className="management__schedule-form" onSubmit={submit}>
      <h2>{editing ? 'Edit schedule' : 'New schedule'}</h2>
      <div className="management__schedule-fields">
        <label>App<select value={draft.appId} disabled={busy || !loaded} onChange={(event) => setDraft({ ...draft, appId: event.target.value })}>{schedulableApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
        <label>Time<input type="time" required value={draft.time} disabled={busy || !loaded} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
        <label className="management__schedule-enabled"><input type="checkbox" checked={draft.enabled} disabled={busy || !loaded} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />Enabled</label>
      </div>
      <fieldset disabled={busy || !loaded} className="management__schedule-days"><legend>Days</legend>{dayOrder.map((day) => <label key={day}><input type="checkbox" checked={draft.days.includes(day)} onChange={(event) => setDraft({ ...draft, days: event.target.checked ? [...draft.days, day] : draft.days.filter((item) => item !== day) })} />{weekdays[day]}</label>)}</fieldset>
      <div className="management__schedule-actions"><button disabled={busy || !loaded || !draft.days.length}>{editing ? <Save size={18} /> : <Plus size={18} />}{editing ? 'Save changes' : 'Add schedule'}</button>{editing && <button type="button" disabled={busy} onClick={() => { setEditing(false); setDraft(newSchedule()) }}><X size={18} /> Cancel</button>}</div>
    </form>
    <div className="management__schedule-list" role="region" aria-label="Saved schedules">
      {!busy && loaded && schedules.length === 0 && <p>No schedules yet.</p>}
      {schedules.map((schedule) => <div className="management__schedule-row" key={schedule.id}>
        <label className="management__schedule-enabled"><input type="checkbox" aria-label={`Enable ${schedule.appId} at ${schedule.time}`} checked={schedule.enabled} disabled={busy} onChange={(event) => void save(schedules.map((item) => item.id === schedule.id ? { ...item, enabled: event.target.checked } : item))} /></label>
        <div><strong>{schedulableApps.find((app) => app.id === schedule.appId)?.name} <time>{schedule.time}</time></strong><small>{schedule.days.length === 7 ? 'Every day' : dayOrder.filter((day) => schedule.days.includes(day)).map((day) => weekdays[day]).join(', ')}</small></div>
        <div className="management__schedule-actions">
          <button type="button" disabled={busy} title="Test reminder in this browser" aria-label={`Test ${schedule.appId} reminder`} onClick={() => {
            localStorage.setItem(scheduleStorageKey, JSON.stringify(schedules))
            window.dispatchEvent(new CustomEvent(testScheduleEvent, { detail: schedule.id }))
          }}><AlarmClock size={18} /></button>
          <button type="button" disabled={busy} title="Edit schedule" aria-label={`Edit ${schedule.appId} schedule`} onClick={() => { setDraft({ ...schedule, days: [...schedule.days] }); setEditing(true) }}><Pencil size={18} /></button>
          <button type="button" disabled={busy} title="Delete schedule" aria-label={`Delete ${schedule.appId} schedule`} onClick={() => setPendingDelete(schedule)}><Trash2 size={18} /></button>
        </div>
      </div>)}
    </div>
    {pendingDelete && <ConfirmationDialog title="Delete this schedule?" message={`${schedulableApps.find((app) => app.id === pendingDelete.appId)?.name} at ${pendingDelete.time}`} confirmLabel="Delete schedule" destructive busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => void save(schedules.filter((item) => item.id !== pendingDelete.id))} />}
    {busy && <span className="management__schedule-status" role="status"><Check size={16} /> Updating schedules</span>}
  </section>
}