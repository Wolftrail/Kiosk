import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ConfirmationDialog, RemoteAppShell, RemoteButton } from '@kiosk/remote-ui'
import { Activity, Check, Clock3, Pause, Play, RotateCcw, Square, Timer, Volume2, VolumeX } from 'lucide-react'
import { exercises, formatTime, getStage, TOTAL_SECONDS } from './routine'
import './App.css'

function App() {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [sound, setSound] = useState(true)
  const [exitOpen, setExitOpen] = useState(false)
  const clock = useRef({ accumulated: 0, started: 0 })
  const primaryRef = useRef<HTMLButtonElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const exitTarget = useRef<string | null>(null)
  const previousSignal = useRef('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentScale, setContentScale] = useState(1)
  const stage = getStage(elapsed)
  const complete = stage.kind === 'complete'
  const active = status !== 'idle' && !complete
  const exercise = exercises[stage.exerciseIndex]
  const imageUrl = (id: string) => `${import.meta.env.BASE_URL}exercises/${id}.png`

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const fitContent = () => {
      setContentScale(Math.min(1, viewport.clientHeight / Math.max(1, content.scrollHeight), viewport.clientWidth / Math.max(1, content.scrollWidth)))
    }
    const observer = new ResizeObserver(fitContent)
    observer.observe(viewport)
    observer.observe(content)
    fitContent()
    return () => observer.disconnect()
  }, [])

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
    primaryRef.current?.focus()
  }

  function finishExit() {
    setExitOpen(false)
    setStatus('idle')
    setElapsed(0)
    clock.current.accumulated = 0
    if (exitTarget.current) window.location.assign(exitTarget.current)
  }

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
    primaryRef.current?.focus()
  }, [active, complete])

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

  useEffect(() => () => { void audioRef.current?.close() }, [])

  return (
    <div className="workout" data-status={complete ? 'complete' : status} onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest('a')
      if (active && link) {
        event.preventDefault()
        event.stopPropagation()
        requestExit(link.href)
      }
    }}>
    <RemoteAppShell
      title="7-minute workout"
      category="FITNESS"
      theme="workout"
      initialFocusSelector=".workout-primary"
      onBack={() => {
        if (exitOpen) cancelExit()
        else if (active) requestExit('/')
        else window.location.assign('/')
        return true
      }}
    >
      <div className="workout-topline">
        <span className="workout-session-label"><Activity aria-hidden="true" />{complete ? '12 / 12 complete' : active ? `Move ${String(stage.exerciseIndex + 1).padStart(2, '0')} / 12` : '12 moves. One session.'}</span>
        <RemoteButton className="workout-sound" aria-label={sound ? 'Mute workout sounds' : 'Enable workout sounds'} aria-pressed={sound} title={sound ? 'Mute workout sounds' : 'Enable workout sounds'} onClick={() => {
          if (!sound) {
            audioRef.current ??= new AudioContext()
            void audioRef.current.resume().catch(() => {})
          }
          setSound(!sound)
        }}>{sound ? <Volume2 /> : <VolumeX />}</RemoteButton>
      </div>

      <div className="workout-fit-viewport" ref={viewportRef}>
      <div className="workout-fit-content" ref={contentRef} style={{ transform: `scale(${contentScale})` }}>
      {status === 'idle' ? (
        <>
          <div className="workout-overview">
            <div className="workout-introduction">
              <p className="workout-eyebrow">A LITTLE TIME FOR YOURSELF</p>
              <h2><span>Move.</span><span>Breathe.</span><span>Reset.</span></h2>
              <p className="workout-lead">A full-body break, at your own pace.</p>
              <div className="workout-facts"><span><Clock3 aria-hidden="true" /><strong>7:00</strong> total</span><span><Activity aria-hidden="true" /><strong>30s</strong> per move</span><span><Timer aria-hidden="true" /><strong>5s</strong> transitions</span></div>
              <RemoteButton ref={primaryRef} className="workout-button workout-primary" onClick={start}><Play fill="currentColor" /> Start workout</RemoteButton>
              <p className="workout-safety">Have a mat, a wall, and a low, stable step or secured bench nearby. Take longer breaks whenever you need. Stop if you feel pain or dizziness.</p>
            </div>
            <div className="workout-preview">
              <div className="workout-artwork"><img src={imageUrl('jumping_jacks')} alt="Two positions of a jumping jack" /><span className="workout-artwork-caption">01 / Jumping jacks</span></div>
              <ol className="workout-routine">{exercises.map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, '0')}</span>{item.name}</li>)}</ol>
            </div>
          </div>
        </>
      ) : complete ? (
        <div className="workout-complete">
          <div className="workout-check"><Check size={48} /></div>
          <p className="workout-eyebrow">SESSION COMPLETE</p>
          <h2>Seven minutes.<br />Well spent.</h2>
          <p>12 exercises complete. Catch your breath, walk gently, and have some water.</p>
          <div className="workout-actions">
            <RemoteButton ref={primaryRef} className="workout-button workout-primary" onClick={start}><RotateCcw /> Do it again</RemoteButton>
            <RemoteButton className="workout-button workout-secondary" onClick={() => { setStatus('idle'); setElapsed(0) }}>Done</RemoteButton>
          </div>
        </div>
      ) : (
        <>
          <div className="workout-session" data-phase={stage.kind}>
            <div className="workout-move">
              <p className="workout-eyebrow" role="status">{status === 'paused' ? 'PAUSED' : stage.kind === 'ready' ? 'GET READY' : stage.kind === 'rest' ? 'REST / UP NEXT' : stage.switchSide ? 'SWITCH SIDES' : 'LET\'S MOVE'}</p>
              <h2>{exercise.name}</h2>
              <img key={exercise.id} src={imageUrl(exercise.id)} alt={`${exercise.name} positions`} />
              <p className="workout-cue">{stage.switchSide ? 'Change to your other side. Keep breathing.' : exercise.cue}</p>
              <p className="workout-easier"><span>Gentler option</span> {exercise.easier}</p>
            </div>
            <div className="workout-timing">
              <div className="workout-timer-dial" style={{ '--interval-progress': `${100 * (stage.duration - stage.remaining) / stage.duration}%` } as CSSProperties}>
              <progress className="workout-stage-progress" max={stage.duration} value={stage.duration - stage.remaining} aria-label="Current interval progress" />
              <div className="workout-countdown" role="timer" aria-label={`${stage.remaining} seconds remaining`}>
                <span>{String(stage.remaining).padStart(2, '0')}</span>
                <span className="workout-seconds">seconds</span>
              </div>
              </div>
              <p className="workout-remaining">{formatTime(TOTAL_SECONDS - elapsed)} <span>left in session</span></p>
              <div className="workout-actions">
                <RemoteButton ref={primaryRef} className="workout-button workout-primary" onClick={status === 'running' ? pause : start}>{status === 'running' ? <Pause /> : <Play fill="currentColor" />}{status === 'running' ? 'Pause' : 'Resume'}</RemoteButton>
                <RemoteButton className="workout-button workout-secondary" onClick={() => requestExit()}><Square /> End</RemoteButton>
              </div>
              <div className="workout-next"><span>{stage.kind === 'exercise' ? 'UP NEXT' : 'STARTING NEXT'}</span><strong>{stage.kind !== 'exercise' ? exercise.name : exercises[stage.exerciseIndex + 1]?.name ?? 'Finish & cool down'}</strong></div>
            </div>
          </div>
          <div className="workout-progress" aria-label={`Exercise ${stage.exerciseIndex + 1} of 12`}>{exercises.map((item, index) => <span key={item.id} className={index < stage.exerciseIndex ? 'is-done' : index === stage.exerciseIndex ? 'is-current' : ''} aria-current={index === stage.exerciseIndex ? 'step' : undefined}>{index < stage.exerciseIndex ? <Check aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span>)}</div>
        </>
      )}
      </div>
      </div>
      {exitOpen && <ConfirmationDialog title="End this workout?" message="Your session is paused. You can keep going or end here." confirmLabel="End workout" cancelLabel="Keep going" destructive onConfirm={finishExit} onCancel={cancelExit} />}
    </RemoteAppShell>
    </div>
  )
}

export default App
