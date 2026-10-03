import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent } from 'react'
import { Disc3, Pause, Play, Plus, Radio, Search, SkipBack, SkipForward, SlidersHorizontal, Tags, Video, X } from 'lucide-react'
import { OnScreenKeyboard, RemoteAppShell, RemoteButton } from '@kiosk/remote-ui'
import './App.css'

type Track = {
  id: string
  title: string
  artist: string
  duration: string
  tint: string
  tags: string[]
  videoUrl?: string
}

type DownloadResponse = {
  id: string
  title: string
  artist: string
  duration: string
  videoUrl: string
  tags?: string[]
  error?: string
}

type YouTubeSearchResult = {
  id: string
  title: string
  artist: string
  duration: string
  url: string
}

type TagFilterMode = 'include' | 'exclude'

const initialTracks: Track[] = [
  { id: 'night-drive', title: 'Night Drive', artist: 'Chromatics', duration: '4:12', tint: 'rose', tags: [] },
  { id: 'roads', title: 'Roads', artist: 'Portishead', duration: '5:03', tint: 'blue', tags: [] },
  { id: 'teardrop', title: 'Teardrop', artist: 'Massive Attack', duration: '5:30', tint: 'green', tags: [] },
  { id: 'dreams', title: 'Dreams', artist: 'Fleetwood Mac', duration: '4:18', tint: 'gold', tags: [] },
  { id: 'red-eyes', title: 'Red Eyes', artist: 'The War on Drugs', duration: '5:58', tint: 'violet', tags: [] },
  { id: 'harvest-moon', title: 'Harvest Moon', artist: 'Neil Young', duration: '5:03', tint: 'orange', tags: [] },
  { id: 'ceremony', title: 'Ceremony', artist: 'New Order', duration: '4:23', tint: 'cyan', tags: [] },
  { id: 'age-of-consent', title: 'Age of Consent', artist: 'New Order', duration: '5:16', tint: 'lime', tags: [] },
]

const initialTags = ['Rock', 'Thai', 'Pop', 'Country', 'Dutch', 'Uplifting', 'Explicit', '90s']

function shuffleTracks(trackIds: string[]) {
  const shuffled = [...trackIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function App() {
  const [tracks, setTracks] = useState(initialTracks)
  const [selectedTrackId, setSelectedTrackId] = useState(initialTracks[0].id)
  const [tags, setTags] = useState(initialTags)
  const [tagFilters, setTagFilters] = useState<Record<string, TagFilterMode>>({})
  const [showTagFilters, setShowTagFilters] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isCaptionVisible, setIsCaptionVisible] = useState(false)
  const [isCaptionPersistent, setIsCaptionPersistent] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [managedTrackId, setManagedTrackId] = useState('')
  const [newTag, setNewTag] = useState('')
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [notice, setNotice] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const captionTimerRef = useRef<number | undefined>(undefined)
  const autoplayTrackChangeRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const queueIndexRef = useRef(0)
  const queueSignatureRef = useRef('')

  useEffect(() => {
    let isActive = true
    void fetch('/apps/jukebox/api/videos')
      .then((response) => response.ok ? response.json() as Promise<{ videos: DownloadResponse[]; tags?: string[] }> : Promise.reject())
      .then(({ videos, tags: libraryTags }) => {
        if (!isActive) return
        setTracks((current) => {
          const downloaded = videos.map((video): Track => ({ ...video, tint: 'red', tags: video.tags ?? [] }))
          const downloadedIds = new Set(downloaded.map((track) => track.id))
          return [...current.filter((track) => !downloadedIds.has(track.id)), ...downloaded]
        })
        if (libraryTags?.length) setTags(libraryTags)
        if (videos.length > 0) setManagedTrackId(videos[0].id)
      })
      .catch(() => undefined)
    return () => {
      isActive = false
      window.clearTimeout(captionTimerRef.current)
    }
  }, [])

  const includedTags = tags.filter((tag) => tagFilters[tag] === 'include')
  const excludedTags = tags.filter((tag) => tagFilters[tag] === 'exclude')
  const hasTagFilters = includedTags.length > 0 || excludedTags.length > 0
  const eligibleTracks = useMemo(
    () => tracks.filter((track) => track.videoUrl
      && (includedTags.length === 0 || includedTags.some((tag) => track.tags.includes(tag)))
      && !excludedTags.some((tag) => track.tags.includes(tag))),
    [excludedTags, includedTags, tracks],
  )
  const eligibleTrackIds = eligibleTracks.map((track) => track.id).sort().join('|')
  const selectedTagKey = tags.filter((tag) => tagFilters[tag]).map((tag) => `${tag}:${tagFilters[tag]}`).sort().join('|')
  const selectedTrack = eligibleTracks.find((track) => track.id === selectedTrackId)
    ?? eligibleTracks[0]
    ?? (!hasTagFilters ? tracks[0] : undefined)
  const managedTrack = tracks.find((track) => track.id === managedTrackId) ?? tracks[0]
  const synchronizeQueueSelection = useEffectEvent((queue: string[], currentIndex: number) => {
    if (currentIndex >= 0) return
    videoRef.current?.pause()
    setIsPlaying(false)
    setSelectedTrackId(queue[0] ?? '')
  })

  useEffect(() => {
    const signature = `${selectedTagKey}::${eligibleTrackIds}`
    if (signature === queueSignatureRef.current) return
    queueSignatureRef.current = signature
    const previousTrackId = selectedTrackId
    const previousFirstTrackId = queueRef.current[0]
    const queue = shuffleTracks(eligibleTracks.map((track) => track.id))
    if (queue.length > 1 && queue[0] === previousFirstTrackId && queue[0] !== previousTrackId) {
      ;[queue[0], queue[1]] = [queue[1], queue[0]]
    }
    queueRef.current = queue
    const currentIndex = queue.indexOf(previousTrackId)
    queueIndexRef.current = currentIndex >= 0 ? currentIndex : 0
    synchronizeQueueSelection(queue, currentIndex)
  }, [eligibleTrackIds, eligibleTracks, selectedTagKey, selectedTrackId])

  useEffect(() => {
    if (!autoplayTrackChangeRef.current) return
    autoplayTrackChangeRef.current = false
    const video = videoRef.current
    if (!video) return
    void video.play().catch(() => {
      setIsPlaying(false)
      setNotice('The selected video could not be played by this browser.')
    })
  }, [selectedTrackId])

  const closeManage = () => {
    setShowManage(false)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.jukebox__play-button')?.focus())
  }

  const toggleFilterTag = (tag: string) => {
    setTagFilters((current) => {
      const nextMode = current[tag] === undefined ? 'include' : current[tag] === 'include' ? 'exclude' : undefined
      const next = { ...current }
      if (nextMode) next[tag] = nextMode
      else delete next[tag]
      return next
    })
  }

  const saveTrackTags = async (trackId: string, nextTags: string[]) => {
    const previousTags = tracks.find((track) => track.id === trackId)?.tags ?? []
    setTracks((current) => current.map((track) => track.id === trackId ? { ...track, tags: nextTags } : track))
    try {
      const response = await fetch('/apps/jukebox/api/video-tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: trackId, tags: nextTags }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not save video tags.')
      setNotice('Tags saved.')
    } catch (error) {
      setTracks((current) => current.map((track) => track.id === trackId ? { ...track, tags: previousTags } : track))
      setNotice(error instanceof Error ? error.message : 'Could not save video tags.')
    }
  }

  const handleCreateTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newTag.trim()
    if (!name) return
    try {
      const response = await fetch('/apps/jukebox/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const result = await response.json() as { tag?: string; tags?: string[]; error?: string }
      if (!response.ok || !result.tag) throw new Error(result.error ?? 'Could not create tag.')
      setTags(result.tags ?? tags)
      setNewTag('')
      if (managedTrack?.videoUrl && !managedTrack.tags.includes(result.tag)) {
        void saveTrackTags(managedTrack.id, [...managedTrack.tags, result.tag])
      } else {
        setNotice(`Added tag: ${result.tag}`)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create tag.')
    }
  }

  const selectTrack = (track: Track, autoplay = false) => {
    autoplayTrackChangeRef.current = autoplay
    setSelectedTrackId(track.id)
    const queueIndex = queueRef.current.indexOf(track.id)
    if (queueIndex >= 0) queueIndexRef.current = queueIndex
    if (!autoplay) setIsPlaying(false)
    setNotice(track.videoUrl ? '' : 'This track does not have a downloaded video yet.')
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video || !selectedTrack?.videoUrl) {
      setNotice('This track does not have a downloaded video yet.')
      return
    }
    if (video.paused) {
      void video.play().catch(() => {
        setIsPlaying(false)
        setNotice('The selected video could not be played by this browser.')
      })
    } else {
      video.pause()
    }
  }

  const revealCaption = () => {
    setIsCaptionVisible(true)
    window.clearTimeout(captionTimerRef.current)
    captionTimerRef.current = window.setTimeout(() => setIsCaptionVisible(false), 2500)
  }

  const handleVideoPlay = () => {
    setIsPlaying(true)
    if (isCaptionPersistent) {
      setIsCaptionPersistent(false)
      setIsCaptionVisible(false)
      window.clearTimeout(captionTimerRef.current)
      return
    }
    revealCaption()
  }

  const moveTrack = (direction: -1 | 1) => {
    let queue = queueRef.current
    if (queue.length === 0) return
    if (direction === 1 && queueIndexRef.current >= queue.length - 1) {
      queue = shuffleTracks(eligibleTracks.map((track) => track.id))
      if (queue.length > 1 && queue[0] === selectedTrackId) [queue[0], queue[1]] = [queue[1], queue[0]]
      queueRef.current = queue
      queueIndexRef.current = -1
    }
    queueIndexRef.current = (queueIndexRef.current + direction + queue.length) % queue.length
    const nextTrack = tracks.find((track) => track.id === queue[queueIndexRef.current])
    if (nextTrack) selectTrack(nextTrack, true)
  }

  const handleQueueUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const parsedUrl = new URL(videoUrl)
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(parsedUrl.hostname) || parsedUrl.protocol !== 'https:') {
        setNotice('Enter an HTTPS YouTube link.')
        return
      }
      await downloadYouTubeVideo(parsedUrl.toString())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enter a valid YouTube link.')
    }
  }

  const downloadYouTubeVideo = async (url: string) => {
    try {
      setIsDownloading(true)
      setNotice('Downloading video with yt-dlp...')
      const response = await fetch('/apps/jukebox/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const result = await response.json() as DownloadResponse
      if (!response.ok) throw new Error(result.error ?? 'Video download failed.')
      const addedTrack: Track = { ...result, tags: result.tags ?? [], tint: 'red' }
      setTracks((current) => [...current.filter((track) => track.id !== addedTrack.id), addedTrack])
      setSelectedTrackId(addedTrack.id)
      setShowAddVideo(false)
      setShowSearch(false)
      setVideoUrl('')
      setIsPlaying(false)
      setNotice(`Downloaded: ${addedTrack.title}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reach the jukebox downloader.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleYouTubeSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!query) return
    setIsSearching(true)
    setHasSearched(false)
    setSearchResults([])
    setNotice('')
    try {
      const response = await fetch('/apps/jukebox/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const result = await response.json() as { results?: YouTubeSearchResult[]; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'YouTube search failed.')
      setSearchResults(result.results ?? [])
      setHasSearched(true)
    } catch (error) {
      setSearchResults([])
      setNotice(error instanceof Error ? error.message : 'YouTube search failed.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <RemoteAppShell
      title="Jukebox"
      category="MEDIA"
      description="Your room, your rotation."
      theme="jukebox"
      initialFocusSelector=".jukebox__play-button"
      onBack={() => {
        if (showSearch) {
          setShowSearch(false)
          return true
        }
        if (showAddVideo) {
          setShowAddVideo(false)
          return true
        }
        if (showManage) {
          closeManage()
          return true
        }
        window.location.assign('/')
        return true
      }}
    >
      <div className="jukebox">
        <section className="jukebox__player" aria-label="Video player">
          <div className={`jukebox__screen jukebox__screen--${selectedTrack?.tint ?? 'rose'} ${selectedTrack?.videoUrl ? 'jukebox__screen--video' : ''}`} onClickCapture={revealCaption}>
            {selectedTrack?.videoUrl && <video ref={videoRef} className="jukebox__video" src={selectedTrack.videoUrl} preload="metadata" playsInline aria-label={`${selectedTrack.title} by ${selectedTrack.artist}`} onPlay={handleVideoPlay} onPause={() => { setIsPlaying(false); setIsCaptionPersistent(true); setIsCaptionVisible(false); window.clearTimeout(captionTimerRef.current) }} onEnded={() => moveTrack(1)} onError={() => { setIsPlaying(false); setNotice('The selected video file could not be loaded.') }} />}
            <div className="jukebox__screen-topline">
              <span><Radio size={15} /> NOW PLAYING</span>
              <RemoteButton className="jukebox__browse-button" aria-label="Manage videos and tags" onClick={() => setShowManage(true)}><Tags size={17} /><span>Manage</span></RemoteButton>
            </div>
            {selectedTrack?.videoUrl && <div className={`jukebox__screen-caption ${isCaptionVisible || isCaptionPersistent ? 'is-visible' : ''}`}>
              <span className="jukebox__eyebrow">{selectedTrack.tags.length ? selectedTrack.tags.join(' · ') : 'UNTAGGED'}</span>
              <strong>{selectedTrack.title}</strong>
              <span>{selectedTrack.artist}</span>
            </div>}
            {eligibleTracks.length === 0 && <div className="jukebox__empty-notice" role="status"><Video size={18} /><span>{hasTagFilters ? 'No videos match these tags.' : 'Add videos to start listening.'}</span></div>}
            <div className="jukebox__overlay-controls">
              <div id="jukebox-tag-filters" className="jukebox__tag-filters" aria-label="Filter music by tags" hidden={!showTagFilters}>
                <div className="jukebox__tag-filter-heading">
                  <span><Tags size={15} /> FILTER TAGS</span>
                  <span>{!hasTagFilters ? 'ALL MUSIC' : `+${includedTags.length} INCLUDE · −${excludedTags.length} EXCLUDE · ${eligibleTracks.length} MATCHES`}</span>
                  <RemoteButton className="jukebox__filter-close" aria-label="Close tag filters" onClick={() => setShowTagFilters(false)}><X size={19} /></RemoteButton>
                </div>
                <div className="jukebox__tag-list">
                  {tags.map((tag) => (
                    <RemoteButton
                      key={tag}
                      className={`jukebox__tag-chip ${tagFilters[tag] === 'include' ? 'is-selected' : ''} ${tagFilters[tag] === 'exclude' ? 'is-excluded' : ''}`}
                      aria-label={`${tagFilters[tag] === 'include' ? 'Included' : tagFilters[tag] === 'exclude' ? 'Excluded' : 'Not filtered'}: ${tag}. Press to cycle include, exclude, clear.`}
                      aria-pressed={tagFilters[tag] === 'include'}
                      onClick={() => toggleFilterTag(tag)}
                    >
                      {tagFilters[tag] && <span className="jukebox__tag-mode-mark" aria-hidden="true">{tagFilters[tag] === 'include' ? '+' : '−'}</span>}
                      {tag}
                    </RemoteButton>
                  ))}
                </div>
              </div>
              <div className="jukebox__transport">
                <RemoteButton
                  className={`jukebox__filter-toggle ${hasTagFilters ? 'is-active' : ''}`}
                  aria-label={`${showTagFilters ? 'Close' : 'Open'} tag filters${hasTagFilters ? `, ${includedTags.length} included and ${excludedTags.length} excluded` : ''}`}
                  aria-expanded={showTagFilters}
                  aria-controls="jukebox-tag-filters"
                  onClick={() => setShowTagFilters((open) => !open)}
                ><SlidersHorizontal size={18} /><span>Filters</span><small>{hasTagFilters ? `${includedTags.length + excludedTags.length} active` : 'All music'}</small></RemoteButton>
                <div className="jukebox__transport-buttons">
                  <RemoteButton className="jukebox__icon-button" aria-label="Previous track" onClick={() => moveTrack(-1)}><SkipBack size={20} fill="currentColor" /></RemoteButton>
                  <RemoteButton className="jukebox__play-button" aria-label={isPlaying ? 'Pause video' : 'Play video'} onClick={togglePlayback}>
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  </RemoteButton>
                  <RemoteButton className="jukebox__icon-button" aria-label="Next track" onClick={() => moveTrack(1)}><SkipForward size={20} fill="currentColor" /></RemoteButton>
                </div>
                <span className="jukebox__duration">{selectedTrack?.duration}</span>
              </div>
            </div>
          </div>
        </section>

      </div>

      {showManage && <div className="jukebox__library-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeManage() }}>
        <section className="jukebox__manager" role="dialog" aria-modal="true" aria-labelledby="manager-title" onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack' || event.key === 'BrowserBack') {
            event.preventDefault()
            event.stopPropagation()
            closeManage()
          }
        }}>
          <div className="jukebox__library-heading">
            <div><span className="jukebox__eyebrow">YOUR COLLECTION</span><h2 id="manager-title">Manage videos</h2></div>
            <div className="jukebox__library-actions">
              <RemoteButton className="jukebox__add-button" onClick={() => { setShowManage(false); setShowSearch(true); setNotice('') }}><Search size={17} /> Search YouTube</RemoteButton>
              <RemoteButton className="jukebox__add-button" onClick={() => { setShowManage(false); setShowAddVideo(true); setNotice('') }}><Plus size={17} /> Add video</RemoteButton>
              <RemoteButton className="jukebox__icon-button" aria-label="Close video manager" onClick={closeManage}><X size={20} /></RemoteButton>
            </div>
          </div>
          <div className="jukebox__manager-grid">
            <div className="jukebox__manager-videos" aria-label="Videos">
              {tracks.filter((track) => track.videoUrl).map((track, index) => (
                <RemoteButton key={track.id} autoFocus={index === 0} data-remote-initial={index === 0 ? '' : undefined} className={`jukebox__manager-video ${managedTrack?.id === track.id ? 'is-selected' : ''}`} aria-pressed={managedTrack?.id === track.id} onClick={() => { setManagedTrackId(track.id); setNotice('') }}>
                  {/^[A-Za-z0-9_-]{11}$/.test(track.id) ? <img src={`https://i.ytimg.com/vi/${track.id}/mqdefault.jpg`} alt="" loading="lazy" /> : <span className="jukebox__manager-thumb"><Disc3 size={26} /></span>}
                  <span className="jukebox__manager-video-copy">{track.title}<small>{track.artist}</small></span>
                  <span className="jukebox__manager-video-tags">{track.tags.length ? track.tags.join(' · ') : 'Untagged'}</span>
                </RemoteButton>
              ))}
              {tracks.every((track) => !track.videoUrl) && <p className="jukebox__search-empty">Your local library is empty. Search YouTube or add a video link.</p>}
            </div>
            <div className="jukebox__manager-editor">
              {managedTrack?.videoUrl ? <>
                <span className="jukebox__eyebrow">VIDEO TAGS</span>
                <h3>{managedTrack.title}</h3>
                <p>{managedTrack.artist}</p>
                <div className="jukebox__manager-tags">
                  {tags.map((tag) => {
                    const assigned = managedTrack.tags.includes(tag)
                    return <RemoteButton key={tag} className={`jukebox__tag-chip ${assigned ? 'is-selected' : ''}`} aria-pressed={assigned} onClick={() => void saveTrackTags(managedTrack.id, assigned ? managedTrack.tags.filter((item) => item !== tag) : [...managedTrack.tags, tag])}>{tag}</RemoteButton>
                  })}
                </div>
                <form className="jukebox__new-tag-form" onSubmit={handleCreateTag}>
                  <label htmlFor="new-tag">Create a tag</label>
                  <input id="new-tag" value={newTag} onChange={(event) => setNewTag(event.target.value)} maxLength={32} placeholder="e.g. Dutch" />
                  <OnScreenKeyboard value={newTag} onChange={setNewTag} maxLength={32} label="New tag keyboard" />
                  <RemoteButton className="jukebox__add-button" type="submit" disabled={!newTag.trim()}><Plus size={16} /> Add tag to video</RemoteButton>
                </form>
              </> : <div className="jukebox__manager-empty"><Tags size={32} /><strong>Select a video</strong><span>Assign one or more tags. Videos can stay untagged.</span></div>}
            </div>
          </div>
          {notice && <p className="jukebox__notice" role="status">{notice}</p>}
        </section>
      </div>}

      {showSearch && (
        <div className="jukebox__dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false) }}>
          <section className="jukebox__dialog jukebox__search-dialog" role="dialog" aria-modal="true" aria-labelledby="youtube-search-title">
            <div className="jukebox__dialog-heading"><div><span className="jukebox__eyebrow">YOUTUBE</span><h2 id="youtube-search-title">Find a video</h2></div><RemoteButton className="jukebox__icon-button" aria-label="Close search" onClick={() => setShowSearch(false)}><X size={20} /></RemoteButton></div>
            <form className="jukebox__search-form" onSubmit={handleYouTubeSearch}>
              <label htmlFor="youtube-search">Search videos</label>
              <input id="youtube-search" type="search" placeholder="Artist, song, or video" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchResults([]); setHasSearched(false); setNotice('') }} maxLength={200} autoComplete="off" />
              <OnScreenKeyboard value={searchQuery} onChange={setSearchQuery} maxLength={200} disabled={isSearching || isDownloading} label="YouTube search keyboard" />
              <div className="jukebox__dialog-actions"><RemoteButton className="jukebox__cancel-button" onClick={() => setShowSearch(false)}>Cancel</RemoteButton><RemoteButton className="jukebox__add-button" type="submit" disabled={!searchQuery.trim() || isSearching || isDownloading}><Search size={16} /> {isSearching ? 'Searching...' : 'Search YouTube'}</RemoteButton></div>
            </form>
            {notice && <p className="jukebox__dialog-notice" role="status">{notice}</p>}
            {searchResults.length > 0 && <div className="jukebox__search-results" aria-label="YouTube search results">
              {searchResults.map((result) => (
                <RemoteButton key={result.id} className="jukebox__search-result" disabled={isDownloading} onClick={() => void downloadYouTubeVideo(result.url)}>
                  <span className="jukebox__search-result-title">{result.title}<small>{result.artist}</small></span>
                  <span className="jukebox__search-result-action">{isDownloading ? 'Downloading...' : `Download · ${result.duration}`}</span>
                </RemoteButton>
              ))}
            </div>}
            {hasSearched && searchResults.length === 0 && !notice && <p className="jukebox__search-empty" role="status">No videos found. Try another search.</p>}
          </section>
        </div>
      )}

      {showAddVideo && (
        <div className="jukebox__dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddVideo(false) }}>
          <section className="jukebox__dialog" role="dialog" aria-modal="true" aria-labelledby="add-video-title">
            <div className="jukebox__dialog-heading"><div><span className="jukebox__eyebrow">NEW ADDITION</span><h2 id="add-video-title">Add a video link</h2></div><RemoteButton className="jukebox__icon-button" aria-label="Close" onClick={() => setShowAddVideo(false)}><X size={20} /></RemoteButton></div>
            <form onSubmit={handleQueueUrl}>
              <label htmlFor="youtube-url">YouTube URL</label>
              <input id="youtube-url" type="url" placeholder="https://youtu.be/..." value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} required autoFocus disabled={isDownloading} />
              <p>The video is downloaded to this jukebox's local library.</p>
              {notice && <p className="jukebox__dialog-notice" role="status">{notice}</p>}
              <div className="jukebox__dialog-actions"><RemoteButton className="jukebox__cancel-button" disabled={isDownloading} onClick={() => setShowAddVideo(false)}>Cancel</RemoteButton><RemoteButton className="jukebox__add-button" type="submit" disabled={isDownloading}><Plus size={16} /> {isDownloading ? 'Downloading...' : 'Download video'}</RemoteButton></div>
            </form>
          </section>
        </div>
      )}
    </RemoteAppShell>
  )
}

export default App
