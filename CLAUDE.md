# chessapp-analyze-v1

A Vite + React 19 + TypeScript chess trainer. Four board screens sit inside one
app shell; the boards themselves are `react-chessboard` v5 driven by `chess.js`
and a Stockfish WASM worker.

Board work has its own rules file — read
[`.claude/rules/chessboard.md`](.claude/rules/chessboard.md) before adding or
changing a board screen.

## Commands

Node comes from `fnm`, so run these from a shell where it is on `PATH`.

| Task | Command |
| --- | --- |
| Dev server | `yarn dev` (a worktree gets its own port — see `.jst/bootstrap.sh`) |
| Type-check + production build | `yarn build` |
| Type-check only | `npx tsc -b` (add `--force` to bypass the incremental cache) |
| Lint | `yarn lint` |
| **Run the full test suite** | `yarn test:run` |
| **Run a single test file** | `npx vitest run <path>` — e.g. `npx vitest run src/theme/AppThemeWithLang.test.tsx` |
| Run tests matching a name | `npx vitest run -t "<substring of the test name>"` |
| Watch mode | `yarn test` |
| Coverage | `npx vitest run --coverage` |

Tests are Vitest + Testing Library on jsdom. `src/test/setup.ts` stubs
`matchMedia` (jsdom has none, and MUI's color-scheme provider reads it) and
clears `localStorage` between tests.

`yarn lint` currently exits non-zero on pre-existing findings in the board and
XState modules (`react-hooks/refs` on the engine refs, unused imports). Judge a
change by whether it *adds* to that count, not by the exit code.

## Layout of the source

| Path | What lives there |
| --- | --- |
| `src/main.tsx` | Composition root: `AppThemeWithLang` → `CssBaseline` → `App`. Imports `./i18n` for its side effect so a language exists before anything reads one. |
| `src/i18n.ts` | i18next setup, plus `supportedLanguages` / `rtlLanguages` / `asAppLanguage()`. |
| `src/locales/` | Inline `en` / `he` catalogs. `he` is typed `typeof en`, so a missing key is a compile error. |
| `src/theme/` | The look: `themePrimitives.ts` (tokens), `AppThemeWithLang.tsx` (the provider), `rtlCache.ts`, `ForceLTR.tsx`, and the two header controls. |
| `src/views/main/` | The app shell — `Layout.tsx` (header + sidebar + board area), `Sidebar.tsx`, the nav registries (`navItems.ts`, `navFolders.ts`, `navTree.ts`), and the XState `service.ts`. |
| `src/views/demos/`, `src/views/player/` | The four board screens. |
| `src/lib/engine.ts` | The Stockfish worker wrapper. |
| `src/lib/treeManager.ts` | Read-only tree walks (`traverse` / `toArray` / `collectIds` / `findBy` / `getPath`). The seam for anything tree-shaped; `navTree.ts` is its only consumer. |

## Theming, direction and language

`AppThemeWithLang` is the single owner of **both** axes. The color scheme
(light/dark, via `colorSchemes` + CSS variables) and the text direction live in
one provider because direction is *derived from the active i18n language*
rather than stored separately: changing the language swaps the emotion cache,
`theme.direction` and the MUI locale bundle together. Splitting them across
providers reintroduces the mismatch this design exists to prevent.

Two consequences worth knowing before you touch this:

- **Adding a language** means a catalog in `src/locales/`, an entry in
  `supportedLanguages`, and — if it mirrors — one in `rtlLanguages`. Nothing
  else; the direction follows.
- **The chessboard must never mirror.** Files run a–h left to right in every
  language, and flipping the board would put a1 bottom-right while `chess.js`
  and the engine still report it as bottom-left. `Layout.tsx` wraps the board
  area in `ForceLTR` for exactly this. Use the same escape hatch for any other
  subtree that must stay LTR.

## Sidebar navigation

The sidebar is a folder tree over the routes. Folders group screens; routes
stay global, so a folder never appears in a URL and `App.tsx` is untouched by
one. Four layers, each consumed by the next:

| Layer | File | What it owns |
| --- | --- | --- |
| Walks | `src/lib/treeManager.ts` | Depth-first reads over any tree. The only place tree traversal is written. |
| Data | `navFolders.ts` + `navItems.ts` | The authored folder tree (`{ id, labelKey, icon, children? }`) and the screens, each naming its `folder`. |
| Builder | `navTree.ts` | Pure `buildNavTree` — sub-folders before that folder's own screens at every level — plus `folderPath` (the breadcrumb, and the chain the sidebar re-opens). |
| Renderer | `Sidebar.tsx` | A recursive `TreeRow`. Folders are `aria-expanded` toggles, screens are links. |

Consequences worth knowing:

- **Nesting a folder is a data edit.** Add it to `navFolders` (at any depth),
  give it a `labelKey` present in both catalogs, and point screens at it. The
  renderer already recurses — `navTree.test.ts` and `Sidebar.test.tsx` both
  carry fixtures nested deeper than anything shipped.
- **Folders start open and are never persisted.** `Sidebar.tsx` tracks what the
  reader *collapsed*, so absent means open and no map needs seeding. Navigating
  re-opens the active screen's ancestors — adjusted during render against the
  previous pathname, not in an effect, which `react-hooks/set-state-in-effect`
  rejects.
- **The active state is an exact path match.** `"/"` is a prefix of every other
  route, so `startsWith` would light the basic board up everywhere.
- **The sidebar mirrors; only the board does not.** Depth is indented with
  `paddingInlineStart`, which follows the direction on its own — never
  `paddingLeft`, and never wrap this subtree in `ForceLTR`.
