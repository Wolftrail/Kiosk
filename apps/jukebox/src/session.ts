export type TagFilterMode = 'include' | 'exclude'

export type JukeboxSession = {
  tagFilters: Record<string, TagFilterMode>
  showTagFilters: boolean
  selectedTrackId: string
  queue: string[]
  playbackTime: number
  volume: number
  muted: boolean
}

export const jukeboxSessionKey = 'kiosk.jukebox.session.v1'

export function parseSession(raw: string | null): JukeboxSession {
  const defaults: JukeboxSession = {
    tagFilters: {}, showTagFilters: false, selectedTrackId: '', queue: [],
    playbackTime: 0, volume: 1, muted: false,
  }
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
    const saved = value as Record<string, unknown>
    const tagFilters = saved.tagFilters && typeof saved.tagFilters === 'object' && !Array.isArray(saved.tagFilters)
      ? Object.fromEntries(Object.entries(saved.tagFilters).filter((entry): entry is [string, TagFilterMode] => entry[1] === 'include' || entry[1] === 'exclude'))
      : {}
    return {
      tagFilters,
      showTagFilters: saved.showTagFilters === true,
      selectedTrackId: typeof saved.selectedTrackId === 'string' ? saved.selectedTrackId : '',
      queue: Array.isArray(saved.queue) ? [...new Set(saved.queue.filter((id): id is string => typeof id === 'string'))] : [],
      playbackTime: typeof saved.playbackTime === 'number' && Number.isFinite(saved.playbackTime) && saved.playbackTime >= 0 ? saved.playbackTime : 0,
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : 1,
      muted: saved.muted === true,
    }
  } catch {
    return defaults
  }
}

export function restoreQueue(savedQueue: string[], eligibleIds: string[]) {
  const eligible = new Set(eligibleIds)
  const retained = [...new Set(savedQueue)].filter((id) => eligible.has(id))
  const retainedIds = new Set(retained)
  return [...retained, ...eligibleIds.filter((id) => !retainedIds.has(id))]
}