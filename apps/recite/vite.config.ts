import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: '/apps/recite/',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5178, strictPort: true },
  build: {
    outDir: resolve(projectRoot, '../../dist/apps/recite'),
    emptyOutDir: false,
  },
})