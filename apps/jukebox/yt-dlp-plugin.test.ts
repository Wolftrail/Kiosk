import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createServer } from 'node:http'
import childProcess from 'node:child_process'
import filesystem from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { mock, test } from 'node:test'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const videoId = 'AbCdEf12345'
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
const jpegFixture = Buffer.from('jpeg-fixture')

function makeFakeSpawn(root: string, calls: Array<{ command: string; args: string[] }>, options: {
  artwork?: 'success' | 'fail'
  ffmpegThumbnail?: 'success' | 'fail'
  download?: 'success' | 'fail' | 'interrupted' | 'empty' | 'outside'
  metadataError?: string
  downloadGate?: Promise<void>
}) {
  return (command: string, args: string[]) => {
    calls.push({ command, args: [...args] })
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough
      stderr: PassThrough
      kill: () => boolean
    }
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {
      child.emit('close', 1)
      return true
    }

    queueMicrotask(async () => {
      let code = 0
      let stdout = ''
      let stderr = ''
      try {
        if (command === 'ffmpeg' && args[0] === '-version') {
          stdout = 'ffmpeg fixture'
        } else if (command === 'yt-dlp' && args.includes('--dump-single-json')) {
          if (options.metadataError) throw new Error(options.metadataError)
          if (options.download === 'fail') throw new Error('download fixture failed')
          if (args.includes('--flat-playlist')) {
            stdout = JSON.stringify({ entries: [] })
          } else {
            stdout = JSON.stringify({ id: videoId, title: 'Fixture song', uploader: 'Fixture artist', duration: 125 })
          }
        } else if (command === 'yt-dlp' && args.includes('--print') && args.includes('after_move:filepath')) {
          await options.downloadGate
          const output = args[args.indexOf('--output') + 1]
          const filePath = output.replace('%(id)s', videoId).replace('%(ext)s', 'mp4')
          assert.ok(filePath.startsWith(join(tmpdir(), 'kiosk-jukebox-download-')))
          assert.deepEqual(await readdir(join(root, 'public', 'videos')), [])
          await writeFile(`${filePath}.part`, 'partial-fixture')
          await writeFile(`${filePath}.ytdl`, 'resume-fixture')
          if (options.download === 'interrupted') throw new Error('download interrupted')
          if (options.download === 'outside') {
            stdout = `${join(root, 'outside.mp4')}\n`
          } else {
            await writeFile(filePath, options.download === 'empty' ? '' : 'video-fixture')
            stdout = `${filePath}\n`
          }
        } else if (command === 'yt-dlp' && args.includes('--write-thumbnail')) {
          if (options.artwork !== 'success') throw new Error('artwork failed')
          const output = args[args.indexOf('--output') + 1]
          const pendingPath = output.slice('thumbnail:'.length).replace('%(ext)s', 'jpg')
          await writeFile(pendingPath, jpegFixture)
        } else if (command === 'ffmpeg') {
          if (options.ffmpegThumbnail === 'fail') throw new Error('thumbnail failed')
          await writeFile(args.at(-1)!, jpegFixture)
        } else {
          throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
        }
      } catch (error) {
        code = 1
        stderr = error instanceof Error ? error.message : String(error)
      }
      child.stdout.end(stdout)
      child.stderr.end(stderr)
      child.emit('close', code)
    })
    return child
  }
}

async function createHarness(t: { after: (callback: () => Promise<void>) => void }, options: {
  artwork?: 'success' | 'fail'
  ffmpegThumbnail?: 'success' | 'fail'
  download?: 'success' | 'fail' | 'interrupted' | 'empty' | 'outside'
  metadataError?: string
  downloadGate?: Promise<void>
  cookiesFile?: string
  cookiesBrowser?: string
  library?: unknown[]
  tags?: string[]
  adminPassword?: string
  crossFilesystem?: 'success' | 'copy-fail'
} = {}) {
  const originalPassword = process.env.KIOSK_ADMIN_PASSWORD
  const originalUsername = process.env.KIOSK_ADMIN_USERNAME
  const originalCookiesFile = process.env.KIOSK_YTDLP_COOKIES_FILE
  const originalCookiesBrowser = process.env.KIOSK_YTDLP_COOKIES_BROWSER
  delete process.env.KIOSK_YTDLP_COOKIES_FILE
  delete process.env.KIOSK_YTDLP_COOKIES_BROWSER
  if (options.cookiesFile) process.env.KIOSK_YTDLP_COOKIES_FILE = options.cookiesFile
  if (options.cookiesBrowser) process.env.KIOSK_YTDLP_COOKIES_BROWSER = options.cookiesBrowser
  const restoreCookies = () => {
    if (originalCookiesFile === undefined) delete process.env.KIOSK_YTDLP_COOKIES_FILE
    else process.env.KIOSK_YTDLP_COOKIES_FILE = originalCookiesFile
    if (originalCookiesBrowser === undefined) delete process.env.KIOSK_YTDLP_COOKIES_BROWSER
    else process.env.KIOSK_YTDLP_COOKIES_BROWSER = originalCookiesBrowser
  }
  delete process.env.KIOSK_ADMIN_PASSWORD
  delete process.env.KIOSK_ADMIN_USERNAME
  if (options.adminPassword) {
    process.env.KIOSK_ADMIN_PASSWORD = options.adminPassword
    process.env.KIOSK_ADMIN_USERNAME = 'fixture-admin'
  }
  const root = await mkdtemp(join(tmpdir(), 'jukebox-plugin-test-'))
  const videoDirectory = join(root, 'public', 'videos')
  const dataDirectory = join(root, 'data')
  await mkdir(videoDirectory, { recursive: true })
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
  await copyFile(new URL('./yt-dlp-plugin.ts', import.meta.url), join(root, 'yt-dlp-plugin.ts'))
  await writeFile(join(dataDirectory, 'library.json'), JSON.stringify(options.library ?? []))
  await writeFile(join(dataDirectory, 'tags.json'), JSON.stringify(options.tags ?? []))

  const calls: Array<{ command: string; args: string[] }> = []
  mock.method(childProcess, 'spawn', makeFakeSpawn(root, calls, options))
  if (options.crossFilesystem) {
    const originalRename = filesystem.rename
    const originalCopyFile = filesystem.copyFile
    mock.method(filesystem, 'rename', async (source, destination) => {
      if (String(source).startsWith(join(tmpdir(), 'kiosk-jukebox-'))) {
        throw Object.assign(new Error('Cross-device rename'), { code: 'EXDEV' })
      }
      return originalRename(source, destination)
    })
    if (options.crossFilesystem === 'copy-fail') {
      mock.method(filesystem, 'copyFile', async (source, destination, mode) => {
        if (String(destination).startsWith(join(root, 'public', '.jukebox-staging'))) {
          await writeFile(destination, 'interrupted-copy')
          throw Object.assign(new Error('Publication copy failed'), { code: 'ENOSPC' })
        }
        return originalCopyFile(source, destination, mode)
      })
    }
  }
  syncBuiltinESMExports()
  let server
  try {
    const pluginModule = await import(pathToFileURL(join(root, 'yt-dlp-plugin.ts')).href)
    let middleware
    server = createServer((request, response) => middleware(request, response, () => {
      response.writeHead(404)
      response.end()
    }))
    pluginModule.ytDlpPlugin().configureServer({ middlewares: { use(handler) { middleware = handler } } })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
  } catch (error) {
    restoreCookies()
    mock.restoreAll()
    syncBuiltinESMExports()
    if (originalPassword === undefined) delete process.env.KIOSK_ADMIN_PASSWORD
    else process.env.KIOSK_ADMIN_PASSWORD = originalPassword
    if (originalUsername === undefined) delete process.env.KIOSK_ADMIN_USERNAME
    else process.env.KIOSK_ADMIN_USERNAME = originalUsername
    await rm(root, { recursive: true, force: true })
    throw error
  }

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    mock.restoreAll()
    restoreCookies()
    syncBuiltinESMExports()
    if (originalPassword === undefined) delete process.env.KIOSK_ADMIN_PASSWORD
    else process.env.KIOSK_ADMIN_PASSWORD = originalPassword
    if (originalUsername === undefined) delete process.env.KIOSK_ADMIN_USERNAME
    else process.env.KIOSK_ADMIN_USERNAME = originalUsername
    await rm(root, { recursive: true, force: true })
  })

  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  return { root, calls, baseUrl }
}

async function postDownload(baseUrl: string) {
  return fetch(`${baseUrl}/apps/jukebox/api/download`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: videoUrl }),
  })
}

async function assertStagingCleaned(calls: Array<{ command: string; args: string[] }>) {
  const outputs = calls.filter(({ args }) => args.includes('--output')).map(({ args }) => args[args.indexOf('--output') + 1])
  for (const output of outputs) {
    const directory = dirname(output.replace(/^thumbnail:/, ''))
    assert.ok(directory.startsWith(join(tmpdir(), 'kiosk-jukebox-')))
    await assert.rejects(stat(directory), { code: 'ENOENT' })
  }
}

async function postQueuedDownload(baseUrl: string, url = videoUrl, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/apps/jukebox/api/downloads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ url }),
  })
}

test('yt-dlp plugin middleware regressions', async (t) => {
  for (const setting of ['file', 'browser'] as const) {
    await t.test(`passes ${setting} cookies to metadata, video, and thumbnail requests`, async (t) => {
      const value = setting === 'file' ? join(tmpdir(), 'private fixture cookies.txt') : 'firefox:fixture-profile'
      const { calls, baseUrl } = await createHarness(t, { artwork: 'success', cookiesFile: setting === 'file' ? value : undefined, cookiesBrowser: setting === 'browser' ? value : undefined })
      assert.equal((await postDownload(baseUrl)).status, 200)
      const commands = calls.filter(({ command }) => command === 'yt-dlp')
      assert.equal(commands.length, 3)
      for (const { args } of commands) assert.deepEqual(args.slice(0, 2), [setting === 'file' ? '--cookies' : '--cookies-from-browser', value])
      assert.ok(calls.filter(({ command }) => command === 'ffmpeg').every(({ args }) => !args.includes('--cookies') && !args.includes('--cookies-from-browser')))
    })
  }

  await t.test('does not request cookies for public downloads by default', async (t) => {
    const { calls, baseUrl } = await createHarness(t, { artwork: 'success' })
    assert.equal((await postDownload(baseUrl)).status, 200)
    assert.ok(calls.every(({ args }) => !args.includes('--cookies') && !args.includes('--cookies-from-browser')))
  })

  await t.test('uses the running Node executable for all YouTube challenge solving', async (t) => {
    const { calls, baseUrl } = await createHarness(t, { artwork: 'success' })
    assert.equal((await postDownload(baseUrl)).status, 200)
    const commands = calls.filter(({ command }) => command === 'yt-dlp')
    assert.equal(commands.length, 3)
    for (const { args } of commands) {
      assert.ok(args.includes('--js-runtimes'))
      assert.equal(args[args.indexOf('--js-runtimes') + 1], `node:${process.execPath}`)
    }
    assert.ok(calls.filter(({ command }) => command === 'ffmpeg').every(({ args }) => !args.includes('--js-runtimes')))
  })

  await t.test('rejects ambiguous cookie configuration', async (t) => {
    const { calls, baseUrl } = await createHarness(t, { cookiesFile: 'fixture.txt', cookiesBrowser: 'firefox' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 500)
    assert.match((await response.json()).error, /not both/)
    assert.ok(calls.every(({ command }) => command !== 'yt-dlp'))
  })

  for (const configured of [false, true]) {
    await t.test(`explains YouTube authentication errors with cookies ${configured ? 'configured' : 'absent'}`, async (t) => {
      const { baseUrl } = await createHarness(t, { cookiesBrowser: configured ? 'firefox' : undefined, metadataError: 'ERROR: [youtube] AbCdEf12345: Sign in to confirm your age. Use --cookies-from-browser or --cookies for the authentication.' })
      const response = await postDownload(baseUrl)
      assert.equal(response.status, 500)
      const { error } = await response.json()
      assert.match(error, configured ? /Refresh the configured cookies/ : /Configure cookies on the kiosk/)
      assert.ok(!error.includes('ERROR: [youtube]'))
      await postQueuedDownload(baseUrl)
      let jobs
      for (let attempt = 0; attempt < 50; attempt += 1) {
        jobs = (await (await fetch(`${baseUrl}/apps/jukebox/api/downloads`)).json()).jobs
        if (jobs[0]?.status === 'failed') break
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
      }
      assert.equal(jobs[0].error, error)
    })
  }

  await t.test('clears only failed jobs while active and queued jobs remain', async (t) => {
    const options: { download?: 'fail'; downloadGate?: Promise<void> } = { download: 'fail' }
    const { baseUrl } = await createHarness(t, options)
    await postQueuedDownload(baseUrl)
    const readJobs = async () => (await (await fetch(`${baseUrl}/apps/jukebox/api/downloads`)).json()).jobs
    let jobs
    for (let attempt = 0; attempt < 50; attempt += 1) {
      jobs = await readJobs()
      if (jobs[0]?.status === 'failed') break
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
    }
    assert.equal(jobs[0].status, 'failed')
    delete options.download
    let release!: () => void
    options.downloadGate = new Promise<void>((resolvePromise) => { release = resolvePromise })
    try {
      const active = (await (await postQueuedDownload(baseUrl)).json()).job
      const queued = (await (await postQueuedDownload(baseUrl, 'https://youtu.be/QwErTy12345')).json()).job
      for (let attempt = 0; attempt < 50; attempt += 1) {
        jobs = await readJobs()
        if (jobs.find((job) => job.id === active.id)?.status === 'downloading') break
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
      }
      const response = await fetch(`${baseUrl}/apps/jukebox/api/downloads/failed`, { method: 'DELETE' })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { cleared: 1 })
      jobs = await readJobs()
      assert.equal(jobs.length, 2)
      assert.equal(jobs.find((job) => job.id === active.id).status, 'downloading')
      assert.equal(jobs.find((job) => job.id === queued.id).status, 'queued')
      assert.deepEqual(await (await fetch(`${baseUrl}/apps/jukebox/api/downloads/failed`, { method: 'DELETE' })).json(), { cleared: 0 })
    } finally {
      release()
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await readJobs()).every((job) => job.status === 'completed' || job.status === 'failed')) break
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
      }
    }
  })

  await t.test('exposes the video title before a queued download completes', async (t) => {
    let release!: () => void
    const downloadGate = new Promise<void>((resolvePromise) => { release = resolvePromise })
    const { baseUrl } = await createHarness(t, { downloadGate })
    const readJobs = async () => (await (await fetch(`${baseUrl}/apps/jukebox/api/downloads`)).json()).jobs
    try {
      const queued = (await (await postQueuedDownload(baseUrl)).json()).job
      let job
      for (let attempt = 0; attempt < 50; attempt += 1) {
        job = (await readJobs()).find((item: { id: string }) => item.id === queued.id)
        if (job?.title) break
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
      }
      assert.equal(job.status, 'downloading')
      assert.equal(job.title, 'Fixture song')
      assert.equal(job.url, videoUrl)
      assert.equal(job.video, undefined)
    } finally {
      release()
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await readJobs()).every((job: { status: string }) => job.status === 'completed' || job.status === 'failed')) break
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
      }
    }
  })

  await t.test('downloads, persists, and serves converted artwork', async (t) => {
    const { root, calls, baseUrl } = await createHarness(t, { artwork: 'success' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 200)
    const video = await response.json()
    assert.equal(video.thumbnailUrl, `/apps/jukebox/videos/${videoId}.thumb.jpg`)
    assert.equal(video.alreadyExists, false)
    assert.deepEqual((await readdir(join(root, 'public', 'videos'))).sort(), [`${videoId}.mp4`, `${videoId}.thumb.jpg`])
    assert.equal(await readFile(join(root, 'public', 'videos', `${videoId}.mp4`), 'utf8'), 'video-fixture')
    await assertStagingCleaned(calls)
    const downloadCommand = calls.find(({ args }) => args.includes('after_move:filepath'))!
    assert.ok(downloadCommand.args[downloadCommand.args.indexOf('--paths') + 1].startsWith(`temp:${join(tmpdir(), 'kiosk-jukebox-download-')}`))

    const artworkCommand = calls.find(({ command, args }) => command === 'yt-dlp' && args.includes('--write-thumbnail'))
    assert.ok(artworkCommand)
    assert.ok(artworkCommand.args.includes('--skip-download'))
    assert.ok(artworkCommand.args.includes('--convert-thumbnails'))
    assert.equal(artworkCommand.args[artworkCommand.args.indexOf('--convert-thumbnails') + 1], 'jpg')

    const library = JSON.parse(await readFile(join(root, 'data', 'library.json'), 'utf8'))
    assert.equal(library[0].thumbnailFilename, `${videoId}.thumb.jpg`)
    const artworkResponse = await fetch(`${baseUrl}${video.thumbnailUrl}`)
    assert.equal(artworkResponse.headers.get('content-type'), 'image/jpeg')
    assert.deepEqual(Buffer.from(await artworkResponse.arrayBuffer()), jpegFixture)
  })

  await t.test('publishes videos and thumbnails across filesystems and cleans both staging areas', async (t) => {
    const { root, calls, baseUrl } = await createHarness(t, { artwork: 'success', crossFilesystem: 'success' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 200)
    const video = await response.json()
    assert.equal(video.thumbnailUrl, `/apps/jukebox/videos/${videoId}.thumb.jpg`)
    assert.equal(await readFile(join(root, 'public', 'videos', `${videoId}.mp4`), 'utf8'), 'video-fixture')
    assert.deepEqual(await readFile(join(root, 'public', 'videos', `${videoId}.thumb.jpg`)), jpegFixture)
    assert.deepEqual(await readdir(join(root, 'public', '.jukebox-staging')), [])
    await assertStagingCleaned(calls)
  })

  await t.test('cleans interrupted cross-filesystem copies without publishing or saving a video', async (t) => {
    const { root, calls, baseUrl } = await createHarness(t, { crossFilesystem: 'copy-fail' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 500)
    assert.match((await response.json()).error, /Publication copy failed/)
    assert.deepEqual(await readdir(join(root, 'public', 'videos')), [])
    assert.deepEqual(await readdir(join(root, 'public', '.jukebox-staging')), [])
    assert.deepEqual(JSON.parse(await readFile(join(root, 'data', 'library.json'), 'utf8')), [])
    await assertStagingCleaned(calls)
  })

  for (const failure of ['interrupted', 'empty', 'outside'] as const) {
    await t.test(`does not publish ${failure} downloads and cleans staging files`, async (t) => {
      const { root, calls, baseUrl } = await createHarness(t, { download: failure })
      const response = await postDownload(baseUrl)
      assert.equal(response.status, 500)
      const result = await response.json()
      const expectedError = failure === 'interrupted' ? /download interrupted/
        : failure === 'empty' ? /empty or not a file/ : /outside the temporary download directory/
      assert.match(result.error, expectedError)
      assert.deepEqual(await readdir(join(root, 'public', 'videos')), [])
      await assertStagingCleaned(calls)
      assert.deepEqual(JSON.parse(await readFile(join(root, 'data', 'library.json'), 'utf8')), [])
    })
  }

  await t.test('falls back to FFmpeg when yt-dlp artwork fails', async (t) => {
    const { calls, baseUrl } = await createHarness(t, { artwork: 'fail' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 200)
    const video = await response.json()
    assert.equal(video.thumbnailUrl, `/apps/jukebox/videos/${videoId}.thumb.jpg`)
    assert.ok(calls.some(({ command, args }) => command === 'yt-dlp' && args.includes('--skip-download')))
    assert.ok(calls.some(({ command, args }) => command === 'ffmpeg' && args.includes('-vf')))
  })

  await t.test('keeps a successful download when both thumbnail commands fail', async (t) => {
    const { root, calls, baseUrl } = await createHarness(t, { artwork: 'fail', ffmpegThumbnail: 'fail' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 200)
    const video = await response.json()
    assert.equal(video.title, 'Fixture song')
    assert.equal('thumbnailUrl' in video, false)
    assert.ok(calls.some(({ command, args }) => command === 'yt-dlp' && args.includes('--write-thumbnail')))
    assert.ok(calls.some(({ command, args }) => command === 'ffmpeg' && args.includes('-vf')))
    assert.equal(JSON.parse(await readFile(join(root, 'data', 'library.json'), 'utf8')).length, 1)
    assert.deepEqual(await readdir(join(root, 'public', 'videos')), [`${videoId}.mp4`])
    await assertStagingCleaned(calls)
  })

  await t.test('backfills an offline library with FFmpeg once and preserves tags', async (t) => {
    const existingVideo = {
      id: videoId,
      title: 'Offline song',
      artist: 'Local artist',
      duration: '2:05',
      filename: `${videoId}.mp4`,
      tags: ['Favorites'],
    }
    const { root, calls, baseUrl } = await createHarness(t, {
      library: [existingVideo],
      tags: ['Favorites'],
    })
    await writeFile(join(root, 'public', 'videos', existingVideo.filename), 'video-fixture')

    const firstResponse = await fetch(`${baseUrl}/apps/jukebox/api/videos`)
    assert.equal(firstResponse.status, 200)
    const first = await firstResponse.json()
    assert.equal(first.videos[0].thumbnailUrl, `/apps/jukebox/videos/${videoId}.thumb.jpg`)
    assert.deepEqual(first.videos[0].tags, ['Favorites'])
    assert.ok(calls.every(({ command }) => command === 'ffmpeg'))
    assert.equal(calls.filter(({ command, args }) => command === 'ffmpeg' && args.includes('-vf')).length, 1)

    const savedLibrary = JSON.parse(await readFile(join(root, 'data', 'library.json'), 'utf8'))
    assert.deepEqual(savedLibrary[0].tags, ['Favorites'])
    assert.equal(savedLibrary[0].thumbnailFilename, `${videoId}.thumb.jpg`)
    const secondResponse = await fetch(`${baseUrl}/apps/jukebox/api/videos`)
    assert.equal(secondResponse.status, 200)
    assert.equal(calls.filter(({ command, args }) => command === 'ffmpeg' && args.includes('-vf')).length, 1)
  })

  await t.test('reuses a stored download and returns its thumbnail URL', async (t) => {
    const existingVideo = {
      id: videoId,
      title: 'Stored song',
      artist: 'Stored artist',
      duration: '2:05',
      filename: `${videoId}.mp4`,
      thumbnailFilename: `${videoId}.thumb.jpg`,
      tags: ['Favorites'],
    }
    const { root, calls, baseUrl } = await createHarness(t, { library: [existingVideo] })
    await writeFile(join(root, 'public', 'videos', existingVideo.filename), 'video-fixture')
    await writeFile(join(root, 'public', 'videos', existingVideo.thumbnailFilename), jpegFixture)

    const response = await postDownload(baseUrl)
    assert.equal(response.status, 200)
    const video = await response.json()
    assert.equal(video.alreadyExists, true)
    assert.equal(video.thumbnailUrl, `/apps/jukebox/videos/${videoId}.thumb.jpg`)
    assert.equal(calls.length, 0)
  })

  await t.test('accepts jobs promptly, deduplicates active URLs, and exposes completion', async (t) => {
    const { baseUrl } = await createHarness(t)
    const responses = await Promise.all([postQueuedDownload(baseUrl), postQueuedDownload(baseUrl)])
    assert.deepEqual(responses.map((response) => response.status), [202, 202])
    const [first, second] = await Promise.all(responses.map((response) => response.json()))
    assert.equal(first.job.id, second.job.id)
    assert.equal(first.job.url, videoUrl)
    assert.ok(['queued', 'downloading', 'completed'].includes(first.job.status))

    let jobs: Array<{ id: string; status: string; video?: { title: string } }> = []
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(`${baseUrl}/apps/jukebox/api/downloads`)
      jobs = (await response.json()).jobs
      if (jobs[0]?.status === 'completed') break
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
    }
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].status, 'completed')
    assert.equal(jobs[0].video?.title, 'Fixture song')
  })

  await t.test('rejects invalid queued URLs and reports background failures', async (t) => {
    const { baseUrl } = await createHarness(t, { download: 'fail' })
    const invalid = await postQueuedDownload(baseUrl, 'http://youtube.com/watch?v=bad')
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error, 'Only HTTPS YouTube video URLs are supported.')

    const accepted = await postQueuedDownload(baseUrl)
    assert.equal(accepted.status, 202)
    const { job } = await accepted.json()
    let result
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(`${baseUrl}/apps/jukebox/api/downloads`)
      result = (await response.json()).jobs.find((item: { id: string }) => item.id === job.id)
      if (result?.status === 'failed') break
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10))
    }
    assert.equal(result.status, 'failed')
    assert.match(result.error, /download fixture failed/)
  })

  await t.test('requires configured Basic auth and blocks foreign-origin mutations', async (t) => {
    const { baseUrl } = await createHarness(t, { adminPassword: 'fixture-password' })
    const unauthenticated = await fetch(`${baseUrl}/apps/jukebox/api/downloads`)
    assert.equal(unauthenticated.status, 401)
    assert.match(unauthenticated.headers.get('www-authenticate') ?? '', /^Basic /)
    assert.equal((await fetch(`${baseUrl}/apps/jukebox/api/downloads/failed`, { method: 'DELETE' })).status, 401)

    const authorization = `Basic ${Buffer.from('fixture-admin:fixture-password').toString('base64')}`
    assert.equal((await fetch(`${baseUrl}/apps/jukebox/api/downloads/failed`, { method: 'DELETE', headers: { authorization, origin: 'http://attacker.example' } })).status, 403)
    const foreignOrigin = await postQueuedDownload(baseUrl, videoUrl, {
      authorization,
      origin: 'http://attacker.example',
    })
    assert.equal(foreignOrigin.status, 403)
    const authorized = await fetch(`${baseUrl}/apps/jukebox/api/downloads`, { headers: { authorization } })
    assert.equal(authorized.status, 200)
  })
})