import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from "vite-tsconfig-paths"
import { spawn } from 'node:child_process'
// Start the repo-data-api automatically during dev and proxy /graphql to it.
function repoDataApiPlugin(): Plugin {
  let started = false
  return {
    name: 'embed-repo-data-api',
    configureServer: async (server) => {
      if (started) return
      started = true
      // Spawn the API with Bun so we don't depend on TS loaders
      const child = spawn('bun', ['../repo-data-api/index.ts'], {
        stdio: 'inherit',
        shell: process.platform === 'win32'
      })
      child.on('error', (e) => console.error('[repo-data-api] failed to start', e))
      server.httpServer?.once('close', () => {
        try { child.kill('SIGINT') } catch {}
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), repoDataApiPlugin()],
  server: {
    proxy: {
      '/graphql': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
