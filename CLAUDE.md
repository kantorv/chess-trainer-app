# chessapp-analyze-v1

A Vite + React 19 + TypeScript chess trainer. Five board screens sit inside one
app shell — Play with Engine, Masked Pieces, Load PGN, the Analysis Board and the
Board Editor — reached from a plain landing page at `/`. The boards themselves
are `react-chessboard` v5 driven by `chess.js` and a Stockfish WASM worker.

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
| `src/views/home/` | The landing page at `/` — no board, just a card per screen built from `navTree()`. |
| `src/views/shared/` | The panel pieces the game screens share: `MoveList.tsx`, `BoardControls.tsx`, `useGameNavigation.ts`, `EvalBar.tsx`, `BestVariations.tsx`, `PromotionPicker.tsx`, `OptionSlider.tsx`, `CopyableValue.tsx`, and `EngineBoardSquare.tsx` (the eval bar + board + promotion picker the two engine-play screens both render). They take props and know nothing about which screen is rendering them, and their catalog keys are top-level (`moveList.*`, `variations.*`, `promotion.*`, `engineOption.*`, `board.*`, `copyable.*`, `masking.*`) rather than under any one screen's. |
| `src/views/engine/play/` | The Play with Engine screen. `PlayWithEngine.tsx` is layout (the shared `EngineBoardSquare`) and the `?fen=` arrival; **all the behaviour is in `usePlayWithEngine.ts`**; `EnginePanel.tsx` is the Game / Engine / Variations tab strip over the shared board controls, with `EngineSettings.tsx` under it. |
| `src/views/masked/play/` | The Masked Pieces screen — Play with Engine with the piece graphics in disguise. `MaskedPlay.tsx` owns the mask and renders the same `EngineBoardSquare`; **the behaviour is `usePlayWithEngine`, reused verbatim**; `MaskedPanel.tsx` adds a fourth tab over the same three, with `MaskEditor.tsx` under it. |
| `src/views/games/load_pgn/` | The Load PGN screen. `LoadPgn.tsx` owns the state and fills the board square; `GamePanel.tsx` is the whole of the shell panel — the Moves / Info / Load PGN tabs (`GameInfo.tsx`, `PgnIngest.tsx`, and the shared `MoveList`) over the shared board controls. |
| `src/views/tools/editor/` | The Board Editor. `BoardEditor.tsx` is layout (the two palettes and the board, inside a `ChessboardProvider`), board options, the `?fen=` arrival and the PGN/FEN ingestion state; **the behaviour is in `useBoardEditor.ts`**; `EditorPanel.tsx` is the Position / FEN / PGN tab strip over the reset controls and the hand-off, with `PositionFields.tsx`, `FenSetup.tsx`, `PgnSetup.tsx` and `PiecePalette.tsx` under it. |
| `src/views/tools/analysis/` | The Analysis Board. `AnalysisBoard.tsx` is layout (eval bar + board), board options and the PGN/FEN ingestion state; **the behaviour is in `useAnalysisBoard.ts`**, the navigation in `useTreeNavigation.ts`; `AnalysisPanel.tsx` is the Moves / Engine / Variations / Position tab strip, with `VariationTree.tsx`, `AnalysisSettings.tsx` and `PositionSetup.tsx` under it. |
| `src/lib/engine.ts` | The Stockfish worker wrapper: search, UCI option discovery, and the protocol discipline that keeps the engine alive (see the chessboard rules §4). |
| `src/lib/engineAnalysis.ts` | Reading the engine's numbers: `scoreFromUci` (the one place a score is normalised to White's perspective), `formatScore`, `evalBarFraction`, `pvToSan`, `numberedVariation`, plus the `Analysis` / `EngineLine` shape both engine screens collect into and the `withEngineLine` fold. Pure. |
| `src/lib/gameModel.ts` | **The shared game model** — `Game` / `GameMove` / `GameHeaders`, plus `gameTag` / `initialFenOf` / `finalFenOf` and the `gameFromChess` snapshot. One *line* of play; all three game screens speak it. |
| `src/lib/gameTree.ts` | **The variation tree** — `GameTree` / `VariationNode`, `addMove` (the branch), `mainline` / `lineOf` / `pathTo` / `fenAtNode`, `treeToPgn`, and the `treeFromGame` ⇄ `mainlineGame` bridge that makes a `Game` a walk over a tree. Read the next section before touching it. |
| `src/lib/pgn.ts` | PGN ingestion only: text in, a `Game` (`parsePgnGames`, mainline only — what `chess.js` gives) or a `GameTree` (`parsePgnTrees`, side lines kept) out. |
| `src/lib/fen.ts` | FEN ingestion: `parseFen` validates and normalises a pasted position, or throws `FenParseError`. |
| `src/lib/positionEditor.ts` | A position *being edited*: `fenFields` / `fenFromFields` (the six fields apart and back together, which is what makes the editor's side-to-move, castling and en passant controls round-trip), `enPassantOptions`, and `positionProblems` — **non-throwing** legality reporting, because a half-edited board is illegal by definition. Pure. |
| `src/lib/gameNavigation.ts` | Walking a `Game`: `clampPly` / `fenAtPly` / `arrowsAtPly` / `moveRowsOf`. A ply is a half-move index, 0 being the starting position; each ply's FEN is read off the move that already carries it, so nothing re-simulates a game. |
| `src/lib/pieceMask.ts` | **Piece masking** — the `PieceMask` (true type → the type drawn in its place, all twelve), the presets, `maskedPieces` (the board's `options.pieces`) and `maskSan` / `maskSanLine` (the notation). Pure, and the only place the mask exists. |
| `src/lib/libraryCatalog.ts` | **The shared library layer** — the types (`LibraryCategory` with its `path` and `children`, `LibraryPosition`, `LocalizedText`), the non-throwing `loadLibraryCatalog` (every FEN through `parseFen`, ids unique, category paths known, bad rows dropped into `problems`), the lookups, `categoryLabel` (data label or catalog key), `resolveLibraryPath` (the longest-category-prefix match a splat route needs) and `sideToMoveOf`. Pure, and the only place that knows what a library's JSON looks like. |
| `src/data/mates.json` | **The mates library** — the category list and a flat list of positions, each naming its category. The only file adding a mate touches. |
| `src/lib/matesCatalog.ts` | A thin binding over the shared layer in the Mates section's own vocabulary (`findMateCategory`, `positionsInCategory`, `findMatePosition`), plus the shipped catalog. |
| `src/data/positions.json` | **The endgame Positions library** — categories nested to any depth, each with its own `{ en, he }` name, and the positions inside them. The only file adding a category *or* a position touches. |
| `src/lib/positionsCatalog.ts` | That file loaded, once, through the same shared loader. |
| `src/views/library/` | The section-agnostic screens both libraries render: `LibraryList.tsx` (the card grid of preview boards plus the right-hand count and hint), `LibraryDetail.tsx` (one position, read-only, facing the side to move, with the three `?fen=` hand-offs) and `section.ts`, which is what tells one section from another — route base, catalog, chrome keys, test ids. |
| `src/views/mates/` | The Mates section, as a **binding**: `list/MatesList.tsx` and `detail/MateDetail.tsx` read `/mates/:category(/:id)` and hand it to the two shared screens. Neither knows anything about JSON. |
| `src/views/positions/` | The Positions section: `PositionsSection.tsx` is **one component behind every `/positions/*` URL**, resolving the splat through the catalog and rendering whichever shared screen the answer calls for. |
| `src/views/main/navFromLibrary.ts` | Building a sidebar subtree — a folder plus a list screen per category, at any depth — out of a library catalog, and merging it into the authored registries. Pure; `positionsNavFolder()` / `positionsNavItems()` are the only shipped use. |
| `src/lib/treeManager.ts` | Read-only tree walks (`traverse` / `toArray` / `collectIds` / `findBy` / `getPath`). The seam for anything tree-shaped: `navTree.ts` and `libraryCatalog.ts` are its consumers. |

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

## An editor owns a position, not a game

The Board Editor is the one board screen with no `Game` and no `GameTree` behind
it. It has no moves to hold: pieces are **put and removed**, never moved by a
rule, so its `chess.js` instance is built with `{ skipValidation: true }` and is
a container rather than a rules authority. Three things follow, and they are the
whole design:

- **Illegal is a state, not an error.** You have to be able to take a king off in
  order to put a different one down, so `positionProblems` (`lib/positionEditor.ts`)
  *reports* — no king, two kings, a pawn on the back rank, the side not to move
  already in check — and only the three controls that take the position
  *elsewhere* (the FEN copy button and the two hand-offs) are switched off while
  it does.
  `parseFen` still guards the way **in**: a pasted FEN is a claim about a
  finished position, not a board mid-edit.
- **The FEN is split apart.** Field 1 comes off the board; fields 2–4 are panel
  controls held as `PositionFields`; fields 5–6 are carried so a pasted FEN
  round-trips. Reading *only* field 1 off the `chess.js` instance is what lets
  the side-to-move, castling and en passant controls mean anything — the
  instance keeps its own idea of those, and that idea is what the reader is
  overriding.
- **Spare pieces need `ChessboardProvider`.** It is the one screen that cannot
  use a plain `<Chessboard>`: every option goes to the provider instead, because
  a `SparePiece` can only reach the board's drag context from inside it. The
  provider renders no element of its own, so it costs the layout nothing.

The editor hands a position on to **both** of the other real screens, and by
exactly the same route: a **query parameter** — `/tools/analysis?fen=…` and
`/engine/play?fen=…` — so the position survives being bookmarked, shared and
reloaded, where router state would not. Each screen validates it with `parseFen`
and ignores what will not pass, then takes it as *initial* state rather than
syncing it in an effect: arriving at the URL mounts the screen, so there is no
later change to follow.

**And it takes one the same way.** `/tools/editor?fen=…` is the other direction
of that one mechanism, read with the same `useSearchParams` → `parseFen` →
`useMemo` block the other two screens use and handed to `useBoardEditor` as its
optional `initialFen`. So the three board screens now have one arrival between
them, and no screen holding a FEN needs a transport of its own to reach any of
them.

An arrival gives the editor one control it otherwise has no use for: a second
reset, **"Reset"**, that returns to the position the screen was opened with. It
is **conditional** — rendered only when a readable `?fen=` arrived, because
otherwise it would offer a position that does not exist — and it does not
displace **"New board"** (`editor.controls.startingPosition`), which goes on
meaning the standard chess start. Unlike the other two resets it *does* turn the
board: it is handing the reader that position a second time rather than
rearranging the pieces, which is the case the rule below is about.

Play with Engine reads a little more out of it than the Analysis Board does. A
position set up with Black to move is one the reader means to play as Black, so
the incoming FEN also decides `playAs` and which way the board faces — otherwise
the engine would move the instant the screen opened, from a position they had
just finished arranging. It is also what "New game" returns to; resetting to the
standard start would throw the handed-over position away with no way back.

**A position turns the board; a game does not.** All three screens face the side
to move when a *position* arrives — a pasted FEN, a handed-over one, the final
position of a game loaded into the editor — because a position is something you
are about to answer, so the side that has to move is the side you look from.
Loading a **game** deliberately does not: a PGN opens at ply 0, where the side to
move says nothing about which side is being studied. Neither do the editor's
resets or its side-to-move field, for the same reason in reverse — arranging a
position is not being handed one, and a viewpoint the reader chose is theirs.

## A library is data; only its chrome is code

There are two browsable position libraries — **Mates** (`/mates/basic`,
`/mates/advanced`, `/mates/complex`, and `/mates/<category>/<id>` for one
position) and **Positions** (`/positions/<path>` and `/positions/<path>/<id>`,
endgame theory: Lucena, Philidor, Vancura, Réti, Saavedra, the trebuchet) — and
**one implementation between them**. Adding a position, or a category *at any
depth*, is an entry in that section's JSON and nothing else: no TypeScript, no
locale key, no component edit, no route.

```
mates.json  ───┐                                    ┌──▶ LibraryList  ─┐
               ├─loadLibraryCatalog()─▶ LibraryCatalog                 ├──?fen=──▶ Analysis Board
positions.json ┘   (lib/libraryCatalog.ts)          └──▶ LibraryDetail ┘           / Play with Engine
                                                        (views/library/)           / Board Editor
      │                                                       ▲
      └──navFromLibrary.ts──▶ navFolders / navItems       views/mates/  (the /mates/:category routes)
             (the sidebar subtree, generated)             views/positions/  (the /positions/* splat)
```

The rules it rests on:

- **A position's name lives in the data, not in `src/locales`.** `he` is typed
  `typeof en`, so a catalog key is a two-file edit and a compile error until
  both are done — right for chrome the app *ships*, wrong for content it
  *lists*. Names and descriptions are `{ en, he }` fields on the entry with an
  `en` fallback; only the screen chrome — the section title, the count, the
  buttons — is in the locale catalogs, and both sections carry the same key
  shape under their own block so `t(`${section.chromeKey}.…`)` serves both.
- **So does a category's name, unless it already had a key.** A category carries
  *either* a `labelKey` (Mates, whose three labels shipped before the shared
  layer existed and stay untouched) *or* an inline `label: { en, he }`
  (Positions, the case that must not need a locale edit). `categoryLabel` is the
  one place the two are told apart.
- **A category id is data, not a type**, and a category is addressed by its full
  **path** — `queen-vs-rook/rosettes`. Narrowing either to the shipped values
  would make a new category a code edit, and the segments arrive from the URL
  anyway. A flat section is simply the case where every path is one segment,
  which is why `mates.json` did not change when the layer generalised.
- **A malformed entry is reported, never thrown.** A bad FEN, a missing name, a
  category with no label: the row drops into `problems` and the rest of the
  catalog still loads — a library that cannot render one card must not take the
  other five down with it, and a `throw` at module scope would take the whole
  app down.
- **One splat route serves any depth.** `resolveLibraryPath` matches the
  **longest prefix** of the URL segments that names a category and reads
  whatever is left (at most one segment) as a position id, so `App.tsx` never
  learns how deep `positions.json` nests. Mates keeps its two shipped
  `:category` routes, because those URLs are bookmarked.
- **The nav is generated from the catalog, and named from it.** `navFromLibrary`
  builds a folder plus one list screen per category, at any depth, and splices
  the subtree into `navFolders` / `navItems`; `buildNavTree`, `folderPath`,
  `folderChain` and `Sidebar.tsx` all recursed already and did not change for
  it. Mates' three categories stay written out by hand — three is all that
  section will have. A *position* is a route, not a nav entry, in both sections.
- **A generated node has no catalog key, and `navLabelKeys` must not invent
  one.** `locales.test.ts` asserts every key that walk returns resolves in both
  languages; a folder named from the data has nothing to assert, so
  `NavTreeNode` carries `labelKey` *or* `label` and the walk reports only the
  first kind. Weakening the assertion instead would have given up the check that
  catches a real missing translation.
- **The mating side is to move in every shipped *mate*** — asserted in
  `matesCatalog.test.ts`, and **that rule stops at that section.** It is
  load-bearing there: `/engine/play` derives `playAs` and the board orientation
  from the incoming FEN, so a mate with the defender to move would open backwards
  and have the engine move the instant the screen loaded. But Philidor's rook
  defense, Vancura, the short-side defense, the Cochrane defense and the
  trebuchet are *defensive or mutual-zugzwang* positions in which the side to
  move is the defender, and half the endgame library would be unshippable under
  an attacker-to-move rule. The board still faces the side to move, which for a
  drawing defense correctly opens the reader on the defending side.

The hand-off is the Board Editor's mechanism verbatim — `?fen=` on
`/tools/analysis`, `/engine/play` and `/tools/editor`, validated with `parseFen`
and taken as *initial* state. No new transport was built for it: the third
destination is a third call to the same `handOffTo` helper on the detail page,
and the list cards still link only to the detail page.

## A mask is a costume, never a rule

Masked Pieces (`/masked/play`) draws chosen piece types with another piece's
graphic while the game underneath stays ordinary legal chess. The technique and
this app's implementation of it are specified in
[`docs/chess_piece_masking_technique.docx.md`](docs/chess_piece_masking_technique.docx.md)
— §7 and §13 there are the two clauses the design answers to, and §15 is what was
actually built.

Three things follow, and they are the whole design:

- **The screen has no behaviour of its own.** It runs `usePlayWithEngine`
  *verbatim* — no mode flag, no fork — so legality, captures, check, castling, en
  passant, promotion, the engine's evaluation and the engine's moves are computed
  from the true position and are identical to `/engine/play`. The mask lives
  entirely between the state and the pixels. Nothing in `chess.js`,
  `lib/engine.ts`, `lib/gameModel.ts` or the PGN path changed for it.
- **It is keyed on the piece *type*, not the piece.** `chess.js` gives a piece no
  stable identity, so per-piece masking would need a square → identity map
  maintained through every move, capture, castle, en passant and promotion — a
  second source of truth that can desync from the real position. A twelve-entry
  type map is a render-time lookup with no state at all, each colour is masked
  independently for free, and a promoted pawn is drawn as whatever a queen is
  drawn as because nothing recorded that it used to be a pawn.
- **The notation is the second place it has to be applied.** SAN names the piece
  that moved and the move list sits beside the board, so `MoveList` and
  `BestVariations` take an optional `mask` prop and print coordinates (`g1f3`)
  for a move whose piece is hidden. Optional is the point: Load PGN, the Analysis
  Board and Play with Engine pass none and are untouched.

And one rule that is easy to get wrong: **a type is hidden when it is drawn as
something else *or when something else is drawn as it*.** Under "all pieces
identical" the pawn is still drawn as a pawn and is the most thoroughly hidden
piece on the board — `e4` in the move list would be the one thing saying which
man really was a pawn. `isMasked` in `lib/pieceMask.ts` is that rule; `mask[t] !== t`
is not.

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
| Data | `navFolders.ts` + `navItems.ts` | The folder tree (`{ id, labelKey?, label?, icon, children? }`) and the screens, each naming its `folder`. Mostly authored; the Positions subtree is spliced in from the generator below. |
| Generator | `navFromLibrary.ts` | A folder plus one list screen per category of a library catalog, at any depth, named from the data (`src/data/positions.json`). Ids are namespaced (`positions:queen-vs-rook/rosettes`) so a generated one cannot collide with an authored one. |
| Builder | `navTree.ts` | Pure `buildNavTree` — sub-folders before that folder's own screens at every level — plus `folderPath` (a screen's breadcrumb, and the chain the sidebar opens), `folderChain` (the same for a folder id, itself included), `navLabel` (catalog key *or* data label) and `navLabelKeys` (only the keys). |
| Renderer | `Sidebar.tsx` | A recursive `TreeRow`. Folders are `aria-expanded` toggles, screens are links. |

Consequences worth knowing:

- **Nesting a folder is a data edit.** Add it to `navFolders` (at any depth),
  give it a `labelKey` present in both catalogs, and point screens at it. The
  renderer already recurses — `navTree.test.ts` and `Sidebar.test.tsx` both
  carry fixtures nested deeper than anything shipped.
- **A folder does not have to be written out at all.** The Positions section's
  are built from its JSON and carry a `label` rather than a `labelKey`; only
  `navLabel` and `navLabelKeys` know the difference, and `NavFolderId` is a
  plain `string` because a generated id cannot be a union member. See the
  library section above for why the label lives in the data.
- **One chain is open at a time, and the route decides which.** `Sidebar.tsx`
  holds an *open path* — the folder ids from the top of the tree down to one
  folder — so opening a folder under a different parent shuts the one that was
  open, while a sub-folder still opens inside its own parents. It is seeded from
  `folderPath(pathname)` and follows the route, adjusted during render against
  the previous pathname rather than in an effect, which
  `react-hooks/set-state-in-effect` rejects. A path that is no screen in the
  tree (the landing page, `/mates/<category>/<id>`) has no chain of its own and
  leaves the open one alone. Nothing is persisted: the state is re-derived on
  every mount.
- **The active state is an exact path match.** `"/"` is a prefix of every other
  route, so `startsWith` would light the basic board up everywhere.
- **The sidebar mirrors; only the board does not.** Depth is indented with
  `paddingInlineStart`, which follows the direction on its own — never
  `paddingLeft`, and never wrap this subtree in `ForceLTR`.



## Use the mui-mcp server to answer any MUI questions --

- 1. call the "useMuiDocs" tool to fetch the docs of the package relevant in the question
- 2. call the "fetchDocs" tool to fetch any additional docs if needed using ONLY the URLs present in the returned content.
- 3. repeat steps 1-2 until you have fetched all relevant docs for the given question
- 4. use the fetched content to answer the question


## claude-in-chrome instructions
- 1. Never take screenshots unless you have to. Check first if the analysis can be done with dom/javascript tools. If you have to take screenshot - ask user before.