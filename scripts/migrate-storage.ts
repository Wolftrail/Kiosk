import { copyFile, lstat, mkdir, readFile, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseLibrary } from '../apps/recite/src/library.ts'
import { readSchedules } from '../packages/remote-ui/src/scheduler.ts'

const supportedVersion = 1

async function exists(path: string) {
  try { return await lstat(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

export async function validateStorage(root: string) {
  const json = async (path: string, fallback: unknown) => {
    try { return JSON.parse(await readFile(resolve(root, path), 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error }
  }
  const schedules = await json('kiosk/schedules.json', [])
  if (!Array.isArray(schedules) || readSchedules({ getItem: () => JSON.stringify(schedules) }).length !== schedules.length) throw new Error('Invalid schedules in data directory.')
  parseLibrary(await json('recite/library.json', { decks: [], flashcards: [] }))
  const videos = await json('jukebox/library.json', [])
  const tags = await json('jukebox/tags.json', [])
  if (!Array.isArray(videos) || !Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) throw new Error('Invalid Jukebox metadata.')
  for (const video of videos) {
    if (!video || typeof video.id !== 'string' || typeof video.filename !== 'string') throw new Error('Invalid Jukebox video entry.')
    for (const filename of [video.filename, video.thumbnailFilename].filter(Boolean)) {
      if (typeof filename !== 'string' || filename !== filename.split(/[\\/]/).at(-1) || filename === '..') throw new Error('Invalid media filename.')
      const media = await lstat(resolve(root, 'jukebox/videos', filename))
      if (!media.isFile() || media.size === 0) throw new Error(`Missing or empty media: ${filename}`)
    }
  }
}

export async function migrateStorage(root: string, legacyRoot: string) {
  root = resolve(root)
  legacyRoot = resolve(legacyRoot)
  await mkdir(root, { recursive: true })
  root = await realpath(root)
  const lock = resolve(root, '.migration-lock')
  try { await mkdir(lock) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    let owner
    try { owner = JSON.parse(await readFile(resolve(lock, 'owner.json'), 'utf8')) }
    catch { throw new Error('Migration lock has no readable owner. Stop all writers and inspect .migration-lock before removing it.') }
    if (owner.host !== hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('Migration lock belongs to an unknown owner.')
    try { process.kill(owner.pid, 0); throw new Error('Another storage migration is running.') }
    catch (ownerError) {
      if ((ownerError as NodeJS.ErrnoException).code !== 'ESRCH') throw ownerError
    }
    await rm(lock, { recursive: true })
    await mkdir(lock)
  }
  try {
    await writeFile(resolve(lock, 'owner.json'), JSON.stringify({ pid: process.pid, host: hostname() }), { flag: 'wx' })
    const versionFile = resolve(root, 'storage-version.json')
    const version = await exists(versionFile) ? JSON.parse(await readFile(versionFile, 'utf8')).version : 0
    if (!Number.isInteger(version) || version < 0 || version > supportedVersion) throw new Error('Unsupported storage version. Upgrade code before opening this data.')
    if (version === supportedVersion) { await validateStorage(root); return }
    const backup = resolve(root, 'backups', 'storage-v0')
    await mkdir(backup, { recursive: true })
    const link = async (source: string, target: string, directory: boolean) => {
      await mkdir(dirname(source), { recursive: true })
      await symlink(target, source, directory ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file')
    }
    const probe = resolve(root, '.symlink-probe')
    await link(probe, versionFile, false)
    await rm(probe)
    const migrateFile = async (oldPath: string, newPath: string, backupName: string, fallback: unknown) => {
      const old = await exists(oldPath)
      const next = await exists(newPath)
      if (next) {
        if (next.isSymbolicLink()) {
          if (resolve(dirname(newPath), await readlink(newPath)) !== oldPath || !old) throw new Error(`Unexpected compatibility link: ${newPath}`)
          return
        }
        if (old) throw new Error(`Conflicting data paths: ${oldPath} and ${newPath}`)
        await mkdir(dirname(oldPath), { recursive: true })
        await rename(newPath, oldPath)
      }
      await mkdir(dirname(oldPath), { recursive: true })
      if (!await exists(oldPath)) await writeFile(oldPath, JSON.stringify(fallback, null, 2) + '\n', { flag: 'wx' })
      const backupPath = resolve(backup, backupName)
      if (!await exists(backupPath)) await copyFile(oldPath, backupPath)
      await link(newPath, oldPath, false)
    }
    await migrateFile(resolve(root, 'schedules.json'), resolve(root, 'kiosk/schedules.json'), 'schedules.json', [])
    const recite = resolve(root, 'recite-library.json')
    const seed = resolve(legacyRoot, 'apps/recite/public/data/library.json')
    if (!await exists(recite) && await exists(seed)) await copyFile(seed, recite)
    await migrateFile(recite, resolve(root, 'recite/library.json'), 'recite-library.json', { decks: [], flashcards: [] })
    const moveDirectory = async (source: string, destination: string) => {
      const old = await exists(source)
      const next = await exists(destination)
      if (old?.isSymbolicLink()) {
        if (resolve(dirname(source), await readlink(source)) !== destination || !next) throw new Error(`Unexpected compatibility link: ${source}`)
        return
      }
      if (old && next) throw new Error(`Conflicting data directories: ${source} and ${destination}`)
      await mkdir(dirname(destination), { recursive: true })
      if (old) await rename(source, destination)
      else if (!next) await mkdir(destination, { recursive: true })
      await link(source, destination, true)
    }
    await moveDirectory(resolve(legacyRoot, 'apps/jukebox/data'), resolve(root, 'jukebox'))
    await moveDirectory(resolve(legacyRoot, 'apps/jukebox/public/videos'), resolve(root, 'jukebox/videos'))
    for (const filename of ['library.json', 'tags.json']) {
      const source = resolve(root, 'jukebox', filename)
      if (await exists(source) && !await exists(resolve(backup, `jukebox-${filename}`))) await copyFile(source, resolve(backup, `jukebox-${filename}`))
    }
    await mkdir(resolve(root, 'jukebox/staging'), { recursive: true })
    await validateStorage(root)
    await writeFile(`${versionFile}.tmp`, JSON.stringify({ version: supportedVersion }, null, 2) + '\n')
    await rename(`${versionFile}.tmp`, versionFile)
  } finally { await rm(lock, { recursive: true }) }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const repository = fileURLToPath(new URL('../', import.meta.url))
  const root = resolve(process.env.KIOSK_DATA_DIR || resolve(repository, 'data'))
  if (process.argv.includes('--check')) await validateStorage(root)
  else await migrateStorage(root, resolve(process.env.KIOSK_LEGACY_ROOT || repository))
  console.log(`Storage ${process.argv.includes('--check') ? 'validated' : 'migrated'}: ${root}`)
}