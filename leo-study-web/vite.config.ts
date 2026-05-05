import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const publicHmrHost = process.env.VITE_PUBLIC_HMR_HOST?.trim()

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['180.academy', 'test.180.academy', 'testt.180.academy', 'dev.180.academy', 'localhost', '127.0.0.1', '10.0.0.225', '10.0.0.42'],
    hmr: publicHmrHost
      ? {
          protocol: 'wss',
          host: publicHmrHost,
          clientPort: 443,
        }
      : undefined,
    watch: {
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 80,
      },
      ignored: ['**/.DS_Store', '**/.AppleDouble', '**/.LSOverride', '**/._*'],
    },
  },
})
