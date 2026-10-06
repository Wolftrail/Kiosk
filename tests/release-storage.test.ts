import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('extracted runtime migrates legacy data and health-checks without dependencies', { timeout: 15000 }, async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'kiosk-release-'))
  const release = resolve(directory, 'release')
  const shared = resolve(directory, 'shared')
  const data = resolve(shared, 'data')
  const repository = fileURLToPath(new URL('../', import.meta.url))
  for (const filename of ['server.ts', 'storage.ts', 'recite-api.ts', 'schedule-api.ts', 'unsplash-api.ts', 'scripts/migrate-storage.ts', 'apps/jukebox/yt-dlp-plugin.ts', 'apps/recite/src/library.ts', 'packages/remote-ui/src/scheduler.ts']) {
    await mkdir(dirname(resolve(release, filename)), { recursive: true })
    await copyFile(resolve(repository, filename), resolve(release, filename))
  }
  await writeFile(resolve(release, 'package.json'), '{"type":"module"}')
  await mkdir(data, { recursive: true })
  await mkdir(resolve(shared, 'apps/jukebox/data'), { recursive: true })
  await mkdir(resolve(shared, 'apps/jukebox/public/videos'), { recursive: true })
  const library = { decks: [{ id: 'thai', name: 'Thai', enabled: true }], flashcards: [] }
  await writeFile(resolve(data, 'recite-library.json'), JSON.stringify(library))
  await writeFile(resolve(shared, 'apps/jukebox/data/library.json'), '[{"id":"fixture","title":"Fixture","filename":"fixture.mp4","tags":[]}]')
  await writeFile(resolve(shared, 'apps/jukebox/public/videos/fixture.mp4'), 'media fixture')
  const env = { ...process.env, KIOSK_DATA_DIR: data, KIOSK_LEGACY_ROOT: shared, KIOSK_PORT: '0', KIOSK_MANAGE_PASSWORD: '' }
  const migration = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/migrate-storage.ts'], { cwd: release, env, encoding: 'utf8' })
  if (process.platform === 'win32' && migration.stderr.includes('EPERM')) { context.skip('Windows file symlinks require Developer Mode.'); return }
  assert.equal(migration.status, 0, migration.stderr)
  const server = spawn(process.execPath, ['--experimental-strip-types', 'server.ts'], { cwd: release, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''
  server.stderr.on('data', (chunk) => { errors += chunk.toString() })
  context.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit')
      server.kill()
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  })
  const address = await new Promise<string>((complete, reject) => {
    server.stdout.on('data', (chunk) => {
      const match = /listening on http:\/\/0\.0\.0\.0:(\d+)/.exec(chunk.toString())
      if (match) complete(`http://127.0.0.1:${match[1]}`)
    })
    server.once('error', reject)
    server.once('exit', () => reject(new Error(errors || 'Server exited before listening.')))
  })
  assert.equal((await fetch(`${address}/api/health`)).status, 200)
  assert.deepEqual(await (await fetch(`${address}/api/recite/library`)).json(), library)
  assert.equal(await (await fetch(`${address}/apps/jukebox/videos/fixture.mp4`)).text(), 'media fixture')
  const updated = { decks: [{ id: 'thai', name: 'Updated Thai', enabled: true }], flashcards: [] }
  assert.equal((await fetch(`${address}/api/recite/library`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(updated) })).status, 200)
  assert.deepEqual(JSON.parse(await readFile(resolve(data, 'recite-library.json'), 'utf8')), updated)
  await rm(resolve(data, 'jukebox/videos/fixture.mp4'))
  assert.equal((await fetch(`${address}/api/health`)).status, 503)
})