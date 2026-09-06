/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
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
  /*
    MDX before React, which is what the plugin's own docs require: `@mdx-js/rollup`
    compiles an `.mdx` file to JSX, and the React plugin has to see that output
    rather than the MDX source. Rollup orders by declaration but Vite does not,
    so `enforce: 'pre'` is what actually pins it ahead — and the React plugin's
    `include` is widened to `.mdx` so an edited note hot-reloads like a component.

    A folder's notes in the User PGNs library are authored as MDX
    (`src/views/library/pgnFolderNotes.ts` globs them), and MDX rather than plain
    Markdown so a note can import and render a React component later. Vitest runs
    off this same config, so a test that mounts a list screen compiles them too.

    `remark-gfm` because a table is the natural way to write half of what a
    folder note says — three rosette types and what each is worth — and tables
    are a GitHub-flavoured extension that MDX's core Markdown does not parse.
  */
  plugins: [
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm] }) },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
  ],
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
