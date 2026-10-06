import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { migrateStorage, validateStorage } from '../scripts/migrate-storage.ts'

test('storage migration is repeatable and preserves rollback paths and backups', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'kiosk-storage-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const root = resolve(directory, 'data')
  await mkdir(resolve(directory, 'apps/jukebox/data'), { recursive: true })
  await mkdir(resolve(directory, 'apps/jukebox/public/videos'), { recursive: true })
  await mkdir(root)
  const library = { decks: [{ id: 'thai', name: 'Thai', enabled: true }], flashcards: [] }
  await writeFile(resolve(root, 'recite-library.json'), JSON.stringify(library))
  await writeFile(resolve(root, 'schedules.json'), '[]')
  await writeFile(resolve(directory, 'apps/jukebox/data/library.json'), '[{"id":"video","filename":"video.mp4"}]')
  await writeFile(resolve(directory, 'apps/jukebox/public/videos/video.mp4'), 'video bytes')
  try { await migrateStorage(root, directory) }
  catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { context.skip('File symlinks require Windows Developer Mode.'); return }
    throw error
  }
  assert.deepEqual(JSON.parse(await readFile(resolve(root, 'recite/library.json'), 'utf8')), library)
  assert.equal(await realpath(resolve(directory, 'apps/jukebox/public/videos')), await realpath(resolve(root, 'jukebox/videos')))
  await writeFile(resolve(root, 'recite-library.json'), JSON.stringify({ decks: [], flashcards: [] }))
  await migrateStorage(root, directory)
  assert.equal(JSON.parse(await readFile(resolve(root, 'recite/library.json'), 'utf8')).decks.length, 0)
  assert.deepEqual(JSON.parse(await readFile(resolve(root, 'backups/storage-v0/recite-library.json'), 'utf8')), library)
  const replacement = resolve(root, 'recite-library.json.tmp')
  await writeFile(replacement, JSON.stringify(library))
  await rename(replacement, await realpath(resolve(root, 'recite/library.json')))
  assert.deepEqual(JSON.parse(await readFile(resolve(root, 'recite-library.json'), 'utf8')), library)
  await writeFile(resolve(root, 'storage-version.json'), '{"version":99}')
  await assert.rejects(migrateStorage(root, directory), /Unsupported storage version/)
})

test('migration resumes after a directory move and refuses conflicting data', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'kiosk-resume-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const root = resolve(directory, 'data')
  await mkdir(resolve(root, 'jukebox'), { recursive: true })
  await writeFile(resolve(root, 'jukebox/library.json'), '[]')
  try { await migrateStorage(root, directory) }
  catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { context.skip('File symlinks require Windows Developer Mode.'); return }
    throw error
  }
  assert.equal(await realpath(resolve(directory, 'apps/jukebox/data')), await realpath(resolve(root, 'jukebox')))
  await rm(resolve(root, 'storage-version.json'))
  await rm(resolve(root, 'recite/library.json'))
  await writeFile(resolve(root, 'recite/library.json'), '{"decks":[],"flashcards":[]}')
  await assert.rejects(migrateStorage(root, directory), /Conflicting data paths/)
  assert.equal(JSON.parse(await readFile(resolve(root, 'recite/library.json'), 'utf8')).decks.length, 0)
  await rm(resolve(root, 'recite/library.json'))
  await symlink(resolve(root, 'recite-library.json'), resolve(root, 'recite/library.json'), 'file')
  await mkdir(resolve(root, '.migration-lock'))
  await writeFile(resolve(root, '.migration-lock/owner.json'), JSON.stringify({ pid: process.pid, host: hostname() }))
  await assert.rejects(migrateStorage(root, directory), /Another storage migration/)
  await writeFile(resolve(root, '.migration-lock/owner.json'), JSON.stringify({ pid: 99999999, host: hostname() }))
  await migrateStorage(root, directory)
  await writeFile(resolve(root, 'jukebox/library.json'), '[{"id":"missing","filename":"missing.mp4"}]')
  await assert.rejects(validateStorage(root), /ENOENT/)
})