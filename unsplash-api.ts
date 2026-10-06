import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseDeckImage } from './apps/recite/src/library.ts'

type Photo = {
  id: string
  alt_description: string | null
  description: string | null
  urls: { regular: string; small: string }
  user: { name: string; links: { html: string } }
  links: { html: string; download_location: string }
}

function creditUrl(value: string) {
  const url = new URL(value)
  url.searchParams.set('utm_source', 'kiosk')
  url.searchParams.set('utm_medium', 'referral')
  return url.href
}

function image(photo: Photo) {
  return parseDeckImage({
    id: photo.id, url: photo.urls.regular, thumbnailUrl: photo.urls.small,
    alt: photo.alt_description ?? photo.description ?? '',
    photographer: photo.user.name, photographerUrl: creditUrl(photo.user.links.html),
    photoUrl: creditUrl(photo.links.html),
  })
}

export async function handleUnsplashRequest(request: IncomingMessage, response: ServerResponse, options: { accessKey?: string; fetch?: typeof fetch } = {}) {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify(value))
  }
  const url = new URL(request.url ?? '/', 'http://localhost')
  const search = url.pathname === '/api/unsplash/search'
  const select = url.pathname === '/api/unsplash/select'
  if (!search && !select) { send(404, { error: 'Not found.' }); return }
  if (request.method !== (search ? 'GET' : 'POST')) { send(405, { error: 'Method not allowed.' }); return }
  const query = url.searchParams.get('query')?.trim() ?? ''
  const page = Number(url.searchParams.get('page') ?? '1')
  const id = url.searchParams.get('id') ?? ''
  if (search && (!query || query.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 1000)) {
    send(400, { error: 'Enter a search term and a valid page.' }); return
  }
  if (select && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) { send(400, { error: 'Invalid photo ID.' }); return }
  const accessKey = options.accessKey ?? process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) { send(503, { error: 'Unsplash is not configured on this server.' }); return }
  const upstreamFetch = options.fetch ?? fetch
  const upstream = async (target: URL) => {
    const result = await upstreamFetch(target, {
      headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
      signal: AbortSignal.timeout(10_000), redirect: 'error',
    })
    if (!result.ok) {
      const exhausted = result.status === 429 || result.status === 403 && result.headers.get('x-ratelimit-remaining') === '0'
      const status = exhausted ? 429 : result.status === 401 || result.status === 403 ? 503 : result.status === 404 ? 404 : 502
      const message = exhausted ? 'Unsplash request limit reached. Try again later.' : status === 503 ? 'The server Unsplash Access Key was rejected.' : status === 404 ? 'This photo is no longer available.' : 'Unsplash is unavailable. Try again later.'
      send(status, { error: message })
      return null
    }
    return result
  }
  try {
    if (search) {
      const target = new URL('https://api.unsplash.com/search/photos')
      target.search = new URLSearchParams({ query, page: String(page), per_page: '12', orientation: 'landscape', content_filter: 'high' }).toString()
      const result = await upstream(target)
      if (!result) return
      const data = await result.json() as { total_pages: number; results: Photo[] }
      send(200, { results: data.results.map(image), totalPages: data.total_pages, page })
    } else {
      const result = await upstream(new URL(`https://api.unsplash.com/photos/${id}`))
      if (!result) return
      const photo = await result.json() as Photo
      const selected = image(photo)
      const download = new URL(photo.links.download_location)
      if (download.origin !== 'https://api.unsplash.com' || download.username || download.password || download.pathname !== `/photos/${id}/download`) throw new Error('Invalid download URL.')
      if (!await upstream(download)) return
      send(200, selected)
    }
  } catch { send(502, { error: 'Could not reach Unsplash. Try again later.' }) }
}