import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { handleUnsplashRequest } from '../unsplash-api.ts'

const photo = {
  id: 'photo-one', alt_description: 'Forest', description: null,
  urls: { regular: 'https://images.unsplash.com/photo-one?ixid=test&w=1080', small: 'https://images.unsplash.com/photo-one?ixid=test&w=400' },
  user: { name: 'Alex', links: { html: 'https://unsplash.com/@alex' } },
  links: { html: 'https://unsplash.com/photos/photo-one', download_location: 'https://api.unsplash.com/photos/photo-one/download?ixid=test' },
}

test('Unsplash proxy validates input, protects credentials, preserves attribution and tracks selections', async () => {
  const calls: { url: URL; init?: RequestInit }[] = []
  let mode = 'ok'
  const upstream: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    if (mode === 'network') throw new Error('secret-key upstream detail')
    if (mode === 'rate') return new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
    if (mode === 'auth') return new Response('secret-key', { status: 401 })
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'unused' })
    if (url.pathname === '/search/photos') return Response.json({ results: [photo], total_pages: 3 })
    return Response.json(mode === 'unsafe' ? { ...photo, links: { ...photo.links, download_location: 'https://example.com/steal-key' } } : photo)
  }
  const server = createServer((request, response) => { void handleUnsplashRequest(request, response, { accessKey: 'secret-key', fetch: upstream }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  try {
    for (const suffix of ['/search?query=', '/search?query=forest&page=0', '/search?query=forest&page=1.5', '/select?id=../bad']) {
      const result = await fetch(`${base}/api/unsplash${suffix}`, { method: suffix.startsWith('/select') ? 'POST' : 'GET' })
      assert.equal(result.status, 400)
    }
    assert.equal(calls.length, 0)
    assert.equal((await fetch(`${base}/api/unsplash/search?query=forest`, { method: 'POST' })).status, 405)
    const result = await fetch(`${base}/api/unsplash/search?query=forest&page=2`)
    assert.equal(result.status, 200)
    const data = await result.json()
    assert.equal(data.totalPages, 3)
    assert.equal(data.results[0].url, photo.urls.regular)
    assert.equal(data.results[0].photographerUrl, 'https://unsplash.com/@alex?utm_source=kiosk&utm_medium=referral')
    assert.equal(JSON.stringify(data).includes('secret-key'), false)
    assert.equal(calls[0].url.searchParams.get('content_filter'), 'high')
    assert.equal(calls[0].url.searchParams.get('page'), '2')
    assert.equal(new Headers(calls[0].init?.headers).get('Authorization'), 'Client-ID secret-key')
    assert.equal(calls.length, 1)
    const selected = await fetch(`${base}/api/unsplash/select?id=photo-one`, { method: 'POST' })
    assert.equal(selected.status, 200)
    assert.equal((await selected.json()).id, 'photo-one')
    assert.equal(calls.at(-1)?.url.href, photo.links.download_location)
    mode = 'unsafe'
    assert.equal((await fetch(`${base}/api/unsplash/select?id=photo-one`, { method: 'POST' })).status, 502)
    assert.equal(calls.some((call) => call.url.hostname === 'example.com'), false)
    for (const [value, status] of [['rate', 429], ['auth', 503], ['network', 502]] as const) {
      mode = value
      const failed = await fetch(`${base}/api/unsplash/search?query=forest`)
      assert.equal(failed.status, status)
      assert.equal((await failed.text()).includes('secret-key'), false)
    }
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
})

test('Unsplash reports missing configuration without making requests', async () => {
  const server = createServer((request, response) => { void handleUnsplashRequest(request, response, { accessKey: '', fetch: async () => { throw new Error('Must not fetch') } }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/unsplash/search?query=forest`)
    assert.equal(result.status, 503)
    assert.match((await result.json()).error, /not configured/)
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
})