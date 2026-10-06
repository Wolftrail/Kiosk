import { useEffect, useRef, useState } from 'react'
import { ConfirmationDialog, finishScheduledApp, getScheduledLaunch, RemoteAppShell, RemoteButton } from '@kiosk/remote-ui'
import { Activity, ArrowLeft, Check, Clock3, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { exercises, EXERCISE_SECONDS, formatTime, getNextExerciseElapsed, getStage, TOTAL_SECONDS } from './routine'
import './App.css'

function App() {
  const [{ scheduledLaunch, started }] = useState(() => ({ scheduledLaunch: getScheduledLaunch('workout'), started: performance.now() }))
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>(scheduledLaunch ? 'running' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [sound, setSound] = useState(true)
  const [exitOpen, setExitOpen] = useState(false)
  const clock = useRef({ accumulated: 0, started })
  const primaryRef = useRef<HTMLButtonElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const exitTarget = useRef<string | null>(null)
  const previousSignal = useRef('')
  const stage = getStage(elapsed)
  const complete = stage.kind === 'complete'
  const active = status !== 'idle' && !complete
  const exercise = exercises[stage.exerciseIndex]
  const imageUrl = (id: string) => `${import.meta.env.BASE_URL}exercises/${id}.png`

  const nextExercise = exercises[stage.exerciseIndex + 1]

  function next() {
    const currentElapsed = status === 'running'
      ? clock.current.accumulated + (performance.now() - clock.current.started) / 1000
      : elapsed
    clock.current.accumulated = getNextExerciseElapsed(currentElapsed)
    clock.current.started = performance.now()
    setElapsed(clock.current.accumulated)
  }

  function back() {
    if (exitOpen) cancelExit()
    else if (active) requestExit(scheduledLaunch?.returnUrl ?? '/')
    else if (!finishScheduledApp('workout')) window.location.assign('/')
    return true
  }

  function pause() {
    if (status !== 'running' || complete) return
    clock.current.accumulated = Math.min(TOTAL_SECONDS, clock.current.accumulated + (performance.now() - clock.current.started) / 1000)
    setElapsed(clock.current.accumulated)
    setStatus('paused')
  }

  function start() {
    if (status === 'idle' || complete) {
      clock.current.accumulated = 0
      setElapsed(0)
      previousSignal.current = ''
    }
    if (sound) {
      audioRef.current ??= new AudioContext()
      void audioRef.current.resume().catch(() => {})
    }
    clock.current.started = performance.now()
    setStatus('running')
  }

  function requestExit(target: string | null = null) {
    pause()
    exitTarget.current = target
    setExitOpen(true)
  }

  function cancelExit() {
    setExitOpen(false)
  }

  function finishExit() {
    setExitOpen(false)
    setStatus('idle')
    setElapsed(0)
    clock.current.accumulated = 0
    if (finishScheduledApp('workout')) return
    if (exitTarget.current) window.location.assign(exitTarget.current)
  }

  useEffect(() => {
    if (!complete || !scheduledLaunch) return
    const timer = window.setTimeout(() => finishScheduledApp('workout'), 5000)
    return () => window.clearTimeout(timer)
  }, [complete, scheduledLaunch])

  useEffect(() => {
    if (status !== 'running' || complete) return
    const interval = window.setInterval(() => {
      setElapsed(Math.min(TOTAL_SECONDS, clock.current.accumulated + (performance.now() - clock.current.started) / 1000))
    }, 100)
    const handleVisibility = () => {
      if (document.hidden) {
        clock.current.accumulated = Math.min(TOTAL_SECONDS, clock.current.accumulated + (performance.now() - clock.current.started) / 1000)
        setElapsed(clock.current.accumulated)
        setStatus('paused')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [status, complete])

  useEffect(() => {
    if (!exitOpen) primaryRef.current?.focus()
  }, [active, complete, exitOpen])

  const signal = `${stage.kind}:${stage.exerciseIndex}:${stage.switchSide}`
  useEffect(() => {
    if (status !== 'running' || previousSignal.current === signal) return
    previousSignal.current = signal
    const audio = audioRef.current
    if (!sound || !audio || audio.state !== 'running') return
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = complete ? 880 : stage.kind === 'exercise' ? 660 : 440
    gain.gain.setValueAtTime(0.12, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.35)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }, [signal, status, sound, complete, stage.kind])

  useEffect(() => () => {
    const audio = audioRef.current
    audioRef.current = null
    void audio?.close()
  }, [])

  useEffect(() => {
    if (!scheduledLaunch) return
    audioRef.current ??= new AudioContext()
    void audioRef.current.resume().catch(() => {})
  }, [scheduledLaunch])

  return (
    <div className="workout" data-status={complete ? 'complete' : status} onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest('a')
      if (scheduledLaunch && !active && link) {
        event.preventDefault()
        finishScheduledApp('workout')
        return
      }
      if (active && link) {
        event.preventDefault()
        event.stopPropagation()
        requestExit(link.href)
      }
    }}>
    <RemoteAppShell
      title="7-minute workout"
      headerTitle="Workout"
      category="FITNESS"
      theme="workout"
      backHref={scheduledLaunch?.returnUrl ?? '/'}
      initialFocusSelector=".workout-primary"
      headerActions={
        <RemoteButton className="workout-sound" aria-label={sound ? 'Mute workout sounds' : 'Enable workout sounds'} aria-pressed={sound} title={sound ? 'Mute workout sounds' : 'Enable workout sounds'} onClick={() => {
          if (!sound) {
            audioRef.current ??= new AudioContext()
            void audioRef.current.resume().catch(() => {})
          }
          setSound(!sound)
        }}>{sound ? <Volume2 /> : <VolumeX />}</RemoteButton>
      }
      onBack={back}
    >
      <div className="workout-session" data-phase={stage.kind}>
        <section className="workout-move" aria-labelledby="workout-move-title">
          <p className="workout-eyebrow" role="status"><Activity aria-hidden="true" />{complete ? 'Session complete' : status === 'idle' ? 'Your workout' : status === 'paused' ? 'Paused' : stage.kind === 'ready' ? 'Get ready' : stage.kind === 'rest' ? 'Rest / up next' : stage.switchSide ? 'Switch sides' : 'Let\'s move'}</p>
          <h2 id="workout-move-title">{complete ? 'Well done.' : exercise.name}</h2>
          <p className="workout-cue">{complete ? 'Catch your breath, walk gently, and have some water.' : stage.switchSide && active ? 'Change to your other side. Keep breathing.' : exercise.cue}</p>
          <p className="workout-easier">{complete ? <><Check aria-hidden="true" />12 exercises complete.</> : <><strong>Gentler option</strong>{exercise.easier}</>}</p>
          <div className="workout-timing">
            <div className="workout-countdown" role="timer" aria-label={complete ? 'Session complete' : `${status === 'idle' ? EXERCISE_SECONDS : stage.remaining} seconds remaining`}>
              <span>{complete ? <Check aria-hidden="true" /> : String(status === 'idle' ? EXERCISE_SECONDS : stage.remaining).padStart(2, '0')}</span>
              <span className="workout-seconds">{complete ? 'finished' : 'seconds'}</span>
            </div>
            <div className="workout-timing-detail">
              <span><Clock3 aria-hidden="true" />{formatTime(TOTAL_SECONDS - elapsed)} {status === 'idle' ? 'total' : 'remaining'}</span>
              <span>{status === 'idle' ? '5s between moves' : complete ? 'Take a moment to recover' : stage.kind !== 'exercise' ? `Next: ${exercise.name}` : `Next: ${nextExercise?.name ?? 'Finish & cool down'}`}</span>
            </div>
          </div>
          <progress className="workout-stage-progress" max={complete || status === 'idle' ? EXERCISE_SECONDS : stage.duration} value={complete ? EXERCISE_SECONDS : status === 'idle' ? 0 : stage.duration - stage.remaining} aria-label="Current interval progress" />
          {status === 'idle' && <p className="workout-safety">Have a mat, a wall, and a low, stable step or secured bench nearby. Rest when needed. Stop if you feel pain or dizziness.</p>}
          {complete && scheduledLaunch && <p className="workout-safety">Returning to your schedule shortly.</p>}
        </section>
        <div className="workout-demonstration">
          <img src={imageUrl(exercise.id)} alt={`${exercise.name} positions`} />
          <span className="workout-artwork-caption">{String(stage.exerciseIndex + 1).padStart(2, '0')} / {exercise.name}</span>
        </div>
        <aside className="workout-lineup" aria-label="Workout routine">
          <div className="workout-lineup-heading"><h3>Your routine</h3><span>12 moves</span></div>
          <ol className="workout-routine">{exercises.map((item, index) => {
            const done = complete || index < stage.exerciseIndex
            const current = !complete && index === stage.exerciseIndex
            return <li key={item.id} className={done ? 'is-done' : current ? 'is-current' : ''} aria-current={current ? 'step' : undefined}>
              <span className="workout-routine-number">{done ? <Check aria-label="Complete" /> : String(index + 1).padStart(2, '0')}</span>
              <span className="workout-routine-name">{item.name}</span>
              <span className="workout-routine-duration">30s</span>
            </li>
          })}</ol>
        </aside>
      </div>
      <div className="workout-controls">
        <RemoteButton className="workout-button workout-secondary workout-back" onClick={back}><ArrowLeft aria-hidden="true" />Back</RemoteButton>
        <RemoteButton ref={primaryRef} className="workout-button workout-primary" onClick={complete && scheduledLaunch ? () => finishScheduledApp('workout') : status === 'running' && !complete ? pause : start}>
          {complete ? scheduledLaunch ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" /> : status === 'running' ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" fill="currentColor" />}
          {complete ? scheduledLaunch ? 'Done' : 'Restart' : status === 'idle' ? 'Start workout' : status === 'running' ? 'Pause' : 'Resume'}
        </RemoteButton>
        <div className="workout-session-progress">
          <div className="workout-progress" aria-hidden="true">{exercises.map((item, index) => <span key={item.id} className={complete || index < stage.exerciseIndex ? 'is-done' : index === stage.exerciseIndex ? 'is-current' : ''} />)}</div>
          <span>{complete ? '12 / 12 complete' : `${stage.exerciseIndex + 1} / 12`}</span>
        </div>
        {complete ? !scheduledLaunch && <RemoteButton className="workout-button workout-secondary workout-next" onClick={() => { setStatus('idle'); setElapsed(0); clock.current.accumulated = 0 }}><Check aria-hidden="true" />Done</RemoteButton> : <RemoteButton className="workout-button workout-secondary workout-next" disabled={!active} onClick={next}><SkipForward aria-hidden="true" />{stage.kind === 'rest' || stage.kind === 'ready' ? 'Begin exercise' : nextExercise ? 'Next exercise' : 'Finish'}</RemoteButton>}
      </div>
      {exitOpen && <ConfirmationDialog title="End this workout?" message="Your session is paused. You can keep going or end here." confirmLabel="End workout" cancelLabel="Keep going" destructive onConfirm={finishExit} onCancel={cancelExit} />}
    </RemoteAppShell>
    </div>
  )
}

export default App
