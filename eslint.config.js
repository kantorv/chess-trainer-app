import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `docs/vendor/**` is upstream source vendored verbatim for reference (see
  // docs/vendor/react-chessboard/README.md). It is never built or imported —
  // the story files even import from the upstream repo's own `src/`, which
  // does not exist here — so linting it only adds ~94 findings we would never
  // act on. tsc already skips it: every tsconfig project includes only `src`.
  globalIgnores(['dist', 'docs/vendor']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
