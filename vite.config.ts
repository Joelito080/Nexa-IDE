import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // dev-electron.mjs spawns Electron; suppress plugin auto-start.
        onstart() {},
        // Entry point for the Electron main process
        entry: ['electron/main.ts', 'electron/search/searchWorker.ts'],
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            minify: process.env.NODE_ENV === 'production',
            rollupOptions: {
              external: ['electron', 'mongodb', 'node-pty', 'chromium-bidi', 'playwright-chromium'],
              input: {
                main: 'electron/main.ts',
                searchWorker: 'electron/search/searchWorker.ts',
              },
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      preload: {
        // Entry point for the Electron preload script
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            minify: process.env.NODE_ENV === 'production',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: [
        '**/.electron-user-data/**',
        '**/release/**',
        '**/dist-electron/**',
        '**/win-unpacked/**',
        '**/*.tmp',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          if (id.includes('src/components/auth/LoginBackground.tsx')) {
            return 'auth-background'
          }
        },
      },
    },
  },
})
