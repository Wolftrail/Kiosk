import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Pause, Play, Radio, SkipBack, SkipForward, SlidersHorizontal, Tags, X } from 'lucide-react'
import { RemoteAppShell, RemoteButton } from '@kiosk/remote-ui'
import './App.css'

type Track = {
  id: string
  title: string
  artist: string
  duration: string
  tint: string
  tags: string[]
  videoUrl?: string
  thumbnailUrl?: string
}

type LibraryVideo = {
  id: string
  title: string
  artist: string
  duration: string
  videoUrl: string
  thumbnailUrl?: string
  tags?: string[]
}

type LibraryResponse = { videos: LibraryVideo[]; tags?: string[] }

type TagFilterMode = 'include' | 'exclude'

function shuffleTracks(trackIds: string[]) {
  const shuffled = [...trackIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState('')
  const [playingTrack, setPlayingTrack] = useState<Track>()
  const [tags, setTags] = useState<string[]>([])
  const [tagFilters, setTagFilters] = useState<Record<string, TagFilterMode>>({})
  const [showTagFilters, setShowTagFilters] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isCaptionVisible, setIsCaptionVisible] = useState(false)
  const [isCaptionPersistent, setIsCaptionPersistent] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const captionTimerRef = useRef<number | undefined>(undefined)
  const autoplayTrackChangeRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const queueIndexRef = useRef(0)
  const queueSignatureRef = useRef('')

  useEffect(() => {
    let isActive = true
    let requestInFlight = false
    const refreshLibrary = async () => {
      if (!isActive || requestInFlight || document.visibilityState === 'hidden') return
      requestInFlight = true
      try {
        const response = await fetch('/apps/jukebox/api/videos')
        if (!response.ok) return
        const library = await response.json() as LibraryResponse
        if (!isActive) return
        setTracks(library.videos.map((video): Track => ({ ...video, tint: 'red', tags: video.tags ?? [] })))
        if (library.tags) setTags(library.tags)
      } catch {
      } finally {
        requestInFlight = false
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshLibrary()
    }
    void refreshLibrary()
    const refreshTimer = window.setInterval(() => void refreshLibrary(), 5000)
    window.addEventListener('focus', refreshLibrary)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      isActive = false
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refreshLibrary)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId)
    ?? (isPlaying ? playingTrack : undefined)
    ?? eligibleTracks[0]
    ?? (!hasTagFilters ? tracks[0] : undefined)
  const synchronizeQueueSelection = useEffectEvent((queue: string[], currentIndex: number) => {
    if (currentIndex >= 0) {
      queueIndexRef.current = currentIndex
      return
    }
    if (isPlaying) {
      queueIndexRef.current = -1
      return
    }
    videoRef.current?.pause()
    setIsPlaying(false)
    setPlayingTrack(undefined)
    queueIndexRef.current = 0
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
    queueIndexRef.current = currentIndex
    synchronizeQueueSelection(queue, currentIndex)
  }, [eligibleTrackIds, eligibleTracks, isPlaying, selectedTagKey, selectedTrackId])

  useEffect(() => {
    if (!autoplayTrackChangeRef.current) return
    autoplayTrackChangeRef.current = false
    const video = videoRef.current
    if (!video) return
    void video.play().catch(() => {
      setIsPlaying(false)
    })
  }, [selectedTrackId])

  const toggleFilterTag = (tag: string) => {
    setTagFilters((current) => {
      const nextMode = current[tag] === undefined ? 'include' : current[tag] === 'include' ? 'exclude' : undefined
      const next = { ...current }
      if (nextMode) next[tag] = nextMode
      else delete next[tag]
      return next
    })
  }

  const selectTrack = (track: Track, autoplay = false) => {
    autoplayTrackChangeRef.current = autoplay
    setPlayingTrack(track)
    setSelectedTrackId(track.id)
    const queueIndex = queueRef.current.indexOf(track.id)
    if (queueIndex >= 0) queueIndexRef.current = queueIndex
    if (!autoplay) setIsPlaying(false)
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video || !selectedTrack?.videoUrl) {
      return
    }
    if (video.paused) {
      void video.play().catch(() => {
        setIsPlaying(false)
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
    if (selectedTrack) setPlayingTrack(selectedTrack)
    if (isCaptionPersistent) {
      setIsCaptionPersistent(false)
      setIsCaptionVisible(false)
      window.clearTimeout(captionTimerRef.current)
      return
    }
    revealCaption()
  }

  const moveTrack = (direction: -1 | 1) => {
    const eligibleIds = new Set(eligibleTracks.map((track) => track.id))
    let queue = queueRef.current.filter((trackId) => eligibleIds.has(trackId))
    if (queue.length !== eligibleIds.size) queue = shuffleTracks([...eligibleIds])
    if (queue.length === 0) return
    const currentIndex = queue.indexOf(selectedTrackId)
    let nextIndex: number
    if (currentIndex < 0) {
      nextIndex = direction === 1 ? 0 : queue.length - 1
    } else if (direction === 1 && currentIndex === queue.length - 1) {
      queue = shuffleTracks([...eligibleIds])
      if (queue.length > 1 && queue[0] === selectedTrackId) [queue[0], queue[1]] = [queue[1], queue[0]]
      nextIndex = 0
    } else {
      nextIndex = (currentIndex + direction + queue.length) % queue.length
    }
    queueRef.current = queue
    queueIndexRef.current = nextIndex
    const nextTrack = tracks.find((track) => track.id === queue[nextIndex])
    if (nextTrack) selectTrack(nextTrack, true)
  }

  return (
    <RemoteAppShell
      title="Jukebox"
      category="MEDIA"
      description="Your room, your rotation."
      theme="jukebox"
      initialFocusSelector=".jukebox__play-button"
      onBack={() => { window.location.assign('/'); return true }}
    >
      <div className="jukebox">
        <section className="jukebox__player" aria-label="Video player">
          <div className={`jukebox__screen jukebox__screen--${selectedTrack?.tint ?? 'rose'} ${selectedTrack?.videoUrl ? 'jukebox__screen--video' : ''}`} onClickCapture={revealCaption}>
            {selectedTrack?.videoUrl && <video ref={videoRef} className="jukebox__video" src={isPlaying && playingTrack ? playingTrack.videoUrl : selectedTrack.videoUrl} poster={selectedTrack.thumbnailUrl} preload="metadata" playsInline aria-label={`${selectedTrack.title} by ${selectedTrack.artist}`} onPlay={handleVideoPlay} onPause={() => { setIsPlaying(false); setIsCaptionPersistent(true); setIsCaptionVisible(false); window.clearTimeout(captionTimerRef.current) }} onEnded={() => moveTrack(1)} onError={() => setIsPlaying(false)} />}
            <div className="jukebox__screen-topline">
              <span><Radio size={15} /> NOW PLAYING</span>
            </div>
            {selectedTrack?.videoUrl && <div className={`jukebox__screen-caption ${isCaptionVisible || isCaptionPersistent ? 'is-visible' : ''}`}>
              <span className="jukebox__eyebrow">{selectedTrack.tags.length ? selectedTrack.tags.join(' · ') : 'UNTAGGED'}</span>
              <strong>{selectedTrack.title}</strong>
              <span>{selectedTrack.artist}</span>
            </div>}
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
    </RemoteAppShell>
  )
}

export default App
