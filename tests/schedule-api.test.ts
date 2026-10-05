import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { handleScheduleRequest } from '../schedule-api.ts'

test('schedule API persists valid lists and rejects malformed or duplicate schedules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiosk-schedule-test-'))
  const server = createServer((request, response) => void handleScheduleRequest(request, response, directory))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}/api/schedules`
  const schedule = { id: 'daily', appId: 'workout', time: '09:00', days: [1, 2, 3, 4, 5], enabled: true }
  const put = (body: unknown) => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.deepEqual(await (await fetch(url)).json(), { schedules: [] })
    assert.equal((await put([schedule])).status, 200)
    assert.deepEqual(await (await fetch(url)).json(), { schedules: [schedule] })
    for (const invalid of [[{ ...schedule, time: '25:00' }], [schedule, schedule], [{ ...schedule, days: [] }], [{ ...schedule, appId: 'unknown' }], [{ ...schedule, id: '../bad' }], {}]) {
      assert.equal((await put(invalid)).status, 400)
      assert.deepEqual(await (await fetch(url)).json(), { schedules: [schedule] })
    }
    assert.equal((await fetch(url, { method: 'DELETE' })).status, 405)
    assert.equal((await fetch(url, { method: 'PUT', body: 'invalid' })).status, 400)
    assert.equal((await put([])).status, 200)
    assert.deepEqual(await (await fetch(url)).json(), { schedules: [] })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})