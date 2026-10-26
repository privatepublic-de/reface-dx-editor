import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the build works at any address, such as GitHub Pages' /reface-dx-editor/.
  base: './',
  // The build is the editor alone (what GitHub Pages publishes). The Phase 0 protocol probe, /probe.html, runs with
  // `npm run dev` or `npm run probe`.
  build: { rollupOptions: { input: { index: 'index.html' } } },
  // the wheel tests render many voices (up to ~5 s each here, more on a shared CI runner)
  test: { exclude: ['**/node_modules/**', '.claude/**', 'local/**'], testTimeout: 30000 },
})
