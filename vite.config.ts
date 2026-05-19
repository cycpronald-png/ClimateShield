import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const BACKEND_TARGET = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Priority-based chunking to avoid circular dependencies
          // Check most specific patterns first

          // 1. Split plotly FIRST (before generic vendor check)
          if (id.includes('plotly.js')) {
            return 'plotly-vendor';
          }

          // 2. Split other large viz libraries
          if (id.includes('@visx')) {
            return 'visx-vendor';
          }

          // 3. React ecosystem (before generic node_modules)
          if (id.includes('node_modules')) {
            // React core (highest priority vendor)
            if (id.includes('/react/') || id.includes('/react-dom/')) {
              return 'react-vendor';
            }
            // React router
            if (id.includes('react-router')) {
              return 'router-vendor';
            }
            // Radix UI
            if (id.includes('@radix-ui')) {
              return 'radix-vendor';
            }
            // Icons
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            // Everything else from node_modules
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500, // 1.5MB limit
  },
})
