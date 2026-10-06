import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function storagePath(_app: string, filename: string) {
  const root = fileURLToPath(new URL('.', import.meta.url))
  return filename === 'videos' ? resolve(root, 'public/videos')
    : filename === 'staging' ? resolve(root, 'public/.jukebox-staging')
    : resolve(root, 'data', filename)
}