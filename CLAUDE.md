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
| `src/views/shared/` | The panel pieces the game screens share: `MoveList.tsx`, `BoardControls.tsx`, `GameInfo.tsx` (a game's PGN tag pairs), `useGameNavigation.ts`, `EvalBar.tsx`, `BestVariations.tsx`, `PromotionPicker.tsx`, `OptionSlider.tsx`, `CopyableValue.tsx`, `CurrentOpening.tsx` (the live opening line every game screen's panel carries — the eco.json lookup at the position on screen, its ECO chip linking to `/tools/openings?fen=`; it replaced the per-screen "Open in Openings" buttons), and `EngineBoardSquare.tsx` (the eval bar + board + promotion picker the two engine-play screens both render). Beside them, the **saved-list view machinery** the three saved screens consume: `savedList.ts` (the pure half — the `SavedListView` type, the board-view grid styles and the caption date/join helpers), `SavedListViewToggle.tsx` / `SavedListExportBar.tsx` / `SavedListRemoveButton.tsx` and `useOpeningBook.ts`. These take each screen's own catalog block (`labelKey`) and test-id prefix rather than keys of their own, because the screens' tests are the contract on the rendered words and ids — a deliberate difference from the pieces above, whose keys are top-level (`moveList.*`, `variations.*`, `promotion.*`, `engineOption.*`, `board.*`, `copyable.*`, `masking.*`). All of them take props and know nothing about which screen is rendering them. |
| `src/views/engine/play/` | The Play with Engine screen. `PlayWithEngine.tsx` is layout (the shared `EngineBoardSquare`) and the `?fen=` arrival; **all the behaviour is in `usePlayWithEngine.ts`**; `EnginePanel.tsx` is the Game / Engine / Variations tab strip over the shared board controls, with `EngineSettings.tsx` under it. |
| `src/views/engine/saved/` | The Saved games screen — the games played on the screen above, newest first, as a list **or** as preview boards (the library list screen's own two card sizes, through `views/library/cardSize.ts`). `SavedGames.tsx` is both views and the three hand-offs, `useSavedGames.ts` the `useSyncExternalStore` binding (so `src/lib/` stays free of React). No catalog to browse: these are this app's own output. |
| `src/views/masked/play/` | The Masked Pieces screen — Play with Engine with the piece graphics in disguise. `MaskedPlay.tsx` owns the mask and renders the same `EngineBoardSquare`; **the behaviour is `usePlayWithEngine`, reused verbatim**; `MaskedPanel.tsx` adds a fourth tab over the same three, with `MaskEditor.tsx` under it. |
| `src/views/games/load_pgn/` | The Load PGN screen. `LoadPgn.tsx` owns the state and fills the board square; `GamePanel.tsx` is the whole of the shell panel — the Moves / Info / Load PGN tabs (`PgnIngest.tsx`, plus the shared `MoveList` and `GameInfo`) over the shared board controls. It also takes a `?game=` arrival. |
| `src/views/tools/editor/` | The Board Editor. `BoardEditor.tsx` is layout (the two palettes and the board, inside a `ChessboardProvider`), board options, the `?fen=` arrival and the PGN/FEN ingestion state; **the behaviour is in `useBoardEditor.ts`**; `EditorPanel.tsx` is the Position / FEN / PGN tab strip over the reset controls and the hand-off, with `PositionFields.tsx`, `FenSetup.tsx`, `PgnSetup.tsx` and `PiecePalette.tsx` under it. |
| `src/views/tools/analysis/` | The Analysis Board. `AnalysisBoard.tsx` is layout (eval bar + board), board options, the PGN/FEN ingestion state and the three arrivals (`?fen=`, `?game=`, `?analysis=`); **the behaviour is in `useAnalysisBoard.ts`** — including the effect that writes the board down as it is worked on — the navigation in `useTreeNavigation.ts`; `AnalysisPanel.tsx` is the Moves / Engine / Variations / Position tab strip, with `VariationTree.tsx`, `AnalysisSettings.tsx` and `PositionSetup.tsx` under it. |
| `src/views/tools/analysis/saved/` | The Saved analyses screen — the boards worked on above, newest first, as a list **or** as preview boards at the library's two card sizes. `SavedAnalyses.tsx` is both views and the three hand-offs, `useSavedAnalyses.ts` the `useSyncExternalStore` binding. `views/engine/saved/` again, and the header comment says only what is different. |
| `src/views/tools/openings/` | The Openings screen — a regular board the reader plays through, with the book continuations from the position on screen listed explorer-style and a variation tree behind it all (the Analysis Board's tree, driven by `useOpenings.ts`; `OpeningsBoard.tsx` is layout). `OpeningsPanel.tsx` is the whole of the right-hand panel — the current opening, the explorer list, a tab strip over the variation tree and the board controls — with `SaveOpeningDialog.tsx` (the save prompt: the note and the folder choice), `NoteDialog.tsx` (the shared edit-note dialog) and `FolderPicker.tsx` under it. Takes `?fen=` (the arrival the three board screens share) and `?openings=<id>` (a saved opening to go on exploring). Its saved screens are `saved/SavedOpenings.tsx` — the Saved analyses screen again, over the same saved-list view machinery, split into `saved/useFolderBrowser.ts` (the folder browsing, a hook), `saved/SavedOpeningViews.tsx` / `saved/SavedFolderViews.tsx` (the rows and cards), `saved/SavedFolderBreadcrumb.tsx` and `saved/SavedOpeningsDialogs.tsx` (the breadcrumb and the dialog stack), with `saved/useSavedOpenings.ts` / `saved/useOpeningFolders.ts` the two `useSyncExternalStore` bindings. |
| `src/lib/engineSettings.ts` | **The engine knobs a game is played under** — `EngineSettings`, its defaults, the `SETTING_UCI_OPTION` table and `approximateElo`, plus the non-throwing `engineSettingsFrom` a stored record is read back through. In `src/lib/` because a saved game records them; `usePlayWithEngine.ts` re-exports the lot, so that hook stays the one import a reader of the screen needs. |
| `src/lib/analysisSettings.ts` | **The engine knobs an analysis is worked under** — `AnalysisSettings`, its defaults, `ANALYSIS_UCI_OPTION` and the non-throwing `analysisSettingsFrom`. The same move for the same reason as the file above: a saved analysis records them, and `useAnalysisBoard.ts` re-exports the lot. |
| `src/lib/engine.ts` | The Stockfish worker wrapper: search, UCI option discovery, and the protocol discipline that keeps the engine alive (see the chessboard rules §4). |
| `src/lib/engineAnalysis.ts` | Reading the engine's numbers: `scoreFromUci` (the one place a score is normalised to White's perspective), `formatScore`, `evalBarFraction`, `pvToSan`, `numberedVariation`, plus the `Analysis` / `EngineLine` shape both engine screens collect into and the `withEngineLine` fold. Pure. |
| `src/lib/gameModel.ts` | **The shared game model** — `Game` / `GameMove` / `GameHeaders`, plus `gameTag` / `initialFenOf` / `finalFenOf` and the `gameFromChess` snapshot. One *line* of play; all three game screens speak it. |
| `src/lib/gameTree.ts` | **The variation tree** — `GameTree` / `VariationNode`, `addMove` (the branch), `mainline` / `lineOf` / `pathTo` / `fenAtNode`, `treeToPgn`, and the `treeFromGame` ⇄ `mainlineGame` bridge that makes a `Game` a walk over a tree. Also `gameToPgn`, the **linear** game's writer, which is `treeToPgn` over the one-line tree rather than a second copy of the numbering and `SetUp`/`FEN` rules. Read the next section before touching it. |
| `src/lib/pgn.ts` | PGN ingestion only: text in, a `Game` (`parsePgnGames`, mainline only — what `chess.js` gives) or a `GameTree` (`parsePgnTrees`, side lines kept) out. |
| `src/lib/fen.ts` | FEN ingestion: `parseFen` validates and normalises a pasted position, or throws `FenParseError`. |
| `src/lib/positionEditor.ts` | A position *being edited*: `fenFields` / `fenFromFields` (the six fields apart and back together, which is what makes the editor's side-to-move, castling and en passant controls round-trip), `enPassantOptions`, and `positionProblems` — **non-throwing** legality reporting, because a half-edited board is illegal by definition. Pure. |
| `src/lib/gameNavigation.ts` | Walking a `Game`: `clampPly` / `fenAtPly` / `arrowsAtPly` / `moveRowsOf`. A ply is a half-move index, 0 being the starting position; each ply's FEN is read off the move that already carries it, so nothing re-simulates a game. |
| `src/lib/pieceMask.ts` | **Piece masking** — the `PieceMask` (true type → the type drawn in its place, all twelve), the presets, `maskedPieces` (the board's `options.pieces`) and `maskSan` / `maskSanLine` (the notation). Pure, and the only place the mask exists. |
| `src/lib/libraryCatalog.ts` | **The shared library layer** — the types (`LibraryCategory` with its `path` and `children`, the `LibraryItem` union of `LibraryPosition` and `LibraryGame`, `LocalizedText`), `libraryCatalogOf` (the one constructor, which derives the `positions` projection from `items`), the non-throwing `loadLibraryCatalog` (a JSON-of-FEN-rows producer kept for a future section of positions — every FEN through `parseFen`, ids unique, category paths known, bad rows dropped into `problems`), the lookups, `categoryLabel` (data label or catalog key), `resolveLibraryPath` (the longest-category-prefix match a splat route needs), `libraryItemFen` and `sideToMoveOf`. Pure, section-agnostic, and the only place that knows what a library's data looks like. |
| `src/data/pgn/` | **The Library section's data** (was "User PGNs"; dir name kept) — the project's `.pgn` files themselves: three lichess study exports (queen-vs-rook rosettes, a custom puzzle set, and nine annotated master games), the three-part Capablanca study, and one **multi-study** export of an author's twenty-eight queen-vs-rook studies. One file is one folder — or, when it carries several `StudyName`s or is a `repertoire` (none ship, but an upload can be one), a folder of sub-folders — and each game/line inside it is one item. A folder's optional **notes** are a sibling `.mdx` of the same stem. The only thing adding content touches. |
| `src/data/pgn.json` | That section's *optional* manifest: renames, translates, nests and orders a folder. Every field is an override — a file it says nothing about still appears, and one it nests but does not label is still named from its own `StudyName` tag, which the shipped entry for the master-games study relies on. |
| `src/lib/pgnLibrary.ts` | **The second producer of a `LibraryCatalog`** — `loadPgnLibrary` turns `path -> PGN text` plus that manifest into categories and `LibraryGame` items, naming each from the file's `StudyName` / a game's `ChapterName` / its players. A file carrying **more than one `StudyName`** splits into a folder of study sub-folders (`studyGroupsOf`); one with a single one, or none, is untouched. Non-throwing: a broken game, an empty file, a manifest naming a file that is not there all land in `problems`. Pure — it takes its files as a parameter. |
| `src/lib/pgnCatalog.ts` | That loader over the shipped files, once: an eager `import.meta.glob('../data/pgn/*.pgn', { query: '?raw' })`, so Vite inlines the text at build time and the sidebar can be built from the result at module scope. Exports the shipped catalog and its `pgnKinds`, plus **`userPgnsLibrary()`** — that catalog with the reader's uploads folded in, memoised on them, which is what every screen in the section actually reads. |
| `src/lib/pgnKind.ts` | **The PGN taxonomy** — `study`, `collection`, `repertoire`, `shelf`, `games`, `uploads`, what each is recognised by, what screen each gets, and how to add the next one (`variations`). Types and a lookup only; the recognition is in `pgnLibrary.ts` and the dispatch in `views/pgn/UserPgnsSection.tsx`. |
| `src/lib/savedGames.ts` + `savedGameStore.ts` | **The reader's games against the engine** — what a saved game is (a PGN plus the `EngineSettings` it was played under), how it is written and read back, and `savedGameCatalogOf`, which presents the lot as a `LibraryCatalog` so `?game=` resolves against it; and the `localStorage` half, revision-stamped like the uploads store, with an idempotent `saveGame` because the writer is an effect. Non-throwing throughout. |
| `src/lib/pgnUploads.ts` + `pgnUploadStore.ts` | **The reader's own `.pgn` files** — what an upload is, how it becomes a library under the `uploads` folder (through the same loader), whether a picked file is worth keeping; and the `localStorage` half, whose snapshot is checked against a revision stamp so a megabyte of PGN is not re-read per render. Non-throwing throughout. |
| `src/lib/savedAnalyses.ts` + `savedAnalysisStore.ts` | **The reader's analysis boards** — what a saved analysis is (the whole tree as PGN, the `AnalysisSettings` it was worked under, where the reader was standing as SAN from the root, and which way the board faced), how it is written and read back, and `savedAnalysisCatalogOf` so `?game=` resolves against it; and the `localStorage` half. The pair above, deliberately, with two differences: `treeToPgn` / `parsePgnTree` rather than the linear writer, because side lines are the point, and a **place in the tree** as part of the record. Non-throwing throughout. |
| `src/lib/savedOpenings.ts` + `savedOpeningFolders.ts` + the two stores | **The reader's saved openings, and the folders they are filed under** — what a saved opening is (the whole tree as PGN — side lines are the point — plus the orientation it was viewed from, the note it is named by and the folder it is filed under), how it is written and read back, and the folder entity: `OpeningFolder` is a name and a parent id, with the reads over a list of them (cycles cut, dangling parents read as top level). The `localStorage` halves: the openings' store, with an idempotent `saveOpening` and a note edited in place (`updateSavedOpeningNote` keeps the record's place in the list); and the folders' store, where the CRUD lives because every caller must mean the same thing — `moveOpeningFolder` refuses the folder's own subtree, and `removeOpeningFolder` re-parents sub-folders and files the openings back to Unfiled in one write-through. The saved openings are **not** a `LibraryCatalog`: nothing hands one on with `?game=` — reopening is `?openings=<id>`, and the position hand-off is `?fen=` at the end of the mainline. Non-throwing throughout. |
| `src/lib/recordStore.ts` | **The shared localStorage record-store factory** — the snapshot/subscribe/write machinery every record store (`savedGameStore`, `savedAnalysisStore`, `savedOpeningStore`, `savedOpeningFolderStore`, `pgnUploadStore`) is built over: the try/catch read, the revision-stamped cached snapshot, the `storage`-event subscription, and the write that stamps the revision after the data. A row the normaliser (the `savedGameFrom`-style guard each store passes in) refuses is dropped, not rendered. Pure, non-throwing; one instance per store, each file keeping its own caps, idempotency comparisons and cross-store operations beside it. |
| `src/lib/pgnExport.ts` | **Taking games out of the app** — `pgnFileOf` (several stored PGN records joined with a blank line, which is what `splitPgnGames` reads back) and `downloadTextFile` / `downloadPgn`, the blob-URL save. A join rather than a re-write: a saved game *is* PGN already, so nothing is re-parsed and a record this build cannot read still exports intact. |
| `src/lib/gameReference.ts` | **The `?game=` carrier** — `library/<category path>/<id>` (the key was `pgn` before CTA-38; still resolves), formatted by `gameReferenceOf` and resolved by `resolveGameReference` through the same `resolveLibraryPath`. A game does not fit in a URL, so what travels is a reference into the catalog. |
| `src/views/library/` | The section-agnostic screens a library section renders: `LibraryList.tsx` (a fixed top bar — the category's name and counts, the name search, the card-size toggle — over the only thing on the screen that scrolls, the card grid: this category's **sub-folders** first, as `LibraryFolderCard.tsx`, then its items as preview boards; its pure `librarySearch.ts` and `cardSize.ts` under it, and the folder's notes — or the hint, when it has none — in the right-hand panel), `LibraryDetail.tsx` (which resolves the URL, renders the miss, and dispatches on the item's kind — and on the `variationMode` flag the section passes for a repertoire line), `LibraryPositionDetail.tsx` (one position, read-only, facing the side to move, with the three `?fen=` hand-offs), `LibraryGameDetail.tsx` (the game replayed over the shared `MoveList` / `BoardControls` / `useGameNavigation`, with the `?game=` and `?fen=` hand-offs), `LibraryVariationDetail.tsx` (a repertoire line replayed with its **variation tree** — `parsePgnTree` + the shared `VariationTree` / `useTreeNavigation`), `LibraryCardFooter.tsx` and its pure `gameSummary.ts` (a card's footer, and the one branch the list screen makes on the item's kind), `BackToCategory.tsx`, `folderNotes.ts` / `pgnFolderNotes.ts` / `LibraryNotes.tsx` (a folder's authored MDX notes — the pure path lookup, the shipped `.mdx` glob, and the panel that styles and scrolls them), and `section.ts`, which is what tells one section from another — route base, catalog, chrome keys, test ids, `?game=` key, folder notes. |
| `src/views/pgn/` | The Library section: `UserPgnsSection.tsx` is **one component behind every `/library/*` URL** (was "User PGNs" at `/pgn/*`; file path kept), resolving the splat through the catalog, over a catalog whose items are games — and **the one place a PGN kind becomes a screen** (see *What kind of thing a PGN file is* below). Under it, the screens the section's own kinds need: `PgnCollection.tsx` (a multi-study file's index), `PgnCollectionNav.tsx` (its studies in the shell's left rail, while one of them is open), `PgnUploads.tsx` (the reader's own files — the button and the list), the shared two-line `PgnIndexRow.tsx`, the pure `collectionSummary.ts`, and `useUploads.ts` (the `useSyncExternalStore` binding, so `src/lib/` stays free of React). |
| `src/views/main/navFromLibrary.ts` | Building a sidebar subtree — a folder plus a list screen per category, at any depth — out of a library catalog, and merging it into the authored registries. Pure; `userPgnsNavFolder()` / `userPgnsNavItems()` are the shipped use, over a catalog built from `.pgn` files. It is a generator over any `LibraryCatalog`, not a Library-section special case. |
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

There is one browsable library — the **Library** (`/library/<path>` and
`/library/<path>/<id>`, the games in the project's own `.pgn` files — was "User
PGNs" at `/pgn/*` before CTA-38; old URLs redirect and the old `?game=pgn/…`
key still resolves) — over a **section-agnostic implementation**
(`src/views/library/` over `src/lib/libraryCatalog.ts`) built to carry more than
one. Adding content, or a category *at any depth*, is an edit to the section's
data and nothing else: no TypeScript, no locale key, no component edit, no
route. For the Library that edit is **dropping a `.pgn` file into
`src/data/pgn/`**. The layer also keeps a JSON-of-FEN-rows producer
(`loadLibraryCatalog`) for a future section of positions; nothing ships one
today.

```
(a JSON file of FEN rows) ──loadLibraryCatalog()──┐                ┌──▶ LibraryList ────────────────?fen=──▶ Analysis Board
                             (lib/libraryCatalog)  │               │                                        / Play with Engine
                                                   ├─▶ LibraryCatalog│                                     / Board Editor
src/data/pgn/*.pgn ──────────loadPgnLibrary()──────┘               └──▶ LibraryDetail ─┬─▶ …PositionDetail ─?fen=──▶ (the same three)
  + pgn.json                 (lib/pgnLibrary.ts)                       (views/library/)├─▶ …GameDetail ────?game=─▶ Analysis Board
      │                                                                       ▲        └─▶ …VariationDetail (repertoire line)  / Load PGN
      └──navFromLibrary.ts──▶ navFolders / navItems                   views/pgn/  (the /library/* splat)
             (the sidebar subtree, generated)
```

## An item is a position, or a whole game

A library can list **positions** — one FEN, to be looked at and handed on — or
**games**, and a game is not a FEN: it is headers, a starting position and a
line of moves. So `LibraryItem` is a union discriminated by `kind`, and the two
shared screens branch on it **exactly once each**. The shipped User PGNs section
holds games; the position path stays supported for a future section.

| Screen | The one branch |
| --- | --- |
| `LibraryList` | a card's footer (`LibraryCardFooter.tsx`) — whose move it is, because that is the question a position asks; or how a game ended, how long it ran, where it was played and what was opened (`gameSummary.ts`), because "White to play" says nothing about a game you are about to replay from move one. The preview board is not a branch: `libraryItemFen` gives both kinds their starting position, and neither is the search — `librarySearch.ts` folds the two kinds into one string |
| `LibraryDetail` | which body to render — and it splits *before* either runs, because the game body uses hooks the position body does not, and a hook cannot live behind a condition |

Two things follow that are worth knowing before touching the layer:

- **`positions` is a projection of `items`, not a second list.** Every producer
  builds its result through `libraryCatalogOf`, which derives it — so "every
  position in `positions` is an item in `items`" is true by construction. A
  position-shaped section speaks in positions; the shared screens read `items`.
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
an author's whole shelf of them, a month of blitz games, an opening repertoire
and — next — a single position's branches. Those want different screens, so
**`loadPgnLibrary` labels every folder it makes with a kind**
([`src/lib/pgnKind.ts`](src/lib/pgnKind.ts)) and the section binding dispatches
on it. The kinds ride *beside* the catalog, in a lookup keyed by category path,
for the same reason the folder notes do: a `LibraryCategory` is
section-agnostic and only this section has files.

| Kind | What it is | Recognised by | Screen |
| --- | --- | --- | --- |
| `study` | one study; its chapters are the cards | exactly one `StudyName` | `LibraryList` |
| `collection` | one file, **several** studies | two or more `StudyName`s | `PgnCollection` — the file's index |
| `repertoire` | one file, an opening repertoire; the `White` tag groups the lines into `"N) "`-ordered chapters | manifest `kind: "repertoire"`, else the shape (many games, no `StudyName`, `"N) "` `White` tags) | `LibraryList` (chapter folder-cards, then a card per line); a line opens in `LibraryVariationDetail` — `parsePgnTree` + the shared `VariationTree` |
| `shelf` | a folder of several files | a `pgn.json` `under` path | `LibraryList` (folder cards) |
| `games` | played games, no study | no `StudyName` | `LibraryList` |
| `uploads` | not a file — the folder the reader's own files land in | the one folder `lib/pgnUploads.ts` builds | `PgnUploads` — the upload button and what has been uploaded |

Three rules hold the taxonomy together:

- **A kind is recognised where the folder is made, and turned into a screen in
  exactly one other place** — `views/pgn/UserPgnsSection.tsx`. So adding
  `variations` (or, as `repertoire` already did, a new kind) is: a name in
  `PgnKind`, a rule in `pgnLibrary.ts` (plus, when the tags cannot declare it, a
  manifest `kind` field and an optional heuristic — `repertoire` uses both), a
  screen plus one line in that dispatcher. Nothing in
  `src/lib/libraryCatalog.ts` or `src/views/library/` learns about it — the
  `repertoire` line viewer takes a `variationMode` **prop**, it does not import
  `pgnKind` — and the other two library sections cannot be affected.
- **A different folder screen does not mean a different item screen.** A chapter
  of a collection is the same `LibraryGame` as a game of a chess.com export, so
  `LibraryDetail`, the `?game=` reference and the sibling nav are untouched by
  any kind. Only the *folder* screens differ, because only a folder differs.
- **An upload is not a special kind of content.** A `.pgn` the reader picks at
  `/library/uploads` goes through `loadPgnLibrary` under the same `under:` mechanism
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
  let another section carry notes by filling one field.
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

**A reference resolves against a catalog, so anything that can be one gets the
hand-off free.** `catalogsByKey` in `lib/gameReference.ts` is the whole of that
mapping and it has three entries: `library` (the Library section; the old `pgn` key still resolves), `engine` (the
reader's **saved games**) and `analysis` (their **saved analyses**) — the last
two presented as catalogs by `savedGameCatalogOf` and `savedAnalysisCatalogOf`
for exactly this reason. No destination learns that a game can come from an
engine or an analysis screen, and nothing in `views/library/` learns that either
store exists. **A line in that registry is the whole cost of a new producer of
games** — see *Saving a game against the engine* and *Saving an analysis board*
below.

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
  buttons — is in the locale catalogs, under the section's own block so
  `t(`${section.chromeKey}.…`)` reaches it. That shape is a **floor, not a
  ceiling**: a section adds the keys its own item kinds need, which is why
  `userPgns` has `list.moves` and `detail.openInLoadPgn`. A User PGNs folder is
  named from its file's `StudyName` tag or from `src/data/pgn.json`, and a game
  from its `ChapterName` or its players — never from `src/locales`.
- **So does a category's name, unless it needs a key.** A category carries
  *either* a `labelKey` (for a section whose category names are chrome the app
  ships) *or* an inline `label: { en, he }` (for a section whose categories are
  content the data owns — the case that must not need a locale edit).
  `categoryLabel` is the one place the two are told apart.
- **A category id is data, not a type**, and a category is addressed by its full
  **path** — `queen-vs-rook/rosettes`. Narrowing either to the shipped values
  would make a new category a code edit, and the segments arrive from the URL
  anyway. A flat section is simply the case where every path is one segment.
- **A malformed entry is reported, never thrown.** A bad FEN, a missing name, a
  category with no label: the row drops into `problems` and the rest of the
  catalog still loads — a library that cannot render one card must not take the
  other five down with it, and a `throw` at module scope would take the whole
  app down.
- **One splat route serves any depth.** `resolveLibraryPath` matches the
  **longest prefix** of the URL segments that names a category and reads
  whatever is left (at most one segment) as an item id, so `App.tsx` never
  learns how `src/data/pgn/` is organised. `/library/*` is that one route
  (`/pgn/*` redirects to it — CTA-38).
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
  it. It runs over the PGN catalog, and nothing in it knows that the section's
  folders are files, which is what makes it a generator over any `LibraryCatalog`
  rather than a User-PGNs special case. An *item* is a route, not a nav entry.
- **A generated node has no catalog key, and `navLabelKeys` must not invent
  one.** `locales.test.ts` asserts every key that walk returns resolves in both
  languages; a folder named from the data has nothing to assert, so
  `NavTreeNode` carries `labelKey` *or* `label` and the walk reports only the
  first kind. Weakening the assertion instead would have given up the check that
  catches a real missing translation.
- **The library layer holds no rule about which side is to move.** Whether the
  attacker or the defender is to play is a property of the content: a section
  that cares (a library of forced wins, say — `/engine/play` derives `playAs`
  and the board orientation from the incoming FEN, so a position with the
  defender to move would open backwards) asserts it in its own tests, not in
  `src/lib/libraryCatalog.ts`, where a drawing-defense position with the
  defender to move is ordinary and correct.

The position hand-off is the Board Editor's mechanism verbatim — `?fen=` on
`/tools/analysis`, `/engine/play` and `/tools/editor`, validated with `parseFen`
and taken as *initial* state. No new transport was built for it: the third
destination is a third call to the same `handOffTo` helper on the detail page,
and the list cards still link only to the detail page. `?game=` sits beside it
for the one thing a FEN cannot carry — see *Handing a game on* above.

## Saving a game against the engine

A game played on `/engine/play` is written to `localStorage` **as it is played**,
and `/engine/saved` lists what has been written. There is nothing to click:
a game is worth keeping by the fact of having been played, and a reader who has
to remember to save is a reader who loses a game.

```
usePlayWithEngine ──game + settings──▶ savedGameOf() ──▶ saveGame() ──▶ localStorage
   (an effect, on every move)          (lib/savedGames)   (…GameStore)        │
        ▲                                                                     │
        │                                                        useSavedGames()
   ?saved=<id> ◀── SavedGames.tsx ◀──────────────────────────────────┘
   (resume: moves + side + settings)      │
                                          └── ?game=engine/saved/<id> ─▶ Analysis Board / Load PGN
```

Five decisions hold it together:

- **A saved game is a PGN and the settings it was played under.** Not a
  serialised `Game`: a `Game` is a *walk*, carrying a FEN per half-move, so
  writing the object out would store a position per move for no gain. PGN is the
  format this app already parses in two directions, so a record round-trips
  through `parsePgnGame` exactly as a pasted game does and survives the next
  version of the app. `gameToPgn` (`lib/gameTree.ts`) is the writer that was
  missing, and it is `treeToPgn` over the one-line tree rather than a second copy
  of the numbering rules. The **settings ride beside** the PGN because resuming
  has to put the *engine* back: a game played at Skill Level 3 from the Black
  side is not the same game once it continues at level 20 on White. A tag pair
  says what the game was; these say how the next move gets made.
- **A saved game is a `LibraryCatalog`, so `?game=` already worked.** Handing one
  to the Analysis Board or Load PGN is the reference hand-off those screens take
  (`?game=engine/saved/<id>`), and the only cost was one entry in
  `catalogsByKey`. Resuming is `?saved=<id>` instead, for the one thing a
  `LibraryGame` cannot carry — it is moves, and playing on needs the settings
  too. Nothing browses that catalog: `/engine/saved` is its own screen under the
  Engine folder, because these are the app's own output rather than a shipped
  library.
- **The id is the game, and "New game" mints a new one.** Saving on every move is
  one growing row because the id is stable for the life of a game, resume
  included — `saveGame` replaces in place. Starting a new game clears the id, so
  the one just abandoned stays in the list rather than being overwritten, which
  is the whole difference between a saved game and an autosave slot.
- **The write is idempotent, because the writer is an effect.** Mounting a
  resumed game re-saves it, and the settings clamp fires again once the engine's
  option handshake lands; `saveGame` compares against what is stored and does
  nothing when the PGN and the settings both match, so opening a game does not
  re-order a list sorted by when each was last played.
- **A saved game's card previews where it was left, not where it began.** This
  is the one place the screen parts company with `LibraryList`, whose cards read
  `libraryItemFen` — a game's *first* position, because that is where a replay
  starts. A saved game is not a game to replay from move one; it is one to pick
  back up, so the board shows what the reader will be looking at a click later
  (`finalFenOf`). The card also names the opening the game reached — the
  **deepest** position along it the eco.json book names (`openingOfLine` in
  `lib/openings.ts`), because "King's Pawn Game" is true of every 1. e4 game and
  says nothing about which of the reader's games this is. The list view is
  unchanged and carries no opening: its one caption line is already four facts
  wide.
- **Masked Pieces does not save.** It runs `usePlayWithEngine` verbatim and the
  game underneath would serialise perfectly well — but a saved game is resumed on
  `/engine/play`, where the mask does not exist, so it would come back with its
  costume gone. `persist` is therefore a `PlayWithEngineStart` field passed by
  one screen, rather than the store learning what a mask is.

**And a way back out.** The list view carries a checkbox per row and a
select-all plus a download in the top bar: pick some games, get one `.pgn`
holding them (`lib/pgnExport.ts`). It is here and nowhere in `views/library/`
because these are the only games in the app that exist **nowhere else** — a
shipped study is a file in the repo and an uploaded one is a file the reader
has, but a game against the engine lives in this browser's `localStorage`.
Two rules: it is the **list view only** (a checkbox will not fit a 160px card's
footer, and switching view drops the selection rather than leaving a count for
rows nobody can see), and the file is a **join of the stored PGN**, so a record
this build cannot read still exports intact — which is why such a row is still
selectable. The Saved analyses screen carries the same control over the same
helper.

The storage layer is one shared factory (`lib/recordStore.ts`), built the way
the uploads store first had it: a versioned key, a revision stamp so a snapshot
is cheap, non-throwing reads and writes, and a `useSyncExternalStore` binding in
the view layer — see `lib/recordStore.ts` for the scaffolding's reasoning, which
is not repeated in the store files. It caps the
list at `MAX_SAVED_GAMES`, because a game is written on every move and an
unbounded list would fill the origin's quota over a few evenings.

## Saving an analysis board

A board worked on at `/tools/analysis` is written to `localStorage` **as it is
worked on**, and `/tools/analysis/saved` lists what has been written. It is the
section above again — the same three-way split (`lib/savedAnalyses.ts`,
`lib/savedAnalysisStore.ts`, `views/tools/analysis/saved/useSavedAnalyses.ts`),
the same "nothing to click", the same idempotent write, the same
`useSyncExternalStore` binding, the same cap. Only what is **different** is
written out here; everything else is stated once, up there.

```
useAnalysisBoard ──tree + where + settings──▶ savedAnalysisOf() ──▶ saveAnalysis()
   (an effect, on every move and every step)   (lib/savedAnalyses)         │
        ▲                                                                 ▼
   ?analysis=<id> ◀── SavedAnalyses.tsx ◀── useSavedAnalyses() ◀─── localStorage
   (reopen: tree + node + orientation + settings)  │
                                                   └── ?game=analysis/saved/<id> ─▶ Load PGN
                                                   └── ?fen= at the node ─────────▶ Play with Engine
```

Three things are different, and they are the whole of it:

- **The record is a tree, so it is `treeToPgn` out and `parsePgnTree` back.** A
  saved game is one line and goes through `gameToPgn` / `parsePgnGame`; side
  lines are the one thing this screen exists for, and `chess.js` `loadPgn`
  discards `( … )`. It is still PGN for every reason it is there.
- **Where the reader was standing is part of the record, and it travels as
  SAN.** A game is resumed at its last move because that is the only position it
  can be played on from; a tree has no such position — the reader may have been
  three moves deep inside a variation. A node id would not survive the PGN round
  trip (ids are minted per tree), so the path is `sanPathTo` out and
  `nodeAtSanPath` back (`lib/gameTree.ts`), which stops at the last move it
  recognises rather than giving up. The card previews that position and the
  reopened screen opens on it — the counterpart of a saved game's `finalFenOf`.
  The orientation rides along for the same reason: coming back to your own
  analysis should not turn it around.
- **Nothing is written until the reader has done something.** Play with Engine
  can save from the first move because a move is what that screen is; this one
  is also where every library game is *read*, so writing on arrival would fill
  the list with everything anyone ever opened. The gate is a `dirty` flag set by
  `applyMove` — and only when `addMove` actually grew the tree, since replaying
  a line that is already there is following it, not analysing it — and by
  `loadTree`, which is a PGN or a FEN the reader deliberately loaded. A reopened
  analysis starts dirty, because it is already a record and walking around it is
  worth writing down.

Two things are deliberately the *same*: `loadTree` and the Engine tab's "New
board" drop the id, so the analysis being left stays in the list rather than
being overwritten (a saved analysis, not an autosave slot); and the `?game=`
hand-off cost one entry in `catalogsByKey` and nothing else, so Load PGN never
learns this screen exists.

## Saving an opening

A position explored on `/openings` is written down **when the reader asks to
keep it** — the save prompt names it with a note and files it under a folder —
and `/openings/saved` lists what has been written, filed into the reader's tree
of folders (CTA-40). It is the two sections above again — the same three-way
split (`lib/savedOpenings.ts`, `lib/savedOpeningStore.ts`,
`views/tools/openings/saved/useSavedOpenings.ts`), the same idempotent write,
the same `useSyncExternalStore` binding, the same cap — and its list screen is
the Saved analyses screen again over the shared view machinery
(`views/shared/savedList.ts` and the three `SavedList*` components beside it).
Only what is different is written out here; everything else is stated once, up
there.

```
useOpenings ──tree + orientation + note + folder──▶ savedOpeningOf() ──▶ saveOpening()
   (the save prompt's onSave)                       (lib/savedOpenings)        │
        ▲                                                                      │
        │                                                         useSavedOpenings()
   ?openings=<id> ◀── SavedOpenings.tsx ◀───────────────────────────────────────┘
   (reopen: tree + orientation + note + folder)   │
                                                  └── ?fen= at the end of the mainline ─▶ Play with Engine
```

Four things are different, and they are the whole of it:

- **The record is the whole tree as PGN, with a note and a folder beside it.**
  Side lines are what an opening explorer keeps, so it is `treeToPgn` out and
  `parsePgnTree` back — the saved analysis' record for the same reason. What it
  does **not** carry is a place in the tree or engine settings: an opening
  reopens at the **end of its mainline** — the position the reader goes on
  playing from — and there is nothing else to restore but the orientation,
  which rides along for the same reason it does on an analysis.
- **The note is the name, and it is edited in place.** A position begun from an
  empty board carries no players to name a row after, so the record carries the
  reader's own one-line name instead — prompted at save time, changed afterward
  on the Saved openings screen. `updateSavedOpeningNote` is that write, and it
  keeps the record's place in the list rather than moving it to the top:
  editing a name is not "working on" the opening.
- **The folder is a second record in a second store.** `OpeningFolder`
  (`lib/savedOpeningFolders.ts`) is a name and a parent id — not an opening,
  which is the whole reason it is a separate record. What joins them is
  `SavedOpening.folderId`, a plain id, `null` meaning **Unfiled** — the state a
  pre-folder record is already in, which is why `folderId` arriving as anything
  else reads as `null` and there is no version bump. The CRUD lives in
  `savedOpeningFolderStore.ts` because every caller must mean the same thing: a
  move can never make a cycle (the store refuses the folder's own subtree), and
  a delete never orphans anything — `removeOpeningFolder` re-parents
  sub-folders and files the openings back to Unfiled in one write-through.
- **A pick persists across folder navigation.** The Saved openings list screen
  is the shared machinery, and this is the one place it behaves differently
  from the other two: its select-all works on the rows on screen and **adds**
  them to the picks (unchecking removes just these), the chip counts the whole
  picked set wherever the reader is standing, and each folder row and card
  carries a download of the whole subtree — one `.pgn` of everything under
  that folder, the same set its count stands for, named from the folder's own
  name, slugified.

**And there is no `?game=`.** The saved games and saved analyses are presented
as `LibraryCatalog`s, so the reference hand-off already took them; a saved
opening is not one, because nothing replays it. The Openings screen goes on
exploring it, so what travels is the id (`?openings=<id>`) beside the position
hand-off (`?fen=` at the end of the mainline, for Play with Engine). The
Openings screen itself takes `?fen=` as its arrival the way the three board
screens do, validated with `parseFen` and taken as initial state.

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
| Data | `navFolders()` + `navItems()` | The folder tree (`{ id, labelKey?, label?, icon, children? }`) and the screens, each naming its `folder`. Mostly authored; the User PGNs subtree is spliced in from the generator below. **Functions**, because that subtree grows a folder when the reader uploads a `.pgn`. |
| Generator | `navFromLibrary.ts` | A folder plus one list screen per category of a library catalog, at any depth, named from the data. Run over the `.pgn` files under `src/data/pgn/`. Ids are namespaced (`user-pgns:studies`) so a generated one cannot collide with an authored one. |
| Builder | `navTree.ts` | Pure `buildNavTree` — sub-folders before that folder's own screens at every level — plus `folderPath` (a screen's breadcrumb, and the chain the sidebar opens), `folderChain` (the same for a folder id, itself included), `navLabel` (catalog key *or* data label) and `navLabelKeys` (only the keys). |
| Renderer | `Sidebar.tsx` | A recursive `TreeRow`. Folders are `aria-expanded` toggles, screens are links. |

Consequences worth knowing:

- **Nesting a folder is a data edit.** Add it to `navFolders` (at any depth),
  give it a `labelKey` present in both catalogs, and point screens at it. The
  renderer already recurses — `navTree.test.ts` and `Sidebar.test.tsx` both
  carry fixtures nested deeper than anything shipped.
- **A folder does not have to be written out at all.** The User PGNs section's
  folders are built from its catalog and carry a `label` rather than a
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
  tree (the landing page, `/pgn/<folder>/<id>`) has no chain of its own and
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