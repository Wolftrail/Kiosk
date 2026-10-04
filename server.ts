import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApiRequest, protectManagementAccess } from './apps/jukebox/yt-dlp-plugin.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const distRoot = resolve(projectRoot, 'dist')
const appRoots = new Map([
  ['/apps/recite', resolve(distRoot, 'apps/recite')],
  ['/apps/jukebox', resolve(distRoot, 'apps/jukebox')],
  ['/apps/workout', resolve(distRoot, 'apps/workout')],
  ['/apps/scripture', resolve(distRoot, 'apps/scripture')],
])
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function sendNotFound(response: ServerResponse) {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}

function staticPath(pathname: string) {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return undefined
  }
  if (decodedPath.includes('\\') || decodedPath.includes('\0')) return undefined

  let base = distRoot
  let relativePath = decodedPath.replace(/^\/+/, '')
  for (const [prefix, appRoot] of appRoots) {
    if (decodedPath === prefix || decodedPath.startsWith(`${prefix}/`)) {
      base = appRoot
      relativePath = decodedPath.slice(prefix.length).replace(/^\/+/, '')
      break
    }
  }
  const target = resolve(base, relativePath || 'index.html')
  const pathFromRoot = relative(base, target)
  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot.startsWith(sep)) return undefined
  return target
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }
  const route = pathname === '/' || pathname === '/manage' || pathname === '/manage/'
    ? '/index.html'
    : pathname
  const filename = staticPath(route)
  if (!filename) {
    sendNotFound(response)
    return
  }
  try {
    const details = await stat(filename)
    if (!details.isFile()) {
      sendNotFound(response)
      return
    }
    response.writeHead(200, {
      'content-length': details.size,
      'content-type': contentTypes[extname(filename).toLowerCase()] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(filename).on('error', () => response.destroy()).pipe(response)
  } catch {
    sendNotFound(response)
  }
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname === '/manage' || pathname.startsWith('/manage/')) {
    protectManagementAccess(request, response, () => void serveStatic(request, response, pathname), true)
    return
  }
  if (pathname.startsWith('/apps/jukebox/api/') || pathname.startsWith('/apps/jukebox/videos/')) {
    handleApiRequest(request, response, () => sendNotFound(response))
    return
  }
  void serveStatic(request, response, pathname)
})

const port = Number(process.env.KIOSK_PORT || 8080)
server.listen(port, '0.0.0.0', () => {
  console.log(`Kiosk server listening on http://0.0.0.0:${port}`)
})