import react from '@vitejs/plugin-react'
import { protectManagementAccess } from './apps/jukebox/yt-dlp-plugin.ts'
import { defineConfig, type Plugin } from 'vite'

const managementAccessPlugin: Plugin = {
  name: 'kiosk-management-access',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname === '/manage' || pathname.startsWith('/manage/')) {
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
