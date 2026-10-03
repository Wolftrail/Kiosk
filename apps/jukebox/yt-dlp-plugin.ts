import { spawn } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import type { Plugin } from 'vite'

type LibraryVideo = {
  id: string
  title: string
  artist: string
  duration: string
  filename: string
  tags?: string[]
}

type RequestBody = { url?: unknown; query?: unknown; name?: unknown; videoId?: unknown; tags?: unknown }

const apiPrefix = '/apps/jukebox/api/'
const videoPrefix = '/apps/jukebox/videos/'
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'])
const playbackCompatibleFormatSelector = "bv*[height<=1440][vcodec~='^(avc1|h264)']+ba[acodec~='^(mp4a|aac)']/b[height<=1440][ext=mp4]/bv*[height<=1440]+ba/b[height<=1440]"
const projectRoot = dirname(fileURLToPath(import.meta.url))
const videoDirectory = resolve(projectRoot, 'public/videos')
const libraryPath = resolve(projectRoot, 'data/library.json')
const tagsPath = resolve(projectRoot, 'data/tags.json')
let libraryMutation = Promise.resolve()

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

function runYtDlp(args: string[], maxOutput = 4_000_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn('yt-dlp', args, { cwd: projectRoot, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (stdout.length > maxOutput) child.kill()
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > maxOutput) child.kill()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code ?? 'unknown'}.`))
    })
  })
}

async function readLibrary(): Promise<LibraryVideo[]> {
  try {
    const library = JSON.parse(await readFile(libraryPath, 'utf8')) as LibraryVideo[]
    return library.map((video) => ({ ...video, tags: Array.isArray(video.tags) ? video.tags : [] }))
  } catch {
    return []
  }
}

async function readTags(): Promise<string[]> {
  try {
    const tags = JSON.parse(await readFile(tagsPath, 'utf8')) as unknown
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}

function normalizeTag(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > 32) throw new Error('Tags must be between 1 and 32 characters.')
  return normalized
}

function findTag(tags: string[], value: string) {
  const normalized = normalizeTag(value)
  return tags.find((tag) => tag.toLocaleLowerCase() === normalized.toLocaleLowerCase())
}

async function writeTags(tags: string[]) {
  await mkdir(resolve(projectRoot, 'data'), { recursive: true })
  await writeFile(tagsPath, JSON.stringify(tags, null, 2), 'utf8')
}

  function assertFfmpegAvailable() {
    return new Promise<void>((resolvePromise, reject) => {
      const process = spawn('ffmpeg', ['-version'], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' })
      const missingFfmpeg = () => reject(new Error('FFmpeg is required to merge YouTube video and audio. Install FFmpeg and make it available on PATH.'))
      process.once('error', missingFfmpeg)
      process.once('close', (code) => {
        if (code === 0) resolvePromise()
        else missingFfmpeg()
      })
    })
  }

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 16_384) throw new Error('Request is too large.')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as RequestBody
}

function normalizeYouTubeVideoUrl(url: URL) {
  let videoId = ''
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v') ?? ''
  } else {
    videoId = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? ''
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('YouTube URL must contain a valid video ID.')
  return `https://www.youtube.com/watch?v=${videoId}`
}

async function downloadVideo(url: string) {
  await assertFfmpegAvailable()
  const metadataResult = await runYtDlp(['--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist', url])
  const metadata = JSON.parse(metadataResult.stdout) as { id?: string; title?: string; uploader?: string; channel?: string; duration?: number }
  if (!metadata.id || !metadata.title) throw new Error('yt-dlp did not return video details.')

  await mkdir(videoDirectory, { recursive: true })
  const downloadResult = await runYtDlp([
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--format', playbackCompatibleFormatSelector,
    '--output', resolve(videoDirectory, '%(id)s.%(ext)s'),
    '--print', 'after_move:filepath',
    url,
  ])
  const downloadedPath = downloadResult.stdout.trim().split(/\r?\n/).at(-1)
  if (!downloadedPath) throw new Error('yt-dlp completed without returning a video file.')

  const absolutePath = resolve(downloadedPath)
  const pathFromVideoDirectory = relative(videoDirectory, absolutePath)
  if (!pathFromVideoDirectory || pathFromVideoDirectory.startsWith(`..${sep}`) || pathFromVideoDirectory === '..') {
    throw new Error('yt-dlp returned a path outside the jukebox video directory.')
  }

  const downloadedVideo: LibraryVideo = {
    id: metadata.id,
    title: metadata.title,
    artist: metadata.uploader || metadata.channel || 'YouTube',
    duration: typeof metadata.duration === 'number'
      ? `${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}`
      : '--:--',
    filename: basename(absolutePath),
  }
  let savedVideo = downloadedVideo
  await updateLibrary((library) => {
    savedVideo = { ...downloadedVideo, tags: library.find((item) => item.id === downloadedVideo.id)?.tags ?? [] }
    return [...library.filter((item) => item.id !== savedVideo.id), savedVideo]
  })
  return savedVideo
}

function handleApiRequest(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname.startsWith(videoPrefix)) {
    handleVideoRequest(request, response, pathname, next)
    return
  }
  if (!pathname.startsWith(apiPrefix)) {
    next()
    return
  }

  if (pathname === `${apiPrefix}videos` && request.method === 'GET') {
    void Promise.all([readLibrary(), readTags()])
      .then(([videos, tags]) => sendJson(response, 200, {
        tags,
        videos: videos.map(({ filename, ...video }) => ({
          ...video,
          videoUrl: `/apps/jukebox/videos/${encodeURIComponent(filename)}`,
        })),
      }))
      .catch(() => sendJson(response, 500, { error: 'Could not read the jukebox library.' }))
    return
  }

  if (pathname === `${apiPrefix}tags` && request.method === 'POST') {
    void readRequestBody(request)
      .then(async ({ name }) => {
        if (typeof name !== 'string') throw new Error('Provide a tag name.')
        const tags = await readTags()
        const existingTag = findTag(tags, name)
        if (existingTag) return { tag: existingTag, tags }
        const tag = normalizeTag(name)
        const updatedTags = [...tags, tag]
        await writeTags(updatedTags)
        return { tag, tags: updatedTags }
      })
      .then((result) => sendJson(response, 200, result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not create tag.'
        sendJson(response, message.startsWith('Tags must') || message.startsWith('Provide') ? 400 : 500, { error: message })
      })
    return
  }

  if (pathname === `${apiPrefix}video-tags` && request.method === 'POST') {
    void readRequestBody(request)
      .then(async ({ videoId, tags: requestedTags }) => {
        if (typeof videoId !== 'string' || !Array.isArray(requestedTags) || !requestedTags.every((tag) => typeof tag === 'string')) {
          throw new Error('Provide a video ID and a list of tags.')
        }
        const catalog = await readTags()
        const tags = [...new Set((requestedTags as string[]).map((name) => {
          const existing = findTag(catalog, name)
          if (!existing) throw new Error(`Unknown tag: ${name}`)
          return existing
        }))]
        const updatedLibrary = await updateLibrary((library) => {
          if (!library.some((item) => item.id === videoId)) throw new Error('Video was not found in the library.')
          return library.map((item) => item.id === videoId ? { ...item, tags } : item)
        })
        const video = updatedLibrary.find((item) => item.id === videoId)
        if (!video) throw new Error('Video was not found in the library.')
        return { video }
      })
      .then((result) => sendJson(response, 200, result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not update video tags.'
        const invalid = message.startsWith('Provide') || message.startsWith('Video was not found') || message.startsWith('Unknown tag')
        sendJson(response, invalid ? 400 : 500, { error: message })
      })
    return
  }

  if (pathname === `${apiPrefix}search` && request.method === 'POST') {
    void readRequestBody(request)
      .then(async ({ query }) => {
        if (typeof query !== 'string' || !query.trim()) throw new Error('Enter a search query.')
        const normalizedQuery = query.trim()
        if (normalizedQuery.length > 200) throw new Error('Search queries must be 200 characters or fewer.')
        const searchResult = await runYtDlp([
          '--dump-single-json',
          '--skip-download',
          '--no-warnings',
          '--flat-playlist',
          `ytsearch10:${normalizedQuery}`,
        ])
        const searchData = JSON.parse(searchResult.stdout) as {
          entries?: Array<{ id?: string; title?: string; uploader?: string; channel?: string; duration?: number }>
        }
        const results = (searchData.entries ?? [])
          .filter((entry): entry is typeof entry & { id: string; title: string } => Boolean(entry.id && entry.title))
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            artist: entry.uploader || entry.channel || 'YouTube',
            duration: typeof entry.duration === 'number'
              ? `${Math.floor(entry.duration / 60)}:${String(Math.floor(entry.duration % 60)).padStart(2, '0')}`
              : '--:--',
            url: `https://www.youtube.com/watch?v=${entry.id}`,
          }))
        return { results }
      })
      .then((result) => sendJson(response, 200, result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'YouTube search failed.'
        const invalidQuery = message.startsWith('Enter a search query.') || message.startsWith('Search queries must')
        sendJson(response, invalidQuery ? 400 : 500, { error: message })
      })
    return
  }

  if (pathname !== `${apiPrefix}download` || request.method !== 'POST') {
    sendJson(response, 404, { error: 'Jukebox API route not found.' })
    return
  }

  void readRequestBody(request)
    .then(async ({ url }) => {
      if (typeof url !== 'string') throw new Error('Provide a YouTube video URL.')
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        throw new Error('Enter a valid YouTube URL.')
      }
      if (parsedUrl.protocol !== 'https:' || parsedUrl.port || parsedUrl.username || parsedUrl.password || !youtubeHosts.has(parsedUrl.hostname.toLowerCase())) {
        throw new Error('Only HTTPS YouTube video URLs are supported.')
      }
      return downloadVideo(normalizeYouTubeVideoUrl(parsedUrl))
    })
    .then((video) => sendJson(response, 200, {
      ...video,
      videoUrl: `/apps/jukebox/videos/${encodeURIComponent(video.filename)}`,
    }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Video download failed.'
      const invalidUrl = message.startsWith('Only HTTPS') || message.startsWith('Enter a valid') || message.startsWith('YouTube URL must') || message.startsWith('Provide')
      const status = message.includes('too large') ? 413 : invalidUrl ? 400 : 500
      sendJson(response, status, { error: message })
    })
}

function handleVideoRequest(request: IncomingMessage, response: ServerResponse, pathname: string, next: () => void) {
  if (!pathname.startsWith(videoPrefix)) {
    next()
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  let filename: string
  try {
    filename = decodeURIComponent(pathname.slice(videoPrefix.length))
  } catch {
    sendJson(response, 400, { error: 'Invalid video path.' })
    return
  }
  if (!filename || filename !== basename(filename) || filename.includes('\\')) {
    sendJson(response, 400, { error: 'Invalid video path.' })
    return
  }

  const videoPath = resolve(videoDirectory, filename)
  void stat(videoPath).then(({ size }) => {
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    const contentType = ({
      '.mp4': 'video/mp4',
      '.m4v': 'video/x-m4v',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
    } as Record<string, string>)[extension] ?? 'application/octet-stream'
    const range = request.headers.range
    let start = 0
    let end = size - 1
    let status = 200
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) {
        response.writeHead(416, { 'content-range': `bytes */${size}` })
        response.end()
        return
      }
      start = match[1] ? Number(match[1]) : 0
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
      if (start > end || start >= size) {
        response.writeHead(416, { 'content-range': `bytes */${size}` })
        response.end()
        return
      }
      status = 206
    }

    response.writeHead(status, {
      'accept-ranges': 'bytes',
      'content-length': end - start + 1,
      'content-type': contentType,
      ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(videoPath, range ? { start, end } : undefined)
      .on('error', () => response.destroy())
      .pipe(response)
  }).catch(() => sendJson(response, 404, { error: 'Video file not found.' }))
}
export function ytDlpPlugin(): Plugin {
  return {
    name: 'jukebox-yt-dlp',
    configureServer(server) {
      server.middlewares.use(handleApiRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApiRequest)
    },
  }
}

async function updateLibrary(mutate: (library: LibraryVideo[]) => LibraryVideo[]) {
  let updatedLibrary: LibraryVideo[] = []
  const mutation = libraryMutation.then(async () => {
    updatedLibrary = mutate(await readLibrary())
    await mkdir(resolve(projectRoot, 'data'), { recursive: true })
    await writeFile(libraryPath, JSON.stringify(updatedLibrary, null, 2), 'utf8')
  })
  libraryMutation = mutation.catch(() => undefined)
  await mutation
  return updatedLibrary
}