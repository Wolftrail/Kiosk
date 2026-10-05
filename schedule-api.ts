import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSchedules } from './packages/remote-ui/src/scheduler.ts'

const directory = fileURLToPath(new URL('./data/', import.meta.url))
let saving = false

export async function handleScheduleRequest(request: IncomingMessage, response: ServerResponse, storageDirectory = directory) {
  const filename = resolve(storageDirectory, 'schedules.json')
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify(value))
  }
  try {
    if (request.method === 'GET') {
      let raw = '[]'
      try { raw = await readFile(filename, 'utf8') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      send(200, { schedules: readSchedules({ getItem: () => raw }) })
      return
    }
    if (request.method !== 'PUT') { send(405, { error: 'Method not allowed.' }); return }
    let raw = ''
    for await (const chunk of request) {
      raw += chunk.toString()
      if (Buffer.byteLength(raw) > 64 * 1024) { send(413, { error: 'Schedule list is too large.' }); return }
    }
    let value: unknown
    try { value = JSON.parse(raw) } catch { send(400, { error: 'Invalid JSON.' }); return }
    const schedules = readSchedules({ getItem: () => raw })
    if (!Array.isArray(value) || schedules.length !== value.length || schedules.length > 100
      || new Set(schedules.map((item) => item.id)).size !== schedules.length
      || schedules.some((item) => !/^[\w-]{1,80}$/.test(item.id))) {
      send(400, { error: 'Invalid schedules.' })
      return
    }
    if (saving) { send(409, { error: 'Another save is in progress. Try again.' }); return }
    saving = true
    try {
      await mkdir(storageDirectory, { recursive: true })
      await writeFile(`${filename}.tmp`, JSON.stringify(schedules, null, 2) + '\n')
      await rename(`${filename}.tmp`, filename)
    } finally { saving = false }
    send(200, { schedules })
  } catch {
    send(500, { error: 'Could not access schedules.' })
  }
}