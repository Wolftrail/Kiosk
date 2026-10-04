import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createServer } from 'node:http'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { mock, test } from 'node:test'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const videoId = 'AbCdEf12345'
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
const jpegFixture = Buffer.from('jpeg-fixture')

function makeFakeSpawn(root: string, calls: Array<{ command: string; args: string[] }>, options: {
  artwork?: 'success' | 'fail'
  ffmpegThumbnail?: 'success' | 'fail'
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
          if (args.includes('--flat-playlist')) {
            stdout = JSON.stringify({ entries: [] })
          } else {
            stdout = JSON.stringify({ id: videoId, title: 'Fixture song', uploader: 'Fixture artist', duration: 125 })
          }
        } else if (command === 'yt-dlp' && args.includes('--print') && args.includes('after_move:filepath')) {
          const filename = `${videoId}.mp4`
          const filePath = join(root, 'public', 'videos', filename)
          await writeFile(filePath, 'video-fixture')
          stdout = `${filePath}\n`
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
  library?: unknown[]
  tags?: string[]
} = {}) {
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
    mock.restoreAll()
    syncBuiltinESMExports()
    await rm(root, { recursive: true, force: true })
    throw error
  }

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    mock.restoreAll()
    syncBuiltinESMExports()
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

test('yt-dlp plugin middleware regressions', async (t) => {
  await t.test('downloads, persists, and serves converted artwork', async (t) => {
    const { root, calls, baseUrl } = await createHarness(t, { artwork: 'success' })
    const response = await postDownload(baseUrl)
    assert.equal(response.status, 200)
    const video = await response.json()
    assert.equal(video.thumbnailUrl, `/apps/jukebox/videos/${videoId}.thumb.jpg`)
    assert.equal(video.alreadyExists, false)

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
})