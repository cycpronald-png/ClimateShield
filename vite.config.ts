import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const BACKEND_TARGET = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // VITE_API_BASE_URL is the optional base for the FastAPI client.
  // VITE_STATIC_MODE=1 opts the frontend into reading bundled
  // public/data/*.json (used for GitHub Pages previews without a backend).
  // Production deployments on the same host should leave these unset.
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL ?? ''),
    'import.meta.env.VITE_STATIC_MODE': JSON.stringify(process.env.VITE_STATIC_MODE ?? ''),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
      '/docs': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
      '/openapi.json': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      }
    },
    watch: {
      usePolling: true,
    },
  },
  build: {
    chunkSizeWarningLimit: 1500, // 1.5MB limit
  },
})
