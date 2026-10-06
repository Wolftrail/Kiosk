import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { parseDeckImage, type DeckImage } from '../../apps/recite/src/library'
import ImageCredit from '../../apps/recite/src/ImageCredit'

export default function DeckImagePicker({ initialQuery, onSelect, onClose }: { initialQuery: string; onSelect: (image: DeckImage) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<DeckImage[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.showModal()
    dialog?.querySelector('input')?.focus({ preventScroll: true })
    return () => { requestRef.current?.abort(); dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) }
  }, [])

  async function find(term: string, nextPage = 1) {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/unsplash/search?${new URLSearchParams({ query: term.trim(), page: String(nextPage) })}`, { signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not search photos.')
      setResults(data.results.map(parseDeckImage))
      setPage(nextPage)
      setSearch(term.trim())
      setTotalPages(Math.min(data.totalPages, 1000))
      setSearched(true)
      dialogRef.current?.querySelector('.management__photo-results')?.scrollTo(0, 0)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not search photos.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }

  async function select(image: DeckImage) {
    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/unsplash/select?id=${encodeURIComponent(image.id)}`, { method: 'POST', signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not select this photo.')
      onSelect(parseDeckImage(data))
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not select this photo.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (query.trim() && !busy) void find(query) }

  return <dialog ref={dialogRef} className="management__photo-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-picker-title" onCancel={(event) => { event.preventDefault(); onClose() }} onKeyDown={(event) => {
    if (['Escape', 'GoBack', 'BrowserBack'].includes(event.key) || event.key === 'Backspace' && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }}>
    <div className="management__photo-heading"><h2 id="photo-picker-title">Theme image</h2><button type="button" title="Close image picker" aria-label="Close image picker" onClick={onClose}><X size={18} /></button></div>
    <form className="management__photo-search" onSubmit={submit}><label htmlFor="photo-query">Search Unsplash</label><div><input id="photo-query" type="search" value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} /><button type="submit" disabled={busy || !query.trim()} title="Search photos" aria-label="Search photos"><Search size={18} /></button></div></form>
    {error && <p className="management__notice" role="alert">{error}</p>}
    <div className="management__photo-results" aria-busy={busy}>
      {results.map((image) => <figure key={image.id}><button type="button" disabled={busy} aria-label={`Select ${image.alt || 'photo'} by ${image.photographer}`} onClick={() => void select(image)}><img src={image.thumbnailUrl} alt={image.alt} loading="lazy" /></button><figcaption><ImageCredit image={image} /></figcaption></figure>)}
      {searched && !results.length && !busy && <p>No matching photos.</p>}
    </div>
    <div className="management__photo-footer"><span role="status">{busy ? 'Loading photos...' : totalPages ? `Page ${page} of ${totalPages}` : ''}</span><div><button type="button" title="Previous photos" aria-label="Previous photos" disabled={busy || page <= 1} onClick={() => void find(search, page - 1)}><ChevronLeft size={18} /></button><button type="button" title="Next photos" aria-label="Next photos" disabled={busy || page >= totalPages} onClick={() => void find(search, page + 1)}><ChevronRight size={18} /></button></div></div>
  </dialog>
}