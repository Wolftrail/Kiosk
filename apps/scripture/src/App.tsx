import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, ChevronLeft, ChevronRight, Circle, Pause, Play, RotateCcw, Square, Volume2, ZoomIn, ZoomOut } from 'lucide-react'
import { RemoteAppShell, RemoteButton, useToast } from '@kiosk/remote-ui'
import { bookName, dayForDate, planReference, resolveReading, type Bible, type Language, type Verse } from './reading'
import { paginate, type Fragment } from './paginate'
import './App.css'

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type ReadingAnchor = Pick<Verse, 'chapter' | 'verse' | 'book' | 'location'> & { offset?: number }
type ReadingPosition = { day: number; section: number; anchor: ReadingAnchor }
type Preferences = { language: Language; start: string; font: number; completed: string[]; position?: ReadingPosition }
function loadPreferences(): Preferences {
  const fallback: Preferences = { language: 'en', start: localDate(), font: 28, completed: [] }
  try {
    const stored = JSON.parse(localStorage.getItem('kiosk-scripture') ?? 'null')
    if (!stored || typeof stored !== 'object') return fallback
    const position = stored.position
    const validPosition = position && Number.isInteger(position.day) && position.day >= 1 && position.day <= 365
      && Number.isInteger(position.section) && position.section >= 0 && position.section < 4
      && position.anchor && Number.isInteger(position.anchor.chapter) && position.anchor.chapter >= 0
      && Number.isInteger(position.anchor.verse) && position.anchor.verse >= 0
    return {
      language: stored.language === 'nl' ? 'nl' : 'en',
      start: typeof stored.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stored.start) && Number.isFinite(Date.parse(stored.start)) ? stored.start : fallback.start,
      font: [24, 28, 32, 36].includes(stored.font) ? stored.font : 28,
      completed: Array.isArray(stored.completed) ? stored.completed.filter((value: unknown) => typeof value === 'string') : [],
      position: validPosition ? {
        day: position.day, section: position.section,
        anchor: {
          chapter: position.anchor.chapter, verse: position.anchor.verse,
          book: typeof position.anchor.book === 'string' ? position.anchor.book : undefined,
          location: typeof position.anchor.location === 'string' ? position.anchor.location : undefined,
          offset: Number.isInteger(position.anchor.offset) && position.anchor.offset >= 0 ? position.anchor.offset : 0,
        },
      } : undefined,
    }
  } catch { return fallback }
}

const cache = new Map<Language, Bible>()
const labels = {
  en: { day: 'Day', today: 'Today', start: 'Start date', sections: ['Old Testament I', 'Old Testament II', 'Psalms', 'New Testament'], read: 'Read aloud', pause: 'Pause', resume: 'Resume', stop: 'Stop', done: 'Mark read', undo: 'Mark unread', page: 'Page', of: 'of', loading: 'Loading Scripture...', retry: 'Retry', pending: 'Reading unavailable', previous: 'Previous page', next: 'Next page', previousDay: 'Previous day', nextDay: 'Next day', larger: 'Larger text', smaller: 'Smaller text', plan: 'Catholic Bible in a Year', edition: 'King James Version', complete: 'read', pdf: 'Plan reference', error: 'Scripture could not be loaded. Please try again.', voice: 'No English voice is installed on this device.', storage: 'Progress could not be saved on this device.' },
  nl: { day: 'Dag', today: 'Vandaag', start: 'Startdatum', sections: ['Oude Testament I', 'Oude Testament II', 'Psalmen', 'Nieuwe Testament'], read: 'Voorlezen', pause: 'Pauzeren', resume: 'Hervatten', stop: 'Stoppen', done: 'Markeer gelezen', undo: 'Markeer ongelezen', page: 'Pagina', of: 'van', loading: 'Bijbel laden...', retry: 'Opnieuw', pending: 'Lezing niet beschikbaar', previous: 'Vorige pagina', next: 'Volgende pagina', previousDay: 'Vorige dag', nextDay: 'Volgende dag', larger: 'Grotere tekst', smaller: 'Kleinere tekst', plan: 'Katholieke Bijbel in een jaar', edition: 'Statenvertaling', complete: 'gelezen', pdf: 'Planverwijzing', error: 'De Bijbel kon niet worden geladen. Probeer het opnieuw.', voice: 'Er is geen Nederlandse stem op dit apparaat geinstalleerd.', storage: 'Voortgang kon niet worden opgeslagen op dit apparaat.' },
}

export default function App() {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState(loadPreferences)
  const { language, start, font, completed } = preferences
  const text = labels[language]
  const [day, setDay] = useState(() => preferences.position?.day ?? dayForDate(start))
  const [section, setSection] = useState(() => preferences.position?.section ?? 0)
  const [plan, setPlan] = useState<string[][]>([])
  const [bible, setBible] = useState<Bible | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [notice, setNotice] = useState('')
  const [pages, setPages] = useState<Fragment[][]>([])
  const currentPages = useRef<Fragment[][]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [audio, setAudio] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [spokenVerse, setSpokenVerse] = useState(-1)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const viewport = useRef<HTMLDivElement>(null)
  const measurement = useRef<HTMLDivElement>(null)
  const anchor = useRef<ReadingAnchor>(preferences.position?.anchor ?? { chapter: 0, verse: 0 })
  const audioGeneration = useRef(0)
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const readings = useMemo(() => bible && plan[day - 1] ? plan[day - 1].map((reference, index) => resolveReading(reference, index, bible, language)) : [], [bible, plan, day, language])
  const reading = readings[section]
  const readingKey = `${day}:${section}:${language}`
  const completionKey = `catholic-gallery-v1:${start}:${day}:${section}`
  const isComplete = completed.includes(completionKey)
  const voice = voices.find((candidate) => candidate.lang.toLowerCase().startsWith(`${language}-`))
    ?? voices.find((candidate) => candidate.lang.toLowerCase() === language)

  function stopAudio() {
    audioGeneration.current += 1
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    utterance.current = null
    setAudio('idle')
    setSpokenVerse(-1)
  }

  useEffect(() => {
    const { chapter, verse, book, location, offset } = anchor.current
    const position = { day, section, anchor: { chapter, verse, book, location, offset } }
    try { localStorage.setItem('kiosk-scripture', JSON.stringify({ ...preferences, position })) }
    catch { toast(labels[preferences.language].storage, { variant: 'warning' }) }
    document.documentElement.lang = preferences.language
  }, [preferences, day, section, pageIndex, pages, toast])

  useEffect(() => {
    const controller = new AbortController()
    async function fetchJson(path: string) {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${path}.json`, { signal: controller.signal })
      if (!response.ok) throw new Error('Data unavailable')
      return response.json()
    }
    Promise.all([fetchJson('catholic-plan'), cache.has(language) ? cache.get(language) : fetchJson(language)])
      .then(([loadedPlan, loadedBible]) => {
        if (controller.signal.aborted) return
        cache.set(language, loadedBible)
        setPlan(loadedPlan)
        setBible(loadedBible)
        setLoading(false)
      }).catch(() => {
        if (controller.signal.aborted) return
        setError(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [language, retry])

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    const update = () => setVoices(synth.getVoices())
    update()
    synth.addEventListener('voiceschanged', update)
    return () => {
      audioGeneration.current += 1
      synth.cancel()
      synth.removeEventListener('voiceschanged', update)
    }
  }, [])

  useEffect(() => {
    let previousToday = dayForDate(start)
    const updateDay = () => {
      const today = dayForDate(start)
      if (today === previousToday) return
      audioGeneration.current += 1
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      setAudio('idle')
      setSpokenVerse(-1)
      anchor.current = { chapter: 0, verse: 0 }
      const expectedDay = previousToday
      setDay((current) => current === expectedDay ? today : current)
      previousToday = today
    }
    const interval = window.setInterval(updateDay, 60000)
    document.addEventListener('visibilitychange', updateDay)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', updateDay)
    }
  }, [start])

  useLayoutEffect(() => {
    const area = viewport.current
    const measure = measurement.current
    if (!area || !measure || !reading) { currentPages.current = []; setPages([]); return }
    const verses = reading.verses
    const fit = () => {
      const bounds = area.getBoundingClientRect()
      if (bounds.width < 1 || bounds.height < 1) return
      measure.style.width = `${bounds.width}px`
      const result = paginate(verses, (fragments) => {
        measure.replaceChildren(...fragments.map((fragment, index) => {
          const paragraph = document.createElement('p')
          const number = document.createElement('sup')
          number.textContent = `${index > 0 && fragment.book !== fragments[index - 1].book && fragment.book ? bookName(fragment.book, language) + ' ' : ''}${fragment.chapter}:${fragment.verse} `
          paragraph.append(number, document.createTextNode(fragment.text))
          return paragraph
        }))
        return measure.getBoundingClientRect().height <= bounds.height - 4
      })
      currentPages.current = result
      setPages(result)
      const target = result.findIndex((page) => page.some((verse) => {
        const matches = anchor.current.location ? verse.location === anchor.current.location : verse.chapter === anchor.current.chapter && verse.verse === anchor.current.verse
        const offset = anchor.current.offset ?? 0
        return matches && verse.offset <= offset && offset < verse.offset + verse.text.split(/\s+/).length
      }))
      const nextPage = Math.max(0, target)
      if (result[nextPage]?.[0]) anchor.current = result[nextPage][0]
      setPageIndex(nextPage)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(area)
    window.addEventListener('resize', fit)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [reading, font, language])

  function changeDay(next: number) {
    stopAudio()
    setNotice('')
    anchor.current = { chapter: 0, verse: 0 }
    setPageIndex(0)
    setSection(0)
    setDay(Math.max(1, Math.min(365, Math.trunc(Number.isFinite(next) ? next : 1))))
  }

  function changeSection(next: number) {
    stopAudio()
    anchor.current = { chapter: 0, verse: 0 }
    setPageIndex(0)
    setSection(next)
    setNotice('')
  }

  function changeLanguage(next: Language) {
    if (next === language) return
    stopAudio()
    setNotice('')
    const first = pages[pageIndex]?.[0]
    if (first) anchor.current = { ...first, offset: 0 }
    setLoading(true)
    setError(false)
    setBible(null)
    setPreferences((current) => ({ ...current, language: next }))
  }

  function changePage(next: number) {
    stopAudio()
    const first = pages[next]?.[0]
    if (first) anchor.current = first
    setPageIndex(next)
  }

  function speak() {
    if (!voice || !reading?.verses.length || !('speechSynthesis' in window)) { setNotice(text.voice); return }
    if (audio === 'playing') {
      window.speechSynthesis.pause()
      setAudio('paused')
      return
    }
    if (audio === 'paused') {
      window.speechSynthesis.resume()
      setAudio('playing')
      return
    }
    stopAudio()
    setNotice('')
    const generation = audioGeneration.current
    const verses = reading.verses
    const startIndex = pages[pageIndex]?.[0]?.index ?? 0
    const readVerse = (index: number) => {
      if (generation !== audioGeneration.current) return
      if (index >= verses.length) { stopAudio(); return }
      const next = new SpeechSynthesisUtterance(verses[index].text)
      next.voice = voice
      next.lang = voice.lang
      next.rate = 0.9
      next.onstart = () => {
        if (generation !== audioGeneration.current) return
        setSpokenVerse(index)
        const target = currentPages.current.findIndex((page) => page.some((fragment) => fragment.index === index))
        if (target >= 0) setPageIndex(target)
      }
      next.onend = () => readVerse(index + 1)
      next.onboundary = (event) => {
        if (generation !== audioGeneration.current) return
        let position = 0
        for (const [target, page] of currentPages.current.entries()) {
          for (const fragment of page.filter((part) => part.index === index)) {
            const end = position + fragment.text.length + 1
            if (event.charIndex >= position && event.charIndex < end) {
              setPageIndex(target)
              anchor.current = fragment
              return
            }
            position = end
          }
        }
      }
      next.onerror = (event) => {
        if (generation !== audioGeneration.current || event.error === 'canceled' || event.error === 'interrupted') return
        stopAudio()
        setNotice(language === 'nl' ? 'Voorlezen mislukt. Controleer de stemmen op dit apparaat.' : 'Read-aloud failed. Check the voices on this device.')
      }
      utterance.current = next
      window.speechSynthesis.speak(next)
    }
    setAudio('playing')
    readVerse(startIndex)
  }

  const audioLabel = audio === 'playing' ? text.pause : audio === 'paused' ? text.resume : text.read
  const currentPage = pages[pageIndex] ?? []
  const currentBook = currentPage[0]?.book ?? reading?.book
  const combinedReading = reading && new Set(reading.verses.map((verse) => verse.book)).size > 1
  const heading = combinedReading && currentBook ? `${bookName(currentBook, language)} ${currentPage[0]?.chapter ?? reading.verses[0].chapter}` : reading?.reference
  const readCount = [0, 1, 2, 3].filter((index) => completed.includes(`catholic-gallery-v1:${start}:${day}:${index}`)).length
  const continueLabel = language === 'nl' ? 'Markeer gelezen en ga verder' : 'Mark read and continue'
  const lastPage = pages.length > 0 && pageIndex >= pages.length - 1
  const finalPage = lastPage && section === text.sections.length - 1
  const nextLabel = finalPage ? (isComplete ? (language === 'nl' ? 'Lezing voltooid' : 'Reading complete') : text.done) : lastPage ? continueLabel : text.next

  function finishAndContinue() {
    if (loading || !reading?.verses.length) return
    setPreferences((current) => ({ ...current, completed: current.completed.includes(completionKey) ? current.completed : [...current.completed, completionKey] }))
    if (section < text.sections.length - 1) changeSection(section + 1)
    else stopAudio()
  }

  return (
    <div className="scripture-app">
      <RemoteAppShell title="Scripture" category={text.plan} theme="scripture" initialFocusSelector=".scripture-list button[aria-pressed='true']">
        <div className="scripture-toolbar">
          <div className="scripture-day-picker">
            <RemoteButton title={text.previousDay} aria-label={text.previousDay} disabled={day === 1} onClick={() => changeDay(day - 1)}><ChevronLeft /></RemoteButton>
            <label>{text.day} <input aria-label={text.day} type="number" min="1" max="365" value={day} onChange={(event) => { if (event.target.value) changeDay(Number(event.target.value)) }} /> <span>/ 365</span></label>
            <RemoteButton title={text.nextDay} aria-label={text.nextDay} disabled={day === 365} onClick={() => changeDay(day + 1)}><ChevronRight /></RemoteButton>
            <RemoteButton className="scripture-today" onClick={() => changeDay(dayForDate(start))}><RotateCcw size={18} />{text.today}</RemoteButton>
          </div>
          <label className="scripture-start">{text.start}<input type="date" value={start} onChange={(event) => {
            if (!event.target.value) return
            changeDay(dayForDate(event.target.value))
            setPreferences((current) => ({ ...current, start: event.target.value }))
          }} /></label>
          <div className="scripture-language" role="group" aria-label={language === 'nl' ? 'Taal' : 'Language'}>
            <RemoteButton aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>English <span>KJV</span></RemoteButton>
            <RemoteButton aria-pressed={language === 'nl'} onClick={() => changeLanguage('nl')}>Nederlands <span>SV</span></RemoteButton>
          </div>
        </div>

        <div className="scripture-workspace">
          <aside className="scripture-schedule">
            <div className="scripture-schedule-heading"><BookOpen size={22} /><span>{text.day} {day}</span><small>{readCount}/4 {text.complete}</small></div>
            <nav className="scripture-list" aria-label={text.plan}>
              {text.sections.map((label, index) => (
                <RemoteButton key={label} aria-pressed={section === index} onClick={() => changeSection(index)}>
                  <span className="scripture-section-number">{completed.includes(`catholic-gallery-v1:${start}:${day}:${index}`) ? <Check size={20} /> : `0${index + 1}`}</span>
                  <span><strong>{label}</strong><span className="scripture-reference">{plan[day - 1]?.[index] ? planReference(plan[day - 1][index], language) : '...'}</span><small>CPDV · {text.pdf}</small></span>
                </RemoteButton>
              ))}
            </nav>
            <div className="scripture-source"><span>CATHOLIC GALLERY</span><p>{language === 'nl' ? '365 dagen · Inclusief deuterocanonieke boeken' : '365 days · Including deuterocanonical books'}</p></div>
          </aside>

          <section className="scripture-reader" aria-label={text.sections[section]}>
            <header className="scripture-reader-heading">
              <div><p>{text.sections[section]} · {text.edition}</p><h2 title={reading?.reference}>{heading ?? text.sections[section]}</h2></div>
              <div className="scripture-text-size" role="group" aria-label={language === 'nl' ? 'Tekstgrootte' : 'Text size'}>
                <RemoteButton title={text.smaller} aria-label={text.smaller} disabled={font === 24} onClick={() => setPreferences((current) => ({ ...current, font: current.font - 4 }))}><ZoomOut size={21} /></RemoteButton>
                <RemoteButton title={text.larger} aria-label={text.larger} disabled={font === 36} onClick={() => setPreferences((current) => ({ ...current, font: current.font + 4 }))}><ZoomIn size={21} /></RemoteButton>
              </div>
            </header>
            <div className="scripture-reading-area" ref={viewport} style={{ fontSize: font }}>
              {loading ? <div className="scripture-empty" role="status"><BookOpen size={32} /><p>{text.loading}</p></div>
                : error ? <div className="scripture-empty" role="alert"><p>{text.error}</p><RemoteButton onClick={() => { setLoading(true); setError(false); setRetry((current) => current + 1) }}>{text.retry}</RemoteButton></div>
                  : reading && !reading.verses.length ? <div className="scripture-empty"><BookOpen size={32} /><h3>{text.pending}</h3><p>{reading.note}</p><p className="scripture-original">{text.pdf}: {reading.original}</p></div>
                    : <div className="scripture-reading-text" key={readingKey} lang={language}>
                      {currentPage.map((fragment, index) => <p key={`${fragment.index}:${index}`} data-speaking={spokenVerse === fragment.index}><sup title={fragment.book ? bookName(fragment.book, language) : undefined}>{index > 0 && fragment.book !== currentPage[index - 1].book && fragment.book ? `${bookName(fragment.book, language)} ` : ''}{fragment.chapter}:{fragment.verse} </sup>{fragment.text}</p>)}
                    </div>}
            </div>
            <div className="scripture-measure scripture-reading-text" ref={measurement} aria-hidden="true" style={{ fontSize: font }} />
            <div className="scripture-notice" role="status">{notice || (reading?.verses.length ? `${text.pdf}: ${reading.original}` : '')}</div>
            <footer className="scripture-reader-controls">
              <div className="scripture-playback">
                <RemoteButton className="scripture-read-aloud" disabled={!reading?.verses.length || loading} onClick={speak}>{audio === 'playing' ? <Pause size={20} /> : audio === 'paused' ? <Play size={20} /> : <Volume2 size={20} />}<span>{audioLabel}</span></RemoteButton>
                <RemoteButton className="scripture-stop" title={text.stop} aria-label={text.stop} disabled={audio === 'idle'} onClick={stopAudio}><Square size={14} fill="currentColor" /><span>{text.stop}</span></RemoteButton>
              </div>
              <div className="scripture-pages">
                <RemoteButton title={text.previous} aria-label={text.previous} disabled={pageIndex <= 0 || !pages.length || loading} onClick={() => changePage(pageIndex - 1)}><ChevronLeft /></RemoteButton>
                <span>{text.page} {pages.length ? pageIndex + 1 : 0} {text.of} {pages.length}</span>
                <RemoteButton title={nextLabel} aria-label={nextLabel} disabled={!pages.length || loading || finalPage && isComplete} onClick={() => lastPage ? finishAndContinue() : changePage(pageIndex + 1)}>{finalPage ? <Check /> : <ChevronRight />}</RemoteButton>
              </div>
              <RemoteButton className="scripture-mark-read" title={isComplete ? text.undo : text.done} aria-label={isComplete ? text.undo : text.done} disabled={!reading?.verses.length || loading} aria-pressed={isComplete} onClick={() => setPreferences((current) => ({ ...current, completed: isComplete ? current.completed.filter((key) => key !== completionKey) : [...current.completed, completionKey] }))}>{isComplete ? <Check size={20} /> : <Circle size={20} />}<span>{isComplete ? text.undo : text.done}</span></RemoteButton>
            </footer>
          </section>
        </div>
      </RemoteAppShell>
    </div>
  )
}
