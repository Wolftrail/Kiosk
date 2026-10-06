import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckSquare, ChevronLeft, ChevronRight, CircleCheck, Eye, Layers, RefreshCw, RotateCcw, SlidersHorizontal, Square, SquareStop, Target, Trophy, Volume2, Zap } from 'lucide-react'
import { ConfirmationDialog, finishScheduledApp, getScheduledLaunch, RemoteAppShell, RemoteButton, useToast } from '@kiosk/remote-ui'
import { isDue, parseLibrary, selectCards } from './library'
import type { Library } from './library'
import { advanceSession, applyProgress, createSession, rememberCard, reviewCard } from './session'
import type { Progress, Rating, Session } from './session'
import { paginateText } from './paginate'
import ImageCredit from './ImageCredit'
import { pronunciationVoice } from './speech'

const PROGRESS_KEY = 'recite.progress.v1'
const DECKS_KEY = 'recite.decks.v1'
const ratingOptions = [
  { value: 'again', label: 'Again', Icon: RotateCcw },
  { value: 'hard', label: 'Hard', Icon: Layers },
  { value: 'good', label: 'Good', Icon: Check },
  { value: 'easy', label: 'Easy', Icon: Zap },
] as const

function stored(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}

function savedProgress(): Progress {
  const value = stored(PROGRESS_KEY)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Progress : {}
}

function CardText({ text, language }: { text: string; language?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const previousRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [layout, setLayout] = useState({ pages: [text], size: 72 })
  const [pageIndex, setPageIndex] = useState(0)
  useLayoutEffect(() => {
    const container = containerRef.current
    const paragraph = textRef.current
    if (!container || !paragraph) return
    const fit = () => {
      if (!container.clientHeight || !container.clientWidth) return
      const previous = paragraph.textContent
      const fits = (candidate: string, size: number) => {
        paragraph.textContent = candidate
        paragraph.style.fontSize = `${size}px`
        return paragraph.scrollHeight <= container.clientHeight && paragraph.scrollWidth <= container.clientWidth
      }
      let lower = 24
      let upper = 72
      while (upper - lower > 1) {
        const size = Math.floor((upper + lower) / 2)
        if (fits(text, size)) lower = size
        else upper = size
      }
      const pages = paginateText(text, (candidate) => fits(candidate, lower))
      paragraph.textContent = previous
      paragraph.style.fontSize = `${lower}px`
      setLayout({ pages, size: lower })
      setPageIndex(0)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    fit()
    void document.fonts.ready.then(fit)
    return () => observer.disconnect()
  }, [text])
  function changePage(nextPage: number) {
    setPageIndex(nextPage)
    requestAnimationFrame(() => {
      const target = nextPage === 0 ? nextRef.current
        : nextPage === layout.pages.length - 1 ? previousRef.current
        : nextPage > pageIndex ? nextRef.current : previousRef.current
      target?.focus({ preventScroll: true })
    })
  }
  return <div className="recite-card-body">
    <div className="recite-card-text" ref={containerRef}><p ref={textRef} dir="auto" lang={language} style={{ fontSize: layout.size }}>{layout.pages[pageIndex]}</p></div>
    <div className="recite-card-pages" data-paginated={layout.pages.length > 1} aria-hidden={layout.pages.length === 1}>
      <RemoteButton ref={previousRef} className="recite-icon-button" disabled={pageIndex === 0} aria-label="Previous text page" title="Previous text page" onClick={() => changePage(pageIndex - 1)}><ChevronLeft aria-hidden="true" /></RemoteButton>
      <span aria-live="polite">{pageIndex + 1} / {layout.pages.length}</span>
      <RemoteButton ref={nextRef} className="recite-icon-button" disabled={pageIndex >= layout.pages.length - 1} aria-label="Next text page" title="Next text page" onClick={() => changePage(pageIndex + 1)}><ChevronRight aria-hidden="true" /></RemoteButton>
    </div>
  </div>
}

export default function App() {
  const { toast } = useToast()
  const [scheduledLaunch] = useState(() => getScheduledLaunch('recite'))
  const scheduledStarted = useRef(false)
  const [library, setLibrary] = useState<Library | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [choosingDecks, setChoosingDecks] = useState(false)
  const [pendingDecks, setPendingDecks] = useState<string[]>([])
  const [practice, setPractice] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const progress = useRef<Progress>(savedProgress())
  const storageWarning = useRef(false)
  const grading = useRef(false)
  const training = session !== null
  const complete = !!session && session.index >= session.cards.length
  const card = session?.cards[session.index]
  const activeDeck = library?.decks.find((deck) => deck.id === card?.deckId)

  useEffect(() => {
    const stop = () => {
      utterance.current = null
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      setSpeaking(false)
    }
    const hide = () => { if (document.hidden) stop() }
    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', hide)
      stop()
    }
  }, [])

  function stopPronunciation() {
    utterance.current = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  function speakAnswer() {
    stopPronunciation()
    if (!card || !activeDeck?.language) return
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      toast('Pronunciation is not supported by this browser.', { variant: 'warning' })
      return
    }
    const synth = window.speechSynthesis
    const voice = pronunciationVoice(synth.getVoices(), activeDeck.language)
    if (!voice) {
      toast(`No voice is available for ${activeDeck.language}. Install a matching voice on this device, then try again.`, { variant: 'warning' })
      return
    }
    const next = new SpeechSynthesisUtterance(card.back)
    next.lang = activeDeck.language
    next.voice = voice
    next.onend = () => { if (utterance.current === next) { utterance.current = null; setSpeaking(false) } }
    const fail = () => {
      if (utterance.current !== next) return
      utterance.current = null
      setSpeaking(false)
      toast('Could not speak this answer. Try replaying it.', { variant: 'warning' })
    }
    next.onerror = fail
    utterance.current = next
    setSpeaking(true)
    try { synth.speak(next) }
    catch { fail() }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/recite/library', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The card library could not be loaded.')
        return parseLibrary(await response.json())
      })
      .then((data) => {
        if (controller.signal.aborted) return
        const preferences = stored(DECKS_KEY)
        const enabled = data.decks.filter((deck) => deck.enabled).map((deck) => deck.id)
        const deckIds = Array.isArray(preferences) ? enabled.filter((id) => preferences.includes(id)) : enabled
        const currentLibrary = applyProgress(data, progress.current)
        setSelected(deckIds)
        setLibrary(currentLibrary)
        if (scheduledLaunch && !scheduledStarted.current) {
          scheduledStarted.current = true
          const cards = selectCards(currentLibrary, deckIds, true)
          if (cards.length) setSession(createSession(cards, false))
        }
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'The card library could not be loaded.')
        setStatus('error')
      })
    return () => controller.abort()
  }, [reload, scheduledLaunch])

  useEffect(() => {
    if (!scheduledLaunch || status !== 'ready' || (session && !complete)) return
    const timer = window.setTimeout(() => finishScheduledApp('recite'), 5000)
    return () => window.clearTimeout(timer)
  }, [scheduledLaunch, status, session, complete])

  useEffect(() => {
    grading.current = false
    const preferred = document.querySelector<HTMLElement>('.recite [data-primary]:not(:disabled)')
      ?? document.querySelector<HTMLElement>('.recite button:not(:disabled)')
    preferred?.focus({ preventScroll: true })
  }, [status, session?.index, training, complete, revealed])

  function persist(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {
      if (!storageWarning.current) {
        storageWarning.current = true
        toast('Browser storage is unavailable. Progress will last only until this app closes.', { variant: 'warning' })
      }
    }
  }

  function toggleDeck(id: string) {
    setPendingDecks((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
  }

  function chooseDecks() {
    setPendingDecks(selected)
    setChoosingDecks(true)
  }

  function saveDecks() {
    setSelected(pendingDecks)
    persist(DECKS_KEY, pendingDecks)
    setChoosingDecks(false)
  }

  function refresh() {
    setStatus('loading')
    setReload((value) => value + 1)
  }

  function start() {
    if (!library) return
    const cards = selectCards(library, selected, !practice)
    if (!cards.length) return
    setSession(createSession(cards, practice))
    setRevealed(false)
  }

  function grade(rating: Rating) {
    if (!session || !card || !revealed || grading.current) return
    stopPronunciation()
    grading.current = true
    const reviewed = session.practice ? card : reviewCard(card, rating)
    if (!session.practice && library) {
      progress.current = rememberCard(progress.current, reviewed)
      persist(PROGRESS_KEY, progress.current)
      setLibrary({ ...library, flashcards: library.flashcards.map((entry) => entry.id === reviewed.id ? reviewed : entry) })
    }
    setSession(advanceSession(session, rating, reviewed))
    setRevealed(false)
  }

  function back() {
    stopPronunciation()
    if (finishScheduledApp('recite')) return true
    if (!session) { window.location.assign('/'); return true }
    setSession(null)
    setRevealed(false)
    return true
  }

  const enabledDecks = library?.decks.filter((deck) => deck.enabled) ?? []
  const chosenDecks = enabledDecks.filter((deck) => selected.includes(deck.id))
  const dueCount = library ? selectCards(library, selected, true).length : 0
  const totalCount = library ? selectCards(library, selected, false).length : 0
  const available = practice ? totalCount : dueCount
  const results = Object.values(session?.results ?? {})
  const recalled = results.filter((rating) => rating !== 'again').length

  return (
    <RemoteAppShell title="Recite" category="Learning" theme="recite" backHref={scheduledLaunch?.returnUrl ?? '/'} onBack={back} initialFocusSelector="[data-primary]">
      <div className="recite" onKeyDown={(event) => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault() }}>
        {!session && <>
          {!scheduledLaunch && <div className="recite-heading">
            <div className="recite-heading-title"><span className="recite-heading-icon"><Layers aria-hidden="true" /></span><div><p className="recite-eyebrow">Your decks</p><h2>Make it memorable.</h2></div></div>
            <div className="recite-heading-actions">
              {status === 'ready' && enabledDecks.length > 0 && <RemoteButton className="recite-button recite-secondary recite-choose" aria-haspopup="dialog" onClick={chooseDecks}><SlidersHorizontal aria-hidden="true" />Choose decks</RemoteButton>}
            </div>
          </div>}
          {status === 'loading' && <div className="recite-empty" role="status"><Layers size={48} /><h2>Loading decks...</h2></div>}
          {status === 'error' && <div className="recite-empty" role="alert"><Layers size={48} /><h2>Library unavailable</h2><p>{error}</p><RemoteButton className="recite-button" data-primary onClick={refresh}><RefreshCw />Try again</RemoteButton></div>}
          {status === 'ready' && (scheduledLaunch ? <div className="recite-complete">
            <CircleCheck className="recite-trophy" size={76} aria-hidden="true" />
            <p className="recite-eyebrow">Scheduled review</p>
            <h2>{enabledDecks.length === 0 ? 'No decks available' : selected.length === 0 ? 'No decks selected' : totalCount === 0 ? 'No cards to review' : 'All caught up.'}</h2>
            <RemoteButton className="recite-button" data-primary onClick={back}><Check aria-hidden="true" />Done</RemoteButton>
          </div> : <>
            {enabledDecks.length === 0 ? <div className="recite-empty"><Layers size={56} /><h2>No decks available</h2><p>No enabled decks are in the library.</p></div> : chosenDecks.length === 0 ? <div className="recite-empty"><Layers size={56} aria-hidden="true" /><h2>No decks selected</h2></div> :
              <div className="recite-decks" role="region" aria-label="Chosen decks">
                {chosenDecks.map((deck, index) => {
                  const cards = library!.flashcards.filter((entry) => entry.deckId === deck.id)
                  const due = cards.filter((entry) => isDue(entry)).length
                  return <div key={deck.id} className="recite-deck-tile">
                  <article className="recite-deck" data-tone={index % 3} data-image={!!deck.image}>
                    <div className="recite-deck-cover">
                      {deck.image ? <img className="recite-deck-image" src={deck.image.url} alt={deck.image.alt} loading="lazy" /> : <Layers className="recite-deck-placeholder" aria-hidden="true" />}
                      <div className="recite-deck-symbol"><Layers size={26} aria-hidden="true" /><span>{String(index + 1).padStart(2, '0')}</span></div>
                    </div>
                    <div className="recite-deck-details">
                      <h3 dir="auto">{deck.name}</h3>
                      <div className="recite-deck-count"><span><Layers size={20} aria-hidden="true" />{cards.length} cards</span><span><Target size={20} aria-hidden="true" />{due} due</span></div>
                    </div>
                  </article>
                  {deck.image && <ImageCredit image={deck.image} linked={false} />}
                  </div>
                })}
              </div>}
            <div className="recite-setup">
              <div className="recite-mode" role="group" aria-label="Training mode">
                <RemoteButton aria-pressed={!practice} onClick={() => setPractice(false)}><Layers aria-hidden="true" />Review <span>{dueCount}</span></RemoteButton>
                <RemoteButton aria-pressed={practice} onClick={() => setPractice(true)}><Target aria-hidden="true" />Practice <span>{totalCount}</span></RemoteButton>
              </div>
              <p className="recite-selection" role="status">{selected.length === 0 ? 'No decks selected' : available === 0 ? (practice ? 'No cards in these decks' : 'All caught up') : `${selected.length} ${selected.length === 1 ? 'deck' : 'decks'} selected`}</p>
              <RemoteButton className="recite-button recite-start" data-primary disabled={!available} onClick={start}>{practice ? 'Start practice' : 'Start review'}<ArrowRight aria-hidden="true" /></RemoteButton>
            </div>
          </>)}
        </>}
        {choosingDecks && <ConfirmationDialog
          title="Choose decks"
          className="recite-deck-picker"
          confirmLabel="Done"
          confirmIcon={<Check aria-hidden="true" />}
          onConfirm={saveDecks}
          onCancel={() => setChoosingDecks(false)}
          message={<>
            <p className="recite-picker-summary" role="status">{pendingDecks.length} {pendingDecks.length === 1 ? 'deck' : 'decks'} selected</p>
            <div className="recite-picker-list" role="group" aria-label="Available decks">
              {enabledDecks.map((deck) => {
                const checked = pendingDecks.includes(deck.id)
                const SelectionIcon = checked ? CheckSquare : Square
                const cards = library!.flashcards.filter((entry) => entry.deckId === deck.id)
                return <RemoteButton key={deck.id} className="recite-picker-deck" role="checkbox" aria-checked={checked} onClick={() => toggleDeck(deck.id)}>
                  <SelectionIcon aria-hidden="true" />
                  <span className="recite-picker-deck-copy"><span dir="auto">{deck.name}</span><span className="recite-picker-count">{cards.length} cards / {cards.filter((entry) => isDue(entry)).length} due</span></span>
                </RemoteButton>
              })}
            </div>
          </>}
        />}
        {session && !complete && card && <>
          <div className="recite-session-heading">
            <RemoteButton className="recite-button recite-secondary" onClick={back}><ArrowLeft aria-hidden="true" />{scheduledLaunch ? 'Done' : 'Decks'}</RemoteButton>
            <div className="recite-session-deck">
              {activeDeck?.image && <img className="recite-session-image" src={activeDeck.image.url} alt="" />}
              <div className="recite-session-deck-copy"><span className="recite-deck-name" dir="auto" title={activeDeck?.name}>{activeDeck?.name}</span>{activeDeck?.image && <ImageCredit image={activeDeck.image} linked={false} />}</div>
            </div>
            <span className="recite-counter">{session.index + 1} / {session.cards.length}</span>
          </div>
          <progress className="recite-progress" value={session.index} max={session.cards.length} aria-label="Session progress" />
          <div className="recite-flashcard" data-revealed={revealed}>
            <div className="recite-card-heading">
              <div className="recite-card-state"><span className="recite-card-state-icon">{revealed ? <Check aria-hidden="true" /> : <Layers aria-hidden="true" />}</span><div><p className="recite-eyebrow">{session.practice ? 'Practice' : 'Review'}</p><h2>{revealed ? 'Answer' : 'Question'}</h2></div></div>
              {revealed && activeDeck?.language && <RemoteButton className="recite-icon-button" aria-label={speaking ? 'Stop pronunciation' : 'Speak answer'} title={speaking ? 'Stop pronunciation' : 'Speak answer'} onClick={speaking ? stopPronunciation : speakAnswer}>{speaking ? <SquareStop aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</RemoteButton>}
            </div>
            <CardText key={`${card.id}-${revealed}`} text={revealed ? card.back : card.front} language={revealed ? activeDeck?.language : undefined} />
          </div>
          <div className="recite-actions">
            {!revealed ? <RemoteButton className="recite-button recite-reveal" data-primary onClick={() => { setRevealed(true); speakAnswer() }}><Eye aria-hidden="true" />Reveal answer</RemoteButton> :
              <div className="recite-ratings" aria-label="Rate your recall">{ratingOptions.map(({ value, label, Icon }) => <RemoteButton key={value} className="recite-button" data-rating={value} data-primary={value === 'good' ? '' : undefined} onClick={() => grade(value)}><Icon aria-hidden="true" />{label}</RemoteButton>)}</div>}
          </div>
        </>}
        {session && complete && <div className="recite-complete">
          <Trophy className="recite-trophy" size={76} aria-hidden="true" />
          <p className="recite-eyebrow">{session.practice ? 'Practice complete' : 'Review complete'}</p>
          <h2>A little more remembered.</h2>
          <div className="recite-results"><span><CircleCheck aria-hidden="true" />{recalled} recalled</span><span><RotateCcw aria-hidden="true" />{results.length - recalled} to revisit</span></div>
          <div className="recite-complete-actions"><RemoteButton className="recite-button recite-secondary" data-primary={scheduledLaunch ? '' : undefined} onClick={back}><ArrowLeft aria-hidden="true" />{scheduledLaunch ? 'Done' : 'Decks'}</RemoteButton>{!scheduledLaunch && available > 0 && <RemoteButton className="recite-button" data-primary onClick={start}>{session.practice ? 'Practice again' : 'Review more'}<ArrowRight aria-hidden="true" /></RemoteButton>}</div>
        </div>}
      </div>
    </RemoteAppShell>
  )
}