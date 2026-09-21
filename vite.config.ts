/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  /*
    The footer shows the app version. Reading it from package.json here — and
    exposing it as a compile-time constant rather than importing package.json
    into the client bundle — means the CTA-5 release automation's `version`
    bump reaches the UI with no code change. Vitest honours `define` too, so
    tests see the same value.
  */
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  /*
    The app is published as a GitHub Pages *project* site at
    https://kantorv.github.io/chess-trainer-app/, so every asset URL and the
    router basename have to carry that sub-path. Vite rewrites `/src/...` and
    the hashed asset links in index.html against this at build time; in dev
    (and under Vitest) it stays `/`. `src/App.tsx` feeds the same value to
    react-router as `import.meta.env.BASE_URL`.
  */
  base: '/chess-trainer-app/',
  plugins: [react()],
  /*
    The Library indexes an upload in a module worker
    (`src/lib/collectionIndex.worker.ts`), which loads the opening book's five
    shards with dynamic `import()`. Vite's default worker format, `iife`,
    cannot code-split, so the worker is built as an ES module — which a
    `{ type: "module" }` worker is anyway.
  */
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    /*
      Vitest's default is 5s per test, which the heavier screen suites (the
      v2 boards, `views/main/Sidebar`, the Library's) sit close to under full
      parallelism — not always the same one, which is the tell that it is
      scheduling rather than a hang.

      Raised rather than papered over per-file: the tests are not wrong and the
      work is real, so the honest fix is to stop asserting that a render
      finishes in five seconds on a loaded machine. A genuine hang still fails,
      three times slower. The two tests that walk the 7,859-node one-tree
      example repertoire carry their own longer timeouts, in place, where the reason is.
    */
    testTimeout: 20000,
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
