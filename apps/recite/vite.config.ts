import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { handleReciteRequest } from '../../recite-api.ts'
import { protectManagementAccess } from '../jukebox/yt-dlp-plugin.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: '/apps/recite/',
  plugins: [react(), {
    name: 'recite-library-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/api/recite/library') { next(); return }
        if (request.method === 'GET') void handleReciteRequest(request, response)
        else protectManagementAccess(request, response, () => void handleReciteRequest(request, response), true)
      })
    },
  }],
  server: { host: '0.0.0.0', port: 5178, strictPort: true },
  build: {
    outDir: resolve(projectRoot, '../../dist/apps/recite'),
    emptyOutDir: false,
  },
})