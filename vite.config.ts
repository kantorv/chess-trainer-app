/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // The bootstrap: nothing renders it, and a test that did would only be
        // asserting that React mounts.
        'src/main.tsx',
        // Type-only modules — they emit no runtime code, so v8 scores them 0%
        // however well the types are used, a number no test can move.
        'src/**/*.d.ts',
      ],
    },
  },
})
