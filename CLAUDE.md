# chessapp-analyze-v1

A Vite + React 19 + TypeScript chess trainer. Its board screens — Play with
Engine and Masked Pieces, the Analysis Board, the Openings explorer, the
repertoire player and the Library's game board — sit inside one app shell,
reached from a plain landing page at `/`, beside a Settings section whose
Export tab downloads the reader's data as one zip. The boards are
`react-chessboard` v5 driven by `chess.js` and a Stockfish WASM worker, and
every one is composed from one **board core** (`src/views/board/core/`).

## Where the detail is

This file is what every session needs. The rest is in `.claude/rules/`:

| File | Loads | Covers |
| --- | --- | --- |
| [`chessboard.md`](.claude/rules/chessboard.md) | always | the board: library conventions, the engine protocol, layout rules, testing, **the board core** (base hook, modules, shell and panel, adding a board) |
| [`react-chessboard-options-api.md`](.claude/rules/react-chessboard-options-api.md), [`react-chessboard-types-and-helpers.md`](.claude/rules/react-chessboard-types-and-helpers.md) | always | the vendored `react-chessboard` reference |
| the module files (table below), [`tree-views.md`](.claude/rules/tree-views.md), [`database.md`](.claude/rules/database.md) | when you work on their `paths:` | each module's whole reference |

The full upstream `react-chessboard` docs and all 53 Storybook examples are
vendored under [`docs/vendor/react-chessboard/`](docs/vendor/react-chessboard/).
**Never read `node_modules` source or web-search for a react-chessboard
question** — it is already on disk.

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
| **Wire a PGN collection into the Library** | `node scripts/wirepgn.js path/to/file.pgn` (or `yarn wirepgn …`; `--list`, `--check`, `--rebuild`, `--remove <id>` — [`game-collections.md`](.claude/rules/game-collections.md) §3) |
| Coverage | `npx vitest run --coverage` |

Tests are Vitest + Testing Library on jsdom. `src/test/setup.ts` stubs
`matchMedia` (MUI's colour-scheme provider reads it), gives jsdom an IndexedDB
(`fake-indexeddb`), and between tests clears `localStorage`, lets every
store's writes land, resets the stores and deletes their databases
([`database.md`](.claude/rules/database.md) §7 — including why fake timers
must leave `setImmediate` real). Board screens stub `<Chessboard>` and the
engine with the shared harness, `src/views/board/boardTestHarness.tsx`
([`chessboard.md`](.claude/rules/chessboard.md) §8).

`yarn lint` exits non-zero on pre-existing findings in `views/main/Layout.tsx`
and the XState `views/main/service.ts`. Judge a change by whether it *adds* to
that count, not by the exit code.

`npx knip` reports unused code. Expected in its output: the vendored stories,
the Stockfish worker, and the stores' `settled…` / `delete…Db` helpers, which
only `src/test/setup.ts` uses (through namespace imports knip does not
follow). `scripts/wirepgn.js` imports `src/lib` dynamically, so an export it
uses can look unused — check `scripts/` before removing one.

## The modules

| Module | Routes | Code | Reference |
| --- | --- | --- | --- |
| **Play with Engine** and the **Lobby** | `/engine/play`, `/engine/games` | `views/engine/play/`, `views/engine/games/`, `lib/playedGame*`, `lib/engineSettings.ts`, `lib/newGameLink.ts` | [`play-with-engine.md`](.claude/rules/play-with-engine.md) |
| **Masked Pieces** | `/engine/masked` | `views/engine/masked/`, `lib/pieceMask.ts` | [`masked-pieces.md`](.claude/rules/masked-pieces.md) |
| **Analysis Board** and **Saved analyses** | `/tools/analysis`, `/tools/analysis/saved` | `views/tools/analysis/`, `lib/savedAnalys*`, `lib/gameReference.ts` | [`analysis-board.md`](.claude/rules/analysis-board.md) |
| **Openings explorer** | `/openings` | `views/openings/`, `lib/openings.ts`, `lib/analysisHandOff.ts` | [`openings-explorer.md`](.claude/rules/openings-explorer.md) |
| **Repertoires** | `/repertoires`, `/repertoires/<id>`, `/…/games/<game>` | `views/repertoires/`, `lib/savedRepertoire*`, `lib/repertoire*`, `lib/playChance.ts` | [`repertoires.md`](.claude/rules/repertoires.md) |
| **Library** (game collections) | `/library`, `/library/<c>`, `/library/<c>/<n>` | `views/library/`, `lib/library*`, `lib/collectionIndex.ts`, `src/data/library/` | [`game-collections.md`](.claude/rules/game-collections.md) |
| **Settings** (Export today) | `/settings/<tab>` (`/settings/export`) | `views/settings/`, `lib/dataExport*.ts`, `lib/pgnExport.ts` | [`settings.md`](.claude/rules/settings.md) |
| **Position editor** (a component, hosted by the Lobby) | — | `views/shared/positionEditor/`, `lib/positionEditor.ts` | [`position-editor.md`](.claude/rules/position-editor.md) |
| **Tree views** (how a board shows its game tree) | — | `views/explorer/`, `lib/treeMap.ts` | [`tree-views.md`](.claude/rules/tree-views.md) |
| **The board core** | — | `views/board/core/` | [`chessboard.md`](.claude/rules/chessboard.md) §9 |
| **Stores** (every one IndexedDB) | — | `lib/idb.ts`, `lib/idbRecordStore.ts`, `lib/*Store.ts`, `lib/*Db.ts` | [`database.md`](.claude/rules/database.md) |

## Layout of the source

| Path | What lives there |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | The composition root (`AppThemeWithLang` → `CssBaseline` → `App`; imports `./i18n` for its side effect) and the router. |
| `src/i18n.ts`, `src/locales/` | i18next setup (`supportedLanguages`, `rtlLanguages`, `asAppLanguage()`) and the inline `en` / `he` catalogs. `he` is typed `typeof en`, so a missing key is a compile error. |
| `src/theme/` | The look: tokens, the `AppThemeWithLang` provider, the RTL cache, `ForceLTR`, the header controls. |
| `src/views/main/` | The app shell: `Layout.tsx` (header, sidebar, the board square and the right-hand panel, `BOARD_PANEL_GAP_PX` between them), `rightPanel.tsx` (the route-fillable panel slot), `Sidebar.tsx` and the nav registries. |
| `src/views/home/` | The landing page at `/` — a card per screen, built from `navTree()`. |
| `src/views/board/` | **The board core** (`core/`: `useBoardCore`, the capability modules, `BoardShell`, `BoardPanel`), the test harness and the two propagation tests. |
| `src/views/explorer/` | **The tree views** — the variations explorer every board attaches. |
| `src/views/shared/` | Pieces the screens share, each taking props and knowing no screen: `MoveList`, `VariationLine`, `BoardControls`, `EvalBar`, `BestVariations`, `PromotionPicker`, `EngineBoardSquare`, `CapturedPieces`, `CurrentOpening`, `GameInfo`, `OptionSlider`, `CopyableValue`, the saved-list machinery (`savedList.ts`, `SavedList*`), `folders/` and `positionEditor/`. Their locale keys are top-level (`moveList.*`, `variations.*`, `board.*`, …); the saved-list pieces take each screen's `labelKey` and test-id prefix instead. |
| `src/views/engine/`, `tools/analysis/`, `openings/`, `repertoires/`, `library/`, `settings/` | The module screens (table above). Each route renders a layout-only `…Main.tsx` wrapper. |
| `src/lib/` | Everything pure or storage: the game model and tree, PGN and FEN reading, the engine wrapper and score reading, the stores and records, the opening book. Named per module (table above); the shared core is below. |

The shared core of `src/lib/`: `gameModel.ts` (`Game`, one line), `gameTree.ts`
(`GameTree`, and every pure edit of one), `pgn.ts` (`parsePgnGames`,
`parsePgnTree(s)`), `fen.ts` (`parseFen`), `gameNavigation.ts` (`?move=`,
`StartPly`, the last-move highlight, the move rows), `engine.ts` +
`engineAnalysis.ts` (the worker and its numbers), `capturedPieces.ts`,
`moveAnnotations.ts` / `pgnComments.ts`, `pgnText.ts`, `pgnExport.ts`,
`recordId.ts` (`newRecordId`, the one id minter), `treeManager.ts` (read-only
tree walks — the only place traversal is written) and `localizedText.ts`.

## Core principles

### One game model, and a tree over it

A game parsed from a PGN and a game played against the engine are the same
data: **`Game`** (`lib/gameModel.ts`) is one line of play, every move carrying
the FEN *after* it, so a viewer jumps to a ply by reading a string and nothing
re-simulates a game. **`GameTree`** (`lib/gameTree.ts`) is all the lines — what
every board holds — and a `Game` is a *walk over one*:

```
GameTree ──mainlineGame()──▶ Game ──▶ MoveList (the mainline's numbered cells)
   ▲
   └──treeFromGame()─────── Game
```

- **`children[0]` is the mainline at every level; everything after it is a
  side line.** `mainline`, `lineOf`, `treeToPgn` and the explorer are that one
  rule applied.
- **Replaying a move that is already there is not a new variation.** `addMove`
  returns the existing node and the *same tree by reference*, so nothing
  re-renders and "changed" stays `tree !== baseline`.
- **A node id is the navigation state, not a ply** — clicking inside a side
  line changes *which line is current*. `useTreeNavigation` holds the id and
  derives the ply; ← / → walk the line, Home / End its ends, ↑ / ↓ cycle the
  sibling moves.
- **Every edit is pure and id-preserving** (promote, delete from here, a
  comment, a play chance): a new tree, the path to the edit copied, a no-op
  the same tree back.
- **`chess.js` `loadPgn` discards `( … )` side lines**, so there are two
  parsers: `parsePgnGames` (mainline only) and `parsePgnTree(s)` (side lines,
  comments and NAGs kept — every board). Only the second round-trips with
  `treeToPgn`.
- **Node ids do not survive a PGN round trip**, so a place in a tree travels
  as SAN from the start (`sanPathTo` / `nodeAtSanPath`, the `?at=` links).

### The board is pure UI, composed from one core

`react-chessboard` draws and reports pointer events; `chess.js` owns every
rule, and only `useBoardCore` calls `.move()`. A board screen is **composed**,
never written from scratch: the base hook, the capability modules it opts
into (engine, Play, opening book, trainer, autosave), a tree view, and one
shell and panel with slots — no behaviour hook of its own, no layout
arithmetic of its own, no second panel ([`chessboard.md`](.claude/rules/chessboard.md) §9).
**A shared piece changes only backward compatibly**: under `views/shared/`,
`views/explorer/`, `views/board/core/` or `src/lib/`, a new behaviour is an
optional prop whose absence is today's behaviour.

### A position turns the board; a game does not

Every screen faces the side to move when a **position** arrives (a `?fen=`, a
pasted FEN, a handed-over position), because a position is something you are
about to answer. Loading a **game** does not: a PGN opens at ply 0, where the
side to move says nothing about which side is being studied. Nor do an
editor's "New board" / "Clear board" or a side-to-move field — arranging a
position is not being handed one.

### Handing things on: `?fen=`, `?game=`, location state

A **position** crosses screens as `?fen=` (`/engine/play`, `/tools/analysis`,
`/openings`); a **game** as `?game=<key>/<path>/<id>`, a reference into a store
that the Analysis Board resolves itself
([`analysis-board.md`](.claude/rules/analysis-board.md) §3.1); a **whole tree
in no store** (the Openings explorer's hand-off) as router location state. The
first two survive being bookmarked, shared and reloaded. Every destination
validates what arrives, ignores what does not pass, and takes it as *initial*
state rather than syncing it in an effect — arriving at a URL is what mounts
the screen.

### The reader's data is IndexedDB — only preferences are `localStorage`

Every store is IndexedDB, one database per module (`chessapp.engine`,
`chessapp.analyses`, `chessapp.repertoires`, `chessapp.library`), opened
through `lib/idb.ts`, most over the record-store factory
`lib/idbRecordStore.ts`. Reads are a kept snapshot, `undefined` until the
first read lands — a screen arriving by a URL naming a record waits for it.
Writes are promises and never throw. Only the theme and the language live in
`localStorage` ([`database.md`](.claude/rules/database.md)).

### Theming, direction and language

`AppThemeWithLang` owns **both** the colour scheme and the text direction,
because direction is *derived from the active i18n language*: changing the
language swaps the emotion cache, `theme.direction` and the MUI locale bundle
together. Splitting them across providers reintroduces the mismatch this
exists to prevent.

- **Adding a language** is a catalog in `src/locales/`, an entry in
  `supportedLanguages`, and — if it mirrors — one in `rtlLanguages`.
- **The chessboard must never mirror.** Files run a–h left to right in every
  language; a mirrored board would put a1 bottom-right while `chess.js` and the
  engine still call it bottom-left. `Layout.tsx` wraps the board area in
  `ForceLTR`; a board elsewhere carries its own.
- **Pinning one *token* to LTR takes the `dir` attribute, not CSS.** Under
  Hebrew the RTL emotion cache's stylis plugin flips `direction: ltr` into
  `rtl` exactly as it flips paddings. SAN cells carry `dir="ltr"`;
  `unicode-bidi` is untouched by the plugin and can stay in `sx`.

### Sidebar navigation

The sidebar is a folder tree over the routes; a folder never appears in a URL.

| Layer | File | What it owns |
| --- | --- | --- |
| Walks | `src/lib/treeManager.ts` | Depth-first reads over any tree. |
| Data | `navFolders()` + `navItems()` | The folders (`{ id, labelKey?, label?, icon, children?, singleEntry?, pinToBottom? }`) and the screens, each naming its `folder`. **Functions**, so a dev-only entry can be a spread gated on `import.meta.env.DEV`. |
| Builder | `navTree.ts` | `buildNavTree`, `folderPath`, `folderChain`, `navLabel` (a catalog key *or* a data label, `lib/localizedText.ts`), `navLabelKeys`. |
| Renderer | `Sidebar.tsx` | A recursive `TreeRow`: folders are `aria-expanded` toggles, screens are links. |

- **Nesting a folder is a data edit** — an entry in `navFolders` with a
  `labelKey` in both catalogs; the renderer already recurses.
- **A `singleEntry` folder** renders as one row, under its own name, straight
  to its one screen (Analysis → Saved analyses, Openings, Repertoires). Board
  screens those hide are reached from the screens' own controls.
- **A `pinToBottom` folder** (Settings) renders at the sidebar's foot, under
  a divider, apart from the screens: the rows above scroll, the foot never
  does, and opening it grows the foot upwards so its screens stay in view.
  One `nav` landmark, one open chain across both.
- **One chain is open at a time, and the route decides which**, adjusted
  during render against the previous pathname (not in an effect, which
  `react-hooks/set-state-in-effect` rejects). Nothing is persisted.
- **The active state is an exact path match** (`"/"` prefixes everything).
- **The sidebar mirrors**: depth is `paddingInlineStart`, never `paddingLeft`,
  and never `ForceLTR`.

## Use the mui-mcp server to answer any MUI questions --

- 1. call the "useMuiDocs" tool to fetch the docs of the package relevant in the question
- 2. call the "fetchDocs" tool to fetch any additional docs if needed using ONLY the URLs present in the returned content.
- 3. repeat steps 1-2 until you have fetched all relevant docs for the given question
- 4. use the fetched content to answer the question


## claude-in-chrome instructions
- 1. Never take screenshots unless you have to. Check first if the analysis can be done with dom/javascript tools. If you have to take screenshot - ask user before.
