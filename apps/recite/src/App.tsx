import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckSquare, ChevronLeft, ChevronRight, CircleCheck, Eye, Layers, RefreshCw, RotateCcw, Square, Trophy, Zap } from 'lucide-react'
import { RemoteAppShell, RemoteButton, useToast } from '@kiosk/remote-ui'
import { isDue, parseLibrary, selectCards } from './library'
import type { Library } from './library'
import { advanceSession, applyProgress, createSession, rememberCard, reviewCard } from './session'
import type { Progress, Rating, Session } from './session'
import { paginateText } from './paginate'

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

function CardText({ text }: { text: string }) {
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
    <div className="recite-card-text" ref={containerRef}><p ref={textRef} dir="auto" style={{ fontSize: layout.size }}>{layout.pages[pageIndex]}</p></div>
    <div className="recite-card-pages" data-paginated={layout.pages.length > 1} aria-hidden={layout.pages.length === 1}>
      <RemoteButton ref={previousRef} className="recite-icon-button" disabled={pageIndex === 0} aria-label="Previous text page" title="Previous text page" onClick={() => changePage(pageIndex - 1)}><ChevronLeft aria-hidden="true" /></RemoteButton>
      <span aria-live="polite">{pageIndex + 1} / {layout.pages.length}</span>
      <RemoteButton ref={nextRef} className="recite-icon-button" disabled={pageIndex >= layout.pages.length - 1} aria-label="Next text page" title="Next text page" onClick={() => changePage(pageIndex + 1)}><ChevronRight aria-hidden="true" /></RemoteButton>
    </div>
  </div>
}

export default function App() {
  const { toast } = useToast()
  const [library, setLibrary] = useState<Library | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [practice, setPractice] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [revealed, setRevealed] = useState(false)
  const progress = useRef<Progress>(savedProgress())
  const storageWarning = useRef(false)
  const grading = useRef(false)
  const training = session !== null
  const complete = !!session && session.index >= session.cards.length
  const card = session?.cards[session.index]

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/recite/library', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The card library could not be loaded.')
        return parseLibrary(await response.json())
      })
      .then((data) => {
        const preferences = stored(DECKS_KEY)
        const enabled = data.decks.filter((deck) => deck.enabled).map((deck) => deck.id)
        setSelected(Array.isArray(preferences) ? enabled.filter((id) => preferences.includes(id)) : enabled)
        setLibrary(applyProgress(data, progress.current))
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'The card library could not be loaded.')
        setStatus('error')
      })
    return () => controller.abort()
  }, [reload])

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
    const next = selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]
    setSelected(next)
    persist(DECKS_KEY, next)
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
    if (!session) { window.location.assign('/'); return true }
    setSession(null)
    setRevealed(false)
    return true
  }

  const enabledDecks = library?.decks.filter((deck) => deck.enabled) ?? []
  const dueCount = library ? selectCards(library, selected, true).length : 0
  const totalCount = library ? selectCards(library, selected, false).length : 0
  const available = practice ? totalCount : dueCount
  const results = Object.values(session?.results ?? {})
  const recalled = results.filter((rating) => rating !== 'again').length

  return (
    <RemoteAppShell title="Recite" category="Learning" theme="recite" onBack={back} initialFocusSelector="[data-primary]">
      <div className="recite" onKeyDown={(event) => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault() }}>
        {!session && <>
          <div className="recite-heading">
            <div><p className="recite-eyebrow">Your decks</p><h2>Make it memorable.</h2></div>
            <RemoteButton className="recite-icon-button" aria-label="Refresh library" title="Refresh library" onClick={refresh} disabled={status === 'loading'}><RefreshCw aria-hidden="true" /></RemoteButton>
          </div>
          {status === 'loading' && <div className="recite-empty" role="status"><Layers size={48} /><h2>Loading decks...</h2></div>}
          {status === 'error' && <div className="recite-empty" role="alert"><Layers size={48} /><h2>Library unavailable</h2><p>{error}</p><RemoteButton className="recite-button" data-primary onClick={refresh}><RefreshCw />Try again</RemoteButton></div>}
          {status === 'ready' && <>
            {enabledDecks.length === 0 ? <div className="recite-empty"><Layers size={56} /><h2>No decks available</h2><p>No enabled decks are in the library.</p></div> :
              <div className="recite-decks" aria-label="Deck selection">
                {enabledDecks.map((deck, index) => {
                  const cards = library!.flashcards.filter((entry) => entry.deckId === deck.id)
                  const due = cards.filter((entry) => isDue(entry)).length
                  const checked = selected.includes(deck.id)
                  const SelectionIcon = checked ? CheckSquare : Square
                  return <RemoteButton key={deck.id} className="recite-deck" data-tone={index % 3} role="checkbox" aria-checked={checked} onClick={() => toggleDeck(deck.id)}>
                    <div className="recite-deck-symbol"><Layers size={32} aria-hidden="true" /><span>{String(index + 1).padStart(2, '0')}</span></div>
                    <h3 dir="auto">{deck.name}</h3>
                    <div className="recite-deck-count"><span>{cards.length} cards</span><span>{due} due</span></div>
                    <SelectionIcon className="recite-deck-check" size={28} aria-hidden="true" />
                  </RemoteButton>
                })}
              </div>}
            <div className="recite-setup">
              <div className="recite-mode" role="group" aria-label="Training mode">
                <RemoteButton aria-pressed={!practice} onClick={() => setPractice(false)}>Review <span>{dueCount}</span></RemoteButton>
                <RemoteButton aria-pressed={practice} onClick={() => setPractice(true)}>Practice <span>{totalCount}</span></RemoteButton>
              </div>
              <p className="recite-selection" role="status">{selected.length === 0 ? 'No decks selected' : available === 0 ? (practice ? 'No cards in these decks' : 'All caught up') : `${selected.length} ${selected.length === 1 ? 'deck' : 'decks'} selected`}</p>
              <RemoteButton className="recite-button recite-start" data-primary disabled={!available} onClick={start}>{practice ? 'Start practice' : 'Start review'}<ArrowRight aria-hidden="true" /></RemoteButton>
            </div>
          </>}
        </>}
        {session && !complete && card && <>
          <div className="recite-session-heading">
            <RemoteButton className="recite-button recite-secondary" onClick={back}><ArrowLeft aria-hidden="true" />Decks</RemoteButton>
            <span className="recite-deck-name" dir="auto">{library?.decks.find((deck) => deck.id === card.deckId)?.name}</span>
            <span className="recite-counter">{session.index + 1} / {session.cards.length}</span>
          </div>
          <progress className="recite-progress" value={session.index} max={session.cards.length} aria-label="Session progress" />
          <div className="recite-flashcard" data-revealed={revealed}>
            <p className="recite-eyebrow">{session.practice ? 'Practice' : 'Review'} / {revealed ? 'Answer' : 'Question'}</p>
            <CardText key={`${card.id}-${revealed}`} text={revealed ? card.back : card.front} />
          </div>
          <div className="recite-actions">
            {!revealed ? <RemoteButton className="recite-button recite-reveal" data-primary onClick={() => setRevealed(true)}><Eye aria-hidden="true" />Reveal answer</RemoteButton> :
              <div className="recite-ratings" aria-label="Rate your recall">{ratingOptions.map(({ value, label, Icon }) => <RemoteButton key={value} className="recite-button" data-rating={value} data-primary={value === 'good' ? '' : undefined} onClick={() => grade(value)}><Icon aria-hidden="true" />{label}</RemoteButton>)}</div>}
          </div>
        </>}
        {session && complete && <div className="recite-complete">
          <Trophy className="recite-trophy" size={76} aria-hidden="true" />
          <p className="recite-eyebrow">{session.practice ? 'Practice complete' : 'Review complete'}</p>
          <h2>A little more remembered.</h2>
          <div className="recite-results"><span><CircleCheck aria-hidden="true" />{recalled} recalled</span><span><RotateCcw aria-hidden="true" />{results.length - recalled} to revisit</span></div>
          <div className="recite-complete-actions"><RemoteButton className="recite-button recite-secondary" onClick={back}><ArrowLeft aria-hidden="true" />Decks</RemoteButton>{available > 0 && <RemoteButton className="recite-button" data-primary onClick={start}>{session.practice ? 'Practice again' : 'Review more'}<ArrowRight aria-hidden="true" /></RemoteButton>}</div>
        </div>}
      </div>
    </RemoteAppShell>
  )
}