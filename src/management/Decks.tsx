import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Download, ImagePlus, Layers, Pencil, Plus, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react'
import { ConfirmationDialog, useToast } from '@kiosk/remote-ui'
import { parseLibrary, type Deck, type Flashcard, type Library } from '../../apps/recite/src/library'
import ImageCredit from '../../apps/recite/src/ImageCredit'
import DeckImagePicker from './DeckImagePicker'

const endpoint = '/api/recite/library'
const languages = [
  ['th-TH', 'Thai'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'],
  ['ar', 'Arabic'], ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'],
  ['nl-NL', 'Dutch'], ['fr-FR', 'French'], ['de-DE', 'German'], ['el-GR', 'Greek'],
  ['he-IL', 'Hebrew'], ['hi-IN', 'Hindi'], ['id-ID', 'Indonesian'], ['it-IT', 'Italian'],
  ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['ms-MY', 'Malay'], ['pl-PL', 'Polish'],
  ['pt-BR', 'Portuguese (Brazil)'], ['pt-PT', 'Portuguese (Portugal)'], ['ru-RU', 'Russian'],
  ['es-ES', 'Spanish'], ['sv-SE', 'Swedish'], ['tr-TR', 'Turkish'], ['uk-UA', 'Ukrainian'], ['vi-VN', 'Vietnamese'],
] as const
const newDeck = (): Deck => ({ id: crypto.randomUUID(), name: '', enabled: true })
const newCard = (deckId: string): Flashcard => ({ id: crypto.randomUUID(), deckId, front: '', back: '', interval: 0, repetitions: 0, easeFactor: 2.5, lastReviewDate: null })
type Confirmation = { title: string; message: string; label: string; destructive?: boolean; action: () => void }

export default function Decks({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { toast } = useToast()
  const [library, setLibrary] = useState<Library | null>(null)
  const [deck, setDeck] = useState<Deck>(newDeck)
  const [card, setCard] = useState<Flashcard>(() => newCard(''))
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [imagePicker, setImagePicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const originalDeck = library?.decks.find((entry) => entry.id === deck.id)
  const originalCard = library?.flashcards.find((entry) => entry.id === card.id)
  const deckDirty = originalDeck ? JSON.stringify(deck) !== JSON.stringify(originalDeck) : !!(deck.name || deck.image || deck.language)
  const cardDirty = originalCard ? JSON.stringify(card) !== JSON.stringify(originalCard) : !!(card.front || card.back)
  const dirty = deckDirty || cardDirty
  const cards = library?.flashcards.filter((entry) => entry.deckId === deck.id) ?? []
  const visibleCards = cards.filter((entry) => `${entry.front} ${entry.back}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))

  useEffect(() => {
    onDirtyChange(dirty)
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); onDirtyChange(false) }
  }, [dirty, onDirtyChange])

  function selectDeck(next: Deck) {
    setDeck({ ...next })
    setCard(newCard(next.id))
    setFilter('')
  }

  function guard(action: () => void) {
    if (dirty) setConfirmation({ title: 'Discard unsaved changes?', message: 'Your deck and card edits have not been saved.', label: 'Discard changes', destructive: true, action: () => {
      setDeck(originalDeck ? { ...originalDeck } : newDeck())
      setCard(newCard(deck.id))
      action()
    } })
    else action()
  }

  useEffect(() => {
    const controller = new AbortController()
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load flashcard decks.')
      const data = parseLibrary(await response.json())
      setLibrary(data)
      selectDeck(data.decks[0] ?? newDeck())
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load flashcard decks.')
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [])

  async function refresh() {
    setBusy(true)
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load flashcard decks.')
      const data = parseLibrary(await response.json())
      setLibrary(data)
      selectDeck(data.decks.find((entry) => entry.id === deck.id) ?? data.decks[0] ?? newDeck())
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load flashcard decks.') }
    finally { setBusy(false) }
  }

  async function save(next: Library, after: (saved: Library) => void, message: string) {
    setBusy(true)
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not save the flashcard library.')
      const saved = parseLibrary(result)
      setLibrary(saved)
      after(saved)
      setConfirmation(null)
      toast(message, { variant: 'success' })
    } catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not save the flashcard library.', { variant: 'error' }) }
    finally { setBusy(false) }
  }

  function saveDeck(event: FormEvent) {
    event.preventDefault()
    if (!library) return
    const next = { ...deck, name: deck.name.trim() }
    void save({ ...library, decks: originalDeck ? library.decks.map((entry) => entry.id === deck.id ? next : entry) : [...library.decks, next] }, () => setDeck(next), 'Deck saved.')
  }

  function saveCard(event: FormEvent) {
    event.preventDefault()
    if (!library || !originalDeck) return
    void save({ ...library, flashcards: originalCard ? library.flashcards.map((entry) => entry.id === card.id ? card : entry) : [...library.flashcards, card] }, () => setCard(newCard(deck.id)), 'Card saved.')
  }

  async function importFile(file: File) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Library exceeds the 5 MB limit.')
      const imported = parseLibrary(JSON.parse(await file.text()))
      setConfirmation({ title: 'Replace the flashcard library?', message: `Import ${imported.decks.length} decks and ${imported.flashcards.length} cards? This replaces all existing decks and cards, including unsaved edits.`, label: 'Replace library', destructive: true, action: () => void save(imported, (saved) => selectDeck(saved.decks[0] ?? newDeck()), 'Library imported.') })
    } catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not import the library.', { variant: 'error' }) }
  }

  function exportLibrary() {
    if (!library) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(library, null, 2) + '\n'], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'recite-library.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="management__decks" aria-labelledby="decks-title">
    <div className="management__heading"><div><h1 id="decks-title">Flashcard decks</h1><p>{library ? `${library.decks.length} decks / ${library.flashcards.length} cards` : busy ? 'Loading decks...' : 'Library unavailable'}</p></div><div className="management__deck-actions">
      <button type="button" disabled={busy || !library} title="Import library JSON" aria-label="Import library JSON" onClick={() => fileRef.current?.click()}><Upload size={18} /></button>
      <button type="button" disabled={busy || !library} title="Export saved library" aria-label="Export saved library" onClick={exportLibrary}><Download size={18} /></button>
      <button type="button" disabled={busy} title="Refresh decks" aria-label="Refresh decks" onClick={() => guard(() => void refresh())}><RefreshCw size={18} /></button>
      <input ref={fileRef} hidden type="file" accept=".json,application/json" aria-label="Library JSON file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
    </div></div>
    {error && <p className="management__notice" role="alert">{error}</p>}
    <fieldset className="management__deck-workspace" disabled={busy || !library}>
      <section className="management__deck-column" aria-label="Decks">
        <div className="management__deck-column-heading"><h2><Layers size={18} />Decks</h2><button type="button" title="New deck" aria-label="New deck" onClick={() => guard(() => selectDeck(newDeck()))}><Plus size={18} /></button></div>
        <div className="management__deck-list">{library?.decks.map((entry) => <button type="button" key={entry.id} className="management__deck-row" aria-pressed={entry.id === deck.id} onClick={() => { if (entry.id !== deck.id) guard(() => selectDeck(entry)) }}><span dir="auto"><strong>{entry.name}</strong><small>{library.flashcards.filter((item) => item.deckId === entry.id).length} cards{!entry.enabled && ' / Disabled'}</small></span></button>)}{library?.decks.length === 0 && <p>No decks yet.</p>}</div>
        <form className="management__deck-form" onSubmit={saveDeck}>
          <h2>{originalDeck ? 'Edit deck' : 'New deck'}</h2>
          <label>Deck name<input value={deck.name} required onChange={(event) => setDeck({ ...deck, name: event.target.value })} /></label>
          <label>Answer language<select value={deck.language ?? ''} onChange={(event) => {
            const language = event.target.value
            setDeck(({ language: _language, ...rest }) => language ? { ...rest, language } : rest)
          }}><option value="">None</option>{deck.language && !languages.some(([tag]) => tag === deck.language) && <option value={deck.language}>{deck.language}</option>}{languages.map(([tag, name]) => <option key={tag} value={tag}>{name}</option>)}</select></label>
          <div className="management__deck-options"><label className="management__deck-enabled"><input type="checkbox" checked={deck.enabled} onChange={(event) => setDeck({ ...deck, enabled: event.target.checked })} />Enabled</label><div className="management__deck-actions"><button type="button" title={deck.image ? 'Change image' : 'Choose image'} aria-label={deck.image ? 'Change image' : 'Choose image'} onClick={() => setImagePicker(true)}><ImagePlus size={17} /></button>{deck.image && <button type="button" title="Remove theme image" aria-label="Remove theme image" onClick={() => setDeck(({ image: _image, ...rest }) => rest)}><X size={17} /></button>}</div></div>
          {deck.image && <div className="management__deck-image"><img src={deck.image.thumbnailUrl} alt={deck.image.alt} /><ImageCredit image={deck.image} /></div>}
          <div className="management__deck-actions"><button type="submit" disabled={!deck.name.trim() || !deckDirty}><Save size={17} />Save deck</button>{originalDeck && <button type="button" title="Delete deck" aria-label="Delete deck" onClick={() => setConfirmation({ title: 'Delete this deck?', message: `This permanently deletes "${originalDeck.name}" and its ${cards.length} cards.`, label: 'Delete deck', destructive: true, action: () => { if (library) void save({ decks: library.decks.filter((entry) => entry.id !== deck.id), flashcards: library.flashcards.filter((entry) => entry.deckId !== deck.id) }, (saved) => selectDeck(saved.decks[0] ?? newDeck()), 'Deck deleted.') } })}><Trash2 size={17} /></button>}</div>
        </form>
      </section>
      <section className="management__deck-column" aria-label="Cards">
        <div className="management__deck-column-heading"><h2>Cards <small>{cards.length}</small></h2><button type="button" title="New card" aria-label="New card" disabled={!originalDeck} onClick={() => guard(() => setCard(newCard(deck.id)))}><Plus size={18} /></button></div>
        <label className="management__filter">Filter cards<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        <div className="management__deck-list">{visibleCards.map((entry) => <button type="button" key={entry.id} className="management__deck-row" aria-pressed={entry.id === card.id} onClick={() => { if (entry.id !== card.id) guard(() => { setCard({ ...entry }); if (originalDeck) setDeck({ ...originalDeck }) }) }}><span dir="auto"><strong>{entry.front}</strong><small dir="auto">{entry.back}</small></span><Pencil size={16} /></button>)}{!visibleCards.length && <p>{!originalDeck ? 'Save a deck to add cards.' : cards.length ? 'No matching cards.' : 'No cards yet.'}</p>}</div>
      </section>
      <form className="management__card-form" onSubmit={saveCard}>
        <h2>{originalCard ? 'Edit card' : 'New card'}</h2>
        <label>Front<textarea value={card.front} required disabled={!originalDeck} dir="auto" onChange={(event) => setCard({ ...card, front: event.target.value })} /></label>
        <label>Back<textarea value={card.back} required disabled={!originalDeck} dir="auto" onChange={(event) => setCard({ ...card, back: event.target.value })} /></label>
        <div className="management__deck-actions"><button type="submit" disabled={!originalDeck || !card.front.trim() || !card.back.trim() || !cardDirty}><Save size={17} />Save card</button><button type="button" title="Cancel card edits" aria-label="Cancel card edits" disabled={!cardDirty && !originalCard} onClick={() => guard(() => { setCard(newCard(deck.id)); if (originalDeck) setDeck({ ...originalDeck }) })}><X size={17} /></button>{originalCard && <button type="button" title="Delete card" aria-label="Delete card" onClick={() => setConfirmation({ title: 'Delete this card?', message: originalCard.front, label: 'Delete card', destructive: true, action: () => { if (library) void save({ ...library, flashcards: library.flashcards.filter((entry) => entry.id !== card.id) }, () => setCard(newCard(deck.id)), 'Card deleted.') } })}><Trash2 size={17} /></button>}</div>
      </form>
    </fieldset>
    <span className="management__deck-status" role="status">{busy ? 'Updating library...' : dirty ? 'Unsaved changes' : library ? 'All changes saved' : ''}</span>
    {imagePicker && <DeckImagePicker initialQuery={deck.name} onClose={() => setImagePicker(false)} onSelect={(image) => { setDeck((current) => ({ ...current, image })); setImagePicker(false) }} />}
    {confirmation && <ConfirmationDialog className="management__deck-dialog" title={confirmation.title} message={confirmation.message} confirmLabel={confirmation.label} destructive={confirmation.destructive} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.action; setConfirmation(null); action() }} />}
  </section>
}