import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Pause, Play, RotateCcw, Settings, Square, Volume2, X, ZoomIn, ZoomOut } from 'lucide-react'
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
  const fallback: Preferences = { language: 'en', start: localDate(), font: 36, completed: [] }
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
      font: [24, 28, 32, 36, 40, 44, 48].includes(stored.font) ? stored.font : fallback.font,
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
  const [panel, setPanel] = useState<'readings' | 'settings' | null>(null)
  const panelElement = useRef<HTMLDivElement>(null)
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

  const readingsLabel = language === 'nl' ? 'Lezingen' : 'Readings'
  const settingsLabel = language === 'nl' ? 'Instellingen' : 'Settings'
  const closeLabel = language === 'nl' ? 'Sluiten' : 'Close'

  function closePanel() {
    const selector = panel === 'readings' ? '.scripture-open-readings' : '.scripture-open-settings'
    setPanel(null)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus())
  }

  useEffect(() => {
    if (!panel) return
    const element = panelElement.current
    element?.querySelector<HTMLButtonElement>('[data-remote-initial]:not(:disabled)')?.focus()
    if (!element?.contains(document.activeElement)) element?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !element) return
      const controls = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]'))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [panel])

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
    let active = true
    void document.fonts.ready.then(() => { if (active) fit() })
    document.fonts.addEventListener('loadingdone', fit)
    const observer = new ResizeObserver(fit)
    observer.observe(area)
    window.addEventListener('resize', fit)
    return () => {
      active = false
      document.fonts.removeEventListener('loadingdone', fit)
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
    <div className="scripture-app" style={{ '--scripture-font': `${font}px` } as CSSProperties}>
      <RemoteAppShell title="Scripture" category={text.plan} theme="scripture" initialFocusSelector=".scripture-open-readings" onBack={() => {
        if (panel) closePanel()
        else window.location.assign('/')
        return true
      }}>
        <div className="scripture-toolbar">
          <RemoteButton className="scripture-open-readings" aria-haspopup="dialog" aria-expanded={panel === 'readings'} onClick={() => setPanel('readings')}><BookOpen /><span>{readingsLabel}</span></RemoteButton>
          <RemoteButton className="scripture-open-settings" aria-haspopup="dialog" aria-expanded={panel === 'settings'} aria-label={`${settingsLabel}, ${text.day} ${day} / 365, ${text.edition}`} onClick={() => setPanel('settings')}><CalendarDays /><span>{text.day} {day} / 365</span><span className="scripture-edition">{language === 'en' ? 'KJV' : 'SV'}</span><Settings size={22} /></RemoteButton>
        </div>

        <div className="scripture-workspace">
          <section className="scripture-reader" aria-label={text.sections[section]}>
            <header className="scripture-reader-heading">
              <div><p>{currentBook ? bookName(currentBook, language) : text.sections[section]}</p><h2 title={reading?.reference}>{heading ?? text.sections[section]}</h2></div>
              <RemoteButton className="scripture-audio-toggle" title={audioLabel} aria-label={audioLabel} disabled={!reading?.verses.length || loading} onClick={speak}>{audio === 'playing' ? <Pause /> : audio === 'paused' ? <Play /> : <Volume2 />}</RemoteButton>
            </header>
            <div className="scripture-reading-area" ref={viewport}>
              {loading ? <div className="scripture-empty" role="status"><BookOpen size={32} /><p>{text.loading}</p></div>
                : error ? <div className="scripture-empty" role="alert"><p>{text.error}</p><RemoteButton onClick={() => { setLoading(true); setError(false); setRetry((current) => current + 1) }}>{text.retry}</RemoteButton></div>
                  : reading && !reading.verses.length ? <div className="scripture-empty"><BookOpen size={32} /><h3>{text.pending}</h3><p>{reading.note}</p><p className="scripture-original">{text.pdf}: {reading.original}</p></div>
                    : <div className="scripture-reading-text" key={readingKey} lang={language}>
                      {currentPage.map((fragment, index) => <p key={`${fragment.index}:${index}`} data-speaking={spokenVerse === fragment.index}><sup title={fragment.book ? bookName(fragment.book, language) : undefined}>{index > 0 && fragment.book !== currentPage[index - 1].book && fragment.book ? `${bookName(fragment.book, language)} ` : ''}{fragment.chapter}:{fragment.verse} </sup>{fragment.text}</p>)}
                    </div>}
            </div>
            <div className="scripture-measure scripture-reading-text" ref={measurement} aria-hidden="true" />
            {notice && <div className="scripture-notice" role="status">{notice}</div>}
            <footer className="scripture-reader-controls">
              <RemoteButton title={text.previous} aria-label={text.previous} disabled={pageIndex <= 0 || !pages.length || loading} onClick={() => changePage(pageIndex - 1)}><ChevronLeft /><span>{language === 'nl' ? 'Vorige' : 'Previous'}</span></RemoteButton>
              <div className="scripture-pages" aria-live="polite"><span>{text.page} {pages.length ? pageIndex + 1 : 0} / {pages.length}</span><div className="scripture-page-dots" aria-hidden="true">{Array.from({ length: Math.min(pages.length, 9) }, (_, index) => <i key={index} data-active={index === Math.min(8, Math.floor(pageIndex * Math.min(pages.length, 9) / Math.max(1, pages.length)))} />)}</div></div>
              <RemoteButton className="scripture-next" title={nextLabel} aria-label={nextLabel} disabled={!pages.length || loading || finalPage && isComplete} onClick={() => lastPage ? finishAndContinue() : changePage(pageIndex + 1)}><span>{finalPage ? (isComplete ? (language === 'nl' ? 'Voltooid' : 'Complete') : text.done) : lastPage ? (language === 'nl' ? 'Volgende lezing' : 'Next reading') : (language === 'nl' ? 'Volgende' : 'Next')}</span>{finalPage ? <Check /> : <ChevronRight />}</RemoteButton>
            </footer>
          </section>

          {panel && <div className="scripture-panel-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closePanel() }}>
            <div className={`scripture-panel scripture-panel--${panel}`} ref={panelElement} role="dialog" aria-modal="true" aria-labelledby="scripture-panel-title">
              <header className="scripture-panel-heading"><h2 id="scripture-panel-title">{panel === 'readings' ? readingsLabel : settingsLabel}</h2><RemoteButton title={closeLabel} aria-label={closeLabel} onClick={closePanel}><X /></RemoteButton></header>
              {panel === 'readings' ? <>
                <p className="scripture-schedule-heading">{text.day} {day}<span>{readCount}/4 {text.complete}</span></p>
                <nav className="scripture-list" aria-label={text.plan}>
                  {text.sections.map((label, index) => <RemoteButton key={label} data-remote-initial={section === index ? '' : undefined} aria-pressed={section === index} title={label} onClick={() => { changeSection(index); closePanel() }}>
                    <span className="scripture-section-number">{completed.includes(`catholic-gallery-v1:${start}:${day}:${index}`) ? <Check /> : `0${index + 1}`}</span>
                    <span className="scripture-reference">{plan[day - 1]?.[index] ? planReference(plan[day - 1][index], language) : label}</span><ChevronRight size={20} />
                  </RemoteButton>)}
                </nav>
              </> : <div className="scripture-settings-content">
                <div className="scripture-day-picker">
                  <RemoteButton data-remote-initial="" title={text.previousDay} aria-label={text.previousDay} disabled={day === 1} onClick={() => changeDay(day - 1)}><ChevronLeft /></RemoteButton>
                  <label>{text.day} <input aria-label={text.day} type="number" min="1" max="365" value={day} onChange={(event) => { if (event.target.value) changeDay(Number(event.target.value)) }} /> <span>/ 365</span></label>
                  <RemoteButton title={text.nextDay} aria-label={text.nextDay} disabled={day === 365} onClick={() => changeDay(day + 1)}><ChevronRight /></RemoteButton>
                  <RemoteButton title={text.today} aria-label={text.today} onClick={() => changeDay(dayForDate(start))}><RotateCcw /></RemoteButton>
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
                <div className="scripture-settings-row"><span>{language === 'nl' ? 'Tekstgrootte' : 'Text size'}</span><div className="scripture-text-size">
                  <RemoteButton title={text.smaller} aria-label={text.smaller} disabled={font === 24} onClick={() => setPreferences((current) => ({ ...current, font: current.font - 4 }))}><ZoomOut /></RemoteButton>
                  <output>{font}</output>
                  <RemoteButton title={text.larger} aria-label={text.larger} disabled={font === 48} onClick={() => setPreferences((current) => ({ ...current, font: current.font + 4 }))}><ZoomIn /></RemoteButton>
                </div></div>
                <div className="scripture-playback">
                  <RemoteButton disabled={!reading?.verses.length || loading} onClick={speak}>{audio === 'playing' ? <Pause /> : audio === 'paused' ? <Play /> : <Volume2 />}<span>{audioLabel}</span></RemoteButton>
                  <RemoteButton title={text.stop} aria-label={text.stop} disabled={audio === 'idle'} onClick={stopAudio}><Square size={18} /></RemoteButton>
                </div>
                <RemoteButton className="scripture-mark-read" disabled={!reading?.verses.length || loading} aria-pressed={isComplete} onClick={() => setPreferences((current) => ({ ...current, completed: isComplete ? current.completed.filter((key) => key !== completionKey) : [...current.completed, completionKey] }))}>{isComplete ? <Check /> : <Circle />}<span>{isComplete ? text.undo : text.done}</span></RemoteButton>
                <div className="scripture-source"><strong>{text.edition}</strong><p>{text.pdf} (CPDV): {reading?.original}</p><span>CATHOLIC GALLERY</span><p>{language === 'nl' ? '365 dagen · Inclusief deuterocanonieke boeken' : '365 days · Including deuterocanonical books'}</p></div>
              </div>}
            </div>
          </div>}
        </div>
      </RemoteAppShell>
    </div>
  )
}
