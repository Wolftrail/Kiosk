import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReadStream } from 'node:fs'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { Plugin } from 'vite'

type LibraryVideo = {
  id: string
  title: string
  artist: string
  duration: string
  filename: string
  thumbnailFilename?: string
  tags?: string[]
  audioNormalization?: 'ebu-r128-v1'
}

type RequestBody = { url?: unknown; query?: unknown; name?: unknown; videoId?: unknown; tags?: unknown }
type DownloadResolution = { video: LibraryVideo; alreadyExists: boolean }
type DownloadJob = {
  id: string
  url: string
  title?: string
  status: 'queued' | 'downloading' | 'completed' | 'failed'
  error?: string
  video?: ReturnType<typeof publicVideo>
  alreadyExists?: boolean
}

const apiPrefix = '/apps/jukebox/api/'
const videoPrefix = '/apps/jukebox/videos/'
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'])
const playbackCompatibleFormatSelector = "bv*[height<=1440][vcodec~='^(avc1|h264)']+ba[acodec~='^(mp4a|aac)']/b[height<=1440][ext=mp4]/bv*[height<=1440]+ba/b[height<=1440]"
const projectRoot = dirname(fileURLToPath(import.meta.url))
const videoDirectory = resolve(projectRoot, 'public/videos')
const publicationDirectory = resolve(dirname(videoDirectory), '.jukebox-staging')
const libraryPath = resolve(projectRoot, 'data/library.json')
const tagsPath = resolve(projectRoot, 'data/tags.json')
let libraryMutation = Promise.resolve()
const inFlightDownloads = new Map<string, Promise<LibraryVideo>>()
const thumbnailJobs = new Map<string, Promise<string | undefined>>()
const downloadJobs = new Map<string, DownloadJob>()
const downloadQueue: string[] = []
const activeDownloadJobs = new Map<string, string>()
let processingDownloadQueue = false

async function createTemporaryDirectory(prefix: string) {
  return mkdtemp(resolve(tmpdir(), `kiosk-jukebox-${prefix}`))
}

async function publishFile(source: string, destination: string) {
  try {
    await rename(source, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await mkdir(publicationDirectory, { recursive: true })
    const stagingDirectory = await mkdtemp(resolve(publicationDirectory, 'publish-'))
    try {
      const stagedFile = resolve(stagingDirectory, basename(destination))
      await copyFile(source, stagedFile)
      await rename(stagedFile, destination)
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

function pruneFinishedJobs() {
  const finished = [...downloadJobs.values()].filter((job) => job.status === 'completed' || job.status === 'failed')
  for (const job of finished.slice(0, Math.max(0, finished.length - 100))) downloadJobs.delete(job.id)
}

async function processDownloadQueue() {
  if (processingDownloadQueue) return
  processingDownloadQueue = true
  try {
    while (downloadQueue.length) {
      const id = downloadQueue.shift()!
      const job = downloadJobs.get(id)
      if (!job) continue
      job.status = 'downloading'
      try {
        const result = await downloadOrReuseVideo(job.url)
        job.video = publicVideo(result.video)
        job.alreadyExists = result.alreadyExists
        job.status = 'completed'
      } catch (error) {
        job.error = error instanceof Error ? error.message : 'Video download failed.'
        job.status = 'failed'
      } finally {
        const videoId = new URL(job.url).searchParams.get('v')
        if (videoId && activeDownloadJobs.get(videoId) === id) activeDownloadJobs.delete(videoId)
        pruneFinishedJobs()
      }
    }
  } finally {
    processingDownloadQueue = false
  }
}

function enqueueDownload(url: string) {
  const videoId = new URL(url).searchParams.get('v')!
  const activeId = activeDownloadJobs.get(videoId)
  if (activeId) return downloadJobs.get(activeId)!
  if (downloadQueue.length >= 100) throw new Error('The download queue is full. Try again later.')
  const job: DownloadJob = { id: randomUUID(), url, status: 'queued' }
  downloadJobs.set(job.id, job)
  activeDownloadJobs.set(videoId, job.id)
  downloadQueue.push(job.id)
  setImmediate(() => void processDownloadQueue())
  return job
}

function youtubeDownloaderArguments() {
  const file = process.env.KIOSK_YTDLP_COOKIES_FILE?.trim()
  const browser = process.env.KIOSK_YTDLP_COOKIES_BROWSER?.trim()
  const runtime = ['--js-runtimes', `node:${process.execPath}`]
  if (file && browser) throw new Error('Configure either KIOSK_YTDLP_COOKIES_FILE or KIOSK_YTDLP_COOKIES_BROWSER, not both.')
  if (file) return ['--cookies', file, ...runtime]
  if (browser) return ['--cookies-from-browser', browser, ...runtime]
  return runtime
}

function youtubeDownloadError(message: string) {
  if (/sign in to confirm your age|sign in to confirm you.?re not a bot|login required|use --cookies-from-browser or --cookies|only available for registered users/i.test(message)) {
    return process.env.KIOSK_YTDLP_COOKIES_FILE?.trim() || process.env.KIOSK_YTDLP_COOKIES_BROWSER?.trim()
      ? 'YouTube authentication is required. Refresh the configured cookies or sign in to the configured browser profile with an account that can watch this video, then retry.'
      : 'This video requires YouTube authentication. Configure cookies on the kiosk using KIOSK_YTDLP_COOKIES_FILE or KIOSK_YTDLP_COOKIES_BROWSER, then retry.'
  }
  return message
}

function runThumbnailCommand(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, command === 'yt-dlp' ? [...youtubeDownloaderArguments(), ...args] : args, { cwd: projectRoot, windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${command} thumbnail generation timed out.`))
    }, 30_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} could not create a thumbnail.`))
    })
  })
}

async function ensureThumbnail(video: LibraryVideo, url?: string): Promise<string | undefined> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.id) || video.filename !== basename(video.filename) || video.filename.includes('\\')) return undefined
  const filename = `${video.id}.thumb.jpg`
  const thumbnailPath = resolve(videoDirectory, filename)
  if (await stat(thumbnailPath).then((details) => details.isFile() && details.size > 0).catch(() => false)) return filename
  const existingJob = thumbnailJobs.get(video.id)
  if (existingJob) return existingJob

  const job = (async () => {
    let stagingDirectory: string | undefined
    try {
      stagingDirectory = await createTemporaryDirectory('thumbnail-')
      const temporaryPath = resolve(stagingDirectory, `${video.id}.thumb.pending.jpg`)
      let hasArtwork = false
      if (url) {
        try {
          await runThumbnailCommand('yt-dlp', [
            '--no-playlist', '--no-warnings', '--skip-download', '--write-thumbnail',
            '--convert-thumbnails', 'jpg', '--socket-timeout', '10', '--retries', '0',
            '--output', `thumbnail:${resolve(stagingDirectory, `${video.id}.thumb.pending.%(ext)s`)}`,
            url,
          ])
          hasArtwork = await stat(temporaryPath).then((details) => details.isFile() && details.size > 0).catch(() => false)
        } catch {
          hasArtwork = false
        }
      }
      if (!hasArtwork) {
        await runThumbnailCommand('ffmpeg', [
          '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
          '-i', resolve(videoDirectory, video.filename),
          '-vf', 'scale=480:-2,thumbnail=60', '-frames:v', '1', temporaryPath,
        ])
      }
      const details = await stat(temporaryPath)
      if (!details.isFile() || details.size === 0) throw new Error('Thumbnail is empty.')
      await publishFile(temporaryPath, thumbnailPath)
      return filename
    } catch (error) {
      console.warn(`Could not create thumbnail for ${video.id}:`, error)
      return undefined
    } finally {
      if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  })()
  thumbnailJobs.set(video.id, job)
  return job
}

async function readLibraryWithThumbnails() {
  const library = await readLibrary()
  const thumbnails = new Map<string, string>()
  for (const video of library) {
    const thumbnailFilename = await ensureThumbnail(video)
    if (thumbnailFilename && thumbnailFilename !== video.thumbnailFilename) thumbnails.set(video.id, thumbnailFilename)
  }
  if (thumbnails.size === 0) return library
  return updateLibrary((current) => current.map((video) => thumbnails.has(video.id)
    ? { ...video, thumbnailFilename: thumbnails.get(video.id) }
    : video))
}

function publicVideo(video: LibraryVideo) {
  const { filename, thumbnailFilename, ...metadata } = video
  return {
    ...metadata,
    videoUrl: `${videoPrefix}${encodeURIComponent(filename)}`,
    ...(thumbnailFilename ? { thumbnailUrl: `${videoPrefix}${encodeURIComponent(thumbnailFilename)}` } : {}),
  }
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

function runYtDlp(args: string[], maxOutput = 4_000_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn('yt-dlp', [...youtubeDownloaderArguments(), ...args], { cwd: projectRoot, windowsHide: true })
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
      else reject(new Error(youtubeDownloadError(stderr.trim() || `yt-dlp exited with code ${code ?? 'unknown'}.`)))
    })
  })
}

function runAudioCommand(args: string[]) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn('ffmpeg', ['-nostdin', '-hide_banner', ...args], { cwd: projectRoot, windowsHide: true })
    let stderr = ''
    child.stdout.resume()
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-64_000)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise(stderr)
      else reject(new Error(`Audio normalization failed: ${stderr.trim() || `FFmpeg exited with code ${code}.`}`))
    })
  })
}

async function normalizeAudio(source: string, destination: string) {
  const target = 'loudnorm=I=-16:TP=-2:LRA=11'
  const analysis = await runAudioCommand([
    '-i', source, '-map', '0:a:0', '-af', `${target}:print_format=json`, '-f', 'null', '-',
  ])
  const measurements = /\{\s*"input_i"[\s\S]*?\}/.exec(analysis)?.[0]
  if (!measurements) throw new Error('FFmpeg did not report audio loudness measurements.')
  const measured = JSON.parse(measurements) as Record<string, unknown>
  const fields = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']
  const silent = measured.input_i === '-inf' && measured.input_tp === '-inf'
  if (!silent && fields.some((field) => typeof measured[field] !== 'string' || !Number.isFinite(Number(measured[field])))) {
    throw new Error('FFmpeg reported invalid audio loudness measurements.')
  }
  const filter = silent ? 'anull' : `${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
  await runAudioCommand([
    '-loglevel', 'error', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'copy', '-af', filter, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', destination,
  ])
  const details = await stat(destination)
  if (!details.isFile() || details.size === 0) throw new Error('Normalized video is empty or not a file.')
}

export async function normalizeLibraryAudio() {
  await assertFfmpegAvailable()
  const result = { normalized: 0, skipped: 0, failed: [] as Array<{ id: string; error: string }> }
  for (const video of await readLibrary()) {
    if (video.audioNormalization === 'ebu-r128-v1') {
      result.skipped += 1
      continue
    }
    let stagingDirectory: string | undefined
    try {
      if (!video.filename || video.filename !== basename(video.filename) || video.filename.includes('\\') || video.filename === '.' || video.filename === '..') {
        throw new Error('Invalid library video filename.')
      }
      const source = resolve(videoDirectory, video.filename)
      const filename = `${basename(video.filename, extname(video.filename))}.mp4`
      if (filename !== video.filename && await stat(resolve(videoDirectory, filename)).then(() => true).catch(() => false)) {
        throw new Error('Normalized video filename already exists.')
      }
      stagingDirectory = await createTemporaryDirectory('normalize-')
      const normalizedPath = resolve(stagingDirectory, filename)
      await normalizeAudio(source, normalizedPath)
      await publishFile(normalizedPath, resolve(videoDirectory, filename))
      await updateLibrary((library) => library.map((item) => item.id === video.id
        ? { ...item, filename, audioNormalization: 'ebu-r128-v1' } : item))
      if (filename !== video.filename) await rm(source)
      result.normalized += 1
    } catch (error) {
      result.failed.push({ id: video.id, error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  return result
}

async function readLibrary(): Promise<Array<LibraryVideo & { tags: string[] }>> {
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
      const missingFfmpeg = () => reject(new Error('FFmpeg is required to merge YouTube video and audio and normalize loudness. Install FFmpeg and make it available on PATH.'))
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

function validateYouTubeUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('Provide a YouTube video URL.')
  let parsedUrl: URL
  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error('Enter a valid YouTube URL.')
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.port || parsedUrl.username || parsedUrl.password || !youtubeHosts.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error('Only HTTPS YouTube video URLs are supported.')
  }
  return normalizeYouTubeVideoUrl(parsedUrl)
}

function isLoopbackAddress(address: string | undefined) {
  return address === '::1' || address === '127.0.0.1' || address?.startsWith('127.') || address?.startsWith('::ffff:127.')
}

function hasValidCredentials(request: IncomingMessage) {
  const password = process.env.KIOSK_ADMIN_PASSWORD
  if (!password) return isLoopbackAddress(request.socket.remoteAddress)
  const username = process.env.KIOSK_ADMIN_USERNAME || 'admin'
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Basic ')) return false
  let supplied: string
  try {
    supplied = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
  } catch {
    return false
  }
  const separator = supplied.indexOf(':')
  if (separator < 0) return false
  const actual = Buffer.from(`${supplied.slice(0, separator)}:${supplied.slice(separator + 1)}`)
  const expected = Buffer.from(`${username}:${password}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function protectManagementAccess(request: IncomingMessage, response: ServerResponse, next: () => void, managementPage = false) {
  if (!managementPage && !request.url?.startsWith(apiPrefix)) {
    next()
    return
  }
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (!managementPage && pathname === `${apiPrefix}videos` && request.method === 'GET') {
    next()
    return
  }
  if (!hasValidCredentials(request)) {
    if (process.env.KIOSK_ADMIN_PASSWORD) {
      response.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'www-authenticate': 'Basic realm="Kiosk management", charset="UTF-8"' })
      response.end(JSON.stringify({ error: 'Management authentication required.' }))
    } else {
      sendJson(response, 403, { error: 'Management is restricted to this device until KIOSK_ADMIN_PASSWORD is configured.' })
    }
    return
  }

  const method = request.method ?? 'GET'
  const protectedRead = pathname === `${apiPrefix}downloads` && method === 'GET'
  const mutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
  if (!managementPage && !protectedRead && !mutation) {
    next()
    return
  }
  if (mutation) {
    const fetchSite = request.headers['sec-fetch-site']
    if (fetchSite === 'cross-site') {
      sendJson(response, 403, { error: 'Cross-site management requests are not allowed.' })
      return
    }
    const origin = request.headers.origin
    const forwardedHost = request.headers['x-forwarded-host']
    const expectedHost = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() || request.headers.host
    if (origin && expectedHost) {
      try {
        if (new URL(origin).host.toLowerCase() !== expectedHost.toLowerCase()) {
          sendJson(response, 403, { error: 'Cross-origin management requests are not allowed.' })
          return
        }
      } catch {
        sendJson(response, 403, { error: 'Invalid request origin.' })
        return
      }
    }
  }
  next()
}

async function downloadVideo(url: string) {
  await assertFfmpegAvailable()
  const metadataResult = await runYtDlp(['--dump-single-json', '--skip-download', '--no-warnings', '--no-playlist', url])
  const metadata = JSON.parse(metadataResult.stdout) as { id?: string; title?: string; uploader?: string; channel?: string; duration?: number }
  if (!metadata.id || !metadata.title) throw new Error('yt-dlp did not return video details.')
  const jobId = activeDownloadJobs.get(new URL(url).searchParams.get('v')!)
  const job = jobId ? downloadJobs.get(jobId) : undefined
  if (job) job.title = metadata.title

  await mkdir(videoDirectory, { recursive: true })
  const stagingDirectory = await createTemporaryDirectory('download-')
  let filename: string
  try {
    const downloadResult = await runYtDlp([
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--format', playbackCompatibleFormatSelector,
      '--paths', `temp:${stagingDirectory}`,
      '--output', resolve(stagingDirectory, '%(id)s.%(ext)s'),
      '--print', 'after_move:filepath',
      url,
    ])
    const downloadedPath = downloadResult.stdout.trim().split(/\r?\n/).at(-1)
    if (!downloadedPath) throw new Error('yt-dlp completed without returning a video file.')

    const absolutePath = resolve(downloadedPath)
    const pathFromStagingDirectory = relative(stagingDirectory, absolutePath)
    if (!pathFromStagingDirectory || isAbsolute(pathFromStagingDirectory) || pathFromStagingDirectory.startsWith(`..${sep}`) || pathFromStagingDirectory === '..') {
      throw new Error('yt-dlp returned a path outside the temporary download directory.')
    }
    const details = await stat(absolutePath)
    if (!details.isFile() || details.size === 0) throw new Error('Downloaded video is empty or not a file.')
    filename = `${basename(absolutePath, extname(absolutePath))}.mp4`
    const normalizedPath = resolve(stagingDirectory, `normalized-${filename}`)
    await normalizeAudio(absolutePath, normalizedPath)
    await publishFile(normalizedPath, resolve(videoDirectory, filename))
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
  }

  const downloadedVideo: LibraryVideo = {
    id: metadata.id,
    title: metadata.title,
    artist: metadata.uploader || metadata.channel || 'YouTube',
    duration: typeof metadata.duration === 'number'
      ? `${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}`
      : '--:--',
    filename,
    audioNormalization: 'ebu-r128-v1',
  }
  downloadedVideo.thumbnailFilename = await ensureThumbnail(downloadedVideo, url)
  let savedVideo = downloadedVideo
  await updateLibrary((library) => {
    savedVideo = { ...downloadedVideo, tags: library.find((item) => item.id === downloadedVideo.id)?.tags ?? [] }
    return [...library.filter((item) => item.id !== savedVideo.id), savedVideo]
  })
  return savedVideo
}

async function findStoredVideo(videoId: string) {
  const video = (await readLibrary()).find((item) => item.id === videoId)
  if (!video) return undefined
  try {
    const details = await stat(resolve(videoDirectory, video.filename))
    return details.isFile() ? video : undefined
  } catch {
    return undefined
  }
}

async function downloadOrReuseVideo(url: string): Promise<DownloadResolution> {
  const videoId = new URL(url).searchParams.get('v')
  if (!videoId) throw new Error('YouTube URL must contain a valid video ID.')

  const activeDownload = inFlightDownloads.get(videoId)
  if (activeDownload) return { video: await activeDownload, alreadyExists: true }

  const existingVideo = await findStoredVideo(videoId)
  if (existingVideo) {
    const thumbnailFilename = await ensureThumbnail(existingVideo)
    if (thumbnailFilename && thumbnailFilename !== existingVideo.thumbnailFilename) {
      const library = await updateLibrary((current) => current.map((video) => video.id === videoId ? { ...video, thumbnailFilename } : video))
      return { video: library.find((video) => video.id === videoId) ?? existingVideo, alreadyExists: true }
    }
    return { video: existingVideo, alreadyExists: true }
  }

  const concurrentDownload = inFlightDownloads.get(videoId)
  if (concurrentDownload) return { video: await concurrentDownload, alreadyExists: true }

  const download = downloadVideo(url)
  inFlightDownloads.set(videoId, download)
  try {
    return { video: await download, alreadyExists: false }
  } finally {
    if (inFlightDownloads.get(videoId) === download) inFlightDownloads.delete(videoId)
  }
}

export function handleApiRequest(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname.startsWith(apiPrefix)) {
    let forwarded = false
    protectManagementAccess(request, response, () => { forwarded = true })
    if (!forwarded) return
  }
  if (pathname.startsWith(videoPrefix)) {
    handleVideoRequest(request, response, pathname, next)
    return
  }
  if (!pathname.startsWith(apiPrefix)) {
    next()
    return
  }

  if (pathname === `${apiPrefix}videos` && request.method === 'GET') {
    void Promise.all([readLibraryWithThumbnails(), readTags()])
      .then(([videos, tags]) => sendJson(response, 200, {
        tags,
        videos: videos.map(publicVideo),
      }))
      .catch(() => sendJson(response, 500, { error: 'Could not read the jukebox library.' }))
    return
  }

  if (pathname === `${apiPrefix}downloads` && request.method === 'GET') {
    sendJson(response, 200, { jobs: [...downloadJobs.values()].map((job) => ({ ...job })) })
    return
  }

  if (pathname === `${apiPrefix}downloads/failed` && request.method === 'DELETE') {
    let cleared = 0
    for (const [id, job] of downloadJobs) {
      if (job.status !== 'failed') continue
      downloadJobs.delete(id)
      cleared += 1
    }
    sendJson(response, 200, { cleared })
    return
  }

  if (pathname === `${apiPrefix}downloads` && request.method === 'POST') {
    void readRequestBody(request)
      .then(({ url }) => enqueueDownload(validateYouTubeUrl(url)))
      .then((job) => sendJson(response, 202, { job: { ...job } }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not queue video download.'
        const invalidUrl = message.startsWith('Only HTTPS') || message.startsWith('Enter a valid') || message.startsWith('YouTube URL must') || message.startsWith('Provide')
        sendJson(response, message.includes('too large') ? 413 : invalidUrl ? 400 : message.includes('queue is full') ? 429 : 500, { error: message })
      })
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

  if (pathname === `${apiPrefix}tags` && request.method === 'DELETE') {
    void readRequestBody(request)
      .then(async ({ name }) => {
        if (typeof name !== 'string') throw new Error('Provide a tag name.')
        const tags = await readTags()
        const tag = findTag(tags, name)
        if (!tag) throw new Error('Tag was not found.')
        const updatedTags = tags.filter((item) => item !== tag)
        await writeTags(updatedTags)
        try {
          await updateLibrary((library) => library.map((video) => ({
            ...video,
            tags: video.tags.filter((item) => item !== tag),
          })))
        } catch (error) {
          await writeTags(tags)
          throw error
        }
        return { tag, tags: updatedTags }
      })
      .then((result) => sendJson(response, 200, result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not delete tag.'
        const status = message === 'Tag was not found.' ? 404 : message.startsWith('Tags must') || message.startsWith('Provide') ? 400 : 500
        sendJson(response, status, { error: message })
      })
    return
  }

  if (pathname === `${apiPrefix}video-tags` && request.method === 'POST') {
    void readRequestBody(request)
      .then(async ({ videoId, tags: requestedTags, videoIds, tag: requestedTag, assigned }) => {
        if (videoIds !== undefined) {
          if (!Array.isArray(videoIds) || videoIds.length === 0 || !videoIds.every((id) => typeof id === 'string' && id.length > 0) || typeof requestedTag !== 'string' || typeof assigned !== 'boolean') {
            throw new Error('Provide video IDs, a tag, and an assigned boolean.')
          }
          const catalog = await readTags()
          const tag = findTag(catalog, requestedTag)
          if (!tag) throw new Error(`Unknown tag: ${requestedTag}`)
          const ids = new Set(videoIds as string[])
          const updatedLibrary = await updateLibrary((library) => {
            if ([...ids].some((id) => !library.some((item) => item.id === id))) throw new Error('Video was not found in the library.')
            return library.map((item) => ids.has(item.id) ? {
              ...item,
              tags: assigned ? [...new Set([...item.tags, tag])] : item.tags.filter((name) => name !== tag),
            } : item)
          })
          return { videos: updatedLibrary.filter((item) => ids.has(item.id)) }
        }
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

  if (pathname !== `${apiPrefix}download` || request.method !== 'POST') {
    sendJson(response, 404, { error: 'Jukebox API route not found.' })
    return
  }

  void readRequestBody(request)
    .then(({ url }) => downloadOrReuseVideo(validateYouTubeUrl(url)))
    .then(({ video, alreadyExists }) => sendJson(response, 200, {
      ...publicVideo(video),
      alreadyExists,
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
      '.jpg': 'image/jpeg',
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

async function updateLibrary(mutate: (library: Array<LibraryVideo & { tags: string[] }>) => LibraryVideo[]) {
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.includes('--normalize-library')) {
  normalizeLibraryAudio().then((result) => {
    console.log(`Normalized ${result.normalized} tracks; skipped ${result.skipped} already normalized tracks.`)
    for (const failure of result.failed) console.error(`${failure.id}: ${failure.error}`)
    if (result.failed.length) process.exitCode = 1
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}