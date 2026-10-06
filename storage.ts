import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = fileURLToPath(new URL('.', import.meta.url))
export const dataRoot = resolve(process.env.KIOSK_DATA_DIR || resolve(repositoryRoot, 'data'))

export function storagePath(app: 'kiosk' | 'recite' | 'jukebox', filename: string): string {
  const marker = resolve(dataRoot, 'storage-version.json')
  if (existsSync(marker)) {
    const version = JSON.parse(readFileSync(marker, 'utf8')).version
    if (version !== 1) throw new Error('Unsupported storage version. Upgrade code before opening this data.')
  }
  const canonical = resolve(dataRoot, app, filename)
  if (existsSync(canonical)) return realpathSync(canonical)
  if (existsSync(marker) || process.env.KIOSK_DATA_DIR) return canonical
  const legacy = app === 'kiosk' ? resolve(dataRoot, filename)
    : app === 'recite' ? resolve(dataRoot, 'recite-library.json')
    : filename === 'videos' ? resolve(repositoryRoot, 'apps/jukebox/public/videos')
    : resolve(repositoryRoot, 'apps/jukebox/data', filename)
  return existsSync(legacy) ? realpathSync(legacy) : canonical
}