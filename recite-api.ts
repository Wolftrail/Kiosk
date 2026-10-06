import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLibrary } from './apps/recite/src/library.ts'

const directory = fileURLToPath(new URL('./data/', import.meta.url))
const seed = fileURLToPath(new URL('./apps/recite/public/data/library.json', import.meta.url))
const saves = new Set<string>()

export async function handleReciteRequest(request: IncomingMessage, response: ServerResponse, storageDirectory = directory, seedFilename = seed) {
  const filename = resolve(storageDirectory, 'recite-library.json')
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify(value))
  }
  try {
    if (request.method === 'GET') {
      let raw: string
      try { raw = await readFile(filename, 'utf8') }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        try { raw = await readFile(seedFilename, 'utf8') }
        catch (seedError) {
          if ((seedError as NodeJS.ErrnoException).code !== 'ENOENT') throw seedError
          raw = '{"decks":[],"flashcards":[]}'
        }
      }
      send(200, parseLibrary(JSON.parse(raw)))
      return
    }
    if (request.method !== 'PUT') { send(405, { error: 'Method not allowed.' }); return }
    const chunks: Buffer[] = []
    let bytes = 0
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > 5 * 1024 * 1024) { send(413, { error: 'Library exceeds the 5 MB limit.' }); return }
      chunks.push(buffer)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    let library
    try { library = parseLibrary(JSON.parse(raw)) }
    catch (error) { send(400, { error: error instanceof Error ? error.message : 'Invalid library.' }); return }
    if (saves.has(filename)) { send(409, { error: 'Another save is in progress. Try again.' }); return }
    saves.add(filename)
    try {
      await mkdir(storageDirectory, { recursive: true })
      await writeFile(`${filename}.tmp`, JSON.stringify(library, null, 2) + '\n')
      await rename(`${filename}.tmp`, filename)
    } finally { saves.delete(filename) }
    send(200, library)
  } catch {
    send(500, { error: 'Could not access the flashcard library.' })
  }
}