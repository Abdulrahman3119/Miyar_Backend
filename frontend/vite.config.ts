import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
// Built assets are served by Frappe at /assets/miyar/frontend/
const frappeOut = path.resolve(rootDir, '../miyar/public/frontend')

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(rootDir, 'src') },
  },
  base: mode === 'production' ? '/assets/miyar/frontend/' : '/',
  build: {
    outDir: frappeOut,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'miyar-app.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) =>
          (info.name || '').endsWith('.css') ? 'miyar-app.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/engine-api': {
        target: process.env.ENGINE_ORIGIN || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/engine-api/, ''),
        timeout: 15 * 60 * 1000,
        proxyTimeout: 15 * 60 * 1000,
      },
    },
  },
}))
