import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { handleReciteRequest } from '../recite-api.ts'

test('Recite imports preserve UTF-8 characters split across request chunks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recite-utf8-'))
  const name = String.fromCodePoint(0x0e01, 0x0e02, 0x1f600)
  const library = { decks: [{ id: 'unicode', name, enabled: true }], flashcards: [] }
  const bytes = Buffer.from(JSON.stringify(library))
  const request = Readable.from(Array.from(bytes, (byte) => Buffer.from([byte]))) as IncomingMessage
  request.method = 'PUT'
  let status = 0
  let result = ''
  const response = {
    writeHead(code: number) { status = code },
    end(body: string) { result = body },
  } as unknown as ServerResponse
  try {
    await handleReciteRequest(request, response, directory)
    assert.equal(status, 200)
    assert.deepEqual(JSON.parse(result), library)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'recite-library.json'), 'utf8')), library)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('Recite library persists edits and rejects invalid replacements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recite-api-'))
  const seed = join(directory, 'seed.json')
  const initial = { decks: [{ id: 'deck', name: 'Original', enabled: true }], flashcards: [] }
  const server: Server = createServer((request, response) => { void handleReciteRequest(request, response, directory, seed) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}/api/recite/library`
  const put = (value: unknown) => fetch(url, { method: 'PUT', body: JSON.stringify(value) })
  try {
    const empty = await fetch(url)
    assert.equal(empty.status, 200)
    assert.deepEqual(await empty.json(), { decks: [], flashcards: [] })
    await writeFile(seed, '{')
    assert.equal((await fetch(url)).status, 500)
    await writeFile(seed, JSON.stringify(initial))
    assert.deepEqual(await (await fetch(url)).json(), initial)
    const updated = { decks: [{ id: 'deck', name: 'Renamed', enabled: false }], flashcards: [{ id: 'card', deckId: 'deck', front: 'Question', back: 'Answer', interval: 3, repetitions: 2, easeFactor: 2.5, lastReviewDate: null }] }
    assert.equal((await put(updated)).status, 200)
    await writeFile(seed, JSON.stringify(initial))
    assert.deepEqual(await (await fetch(url)).json(), updated)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'recite-library.json'), 'utf8')), updated)
    assert.equal((await put({ ...updated, decks: [] })).status, 400)
    assert.equal((await put({ ...updated, decks: [...updated.decks, ...updated.decks] })).status, 400)
    assert.equal((await put({ ...updated, flashcards: [{ ...updated.flashcards[0], front: ' ' }] })).status, 400)
    assert.equal((await fetch(url, { method: 'PUT', body: '{' })).status, 400)
    assert.equal((await fetch(url, { method: 'POST' })).status, 405)
    assert.equal((await fetch(url, { method: 'PUT', body: ' '.repeat(5 * 1024 * 1024 + 1) })).status, 413)
    assert.deepEqual(await (await fetch(url)).json(), updated)
    assert.equal((await put({ decks: [], flashcards: [] })).status, 200)
    assert.deepEqual(await (await fetch(url)).json(), { decks: [], flashcards: [] })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})