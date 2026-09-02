# chessapp-analyze-v1

A Vite + React 19 + TypeScript chess trainer. Four board screens sit inside one
app shell; the boards themselves are `react-chessboard` v5 driven by `chess.js`
and a Stockfish WASM worker.

Board work has its own rules — [`.claude/rules/chessboard.md`](.claude/rules/chessboard.md)
holds the project conventions and, in its §0, the index to everything else.
The `react-chessboard` options API and type reference are loaded every session
alongside it; the full upstream docs and all 53 Storybook examples are vendored
under [`docs/vendor/react-chessboard/`](docs/vendor/react-chessboard/) for
on-demand reading. **Never read `node_modules` source or web-search for a
react-chessboard question** — it is already on disk.

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
| `src/views/main/` | The app shell — `Layout.tsx` (header + sidebar + board area; the nav rail and the right-hand panel are fixed-width, and the board square is what is left over), `rightPanel.tsx` (the route-fillable panel slot), `Sidebar.tsx`, the nav registries (`navItems.ts`, `navFolders.ts`, `navTree.ts`), and the XState `service.ts`. |
| `src/views/demos/`, `src/views/player/` | The four demo board screens. |
| `src/views/shared/` | The panel pieces the game screens share: `MoveList.tsx`, `BoardControls.tsx`, `useGameNavigation.ts`, `EvalBar.tsx`, `BestVariations.tsx`, `PromotionPicker.tsx`, `OptionSlider.tsx`. They take props and know nothing about which screen is rendering them, and their catalog keys are top-level (`moveList.*`, `variations.*`, `promotion.*`, `engineOption.*`, `board.*`) rather than under any one screen's. |
| `src/views/engine/play/` | The Play with Engine screen. `PlayWithEngine.tsx` is layout (eval bar + board) and board options; **all the behaviour is in `usePlayWithEngine.ts`**; `EnginePanel.tsx` is the Game / Engine / Variations tab strip over the shared board controls, with `EngineSettings.tsx` under it. |
| `src/views/games/load_pgn/` | The Load PGN screen. `LoadPgn.tsx` owns the state and fills the board square; `GamePanel.tsx` is the whole of the shell panel — the Moves / Info / Load PGN tabs (`GameInfo.tsx`, `PgnIngest.tsx`, and the shared `MoveList`) over the shared board controls. |
| `src/views/tools/analysis/` | The Analysis Board. `AnalysisBoard.tsx` is layout (eval bar + board), board options and the PGN/FEN ingestion state; **the behaviour is in `useAnalysisBoard.ts`**, the navigation in `useTreeNavigation.ts`; `AnalysisPanel.tsx` is the Moves / Engine / Variations / Position tab strip, with `VariationTree.tsx`, `AnalysisSettings.tsx` and `PositionSetup.tsx` under it. |
| `src/lib/engine.ts` | The Stockfish worker wrapper: search, UCI option discovery, and the protocol discipline that keeps the engine alive (see the chessboard rules §4). |
| `src/lib/engineAnalysis.ts` | Reading the engine's numbers: `scoreFromUci` (the one place a score is normalised to White's perspective), `formatScore`, `evalBarFraction`, `pvToSan`, `numberedVariation`, plus the `Analysis` / `EngineLine` shape both engine screens collect into and the `withEngineLine` fold. Pure. |
| `src/lib/gameModel.ts` | **The shared game model** — `Game` / `GameMove` / `GameHeaders`, plus `gameTag` / `initialFenOf` / `finalFenOf` and the `gameFromChess` snapshot. One *line* of play; all three game screens speak it. |
| `src/lib/gameTree.ts` | **The variation tree** — `GameTree` / `VariationNode`, `addMove` (the branch), `mainline` / `lineOf` / `pathTo` / `fenAtNode`, `treeToPgn`, and the `treeFromGame` ⇄ `mainlineGame` bridge that makes a `Game` a walk over a tree. Read the next section before touching it. |
| `src/lib/pgn.ts` | PGN ingestion only: text in, a `Game` (`parsePgnGames`, mainline only — what `chess.js` gives) or a `GameTree` (`parsePgnTrees`, side lines kept) out. |
| `src/lib/fen.ts` | FEN ingestion: `parseFen` validates and normalises a pasted position, or throws `FenParseError`. |
| `src/lib/gameNavigation.ts` | Walking a `Game`: `clampPly` / `fenAtPly` / `arrowsAtPly` / `moveRowsOf`. A ply is a half-move index, 0 being the starting position; each ply's FEN is read off the move that already carries it, so nothing re-simulates a game. |
| `src/lib/treeManager.ts` | Read-only tree walks (`traverse` / `toArray` / `collectIds` / `findBy` / `getPath`). The seam for anything tree-shaped; `navTree.ts` is its only consumer. |

## One game model, two producers

A game parsed out of a PGN and a game growing move by move against the engine
are **the same type** — `Game` in [`src/lib/gameModel.ts`](src/lib/gameModel.ts).
That is not a coincidence to be tidied away later; it is what lets the move
list, the ply navigation and the board controls in `src/views/shared/` serve
both screens with no branching and no second copy.

The model is plain data. Every move carries the FEN of the position *after* it,
so a viewer jumps to a ply by reading a string — nothing re-simulates a game.
The two producers are `parsePgnGames` (`lib/pgn.ts`) and `gameFromChess`
(`lib/gameModel.ts`), and the second is a **snapshot**: it copies a live
`chess.js` instance, so handing the result to a component is safe while the
instance behind it keeps being mutated.

Consequences:

- **A new game screen writes no move list.** Produce a `Game`, hand it to
  `useGameNavigation` and `MoveList`, and the numbered pairs, the current-ply
  highlight, the jump targets and the keyboard stepping all come with it.
- **A growing game and a fixed one navigate identically**, because
  `useGameNavigation` clamps the requested ply on *read*. A move arriving while
  the reader is back at an earlier ply does not yank the board forward.
- **`lib/pgn.ts` owns parsing, not the model.** Anything about what a game *is*
  belongs in `gameModel.ts`, or the engine screen ends up importing a module
  named after a file format it never reads.

## A `Game` is one line; a `GameTree` is all of them

The Analysis Board needs something `Game` cannot express: playing a different
move from an earlier ply has to **keep both continuations**. That is a tree, and
it lives in [`src/lib/gameTree.ts`](src/lib/gameTree.ts) — not as a replacement
for `Game` but as the shape `Game` is a *walk over*:

```
GameTree ──mainlineGame()──▶ Game ──▶ MoveList / useGameNavigation / BoardControls
   ▲                                   (Load PGN and Play with Engine, unchanged)
   └──treeFromGame()─────── Game
```

`mainlineGame` is the first-child walk. Both bridges are tested in both
directions, so "the linear reading still works" is an assertion rather than a
hope — which is what let the tree arrive without touching the two shipped
screens.

The rules the whole thing rests on:

- **`children[0]` is the mainline at every level; everything after it is a side
  line.** `mainline`, `lineOf`, `treeToPgn` and `VariationTree` are all just that
  one rule applied.
- **Replaying a move that is already there is not a new variation.** `addMove`
  returns the existing node and the *same tree by reference*, so stepping back
  and playing the mainline move again follows the line rather than duplicating
  it, and nothing re-renders.
- **A node id is the navigation state, not a ply.** Clicking a move inside a side
  line does not move along the current line, it changes *which line is current* —
  "ply 3" cannot say that. `useTreeNavigation` therefore holds the id and derives
  the ply, which is what lets the shared `BoardControls` drive a tree unmodified.
- **`chess.js` `loadPgn` discards `( ... )` side lines.** So there are two
  parsers: `parsePgnGames` (mainline, for the Load PGN screen) and
  `parsePgnTrees` (side lines kept), and only the second round-trips with
  `treeToPgn`.

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
- **Pinning a single *token* to LTR takes the `dir` attribute, not CSS.** Under
  Hebrew these styles go through the RTL emotion cache, whose stylis plugin
  flips `direction: ltr` into `direction: rtl` exactly as it flips the paddings
  — an `sx` declaration is reversed into the bug it was meant to prevent. The
  move list's SAN cells carry `dir="ltr"` for this reason; `unicode-bidi` is
  untouched by the plugin and can stay in `sx`. `ForceLTR` is the other option
  but it is a whole provider stack — too much for a handful of inline tokens.

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
