import react from '@vitejs/plugin-react'
import { protectManagementAccess } from './apps/jukebox/yt-dlp-plugin.ts'
import { handleScheduleRequest } from './schedule-api.ts'
import { handleReciteRequest } from './recite-api.ts'
import { handleUnsplashRequest } from './unsplash-api.ts'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const managementAccessPlugin: Plugin = {
  name: 'kiosk-management-access',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname.startsWith('/api/unsplash/')) {
        const accessKey = process.env.UNSPLASH_ACCESS_KEY ?? loadEnv(server.config.mode, server.config.envDir, 'UNSPLASH_').UNSPLASH_ACCESS_KEY
        protectManagementAccess(request, response, () => void handleUnsplashRequest(request, response, { accessKey }), true)
      } else if (pathname === '/api/recite/library') {
        if (request.method === 'GET') void handleReciteRequest(request, response)
        else protectManagementAccess(request, response, () => void handleReciteRequest(request, response), true)
      } else if (pathname === '/api/schedules') {
        if (request.method === 'GET') void handleScheduleRequest(request, response)
        else protectManagementAccess(request, response, () => void handleScheduleRequest(request, response), true)
      } else if (pathname === '/manage' || pathname.startsWith('/manage/')) {
        protectManagementAccess(request, response, next, true)
      } else if (pathname.startsWith('/apps/jukebox/api/')) {
        protectManagementAccess(request, response, next)
      } else {
        next()
      }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [managementAccessPlugin, react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/apps/recite': {
        target: 'http://127.0.0.1:5178',
        changeOrigin: true,
        ws: true,
      },
      '/apps/jukebox': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: false,
        ws: true,
      },
      '/apps/workout': {
        target: 'http://127.0.0.1:5175',
        changeOrigin: true,
        ws: true,
      },
      '/apps/scripture': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
