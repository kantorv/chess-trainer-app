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
| `src/views/shared/` | The panel pieces the game screens share: `MoveList.tsx`, `BoardControls.tsx`, `GameInfo.tsx` (a game's PGN tag pairs), `useGameNavigation.ts`, `EvalBar.tsx`, `BestVariations.tsx`, `PromotionPicker.tsx`, `OptionSlider.tsx`, `CopyableValue.tsx`, `CurrentOpening.tsx` (the live opening line every game screen's panel carries — the eco.json lookup at the position on screen, its ECO chip linking to `/tools/openings?fen=`; it replaced the per-screen "Open in Openings" buttons), and `EngineBoardSquare.tsx` (the eval bar + board + promotion picker the two engine-play screens both render). They take props and know nothing about which screen is rendering them, and their catalog keys are top-level (`moveList.*`, `variations.*`, `promotion.*`, `engineOption.*`, `board.*`, `copyable.*`, `masking.*`) rather than under any one screen's. |
| `src/views/engine/play/` | The Play with Engine screen. `PlayWithEngine.tsx` is layout (the shared `EngineBoardSquare`) and the `?fen=` arrival; **all the behaviour is in `usePlayWithEngine.ts`**; `EnginePanel.tsx` is the Game / Engine / Variations tab strip over the shared board controls, with `EngineSettings.tsx` under it. |
| `src/views/masked/play/` | The Masked Pieces screen — Play with Engine with the piece graphics in disguise. `MaskedPlay.tsx` owns the mask and renders the same `EngineBoardSquare`; **the behaviour is `usePlayWithEngine`, reused verbatim**; `MaskedPanel.tsx` adds a fourth tab over the same three, with `MaskEditor.tsx` under it. |
| `src/views/games/load_pgn/` | The Load PGN screen. `LoadPgn.tsx` owns the state and fills the board square; `GamePanel.tsx` is the whole of the shell panel — the Moves / Info / Load PGN tabs (`PgnIngest.tsx`, plus the shared `MoveList` and `GameInfo`) over the shared board controls. It also takes a `?game=` arrival. |
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
| `src/lib/libraryCatalog.ts` | **The shared library layer** — the types (`LibraryCategory` with its `path` and `children`, the `LibraryItem` union of `LibraryPosition` and `LibraryGame`, `LocalizedText`), `libraryCatalogOf` (the one constructor, which derives the `positions` projection from `items`), the non-throwing `loadLibraryCatalog` (every FEN through `parseFen`, ids unique, category paths known, bad rows dropped into `problems`), the lookups, `categoryLabel` (data label or catalog key), `resolveLibraryPath` (the longest-category-prefix match a splat route needs), `libraryItemFen` and `sideToMoveOf`. Pure, and the only place that knows what a library's data looks like. |
| `src/data/mates.json` | **The mates library** — the category list and a flat list of positions, each naming its category. The only file adding a mate touches. |
| `src/lib/matesCatalog.ts` | A thin binding over the shared layer in the Mates section's own vocabulary (`findMateCategory`, `positionsInCategory`, `findMatePosition`), plus the shipped catalog. |
| `src/data/positions.json` | **The endgame Positions library** — categories nested to any depth, each with its own `{ en, he }` name, and the positions inside them. The only file adding a category *or* a position touches. |
| `src/lib/positionsCatalog.ts` | That file loaded, once, through the same shared loader. |
| `src/data/pgn/` | **The User PGNs library** — the project's `.pgn` files themselves: three lichess study exports (queen-vs-rook rosettes, a custom puzzle set, and nine annotated master games), the three-part Capablanca study, and one **multi-study** export of an author's twenty-eight queen-vs-rook studies. One file is one folder — or, when it carries several `StudyName`s, a folder of study sub-folders — and each game inside it is one item. A folder's optional **notes** are a sibling `.mdx` of the same stem. The only thing adding content touches. |
| `src/data/pgn.json` | That section's *optional* manifest: renames, translates, nests and orders a folder. Every field is an override — a file it says nothing about still appears, and one it nests but does not label is still named from its own `StudyName` tag, which the shipped entry for the master-games study relies on. |
| `src/lib/pgnLibrary.ts` | **The second producer of a `LibraryCatalog`** — `loadPgnLibrary` turns `path -> PGN text` plus that manifest into categories and `LibraryGame` items, naming each from the file's `StudyName` / a game's `ChapterName` / its players. A file carrying **more than one `StudyName`** splits into a folder of study sub-folders (`studyGroupsOf`); one with a single one, or none, is untouched. Non-throwing: a broken game, an empty file, a manifest naming a file that is not there all land in `problems`. Pure — it takes its files as a parameter. |
| `src/lib/pgnCatalog.ts` | That loader over the shipped files, once: an eager `import.meta.glob('../data/pgn/*.pgn', { query: '?raw' })`, so Vite inlines the text at build time and the sidebar can be built from the result at module scope. Exports the shipped catalog and its `pgnKinds`, plus **`userPgnsLibrary()`** — that catalog with the reader's uploads folded in, memoised on them, which is what every screen in the section actually reads. |
| `src/lib/pgnKind.ts` | **The PGN taxonomy** — `study`, `collection`, `shelf`, `games`, `uploads`, what each is recognised by, what screen each gets, and how to add the next one (`repertoire`, `variations`). Types and a lookup only; the recognition is in `pgnLibrary.ts` and the dispatch in `views/pgn/UserPgnsSection.tsx`. |
| `src/lib/pgnUploads.ts` + `pgnUploadStore.ts` | **The reader's own `.pgn` files** — what an upload is, how it becomes a library under the `uploads` folder (through the same loader), whether a picked file is worth keeping; and the `localStorage` half, whose snapshot is checked against a revision stamp so a megabyte of PGN is not re-read per render. Non-throwing throughout. |
| `src/lib/gameReference.ts` | **The `?game=` carrier** — `pgn/<category path>/<id>`, formatted by `gameReferenceOf` and resolved by `resolveGameReference` through the same `resolveLibraryPath`. A game does not fit in a URL, so what travels is a reference into the catalog. |
| `src/views/library/` | The section-agnostic screens all three libraries render: `LibraryList.tsx` (a fixed top bar — the category's name and counts, the name search, the card-size toggle — over the only thing on the screen that scrolls, the card grid: this category's **sub-folders** first, as `LibraryFolderCard.tsx`, then its items as preview boards; its pure `librarySearch.ts` and `cardSize.ts` under it, and the folder's notes — or the hint, when it has none — in the right-hand panel), `LibraryDetail.tsx` (which resolves the URL, renders the miss, and dispatches on the item's kind), `LibraryPositionDetail.tsx` (one position, read-only, facing the side to move, with the three `?fen=` hand-offs), `LibraryGameDetail.tsx` (the game replayed over the shared `MoveList` / `BoardControls` / `useGameNavigation`, with the `?game=` and `?fen=` hand-offs), `LibraryCardFooter.tsx` and its pure `gameSummary.ts` (a card's footer, and the one branch the list screen makes on the item's kind), `BackToCategory.tsx`, `folderNotes.ts` / `pgnFolderNotes.ts` / `LibraryNotes.tsx` (a folder's authored MDX notes — the pure path lookup, the shipped `.mdx` glob, and the panel that styles and scrolls them), and `section.ts`, which is what tells one section from another — route base, catalog, chrome keys, test ids, `?game=` key, folder notes. |
| `src/views/mates/` | The Mates section, as a **binding**: `list/MatesList.tsx` and `detail/MateDetail.tsx` read `/mates/:category(/:id)` and hand it to the two shared screens. Neither knows anything about JSON. |
| `src/views/positions/` | The Positions section: `PositionsSection.tsx` is **one component behind every `/positions/*` URL**, resolving the splat through the catalog and rendering whichever shared screen the answer calls for. |
| `src/views/pgn/` | The User PGNs section: `UserPgnsSection.tsx` is the same one component behind every `/pgn/*` URL, over a catalog whose items are games — and **the one place a PGN kind becomes a screen** (see *What kind of thing a PGN file is* below). Under it, the screens the section's own kinds need: `PgnCollection.tsx` (a multi-study file's index), `PgnCollectionNav.tsx` (its studies in the shell's left rail, while one of them is open), `PgnUploads.tsx` (the reader's own files — the button and the list), the shared two-line `PgnIndexRow.tsx`, the pure `collectionSummary.ts`, and `useUploads.ts` (the `useSyncExternalStore` binding, so `src/lib/` stays free of React). |
| `src/views/main/navFromLibrary.ts` | Building a sidebar subtree — a folder plus a list screen per category, at any depth — out of a library catalog, and merging it into the authored registries. Pure; `positionsNavFolder()` / `positionsNavItems()` and `userPgnsNavFolder()` / `userPgnsNavItems()` are the two shipped uses — the second over a catalog built from `.pgn` files, which is what shows this is a generator rather than a Positions-shaped special case. |
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

There are three browsable libraries — **Mates** (`/mates/basic`,
`/mates/advanced`, `/mates/complex`, and `/mates/<category>/<id>` for one
position), **Positions** (`/positions/<path>` and `/positions/<path>/<id>`,
endgame theory: Lucena, Philidor, Vancura, Réti, Saavedra, the trebuchet) and
**User PGNs** (`/pgn/<path>` and `/pgn/<path>/<id>`, the games in the project's
own `.pgn` files) — and **one implementation between them**. Adding content, or
a category *at any depth*, is an edit to that section's data and nothing else:
no TypeScript, no locale key, no component edit, no route. For the first two
that edit is a JSON entry; for the third it is **dropping a `.pgn` file into
`src/data/pgn/`**.

```
mates.json  ───┐
               ├─loadLibraryCatalog()──┐                ┌──▶ LibraryList ────────────────?fen=──▶ Analysis Board
positions.json ┘  (lib/libraryCatalog) │                │                                        / Play with Engine
                                       ├─▶ LibraryCatalog│                                       / Board Editor
src/data/pgn/*.pgn ──loadPgnLibrary()──┘                └──▶ LibraryDetail ─┬─▶ …PositionDetail ─?fen=──▶ (the same three)
  + pgn.json      (lib/pgnLibrary.ts)                       (views/library/)└─▶ …GameDetail ────?game=─▶ Analysis Board
      │                                                            ▲                                     / Load PGN
      └──navFromLibrary.ts──▶ navFolders / navItems       views/mates/  (the /mates/:category routes)
             (the sidebar subtree, generated)             views/positions/  (the /positions/* splat)
                                                          views/pgn/  (the /pgn/* splat)
```

## An item is a position, or a whole game

The first two sections list **positions**: one FEN, to be looked at and handed
on. The third lists **games**, and a game is not a FEN — it is headers, a
starting position and a line of moves. So `LibraryItem` is a union discriminated
by `kind`, and the two shared screens branch on it **exactly once each**:

| Screen | The one branch |
| --- | --- |
| `LibraryList` | a card's footer (`LibraryCardFooter.tsx`) — whose move it is, because that is the question a position asks; or how a game ended, how long it ran, where it was played and what was opened (`gameSummary.ts`), because "White to play" says nothing about a game you are about to replay from move one. The preview board is not a branch: `libraryItemFen` gives both kinds their starting position, and neither is the search — `librarySearch.ts` folds the two kinds into one string |
| `LibraryDetail` | which body to render — and it splits *before* either runs, because the game body uses hooks the position body does not, and a hook cannot live behind a condition |

Two things follow that are worth knowing before touching the layer:

- **`positions` is a projection of `items`, not a second list.** Every producer
  builds its result through `libraryCatalogOf`, which derives it — so "every
  position in `positions` is an item in `items`" is true by construction. The
  Mates binding and its tests go on speaking in positions; the shared screens
  read `items`.
- **A game-shaped screen writes no move list.** A game out of a `.pgn` is the
  same `Game` `parsePgnGames` produces, so `LibraryGameDetail` hands it to
  `useGameNavigation`, `MoveList` and `BoardControls` and gets the numbered
  pairs, the ply highlight, the jump targets and the keyboard stepping for free.
  That is the whole reason a game-shaped item cost a screen rather than a
  subsystem — see *One game model, two producers* above.
- **A footer prints only what the data has.** `gameSummaryOf` drops every PGN
  placeholder (`gameTag` already reports `"?"`, `"????.??.??"` and an unfinished
  `"*"` result as absent) *and* drops an `Event` that only repeats the item's
  own name — a lichess study writes `Event` as `"<study>: <chapter>"`, so for a
  chapter named "Chapter 1" the event **is** the title with a prefix. So an
  annotated master game fills four lines and a chapter that is a position and a
  comment shows its name and its length and stops. Neither renders a
  placeholder row.

## What kind of thing a PGN file is

A `.pgn` is a container, not a genre: the same syntax carries one lichess study,
an author's whole shelf of them, a month of blitz games and — next — an opening
repertoire. Those want different screens, so **`loadPgnLibrary` labels every
folder it makes with a kind** ([`src/lib/pgnKind.ts`](src/lib/pgnKind.ts)) and
the section binding dispatches on it. The kinds ride *beside* the catalog, in a
lookup keyed by category path, for the same reason the folder notes do: a
`LibraryCategory` serves three sections and only this one has files.

| Kind | What it is | Recognised by | Screen |
| --- | --- | --- | --- |
| `study` | one study; its chapters are the cards | exactly one `StudyName` | `LibraryList` |
| `collection` | one file, **several** studies | two or more `StudyName`s | `PgnCollection` — the file's index |
| `shelf` | a folder of several files | a `pgn.json` `under` path | `LibraryList` (folder cards) |
| `games` | played games, no study | no `StudyName` | `LibraryList` |
| `uploads` | not a file — the folder the reader's own files land in | the one folder `lib/pgnUploads.ts` builds | `PgnUploads` — the upload button and what has been uploaded |

Three rules hold the taxonomy together:

- **A kind is recognised where the folder is made, and turned into a screen in
  exactly one other place** — `views/pgn/UserPgnsSection.tsx`. So adding
  `repertoire` or `variations` is: a name in `PgnKind`, a rule in
  `pgnLibrary.ts`, a screen plus one line in that dispatcher. Nothing in
  `src/lib/libraryCatalog.ts` or `src/views/library/` learns about it, and the
  other two library sections cannot be affected.
- **A different folder screen does not mean a different item screen.** A chapter
  of a collection is the same `LibraryGame` as a game of a chess.com export, so
  `LibraryDetail`, the `?game=` reference and the sibling nav are untouched by
  any kind. Only the *folder* screens differ, because only a folder differs.
- **An upload is not a special kind of content.** A `.pgn` the reader picks at
  `/pgn/uploads` goes through `loadPgnLibrary` under the same `under:` mechanism
  a shipped file does, so it is *recognised* like one — an uploaded multi-study
  export gets the collection index, its chapters route and search and hand
  themselves on with `?game=`, and nothing downstream knows where the file came
  from. What it costs is that this one section's library is **live**:
  `userPgnsLibrary()` (`lib/pgnCatalog.ts`) folds the stored uploads into the
  shipped catalog and is memoised on them, `userPgnsSection.catalog` is a getter
  over it, and `navFolders` / `navItems` became functions so the sidebar can
  grow a folder without a reload. The two position sections are build-time
  constants still.
- **A collection is a book, so the table of contents follows the reader down.**
  Its index screen lists the studies; inside a study, `PgnCollectionNav` puts
  those studies in the shell's left rail (`leftPanel.tsx`), and inside a chapter
  `LibrarySiblingNav` replaces them with that study's chapters. One panel at a
  time and the innermost list wins — and because claiming the rail hides the app
  sidebar, every one of those panels carries a close.

## A folder's notes are MDX, and they are not in the catalog

A library folder can carry **authored notes** — what a study is, who wrote it,
what to look for — and they fill the right-hand panel of its list screen in
place of the one-line hint. Adding them is the section's one-file promise
again: **`my_study.pgn` is described by `my_study.mdx` sitting next to it**, same
stem, no manifest field, no locale key, no component edit.

```
src/data/pgn/<study>.mdx ──import.meta.glob──▶ pgnFolderNotes.ts ──▶ section.folderNotes
      (authored)            (@mdx-js/rollup)     folderNotesOf()          │
                                                 path ← slugify(stem)     ▼
                                                 + manifest `under`   LibraryList → RightPanel → LibraryNotes
```

Three decisions hold it together:

- **A `ComponentType` never enters `src/lib/`.** The obvious home for notes is a
  field on `LibraryCategory`, and that is exactly what it must not be: the lib
  layer is pure data, and its tests compare catalogs as values. So the notes are
  a **second lookup keyed by the same category path**, resolved in the view
  layer and reaching the screens through the `LibrarySection` descriptor —
  which is what keeps `LibraryList` from learning what `.mdx` is, and what would
  let Mates or Positions carry notes by filling one field.
- **The key is the path `loadPgnLibrary` derived**, built with the same
  `slugify` and the same manifest `under` prefix — not a second copy of the
  rule. Get it wrong and nothing breaks loudly: the note sits in the bundle
  addressing nothing and the panel quietly keeps the hint, so
  `folderNotes.test.ts` asserts every shipped note names a folder the catalog
  actually has.
- **MDX, not Markdown, and not a string.** What the glob yields is a component,
  so a note can `import` and render a real component when prose stops being
  enough. `vite.config.ts` puts `@mdx-js/rollup` ahead of the React plugin
  (`enforce: 'pre'`) with `remark-gfm` for tables, and Vitest runs off that same
  config — so a broken MDX setup fails a list-screen test, not only the build.

`LibraryNotes.tsx` is the one place authored elements are styled: MDX emits bare
`h2` / `p` / `table` / `a`, which carry no MUI styling at all, so it applies a
small typographic reset in theme tokens (following light and dark for free) and
scrolls itself — the shell's aside deliberately does not scroll, and
`RightPanel` portals into a `display: contents` host, so `flex: 1` +
`minHeight: 0` + `overflowY: auto` is what keeps a long note off the board
square. Nothing there pins direction: the aside mirrors under Hebrew by design.

## Handing a game on: `?game=`, beside `?fen=`

A FEN fits in a URL; a game does not. So the game hand-off carries a **reference
into the catalog** — `?game=pgn/<category path>/<id>` — and the destination looks
the game up for itself (`lib/gameReference.ts`). It keeps everything the `?fen=`
hand-off is good for: a query parameter survives being bookmarked, shared and
reloaded; the destination validates it and ignores what does not resolve; and it
is taken as *initial* state, because arriving at the URL is what mounts the
screen.

It is **additive**. `?fen=` was not extended, wrapped or replaced — a game's
detail page offers both, and which one a button uses says what that destination
is for:

| Destination | Carries | Because |
| --- | --- | --- |
| Analysis Board, Load PGN | `?game=` (+ `?move=` at the ply on screen) | they replay a game, so the game has to cross — and it opens where the reader was |
| Play with Engine, Board Editor | `?fen=` at the **ply on screen** | neither replays anything; what they want is the position being looked at |

The Analysis Board re-reads the referenced PGN with `parsePgnTree` rather than
taking the catalog's parsed `Game`: the catalog holds a **mainline** (`chess.js`
`loadPgn` discards `( … )`), and side lines are the one thing an analysis board
is for.

**`?move=` rides beside `?game=`, and the study page's own URL too.** A
reference names the game but not where the reader was in it, so the detail page
reflects every step into its own URL with history **replace** (`?move=<ply>`,
the same half-move unit `useGameNavigation` speaks; ply 0 deletes the
parameter), and the two `?game=` hand-offs append it. Both destinations take it
as *initial* state like any other arrival — Load PGN as the first render's
ply, the Analysis Board as a mainline walk (`useTreeNavigation` seeds the node
id, because its state is a node, not a ply). Validation is the one rule the
other two parameters already keep: `parseMoveParam` (`lib/gameNavigation.ts`)
ignores anything that is not a non-negative integer, and a value past the end
of the game is clamped on read, exactly like a ply from any other source.

**A game can also declare its own opening ply: the `StartPly` tag.**
`[StartPly "27"]` in a `.pgn` says the game opens at ply 27 — a puzzle
collection's chapters each open at the position they are about, rather than at
the game's start. The declaration lives in the content file, not in
`src/data/pgn.json` (which stays folder chrome), so a reader's uploaded file
declares it exactly as a shipped one does. `initialPlyOf`
(`lib/gameNavigation.ts`) is the one reader: absent, unreadable or
past-the-end is "no declaration" — ply 0, with an out-of-range value ignored
whole rather than clamped, because a tag naming a move the game does not have
is a broken tag, not a request for the final position. Precedence composes at
each of the three places a game opens (the detail page, Load PGN, the Analysis
Board) as one line: `parseMoveParam(?move=) ?? initialPlyOf(game)` — an
explicit `?move=` wins over the tag, the tag wins over ply 0. Card preview
boards are untouched: a card previews the game, not the puzzle point.

The rules the libraries rest on:

- **A position's name lives in the data, not in `src/locales`.** `he` is typed
  `typeof en`, so a catalog key is a two-file edit and a compile error until
  both are done — right for chrome the app *ships*, wrong for content it
  *lists*. Names and descriptions are `{ en, he }` fields on the entry with an
  `en` fallback; only the screen chrome — the section title, the count, the
  buttons — is in the locale catalogs, and every section carries the same key
  shape under its own block so `t(`${section.chromeKey}.…`)` serves all three.
  That shape is a **floor, not a ceiling**: a section adds the keys its own item
  kinds need, which is why only `userPgns` has `list.moves` and
  `detail.openInLoadPgn`. A User PGNs folder is named from its file's
  `StudyName` tag or from `src/data/pgn.json`, and a game from its `ChapterName`
  or its players — never from `src/locales`.
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
  whatever is left (at most one segment) as an item id, so `App.tsx` never
  learns how deep `positions.json` nests or how `src/data/pgn/` is organised.
  `/positions/*` and `/pgn/*` are the same route twice. Mates keeps its two
  shipped `:category` routes, because those URLs are bookmarked.
- **A folder is a card, so a section that nests is browsable without the
  sidebar.** `LibraryList` renders `found.children` ahead of the items in the
  same grid (`LibraryFolderCard.tsx`), each counting everything under it
  (`itemCountUnder` — the one rollup, and the opposite of
  `itemsInLibraryCategory`'s rule, because a folder card stands for what is
  behind the click). It is not a branch on the item kind: a folder is not an
  item. This is what let a **multi-study `.pgn`** — one lichess export holding
  twenty-eight studies, split into a sub-folder each by `loadPgnLibrary` — cost
  a card rather than a fourth kind of screen.
- **A section may claim a screen the default rule would not give it.**
  `libraryNavItems` skips a category that only groups sub-categories — a second
  sidebar row named the same as the folder holding it, listing nothing. A User
  PGNs **collection** is that shape and has a real index screen anyway, so the
  section overrides it with `hasScreen` (`navFromLibrary.ts`). A manifest shelf
  does not, and keeps the default.
- **The nav is generated from the catalog, and named from it.** `navFromLibrary`
  builds a folder plus one list screen per category, at any depth, and splices
  the subtree into `navFolders` / `navItems`; `buildNavTree`, `folderPath`,
  `folderChain` and `Sidebar.tsx` all recursed already and did not change for
  it. It runs twice — over `positions.json` and over the PGN catalog — and
  nothing in it knows that one section's folders are files, which is what makes
  it a generator rather than a Positions-shaped special case. Mates' three
  categories stay written out by hand: three is all that section will have. An
  *item* is a route, not a nav entry, in every section.
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

The position hand-off is the Board Editor's mechanism verbatim — `?fen=` on
`/tools/analysis`, `/engine/play` and `/tools/editor`, validated with `parseFen`
and taken as *initial* state. No new transport was built for it: the third
destination is a third call to the same `handOffTo` helper on the detail page,
and the list cards still link only to the detail page. `?game=` sits beside it
for the one thing a FEN cannot carry — see *Handing a game on* above.

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
| Data | `navFolders()` + `navItems()` | The folder tree (`{ id, labelKey?, label?, icon, children? }`) and the screens, each naming its `folder`. Mostly authored; the Positions and User PGNs subtrees are spliced in from the generator below. **Functions**, because the second of those grows a folder when the reader uploads a `.pgn`. |
| Generator | `navFromLibrary.ts` | A folder plus one list screen per category of a library catalog, at any depth, named from the data. Run over `src/data/positions.json` and over the `.pgn` files under `src/data/pgn/`. Ids are namespaced (`positions:queen-vs-rook/rosettes`, `user-pgns:studies`) so a generated one cannot collide with an authored one, or with the other section's. |
| Builder | `navTree.ts` | Pure `buildNavTree` — sub-folders before that folder's own screens at every level — plus `folderPath` (a screen's breadcrumb, and the chain the sidebar opens), `folderChain` (the same for a folder id, itself included), `navLabel` (catalog key *or* data label) and `navLabelKeys` (only the keys). |
| Renderer | `Sidebar.tsx` | A recursive `TreeRow`. Folders are `aria-expanded` toggles, screens are links. |

Consequences worth knowing:

- **Nesting a folder is a data edit.** Add it to `navFolders` (at any depth),
  give it a `labelKey` present in both catalogs, and point screens at it. The
  renderer already recurses — `navTree.test.ts` and `Sidebar.test.tsx` both
  carry fixtures nested deeper than anything shipped.
- **A folder does not have to be written out at all.** The Positions and User
  PGNs sections' are built from their catalogs and carry a `label` rather than a
  `labelKey`; only `navLabel` and `navLabelKeys` know the difference, and
  `NavFolderId` is a plain `string` because a generated id cannot be a union
  member. See the library section above for why the label lives in the data.
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