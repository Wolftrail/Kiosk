import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Clock, Download, Film, LoaderCircle, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { useToast } from '@kiosk/remote-ui'
import './Management.css'

type Video = { id: string; title: string; artist: string; duration: string; videoUrl: string; thumbnailUrl?: string; tags: string[] }
type Job = { id: string; url: string; title?: string; status: 'queued' | 'downloading' | 'completed' | 'failed'; error?: string; video?: Video; alreadyExists?: boolean }
const api = '/apps/jukebox/api/'

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${api}${path}`, options)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Request failed.')
  return result
}

function mutation(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export default function Management() {
  const { toast } = useToast()
  const [videos, setVideos] = useState<Video[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [url, setUrl] = useState('')
  const [newTag, setNewTag] = useState('')
  const [filter, setFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const selected = videos.find((video) => video.id === selectedId)
  const visibleJobs = jobs.filter((job) => job.status !== 'completed')
  const activeTagFilter = tagFilter === 'untagged' || tags.some((tag) => `tag:${tag}` === tagFilter) ? tagFilter : ''
  const visibleVideos = videos.filter((video) =>
    `${video.title} ${video.artist}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()) &&
    (!activeTagFilter || (activeTagFilter === 'untagged' ? video.tags.length === 0 : video.tags.includes(activeTagFilter.slice(4))))
  ).reverse()

  useEffect(() => {
    if (!pendingDelete) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => { if (previousFocus?.isConnected) previousFocus.focus() }
  }, [pendingDelete])

  async function refresh() {
    const [library, downloads] = await Promise.all([request('videos'), request('downloads')])
    setVideos(library.videos)
    setTags(library.tags)
    setJobs(downloads.jobs)
    setSelectedId((current) => library.videos.some((video: Video) => video.id === current) ? current : library.videos[0]?.id ?? '')
  }

  useEffect(() => {
    let active = true
    let running = false
    const load = async () => {
      if (running) return
      running = true
      try {
        const [library, downloads] = await Promise.all([request('videos'), request('downloads')])
        if (!active) return
        setVideos(library.videos)
        setTags(library.tags)
        setJobs(downloads.jobs)
        setNotice('')
        setSelectedId((current) => library.videos.some((video: Video) => video.id === current) ? current : library.videos[0]?.id ?? '')
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Cannot connect to kiosk.')
      } finally { running = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  async function perform(action: () => Promise<void>, successMessage?: string) {
    setBusy(true)
    try {
      await action()
      if (successMessage) toast(successMessage, { variant: 'success' })
      await refresh()
    }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not save changes.', { variant: 'error' }) }
    finally { setBusy(false) }
  }

  function addVideo(event: FormEvent) {
    event.preventDefault()
    void perform(async () => {
      await request('downloads', mutation('POST', { url: url.trim() }))
      setUrl('')
    }, 'Video added to the download queue.')
  }

  function createTag(event: FormEvent) {
    event.preventDefault()
    void perform(async () => {
      await request('tags', mutation('POST', { name: newTag.trim() }))
      setNewTag('')
    })
  }

  return <div className="management">
    <header className="management__header"><a href="/" className="management__brand">KIOSK</a><span>Management</span><a href="/apps/jukebox/">Open jukebox</a></header>
    <main>
      <div className="management__heading"><div><h1>Jukebox library</h1><p>{videos.length} videos · {tags.length} tags</p></div><button type="button" title="Refresh library" aria-label="Refresh library" disabled={busy} onClick={() => void perform(refresh)}><RefreshCw size={18} /></button></div>
      {notice && <p className="management__notice" role="status">{notice}</p>}
      <section className="management__downloads" aria-labelledby="download-title">
        <div className="management__download-entry">
          <h2 id="download-title"><Download size={18} /> Add video</h2>
          <form onSubmit={addVideo}><label htmlFor="download-url">YouTube link</label><div className="management__input-row"><input id="download-url" type="url" required placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} /><button disabled={busy || !url.trim()}><Plus size={17} /> Queue download</button></div></form>
        </div>
        <div className="management__download-manager" role="region" aria-labelledby="download-manager-title">
          <div className="management__download-heading"><h2 id="download-manager-title">Downloads <span className="management__job-count">{visibleJobs.length}</span></h2>{jobs.some((job) => job.status === 'failed') && <button type="button" title="Clear failed downloads" aria-label="Clear failed downloads" disabled={busy} onClick={() => void perform(async () => { await request('downloads/failed', { method: 'DELETE' }) }, 'Failed downloads cleared.')}><Trash2 size={16} /> Clear failed</button>}</div>
          {visibleJobs.length === 0 ? <p className="management__jobs-empty">No active downloads.</p> : <ul className="management__jobs">{visibleJobs.map((job) => <li key={job.id}>
            {job.status === 'downloading' ? <LoaderCircle size={18} className="management__activity" aria-hidden="true" /> : job.status === 'queued' ? <Clock size={18} aria-hidden="true" /> : null}
            <span title={job.url}>{job.video?.title ?? job.title ?? job.url}<small>{job.error ?? (job.status === 'queued' ? 'Queued' : 'Downloading')}</small></span>
            {job.status === 'failed' && <button type="button" disabled={busy} onClick={() => void perform(async () => { await request('downloads', mutation('POST', { url: job.url })) }, 'Download added to the retry queue.')}><RefreshCw size={16} /> Retry</button>}
          </li>)}</ul>}
        </div>
      </section>
      <div className="management__workspace">
        <section className="management__videos" aria-labelledby="videos-title"><h2 id="videos-title"><Film size={18} /> Videos</h2><div className="management__filters"><label className="management__filter">Filter library<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Title or artist" /></label><div className="management__filter"><label htmlFor="video-tag-filter">Tag</label><select id="video-tag-filter" value={activeTagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All tags</option><option value="untagged">Untagged</option>{tags.map((tag) => <option key={tag} value={`tag:${tag}`}>{tag}</option>)}</select></div></div><div className="management__video-list">
          {visibleVideos.map((video) => <button type="button" className={`management__video ${selectedId === video.id ? 'is-selected' : ''}`} key={video.id} aria-pressed={selectedId === video.id} onClick={() => setSelectedId(video.id)}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <Film size={30} />}<span>{video.title}<small>{video.artist}</small><small className="management__video-tags"><Tags size={13} aria-hidden="true" /><span>{video.tags.join(' / ') || 'Untagged'}</span></small></span><small>{video.duration}</small></button>)}
          {visibleVideos.length === 0 && <p>{videos.length === 0 ? 'No videos yet.' : 'No videos match these filters.'}</p>}
        </div></section>
        <section className="management__assignment" aria-labelledby="assignment-title"><h2 id="assignment-title">Video tags</h2>{selected ? <><h3>{selected.title}</h3><p>{selected.artist}</p><div className="management__checks">{tags.map((tag) => <label key={tag}><input type="checkbox" checked={selected.tags.includes(tag)} disabled={busy} onChange={(event) => { const nextTags = event.target.checked ? [...selected.tags, tag] : selected.tags.filter((item) => item !== tag); void perform(async () => { await request('video-tags', mutation('POST', { videoId: selected.id, tags: nextTags })) }) }} />{tag}</label>)}</div>{tags.length === 0 && <p>No tags yet.</p>}</> : <p>No video selected.</p>}</section>
        <section className="management__catalog" aria-labelledby="tags-title"><h2 id="tags-title"><Tags size={18} /> Tag catalog</h2><form onSubmit={createTag}><label htmlFor="tag-name">New tag</label><div className="management__input-row"><input id="tag-name" value={newTag} maxLength={32} required onChange={(event) => setNewTag(event.target.value)} disabled={busy} /><button disabled={busy || !newTag.trim()} title="Create tag" aria-label="Create tag"><Plus size={18} /></button></div></form><ul>{tags.map((tag) => <li key={tag}><span>{tag}<small>{videos.filter((video) => video.tags.includes(tag)).length} videos</small></span><button type="button" title={`Delete tag ${tag}`} aria-label={`Delete tag ${tag}`} disabled={busy} onClick={() => setPendingDelete(tag)}><Trash2 size={17} /></button></li>)}</ul></section>
      </div>
    </main>
    {pendingDelete && <div className="management__backdrop"><section role="dialog" aria-modal="true" aria-labelledby="delete-title" onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) setPendingDelete(null)
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const next = event.shiftKey ? buttons.at(-1) : buttons[0]
        const edge = event.shiftKey ? buttons[0] : buttons.at(-1)
        if (document.activeElement === edge) { event.preventDefault(); next?.focus() }
      }
    }}><h2 id="delete-title">Delete tag "{pendingDelete}"?</h2><p>This removes the tag from all videos. Video files are kept.</p><div className="management__dialog-actions"><button ref={cancelRef} disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button><button className="is-destructive" disabled={busy} onClick={() => void perform(async () => { await request('tags', mutation('DELETE', { name: pendingDelete })); setPendingDelete(null) })}><Trash2 size={17} /> Delete tag</button></div></section></div>}
  </div>
}