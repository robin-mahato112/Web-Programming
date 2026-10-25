import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/backend': {
      target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: path => path.replace(/^\/backend/, ''),
    },
  }
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 3000, strictPort: false, proxy },
    preview: { host: '127.0.0.1', proxy },
  }
})
