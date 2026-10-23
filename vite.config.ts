import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the build works at any address, such as GitHub Pages' /reface-dx-editor/.
  base: './',
  // The editor, and the Phase 0 protocol probe next to it.
  build: { rollupOptions: { input: { index: 'index.html', probe: 'probe.html' } } },
  test: { exclude: ['**/node_modules/**', '.claude/**', 'local/**'] },
})
