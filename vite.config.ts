import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: /^@xterm\/xterm$/, replacement: path.resolve(__dirname, 'node_modules/@xterm/xterm/lib/xterm.js') },
      { find: /^@xterm\/xterm\/css\/xterm\.css$/, replacement: path.resolve(__dirname, 'node_modules/@xterm/xterm/css/xterm.css') },
      { find: 'source-map-js/lib/source-node', replacement: path.resolve(__dirname, 'node_modules/source-map-js/lib/source-node.js') },
      { find: 'source-map-js/lib/source-map-generator', replacement: path.resolve(__dirname, 'node_modules/source-map-js/lib/source-map-generator.js') },
    ],
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
