import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    modules: {
      // Keeps the source component name in every class (e.g. "Sidebar__link") in both dev and
      // production builds, so a class in DevTools always points back to its file.
      generateScopedName: '[name]__[local]',
    },
  },
})
