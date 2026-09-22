# chessapp-analyze-v1

A Vite + React 19 + TypeScript chess trainer. Its board screens — Play with
Engine, Masked Pieces, the Analysis Board, the Openings explorer, the
repertoire player and the Library's game board — sit inside one
app shell, reached from a plain landing page at `/`. The boards themselves
are `react-chessboard` v5 driven by `chess.js` and a Stockfish WASM worker.

Board work has its own rules — [`.claude/rules/chessboard.md`](.claude/rules/chessboard.md)
holds the project conventions and, in its §0, the index to everything else.
The `react-chessboard` options API and type reference are loaded every session
alongside it; the full upstream docs and all 53 Storybook examples are vendored
under [`docs/vendor/react-chessboard/`](docs/vendor/react-chessboard/) for
on-demand reading. **Never read `node_modules` source or web-search for a
react-chessboard question** — it is already on disk.

A **new** board screen is not written from scratch any more: it is composed
from the unified board core specified in
[`.claude/rules/chessboard-v2.md`](.claude/rules/chessboard-v2.md) (CTA-60) —
a base hook, optional capability modules, and one slotted shell/panel layer.
Every game board is on it now: the **Analysis Board** since CTA-73, **Play
with Engine** since CTA-74 (see *Playing against the engine* below), the
**Library's** game board from the start (CTA-75 — see *The Library* below),
the **Openings explorer** since CTA-78 (see *Exploring an opening* below), the
repertoire player (CTA-61/63) and, since CTA-79, **Masked Pieces** — the last
pre-v2 screen, rebuilt as Play with Engine's screen in a costume (see *A mask
is a costume, never a rule* below). The **position editor**, which holds a
position rather than a game, is the one board that is not — a shared
component the Lobby hosts (CTA-83, which removed the old Board Editor screen;
[`.claude/rules/position-editor.md`](.claude/rules/position-editor.md)).

The **Library** of game collections (`/library`) has its own path-scoped
reference, [`.claude/rules/game-collections.md`](.claude/rules/game-collections.md),
which loads when you work on its files, and so do the **Openings explorer**
(`/openings`, the opening book and the Analysis hand-off),
[`.claude/rules/openings-explorer.md`](.claude/rules/openings-explorer.md),
and **Masked Pieces** (`/engine/masked`, `lib/pieceMask.ts` and the played
game's costume), [`.claude/rules/masked-pieces.md`](.claude/rules/masked-pieces.md).

**Where the reader's data is kept** — every store, all of them **IndexedDB**
(one database per module: `chessapp.engine`, `chessapp.analyses`,
`chessapp.repertoires`, `chessapp.library`), the shared connection helper
`lib/idb.ts` and record-store factory `lib/idbRecordStore.ts`, how screens
wait for a store's first read, how to test and extend it, and when a wrapper
library (Dexie) would be worth adding — is
[`.claude/rules/database.md`](.claude/rules/database.md), which loads when you
work on the stores. **Data never goes to `localStorage`**; only the theme and
language preferences live there.

How such a screen **shows its game tree** — the move list with its side lines,
the map, the comments, the next-move arrows — is not wired inline either: it
attaches a **tree view** from the shared explorer in `src/views/explorer/`,
specified in [`.claude/rules/tree-views.md`](.claude/rules/tree-views.md)
(CTA-72) — one seam (a `TreeViewSource` in, `TreeViewParts` out), a mode per
hook, the rich variations explorer built and the flat and puzzle modes
specified. The repertoire player, the Analysis Board, Play with Engine and
Masked Pieces, the Library's game board and the Openings explorer are built on
it.

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
| **Wire a PGN collection into the Library** | `node scripts/wirepgn.js path/to/file.pgn` (or `yarn wirepgn …`; `--list`, `--check`, `--rebuild`, `--remove <id>` — see *The Library* below) |
| Coverage | `npx vitest run --coverage` |

Tests are Vitest + Testing Library on jsdom. `src/test/setup.ts` stubs
`matchMedia` (jsdom has none, and MUI's color-scheme provider reads it), gives
jsdom an IndexedDB (`fake-indexeddb`), and between tests clears
`localStorage`, lets every store's writes land, resets the stores and deletes
their databases (`.claude/rules/database.md` §7 — including why fake timers
must leave `setImmediate` real).

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
| `src/views/main/` | The app shell — `Layout.tsx` (header + sidebar + board area; the nav rail and the right-hand panel are fixed-width, and the board square is what is left over — less a 16px gap between the square and the panel, `BOARD_PANEL_GAP_PX`, since CTA-82), `rightPanel.tsx` (the route-fillable panel slot), `Sidebar.tsx`, the nav registries (`navItems.ts`, `navFolders.ts`, `navTree.ts`), and the XState `service.ts`. |
| `src/views/home/` | The landing page at `/` — no board, just a card per screen built from `navTree()`. |
| `src/views/shared/` | The panel pieces the game screens share: `MoveList.tsx`, `BoardControls.tsx`, `GameInfo.tsx` (a game's PGN tag pairs), `useGameNavigation.ts`, `EvalBar.tsx`, `BestVariations.tsx`, `PromotionPicker.tsx`, `OptionSlider.tsx`, `CopyableValue.tsx`, `CurrentOpening.tsx` (the live opening line every game screen's panel carries — the eco.json lookup at the position on screen, its ECO chip linking to `/openings?fen=`; it replaced the per-screen "Open in Openings" buttons), `EngineBoardSquare.tsx` (the eval bar + board + promotion picker the two engine-play screens both render), and `CapturedPieces.tsx` (one captured-pieces strip — the pieces a side has taken and the material diff beside the side that is ahead; the screens compose two around their board, and the height constants the square-ness arithmetic needs live beside it). Beside them, the **saved-list view machinery** the saved screens (Saved analyses, Repertoires) consume: `savedList.ts` (the pure half — the `SavedListView` type, the board-view grid styles and the caption date/join helpers), `SavedListViewToggle.tsx` / `SavedListExportBar.tsx` / `SavedListRemoveButton.tsx` and `useOpeningBook.ts`. These take each screen's own catalog block (`labelKey`) and test-id prefix rather than keys of their own, because the screens' tests are the contract on the rendered words and ids — a deliberate difference from the pieces above, whose keys are top-level (`moveList.*`, `variations.*`, `promotion.*`, `engineOption.*`, `board.*`, `copyable.*`, `masking.*`). All of them take props and know nothing about which screen is rendering them. |
| `src/views/engine/play/` | **Play with Engine** — since CTA-74 a v2 screen: the core, the engine module, the shared Play toggle and the variations explorer, composed (see *Playing against the engine* below). **`PlayScreen.tsx` is the screen** — the slots, the header, the tabs, the URL (`?saved=<id>` once written) — shared since CTA-79 with Masked Pieces through its optional `masking` prop; `PlayWithEngine.tsx` is the route (the arrival, and a masked game's `?saved=` sent on to `/engine/masked`). **No nav entry since CTA-82** — it is reached from the Lobby's Start button, Continue, and the `?fen=` hand-offs; the route stays. **The session is `usePlayGame.ts`** — core + engine + `usePlayToggle` (Play on from the start) + the autosave to `lib/playedGameStore.ts` — with `arrivalOf` (`?fen=` / `?saved=` and, since CTA-82, a new game's options — `side`, `skill`, `depth`, `movetime`, `lines`, `threads`, `hash`, `evalbar`, read by `lib/newGameLink.ts`). `EngineSettings.tsx` is the Engine tab (strength, limits, lines, the eval bar; the side and a new game are the header's side toggle and Replay; the header also carries Resign) — and the body of the Lobby's new-game form. |
| `src/views/engine/games/` | **The Lobby** (`/engine/games`; Saved games in CTA-74, a lobby since CTA-82) — the board square holds Play with Engine's games, **flat and newest first**, no folders: `PlayedGames.tsx` (a row per game, titled by its pairing — "Human - Stockfish level 10", White first — with its length, side lines, PGN result and date; Continue `?saved=<id>`, Analysis `?game=play/games/<id>`, a delete that asks first; a **colour** filter — the side the reader played — and an **opening** filter — the deepest eco.json match along each mainline, `openingOfLine`, the book loaded lazily — combined, in the URL as `?color=` / `?opening=`) and `usePlayedGames.ts`, the `useSyncExternalStore` binding. The right-hand panel is `NewGameForm.tsx`: the side (White / Black / Random) over `EngineSettings` itself (fed by a `useEngineModule` that handshakes and never searches), from the defaults on every visit, and a full-width **Start** — `/engine/play?` + `newGameParams` (`lib/newGameLink.ts`). Since CTA-83 the form is two tabs — **Game** (the side and `EngineSettings`) and **Board editor** (the shared `PositionEditor`, its state the form's) — with Start and the storage note below both: a position other than the standard start rides on Start as `?fen=` (the Game tab says so and resets it), and Start is off, saying why, while that position cannot be played from. |
| `src/views/shared/folders/` | **The saved lists' folder components** — `SavedFolderViews.tsx` (a folder row and card), `SavedFolderBreadcrumb.tsx`, `FolderNameDialog.tsx` / `FolderMoveDialog.tsx` / `FolderDeleteDialog.tsx` and `FolderPicker.tsx`, over `lib/savedGameFolders.ts`'s `GameFolder`. Moved here from the deleted Saved games (old) screen (CTA-74); the Saved analyses screen, its settings screen and its save dialog use them, each passing its own `labelKey` and test-id prefix. |
| `src/views/engine/masked/` | **Masked Pieces** (`/engine/masked`, v2 since CTA-79; full reference [`.claude/rules/masked-pieces.md`](.claude/rules/masked-pieces.md)) — Play with Engine with the piece graphics in disguise. `MaskedPlay.tsx` is the route and the costume's state (the mask, the notation switch, the engine-lines switch, off) and renders **`PlayScreen` with a `masking` prop** — no hook of its own, no fork; `MaskEditor.tsx` is the Masking tab's editor. Its games are the played games, with the costume on the record. |
| `src/views/shared/positionEditor/` | **The position editor** (CTA-83; full reference [`.claude/rules/position-editor.md`](.claude/rules/position-editor.md)) — a board a position is set up on, as one screen-agnostic component: `PositionEditor.tsx` (the legality report, the two spare-piece palettes and the board inside a `ChessboardProvider`, pinned LTR, the resets, and the Position / FEN / PGN forms) over the state in **`usePositionEditor.ts`**, which the **host** owns (so it survives a tab switch, and the host reads `fen` / `problems`); `PositionFields.tsx`, `FenSetup.tsx`, `PgnSetup.tsx` and `PiecePalette.tsx` under it, each taking the host's test-id prefix; keys `positionEditor.*`. No router, no hand-off. Hosted by the Lobby's Board editor tab; the Analysis Board is the next host. It replaced the old Board Editor screen, deleted in CTA-83. |
| `src/views/tools/analysis/` | **The Analysis Board** — since CTA-73 a v2 screen: the core, the engine module and the shared variations explorer, composed (see *Saving an analysis board* below). `AnalysisBoard.tsx` is the screen — the arrivals (`?fen=`, `?game=` + `?move=`, `?analysis=`, and the `?at=` permanent link it writes back), the slots, the URL; **the session is `useAnalysisBoard.ts`** — the core and the engine (which plays the opponent's best move only while the header's Play toggle is on — a step back pauses it), and the saved record with its baseline: Save / Update / Save as copy / Discard, the Load tab's new boards; `AnalysisLoad.tsx` (the Load tab: a PGN by file or paste — one game, or several merged or split — or a FEN), `AnalysisExport.tsx` (the Export tab: FEN, PGN with or without comments / NAGs / side lines, download), `SaveAnalysisDialog.tsx` (a new board's name and folder), `AnalysisSettings.tsx` (the Engine tab, also the repertoire player's). The folder also keeps what other screens import: `useTreeNavigation.ts` (the core's navigation), `NextMovesBar.tsx` / `nextMoveArrows.ts` (the explorer's). Since CTA-75 `useAnalysisSession.ts` is the session's shareable half — core, engine, Play and the baseline — which `useAnalysisBoard`, the Library's game board and the Openings explorer compose. Since CTA-78 the board also takes a **whole tree handed over** in the router's location state (`lib/analysisHandOff.ts`; [`openings-explorer.md`](.claude/rules/openings-explorer.md) §5). |
| `src/views/tools/analysis/saved/` | The Saved analyses screen — the analyses saved on the board above, newest first, filed into a nested tree of folders (CTA-73; `?folder=<id>` is where the reader stands, and a split on the board lands there), as a list **or** as preview boards at the saved lists' two card sizes (`views/shared/cardSize.ts`). `SavedAnalyses.tsx` is both views — laid out as the Repertoires list without its Games menu: an **Open** button (the card's board), the settings gear and a checkbox on every row and card, deleting in bulk from the export bar in every view; no Play with Engine button — and the folder browsing and CRUD, over the shared folder rows, cards, breadcrumb and dialogs (`views/shared/folders/`, which take a `labelKey` and a test-id prefix); `useSavedAnalyses.ts` / `useAnalysisFolders.ts` the `useSyncExternalStore` bindings. |
| `src/views/openings/` | **The Openings explorer** (`/openings`; full reference [`.claude/rules/openings-explorer.md`](.claude/rules/openings-explorer.md)) — since CTA-78 a v2 screen composed like the Library's game board, with no behaviour hook of its own: `OpeningsBoard.tsx` composes `useAnalysisSession` (core, engine, Play), `useOpeningBookModule` (eco.json's continuations from the position on screen) and the variations explorer; `OpeningBookList.tsx` is the Book tab (a click plays a move, from any node); `openingArrows.ts` joins the tree's next-move arrows and the book's into the board's one arrow set. Nothing is saved; the header hands the whole tree to the Analysis Board. See *Exploring an opening*. |
| `src/lib/engineSettings.ts` | **The engine knobs a game is played under** — `EngineSettings`, its defaults, `ENGINE_SETTING_BOUNDS` (the Engine tab's fallback ranges, and what a new-game link is clamped into), the `SETTING_UCI_OPTION` table with `uciOptionsOf` / `withClampedUciOptions` (the settings as the engine module takes them, and back once clamped) and `approximateElo`, plus the non-throwing `engineSettingsFrom` a stored record is read back through. In `src/lib/` because a played game records them. |
| `src/lib/analysisSettings.ts` | **The engine knobs an analysis is worked under** — `AnalysisSettings`, its defaults, `ANALYSIS_UCI_OPTION` and the non-throwing `analysisSettingsFrom`. The same move for the same reason as the file above: a saved analysis records them, and every consumer imports them from here. |
| `src/lib/engine.ts` | The Stockfish worker wrapper: search, UCI option discovery, and the protocol discipline that keeps the engine alive (see the chessboard rules §4). |
| `src/lib/engineAnalysis.ts` | Reading the engine's numbers: `scoreFromUci` (the one place a score is normalised to White's perspective), `formatScore`, `evalBarFraction`, `pvToSan`, `variationNumbering`, plus the `Analysis` / `EngineLine` shape both engine screens collect into and the `withEngineLine` fold. Pure. |
| `src/lib/gameModel.ts` | **The shared game model** — `Game` / `GameMove` / `GameHeaders`, plus `gameTag` / `initialFenOf` / `finalFenOf` and the `gameFromChess` snapshot. One *line* of play; all three game screens speak it. |
| `src/lib/gameTree.ts` | **The variation tree** — `GameTree` / `VariationNode`, `addMove` (the branch), `mainline` / `lineOf` / `pathTo` / `fenAtNode`, `treeToPgn` (since CTA-73 with optional `PgnExportOptions` — comments, NAGs, side lines — through the pure `exportedTree`, the Analysis Board's Export tab), the variations explorer's edits (CTA-64: `promoteVariation` / `makeMainline` / `deleteFrom`, immutable and id-preserving, plus `isInSideLine`, `subtreeCounts` and `linePgn`, the one line to a move as PGN), the PGN annotations a node and a tree carry (CTA-69: optional `comments` / `preComments` / `nags`, written back by `treeToPgn`, joined by `mergeTrees`), and the `treeFromGame` ⇄ `mainlineGame` bridge that makes a `Game` a walk over a tree. Also `gameToPgn`, the **linear** game's writer, which is `treeToPgn` over the one-line tree rather than a second copy of the numbering and `SetUp`/`FEN` rules. Read the next section before touching it. |
| `src/lib/pgn.ts` | PGN ingestion only: text in, a `Game` (`parsePgnGames`, mainline only — what `chess.js` gives) or a `GameTree` (`parsePgnTrees`, side lines kept) out. |
| `src/lib/fen.ts` | FEN ingestion: `parseFen` validates and normalises a pasted position, or throws `FenParseError`. |
| `src/lib/positionEditor.ts` | A position *being edited*: `fenFields` / `fenFromFields` (the six fields apart and back together, which is what makes the editor's side-to-move, castling and en passant controls round-trip), `enPassantOptions`, and `positionProblems` — **non-throwing** legality reporting, because a half-edited board is illegal by definition. Pure. |
| `src/lib/gameNavigation.ts` | Walking a `Game`: `clampPly` / `fenAtPly` / `squareStylesAtPly` (the lichess-style last-move highlight, with `lastMoveSquareStyles` — CTA-48 replaced the old from→to arrow) / `moveRowsOf`. A ply is a half-move index, 0 being the starting position; each ply's FEN is read off the move that already carries it, so nothing re-simulates a game. |
| `src/lib/capturedPieces.ts` | **The captured-pieces strips' data** — `capturedOfLine` (the history-based walk: each move's optional `captured` names the piece type it took, so a promoted pawn is never a capture — the lists are never a FEN-diff), the per-side lists strongest first, `materialDiff` (the pieces each FEN carries relative to the line's own start, so a promotion is a gain for the side that made it) / `diffForSide`, and `capturedSummaryOf`, the one seam every play/analysis board composes. Pure. |
| `src/lib/pieceMask.ts` | **Piece masking** — the `PieceMask` (true type → the type drawn in its place, all twelve), the presets, `isMasked`, `maskedPieces` (the board's `options.pieces`), `maskSan` / `maskSanLine` / `maskNodeSan` (the notation — a tree's node since CTA-79) and `pieceMaskFrom` / `samePieceMask` (a stored mask read back strictly). Pure, and the only place the mask exists. [`.claude/rules/masked-pieces.md`](.claude/rules/masked-pieces.md) §3. |
| `src/views/library/`, `src/lib/{libraryCollections,libraryCollectionStore,shippedCollections,collectionIndex,openingTree,libraryGameCatalog}.ts`, `src/data/library/`, `scripts/wirepgn.js` | **Game collections — the Library** (CTA-75/76/77): the list, the table with its filters and opening-moves board, uploads and custom collections in IndexedDB, the shipped files and their wiring CLI, and each game on a v2 analysis board. **Everything about it is in [`.claude/rules/game-collections.md`](.claude/rules/game-collections.md)**, which loads when you work on these paths. |
| `src/lib/playedGames.ts` + `playedGameStore.ts` | **The reader's games against the engine** (CTA-74; Masked Pieces' too since CTA-79) — a game is a **tree** (`treeToPgn` / `parsePgnTree` — a move played by hand from an earlier position is a side line), with the `EngineSettings` (`playAs` the reader's side), where the reader stands (SAN from the start), the evals **keyed by FEN** (a ply cannot say which line) and, once resigned, `resigned` (the side that did — `playedGameResult` reads it before the board); a Masked Pieces game also its `mask` (the costume and the notation switch, `PlayedGameMask`, read back strictly — absent is unmasked). Also `resultOfFen` and `playedGameHeaders` (the PGN tags), moved in from the deleted `savedGames.ts`. `playedGameCatalogOf` makes the `?game=play/games/<id>` hand-off. The store is IndexedDB — `chessapp.engine`, object store `games`, over `idbRecordStore` — capped at 100, flat, idempotent — and **only a change of the moves re-orders it**: a new place in the tree, a new eval, new settings or a new mask are written in place with the stored `updatedAt`. Non-throwing throughout. |
| `src/lib/recordId.ts` | **The one record-id minter** — `newRecordId` (the clock plus four base-36 digits, URL-safe), which the played games, the saved analyses and their folders, the repertoires' folders and the Library's collections all mint with. (It was `newSavedGameId` in the pre-CTA-74 `savedGames.ts`, deleted in CTA-79.) |
| `src/lib/savedGameFolders.ts` | **The nested-folder model** — `GameFolder` is a name and a parent id, with the reads over a list of them (cycles cut, dangling parents read as top level; `gamesInFolder` / `gamesUnderFolder` generic over any `FiledRecord`). The saved games it was written for are gone (CTA-74, CTA-79); the model stays as what an `AnalysisFolder` *is*. |
| `src/lib/pgnText.ts` | Small text rules over PGN that several readers share — `slugify` (a download's or a route's slug), `chapterPrefix` (a repertoire chapter's `"N) "`) and `MAX_UPLOAD_CHARS` (3,000,000 — the most one stored text may be; a Library collection, kept in IndexedDB, has its own `MAX_COLLECTION_CHARS`). Pure. |
| `src/lib/savedAnalyses.ts` + `savedAnalysisStore.ts` | **The reader's analysis boards** — what a saved analysis is (the whole tree as PGN, the `AnalysisSettings` it was worked under, where the reader was standing as SAN from the root, which way the board faced, and since CTA-73 the reader's **name** for it and the **folder** it is filed under — a record from before either reads as named by its tags, `savedAnalysisDerivedName`, and Unfiled), how it is written and read back, `splitAnalysesOf` (a many-game text as one record per game), `batchAnalysesOf` (CTA-77: a Library pick as one record per game, each game's PGN kept as the collection holds it), and `savedAnalysisCatalogOf` so `?game=` resolves against it; and the store half — **IndexedDB since CTA-77** (`chessapp.analyses`, over `lib/idbRecordStore.ts`). Every write is a promise and every read the kept snapshot, `undefined` until the first read lands (`loadSavedAnalyses`): `saveAnalysis` (a new board or an Update, newest first, idempotent), `addAnalyses` (a split or a Library batch, all or nothing, refused past the cap of **20,000** — `MAX_SAVED_ANALYSES`, measured at Carlsen-fixture scale: 20,000 records are ~20 MB), `fileSavedAnalysis` / `renameSavedAnalysis` (in place) and `unfileAnalysesIn`, plus `findSavedAnalysisGame` (the `?game=analysis/saved/<id>` resolver, which parses only the record named). The saved games' pair, deliberately, with two differences: `treeToPgn` / `parsePgnTree` rather than the linear writer, because side lines are the point, and a **place in the tree** as part of the record. Non-throwing throughout. |
| `src/lib/savedAnalysisFolders.ts` + `savedAnalysisFolderStore.ts` | **The analyses' nested folders** (CTA-73) — the saved games' folder entity and reads, reused (an `AnalysisFolder` *is* a `GameFolder`), plus `analysesInFolder` / `analysesUnderFolder` / `analysesHere`; and the store — the `folders` object store beside the analyses since CTA-77, every write a promise: create (hands the folder back — a split files under it), rename, move (refusing its own subtree), delete (sub-folders re-parent, analyses become Unfiled). Non-throwing throughout. |
| `src/lib/savedRepertoires.ts` + `savedRepertoireStore.ts` | **The reader's repertoires** (CTA-61) — and the rule that **a repertoire is one game**: a mainline with its side lines. `readRepertoireText` is the one reading a file and a paste share (the size rule of `lib/pgnText.ts` and an emptiness check, line endings normalised, every game parsed as a tree, games with no moves skipped and counted); a text of one game is stored as written (`savedRepertoireOf`), and a text of several is not stored as it is — it is **merged** into one tree (`mergedRepertoireOf`, over `mergeTrees` in `lib/gameTree.ts`: the first game's line the mainline, each later divergence a side line; only when every game shares a start) or **split** into one record per game (`splitRepertoiresOf`, each keeping its own text). A record carries its name (typed, else the tags' `StudyName` / `Event`), `previewFen` (where it first branches), `stats` (moves and side lines, for a caption without a parse), its `settings` (`lib/repertoireSettings.ts` — read back field by field; that file's header is the recipe for adding an option), and the `folderId` it is filed under (`null` is Unfiled). A row from before the rule, still holding several games, is told by `isMultiGameRepertoire` and opens on the choice. The store is IndexedDB — the `repertoires` object store of `chessapp.repertoires` (`lib/savedRepertoireDb.ts`), over `idbRecordStore`, every write a promise — capped at 500 because a split makes a record per game; `addRepertoires` writes a split all-or-nothing, in a replaced record's place when given one, and `updateRepertoireSettings` / `fileRepertoire` edit in place. A tree changed on the board becomes a record through `withRepertoireTree` (the record, its game replaced — Update) or `repertoireCopyOf` (a new record with the original's settings and folder — Save as copy) (CTA-63). Non-throwing throughout. |
| `src/lib/repertoireTrainer.ts` | **The trainer's policy and the session model** (CTA-63) — `TrainerPolicy` (the seam every later trainer is a function of), `playChancePolicy` (CTA-69: by the lichess-tools play chances, `lib/playChance.ts` — the player's and *Get to the end*'s), `pickTrainerMove` (uniform over the repertoire's moves at a node, the random source injectable), `repertoireMovesAt`, the extension fold (`nodeIdsOf` the repertoire as it arrived, `extensionIdsOf` the session tree against it), and game mode's pure half: `judgeDrop` (a drop judged book / wrong / unjudged before it is made) and the `DrillScore` tally. Pure; the move is played by `views/dev/core/useTrainerModule.ts`. |
| `src/lib/playChance.ts` | **Play chances** (CTA-69) — lichess-tools' `prc:N`: reading (`playChanceInText` / `playChanceOf`) and writing (`commentsWithPlayChance`, `setPlayChances`) the mark in a move's comment, the default weight (`linesWithin`, lines in the next 8 plies), the four rules at a branch (`playChances`), `pickByChance`, and `marksFrom` (marks read off the session's tree). Its header is the reference for the rules. Pure. |
| `src/lib/repertoireGames.ts` | **The repertoire games** (CTA-63) — `RepertoireGameId` (`end`, `backtrack`) and the menu's order, `repertoireGamePath`, and Backtracking's pure half: `coverageOf` (uncovered lines under every position — one post-order walk), `backtrackingPolicy` (a `TrainerPolicy` steering to uncovered lines), `requiredMovesAt` (the reader's moves that still lead somewhere new, when that is only some of them) and `backtrackTarget` (where play goes back to when a line ends). A line is a leaf of the repertoire as it arrived. |
| `src/lib/treeMap.ts` | **The tree map's layout** (CTA-63; `lib/repertoireMap.ts` until CTA-72) — `mapLayoutOf` (a column per ply, a row per line, a position on its first child's row, so the mainline runs along the top; which moves are White's), and what is drawn from it: `mapEdgePaths` (split by coverage), `mapDots` (by the side that moved), `mapPathTo` / `mapPathDots` (the way to the reader), `mapLabelsIn` / `visibleRect` (the move labels, culled to the view), and the viewport's `MapView` arithmetic (`zoomViewAt`, `fitView`, `centerView`, `MAP_INITIAL_K`). Pure; `views/explorer/TreeMap.tsx` draws it. Its coverage is the structural `MapCoverage` (Backtracking's `Coverage` is one), so it imports nothing of repertoires. |
| `src/lib/moveAnnotations.ts` | **A position's annotations, read for display** (CTA-69) — `annotationsAt` (the comments before and after the move on screen, or the game's at the start, and its NAGs; `null` when there are none), `readComment` (a comment's prose in paragraphs, through `pgnComments.ts`'s `reflowComment`, and the attributes inside it: `[%key value]` commands and an engine's trailing evaluation), and `nagGlyph`. Pure; the repertoire player's comment block is its consumer. |
| `src/lib/repertoireLink.ts` | **A permanent link to a position in a repertoire** (CTA-63) — `?at=` on `/repertoires/<id>`: `atParamOf` (the moves from the start as comma-joined SAN) and `nodeAtParam` (back to a node, as far as the path still matches). Pure. |
| `src/lib/savedRepertoireFolders.ts` + `savedRepertoireFolderStore.ts` | **The folders repertoires are filed under — one level**: a folder holds repertoires, never another folder, so it has no `parentId` and none of the tree machinery the games' and analyses' folders carry. `repertoiresInFolder` reads a `folderId` naming a missing folder as Unfiled; `sortedRepertoireFolders` orders by name. The store (the `folders` object store of `chessapp.repertoires`; cap 100) is create (hands the folder back) / rename / delete, and a delete **keeps its repertoires** — `unfileRepertoiresIn`, the repertoire store's half, files them back to Unfiled. A **split** makes a folder of its own, named after the text, and files every split repertoire into it. Non-throwing throughout. |
| `src/lib/analysisHandOff.ts` | **A whole tree handed to the Analysis Board** (CTA-78) — `analysisHandOffState` (the tree as PGN, and the orientation, as router location state) / `analysisHandOffOf` (read back, non-throwing), and `lineTreeOf` (one SAN line played from a start — how the Openings explorer turns its `?at=` link back into moves). See [`openings-explorer.md`](.claude/rules/openings-explorer.md) §5. |
| `src/lib/idb.ts` | **The one IndexedDB connection helper** — `idbDatabase(name, version, stores)` → `{ open, remove }`: opened once, the upgrade only adds missing object stores (`keyPath: "id"`, no indexes), steps aside on `versionchange`, reconnects after a failure; `remove` is the tests' delete. Plus `done` / `committed`, a request and a transaction as promises. Every database is opened through it. See [`.claude/rules/database.md`](.claude/rules/database.md). |
| `src/lib/idbRecordStore.ts` + `savedAnalysisDb.ts` | **The IndexedDB record-store factory** (CTA-77; every record store since the engine games and the repertoires moved over) — a list of rows kept as one IndexedDB record per row, with a `seq` beside each for the list's order (a row keeps its own whenever the new order allows, so an edit in place writes one record); the first subscriber or `load()` reads every row once and the list is then handed out synchronously (`undefined` before that); writes are `rows → rows` updates, **queued** so back-to-back writes see each other, answered once committed (`"storage"` on a refusal, the kept list unchanged); `settled()` waits for the queue (the tests') and other tabs hear through a `BroadcastChannel`. `savedAnalysisDb.ts` is the one database both analysis stores share, `chessapp.analyses` (object stores `analyses` and `folders`), as `savedRepertoireDb.ts` is `chessapp.repertoires`'s (`repertoires` and `folders`). Non-throwing. |
| `src/lib/pgnExport.ts` | **Taking games out of the app** — `pgnFileOf` (several stored PGN records joined with a blank line, which is what `splitPgnGames` reads back) and `downloadTextFile` / `downloadPgn`, the blob-URL save. A join rather than a re-write: a saved game *is* PGN already, so nothing is re-parsed and a record this build cannot read still exports intact. |
| `src/lib/gameReference.ts` + `gameCatalog.ts` | **The `?game=` carrier** — `<key>/<path>/<id>`, resolved by `resolveGameReference` against a store's `GameCatalog` (`{ path, games }`, `findCatalogGame`). Three keys: `analysis` (saved analyses), `play` (games against the engine) and `library` (a Library collection's game, `library/<collection>/<n>`). A game does not fit in a URL, so what travels is a reference into a store. |
| `src/views/dev/` | **The unified board core** (CTA-60; the folder is named for the Development section it was built in, which closed with its last boards in CTA-79). `core/` is specified in [`.claude/rules/chessboard-v2.md`](.claude/rules/chessboard-v2.md): the base hook (`useBoardCore.ts` — the `GameTree` as the one game shape, node navigation, the rules oracle, promotion, orientation), the capability modules a board composes rather than is flagged by (`useEngineModule.ts`, whose optional `onBestMove` is the entire Play/Analysis difference; `usePlayToggle.ts`; `useOpeningBookModule.ts`; `useTrainerModule.ts`, the repertoire trainer (CTA-63); `useAutosave.ts`), and the composition layer that had no owner before — `BoardShell.tsx` (over the shared `EngineBoardSquare`, never a second copy of the `calc()`) and `BoardPanel.tsx`, the one panel skeleton and the one pinned best-variations block. **`core/` ships**, imported by every game board. Beside it the tests every v2 board shares: `devTestHarness.tsx` (the `Engine` and `<Chessboard>` stand-ins) and the two propagation tests, `devBoards.test.tsx` and `devPanelPropagation.test.tsx`. (The Development section itself — `/dev/*` boards behind `import.meta.env.DEV`, `devNav.ts`, the dev-prefixed stores of `devStores.ts` — held Analysis, Repertoire, Openings, Play and Masked v2 in turn; each shipped or was retired, and the last two went in CTA-79. `chessboard-v2.md` §5 says how to open it again for a new board.) |
| `src/views/explorer/` | **The shared game-tree views** (CTA-72) — how a board screen shows its tree, specified in [`.claude/rules/tree-views.md`](.claude/rules/tree-views.md). `treeView.ts` is the whole seam (`TreeViewSource` in — `useBoardCore`'s return fits it — `TreeViewParts` out: `moves`, `map`, `annotations`, `nextMoves`, `arrows`, `overlay`, each placed by the screen in its own slot); a **mode** is one hook, and the one built is **`useVariationsExplorer.tsx`**, the rich variations explorer: `TreeMoveList.tsx` (side lines under their moves, comment markers, evals, the extension tint, and — given `onEditTree` — the right-click `MoveContextMenu.tsx` with `CommentDialog.tsx` and `PlayChanceDialog.tsx`), `TreeMap.tsx` (the SVG map over `lib/treeMap.ts`, tab and full screen), `AnnotationsBar.tsx` (the comment block) and `ChanceArrows.tsx` / `chanceArrows.ts` (the play-chance overlay); the next-move arrows and bar are imported from `views/tools/analysis/`. Knows no screen: a saved record, trainer or game arrives as plain options (`playChances: false` hides the menu's *Play chances…* on a board with no trainer). Ships (the repertoire player and, since CTA-73, the Analysis Board are built on it); flat and puzzle modes are specified, not built. |
| `src/views/repertoires/` | **The Repertoires section** (CTA-61) — the reader's own repertoires. `Repertoires.tsx` is the list (`/repertoires`, over the saved-list machinery; a card previews where the repertoire first branches; `?folder=<id>` opens a folder, and `RepertoireFolderViews.tsx` / `RepertoireFolderDialogs.tsx` are the folder rows and cards and the folder name / delete dialogs and the bulk delete's confirm (CTA-68: every row and card carries a checkbox, the shared export bar — its optional `onDelete` — shows in all three views, and deleting is in bulk only), `useRepertoireFolders.ts` their store binding), `RepertoireUpload.tsx` brings one in (`/repertoires/new`, a `.pgn` file or pasted text through **one** function), `RepertoireMergeSplit.tsx` is the merge-or-split choice a text of several games gets (on the upload screen, and on the route of a record saved before the one-game rule), `RepertoireBoard.tsx` is the route of one (`/repertoires/<id>`: the miss, the legacy choice, else the player) and `RepertoireGame.tsx` the route of its games (`/repertoires/<id>/games/<end|backtrack>`), both over **`RepertoirePlayer.tsx`** — the one screen composed from the v2 core that a repertoire is read, drilled and played on (CTA-63; see *Playing a repertoire*), with `useRepertoireGame.ts` (a game's session state), the shared explorer's `useVariationsExplorer` (CTA-72 — its Moves and Map tabs, comment block, next-moves bar and arrows; the Map was `RepertoireMap.tsx`, the comment block `RepertoireAnnotationsBar.tsx`), `RepertoireChangesBar.tsx` (update the repertoire / save a copy / discard, while the session has changes); on a protected repertoire it says so and links to its settings in Update's place and `RepertoireGamesMenu.tsx` (the menu on the player and on every list row and card) beside it — and `RepertoireSettingsScreen.tsx` edits one (`/repertoires/<id>/settings`: a list of sections from `RepertoireSettingsSections.tsx` over one draft, written on Save — the folder it is filed under among them, CTA-68). `useSavedRepertoires.ts` is the store binding; `repertoireTestKit.tsx` the tests' shared mount and fixtures. |
| `src/lib/treeManager.ts` | Read-only tree walks (`traverse` / `toArray` / `collectIds` / `findBy` / `getPath`). The seam for anything tree-shaped: `navTree.ts` and `gameTree.ts` are its consumers. |
| `src/lib/localizedText.ts` | `LocalizedText` (`{ en, he? }`) and `localizedText` — a name carried by data rather than by the locale catalogs, which the nav's `label` accepts. |

## One game model, two producers

A game parsed out of a PGN and a game growing move by move against the engine
are **the same type** — `Game` in [`src/lib/gameModel.ts`](src/lib/gameModel.ts).
That is not a coincidence to be tidied away later; it is what lets the move
list, the ply navigation and the board controls in `src/views/shared/` serve
every linear reading of a game with no branching and no second copy. (Most
board screens hold a `GameTree` — next section — and read a `Game` as its
mainline; since CTA-79 none grows a `Game` move by move any more.)

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
   ▲                                   (a tree's mainline — the move list's cells)
   └──treeFromGame()─────── Game
```

`mainlineGame` is the first-child walk. Both bridges are tested in both
directions, so "the linear reading still works" is an assertion rather than a
hope — which is what let the tree arrive without touching the two shipped
screens.

The rules the whole thing rests on:

- **`children[0]` is the mainline at every level; everything after it is a side
  line.** `mainline`, `lineOf`, `treeToPgn` and the variations explorer are all just that
  one rule applied.
- **Replaying a move that is already there is not a new variation.** `addMove`
  returns the existing node and the *same tree by reference*, so stepping back
  and playing the mainline move again follows the line rather than duplicating
  it, and nothing re-renders.
- **A node id is the navigation state, not a ply.** Clicking a move inside a side
  line does not move along the current line, it changes *which line is current* —
  "ply 3" cannot say that. `useTreeNavigation` therefore holds the id and derives
  the ply, which is what lets the shared `BoardControls` drive a tree unmodified.
- **The keys walk the tree, not only the line** (`useTreeNavigation`, every
  board over a tree — the Analysis Board, the v2 boards, the repertoire
  player and its games): ← / → step along the line, **Home / End** jump to
  its start and end, and **↑ / ↓ cycle through the sibling moves** of the
  move on screen — the other continuations from the same position, in
  `children` order, wrapping around (`siblingOf`); nothing at the start or on
  a move with no alternatives (CTA-69 — they were a second Home / End). With
  the repertoire player's Autoplay on, that is how the reader swaps the
  trainer's reply for another of the file's: a navigation owes no reply, so
  the trainer waits, and the reader's next move sets it going from there.
  The linear screens (`useGameNavigation`) keep ↑ / ↓ as Home / End — a line
  has no siblings.
- **`chess.js` `loadPgn` discards `( ... )` side lines.** So there are two
  parsers: `parsePgnGames` (mainline only) and `parsePgnTrees` (side lines
  kept — every board over a tree), and only the second round-trips with
  `treeToPgn`.

## An editor owns a position, not a game

The **position editor** (`src/views/shared/positionEditor/`, CTA-83) is the one
board with no `Game` and no `GameTree` behind it — a screen-agnostic component
the Lobby's new-game form hosts in its **Board editor** tab, and the Analysis
Board is meant to host next. Its whole reference — contract, invariants,
embedding, tests, recipes — is
[`.claude/rules/position-editor.md`](.claude/rules/position-editor.md), which
loads when you work on its files. It has no moves to hold: pieces are **put and
removed**, never moved by a rule, so its `chess.js` instance is built with
`{ skipValidation: true }` and is a container rather than a rules authority.
Four things follow, and they are the whole design:

- **Illegal is a state, not an error.** You have to be able to take a king off in
  order to put a different one down, so `positionProblems` (`lib/positionEditor.ts`)
  *reports* — no king, two kings, a pawn on the back rank, the side not to move
  already in check — and nothing is refused. The editor switches off only its FEN
  copy button; what takes the position *elsewhere* is the host's and is gated by
  the host (the Lobby's Start). `parseFen` still guards the way **in**: a pasted
  FEN is a claim about a finished position, not a board mid-edit.
- **The FEN is split apart.** Field 1 comes off the board; fields 2–4 are panel
  controls held as `PositionFields`; fields 5–6 are carried so a pasted FEN
  round-trips. Reading *only* field 1 off the `chess.js` instance is what lets
  the side-to-move, castling and en passant controls mean anything — the
  instance keeps its own idea of those, and that idea is what the reader is
  overriding.
- **Spare pieces need `ChessboardProvider`.** It is the one board that cannot
  use a plain `<Chessboard>`: every option goes to the provider instead, because
  a `SparePiece` can only reach the board's drag context from inside it. It
  pins its own board and palettes LTR (`ForceLTR`) — it lives in a panel, not
  under `Layout.tsx`'s board area.
- **It knows no screen.** The host owns the state (`usePositionEditor`) and
  passes it with a test-id prefix; the component imports no router, no
  hand-off and no store. An **initial FEN** (already validated by the host)
  seeds it, turns the board to the side to move, and adds a third reset,
  **"Reset"**, back to it — beside "New board" (the standard start) and "Clear
  board".

A position crosses to the other screens as a **query parameter** —
`/engine/play?fen=…` (the Lobby's Start, `lib/newGameLink.ts`),
`/tools/analysis?fen=…`, `/openings?fen=…` — so it survives being bookmarked,
shared and reloaded, where router state would not. Each screen validates it
with `parseFen` and ignores what will not pass, then takes it as *initial*
state rather than syncing it in an effect: arriving at the URL mounts the
screen, so there is no later change to follow.

Play with Engine reads a little more out of it than the Analysis Board does. A
position with Black to move is one the reader means to play as Black, so with
no `side` on the link the incoming FEN also decides `playAs` and which way the
board faces — otherwise the engine would move the instant the screen opened. A
`side` on the link (the Lobby always writes one) is the reader's choice and
beats it. The position is also what Replay returns to.

**A position turns the board; a game does not.** Every screen faces the side
to move when a *position* arrives — a pasted FEN, a handed-over one, the final
position of a game loaded into the editor — because a position is something you
are about to answer, so the side that has to move is the side you look from.
Loading a **game** deliberately does not: a PGN opens at ply 0, where the side to
move says nothing about which side is being studied. Neither do the editor's
"New board" and "Clear board" resets or its side-to-move field, for the same
reason in reverse — arranging a position is not being handed one, and a
viewpoint the reader chose is theirs.

## The Library: game collections

`/library` holds **game collections**: one PGN text of many games (a
tournament, one player's games), shown as a sortable, filterable **table**,
with each game opening on a **full analysis board**. The full reference —
model, storage, index, screens, URL state, invariants, tests and recipes — is
[`.claude/rules/game-collections.md`](.claude/rules/game-collections.md). What
matters from outside the module:

- **Two sources, one set of screens.** **Shipped** collections are wired with
  `node scripts/wirepgn.js <file.pgn>` (never drop a `.pgn` in by hand;
  `shippedCollections.test.ts` and `wirepgn --check` catch it) and are
  read-only. **Uploaded** ones (a file, a paste, or an empty collection filled
  later with *Add games*) are the reader's own, kept in **IndexedDB**
  (`chessapp.library`).
- **A collection is its PGN plus an index made once**: a row per game, tags
  plus a `chess.js` pass. The table never parses a game. It is sized for
  5,000–10,000 games.
- **A game is addressed by its place**: `/library/<collection>/<1-based n>`.
  It also crosses to the Analysis Board as `?game=library/<collection>/<n>`.
- **Analyse** hands picked games to Saved analyses as one new folder (see
  *Saving an analysis board*).
- It is built for **game** collections. A positions collection is planned;
  the rule file (§10.5) says how it should fit in.

## Handing a game on: `?game=`, beside `?fen=`

A FEN fits in a URL; a game does not. So the game hand-off to the Analysis
Board carries a **reference into a store** — `?game=<key>/<path>/<id>` — and
the board looks the game up for itself (`lib/gameReference.ts`). It keeps
everything the `?fen=` hand-off is good for: a query parameter survives being
bookmarked, shared and reloaded; the destination validates it and ignores what
does not resolve; and it is taken as *initial* state, because arriving at the
URL is what mounts the screen. It is **additive**: `?fen=` was not extended,
wrapped or replaced.

**A reference resolves against a store's catalog** (`lib/gameCatalog.ts`: a
`path` and its games, each with its PGN and that PGN's mainline), and
`catalogsByKey` is the whole of the mapping, with three entries: `analysis`
(the reader's **saved analyses**, `savedAnalysisCatalogOf`), `play` (their games
against the engine, `playedGameCatalogOf`, CTA-74) and `library` (a game of a
Library collection, `library/<collection>/<n>`; see
[`game-collections.md`](.claude/rules/game-collections.md) §6.7). **A line in
that registry is the whole cost of a new producer of games.** A store read
asynchronously makes the Analysis Board wait before it resolves
(`isReferenceRead` / `loadReferencedGames`, and the saved analyses' first
read). (The old Library's `pgn/…` key went with it
in CTA-75, and its `library/<folder>/<id>` links name no collection and number;
such a link resolves to nothing, and the board opens as if `?game=` were not
there.)
The Analysis Board re-reads the referenced PGN with `parsePgnTree`: side lines
are the one thing an analysis board is for.

**A tree in no store travels as location state** (CTA-78): the Openings
explorer's Analysis button hands the Analysis Board a whole explored tree
that no catalog holds, so it goes in the router's state beside `?at=`
(`lib/analysisHandOff.ts`; [`openings-explorer.md`](.claude/rules/openings-explorer.md) §5), read once like the
others. It is the one arrival that does not survive being shared as a link —
which is why `?fen=` and `?game=` stay the carriers for everything that can
be named.

**`?move=` rides beside `?game=`**: the ply the game opens at, taken as
*initial* state as a mainline walk (`useTreeNavigation` seeds the node id,
because its state is a node, not a ply). `parseMoveParam`
(`lib/gameNavigation.ts`) ignores anything that is not a non-negative integer,
and a value past the end of the game is clamped on read.

**A game can also declare its own opening ply: the `StartPly` tag.**
`[StartPly "27"]` in a `.pgn` says the game opens at ply 27 — a puzzle's
position rather than the game's start. The declaration lives in the content,
so an uploaded file declares it exactly as a shipped one does. `initialPlyOf`
(`lib/gameNavigation.ts`) is the one reader: absent, unreadable or past the end
is "no declaration" — ply 0, an out-of-range value ignored whole rather than
clamped. Precedence is one line wherever a game opens: on the Analysis Board
`parseMoveParam(?move=) ?? initialPlyOf(game)`, on a Library game `?at=` first
and then the tag.

## Playing against the engine

`/engine/play` is a v2 screen since CTA-74, built like the Analysis Board —
`useBoardCore` + `useEngineModule` + `useVariationsExplorer` in `BoardShell` /
`BoardPanel` — with the session in `views/engine/play/usePlayGame.ts`. What
is different from the Analysis Board is the whole of it:

- **It is reached from the Lobby** (`/engine/games`, CTA-82). Play with
  Engine has no nav entry: the Lobby's right-hand panel is the new-game form —
  the side (White / Black / Random) and the in-game Engine tab
  (`EngineSettings.tsx`, rendered as it is, over an engine that is
  handshaken for its options and never searches), from the defaults on every
  visit — and its full-width **Start** opens `/engine/play` with the choice
  as query parameters (`lib/newGameLink.ts`): `side` (`white` / `black` /
  `random`, drawn on arrival), `skill` (0–20), `depth` (1–24), `movetime`
  (ms, 0–10000), `lines` (1–10), `threads` (1–4), `hash` (1–256) and
  `evalbar` (`1` / `0`) — and, when the form's **Board editor** tab (CTA-83,
  the shared position editor) holds a position other than the standard
  start, `fen`; Start is off while that position cannot be played from. The
  `?fen=` pattern: bookmarkable, read once by
  `arrivalOf`, **each field on its own** — an absent or unreadable one is its
  default, one out of range is clamped (and the engine module re-clamps the
  UCI options to what the build declares). **Precedence**: `?saved=` beats
  all of it; a `side` beats the side to move of a `?fen=`; with no `side`, a
  `?fen=` with Black to move still sets the reader to Black; no parameters is
  the game it always was. The Lobby's list carries a colour and an opening
  filter.
- **It opens on a new board with Play on.** The standard start, or the
  `?fen=` hand-off (a position with Black to move sets the reader to Black and
  turns the board), the reader on the side at the bottom, the engine on and
  answering. **Play is one shared module** — `views/dev/core/usePlayToggle.ts`,
  lifted out of the Analysis Board so both run one copy: the engine plays only
  the side *not* at the bottom, only while Play is on, and Play pauses on a
  step that is not one move forward, on a **change of side** (the board's flip,
  or the header's White / Black toggle — the reader's side *is* the
  orientation), when the engine is switched off and when the game is over.
  Pressing Play goes on from where the reader stands (at once, if it is the
  engine's turn and a search of that position has finished). The header's
  button and the status line are the Analysis Board's (`PlayToggleButton.tsx`,
  `EngineThinking.tsx`).
- **The header holds the game's controls**: the side toggle, Play,
  **Replay** (start over from the position the game began at — the game's
  saved progress is **discarded**, its record removed; asked first when there
  is anything to lose) and **Resign** (asked first; the reader's side loses —
  `resigned` on the record, the PGN's `Result` and `Termination` — Play stays
  off, the board takes no more moves but can still be stepped through). The
  Engine tab is `EngineSettings.tsx` (strength and limits; the side and a new
  game are the header's).
- **The game is a tree.** No `canMoveAt`: a move by hand from an earlier
  position is a side line there, and Play resumes from it. The explorer shows
  it — Moves, Map, the next-moves bar, the arrows, the move menu (editing on,
  *Play chances…* off).
- **It saves itself.** `useAutosave` writes on every change (no Save button)
  to `lib/playedGameStore.ts`; the id is stable for the life of a game; once
  written, the URL is `?saved=<id>` (history replace), so a reload goes on
  with it. The Lobby, `/engine/games`, lists the games **flat, newest first** — each row
  titled by its pairing, White first ("Human - Stockfish level 10"), with the
  result as PGN writes it (`1-0`, `0-1`, `1/2-1/2`, `*`) — to Continue
  (`?saved=`), open on the Analysis Board (`?game=play/games/<id>`) or delete
  (asked first).

The store's rules, which are what keep an effect-driven writer honest:

- **The write is idempotent**, because the writer is an effect: mounting a
  resumed game, the settings clamp landing and an engine score arriving all
  rebuild the record. `savePlayedGame` does nothing when it is the one
  stored, and **only a change of the moves re-orders the list** — a new place
  in the tree, a new eval, new settings or a resignation's flag without new
  moves are written in place with the stored `updatedAt`.
- **The game's start date is carried**, not re-derived (`usePlayGame` keeps
  `startedAt` and passes it as `savedAt`): it is the PGN's `Date`, and a new
  date would read as a change of the moves on every resume.
- **Masked Pieces' games are these games** (CTA-79): the same screen
  (`PlayScreen`), the same session and store, the record carrying the
  costume (`mask`). Saved games marks one *Masked* and continues it on
  `/engine/masked`; a masked `?saved=` on `/engine/play` is sent there, and an
  unmasked one on `/engine/masked` is sent here — a game belongs to the screen
  it was begun on. See *A mask is a costume, never a rule*.

The pre-CTA-74 list (`/engine/saved`, linear games in folders) was deleted
with its screen, its folder store and its `?game=engine/…` key; its linear
record (`lib/savedGames.ts` / `savedGameStore.ts`) and the pre-v2 hook that
wrote it (`usePlayWithEngine`) went with the old Masked Pieces in CTA-79.
`lib/savedGameFolders.ts` stays because the analyses' folders are that model.

## Saving an analysis board

A board worked on at `/tools/analysis` is saved **when the reader says so**
(CTA-73), and `/tools/analysis/saved` lists what has been saved, filed into a
nested tree of folders. It is the saved games' three-way split again
(`lib/savedAnalyses.ts`, `lib/savedAnalysisStore.ts`,
`views/tools/analysis/saved/useSavedAnalyses.ts`), the same idempotent write,
the same `useSyncExternalStore` binding. Only what is **different** is written
out here.

```
AnalysisBoard ─ Save (a new board: name + folder) ─┐
   useAnalysisBoard ─ Update / Save as copy ───────┼─▶ savedAnalysisOf() ──▶ saveAnalysis() ──▶ IndexedDB (CTA-77)
   Load tab ─ split (a folder of analyses) ────────┘   (lib/savedAnalyses)    addAnalyses()        │
        ▲                                                                                          ▼
   ?analysis=<id>[&at=…] ◀── SavedAnalyses.tsx (folders: ?folder=<id>) ◀── useSavedAnalyses() / useAnalysisFolders()
   (reopen: tree + node + orientation + settings)     (the ?game=analysis/saved/<id> reference still resolves)
```

What is different, and it is the whole of it:

- **The record is a tree, so it is `treeToPgn` out and `parsePgnTree` back.** A
  saved game is one line and goes through `gameToPgn` / `parsePgnGame`; side
  lines are the one thing this screen exists for, and `chess.js` `loadPgn`
  discards `( … )`. It is still PGN for every reason it is there.
- **Where the reader was standing is part of the record, and it travels as
  SAN.** A tree has no "last move" to resume at — the reader may have been three
  moves deep inside a variation. A node id would not survive the PGN round trip
  (ids are minted per tree), so the path is `sanPathTo` out and `nodeAtSanPath`
  back (`lib/gameTree.ts`), which stops at the last move it recognises. The
  card previews that position and the reopened screen opens on it; the
  orientation rides along for the same reason.
- **Nothing is written unasked — the repertoire player's rule, not the saved
  games'.** The board used to write itself on every move; it no longer does.
  The session holds a **baseline** — the tree as it arrived, was loaded, or was
  last saved — and `core.tree !== baseline` is the whole of "changed" (every
  edit makes a new tree, and replaying a move that is there does not). Over a
  **record** (`?analysis=`, or once saved), the header's Save lights and opens
  the changes strip (`RepertoireChangesBar`, under this screen's `labelKey`):
  **Update analysis** (the record takes the tree, the place in it, the
  orientation and the settings; its name and folder are the stored ones),
  **Save as copy** ("‹name› (copy)", same folder; the session goes on in it)
  or **Discard** (back to the baseline, on the last of its positions). There
  is no protection. A board with **no record yet** — blank, a `?fen=` or
  `?game=` arrival, a PGN just loaded — saves through a dialog asking a name
  (seeded from its tags) and a folder. A reload with changes unsaved asks
  first. The moves added since the baseline are the explorer's extensions,
  tinted in the list and ringed on the map.
- **A record has settings, edited on their own screen** —
  `/tools/analysis/saved/<id>/settings` (`AnalysisSettingsScreen.tsx`, linked
  from the board's header — off while there are unsaved changes — and from
  every row and card of the list): the title (`name`), a `description` (shown
  under the title on the board), the side the board opens facing
  (`orientation`), whether it opens drawing the next-move arrows
  (`showArrows`, on) and the folder (`folderId`, `null` is Unfiled) — one
  draft, written on Save in place (`updateSavedAnalysisSettings`). A flip or
  the arrows switch on the board is the session's: Update keeps the stored
  settings, and a copy takes the original's; a new board's first save takes
  the side it faces and its arrows switch. A record from before any of them
  reads as its default (named by its tags, Unfiled, no description, arrows
  on), so there is no version bump. The
  folders are the saved games' nested model over the analyses' own store
  (`lib/savedAnalysisFolders.ts`); the list screen reuses the Saved games
  screen's folder components. The cap is **20,000** (CTA-77; it was 30 while
  the board autosaved, 500 while it lived in `localStorage`): nothing
  autosaves, but a split makes a record per game and the Library's Analyse
  a record per picked game, and a collection is sized for 5,000–10,000.
- **The store is IndexedDB since CTA-77**, not `localStorage` (about five
  million characters for the whole origin — about 5,000 games). The analyses
  and the folders are the `analyses` and `folders` object stores of
  `chessapp.analyses` (`lib/savedAnalysisDb.ts`), over
  `lib/idbRecordStore.ts`. Every write is a promise, and a quota refusal is reported
  (`"storage"`), never thrown. Reads are the kept snapshot, `undefined` until
  the first read lands — so a screen that arrives by URL (`?analysis=`,
  `?game=analysis/…`, the settings screen) says it is reading and waits
  rather than calling the record missing. Measured with the Carlsen fixture's
  games (fake-indexeddb, jsdom): 20,000 records are ~20 MB, written in one
  batch in ~0.6 s and read in ~0.1 s.
- **The list is paged, and parsed a page at a time** (CTA-77): 48 analyses a
  page in every view (`SAVED_ANALYSES_PAGE`), each record's tree parsed once
  when its page shows and kept while it is the stored one; the counts, the
  folder downloads and the picks (select-all takes the whole folder) read the
  records unparsed. The first page takes ~0.9 s in jsdom whatever the size
  of the store. `?game=analysis/saved/<id>` parses only the record named
  (`findSavedAnalysisGame`), not the whole store.
- **Loading is a new analysis.** The Load tab reads a PGN the way a repertoire
  is read (`readRepertoireText`): one game goes onto the board unsaved; several
  ask merge or split (`views/shared/MergeSplitChoice.tsx`, the repertoire
  choice's layout) — **merge** puts one tree on the board unsaved, **split**
  saves one analysis per game into a new folder named after the text
  (`addAnalyses`, all or nothing) and takes the reader there
  (`/tools/analysis/saved?folder=<id>`). A FEN is a position: it turns the board.
- **The URL is a permanent link.** `?at=<SANs from the start>`
  (`lib/repertoireLink.ts`) is written back with history replace on every step,
  beside what the board is (`?analysis=<id>` once it is a record, the arrival's
  parameters before that, nothing after a Load); it beats `?move=` and the
  record's own place on the way in.

The `?game=` hand-off still cost one entry in `catalogsByKey` and nothing else.

## Exploring an opening

`/openings` is the **Openings explorer**: an opening played through on a full
analysis board, with eco.json's continuations from the position on screen
beside it. The full reference (composition, the opening book, the URL, the
Analysis hand-off, invariants, tests, debugging and recipes) is
[`.claude/rules/openings-explorer.md`](.claude/rules/openings-explorer.md),
which loads when you work on its files. What matters from outside it:

- **A v2 board with no behaviour hook** (CTA-78): `useAnalysisSession` +
  `useOpeningBookModule` + the variations explorer. Tabs: Book · Moves · Map ·
  Load · Export · Engine.
- **Nothing is kept.** No Save, no folders, no store. The saved openings
  (`/openings/saved`, `?openings=<id>`, `lib/savedOpening*.ts`) were removed
  in CTA-78 with no migration.
- **The Analysis button hands the whole tree on** as router location state
  (`lib/analysisHandOff.ts`), arriving on the Analysis Board as a new unsaved
  board. `?fen=` / `?game=` are unchanged.
- **Takes `?fen=`** (`CurrentOpening`'s
  ECO chip; it turns the board) and **writes `?at=` back**. `/tools/openings`
  redirects here.

## Reading a repertoire

A repertoire the reader brings in at `/repertoires/new` is **one game** — a
mainline with its side lines, the shape the board reads — kept as PGN
(`lib/savedRepertoires.ts`) and read on one v2 board at `/repertoires/<id>` —
since CTA-63 the **player** (*Playing a repertoire*, below).
It is the Saved analyses section again for the list, and Repertoire v2 again
for the board. Only the differences are written out here:

- **A text of several games is not a repertoire as it stands.** A
  Chessable-style export writes each line as its own game (the 2.c3 sampler
  fixture, `src/test/fixtures/pgn/`: 14 games, none with a side line), and a lichess study writes each
  chapter as one. The reader picks: **merge** them into one tree (the first
  game's line is the mainline, each later divergence a side line — the sampler
  becomes one 230-node tree with 13 side lines; only offered when every game shares a start; the file's
  annotations are kept — see the next bullet but one), or **split** them into one repertoire per game, each
  keeping its own text and named by the game, **all filed in a new folder**
  named after the text — and the reader lands inside it.
  `RepertoireMergeSplit.tsx` is that choice, shown on upload and on the route
  of a record saved before the rule, where the result takes the old record's
  place (a merge keeps its id).
- **Folders are one level deep.** The list's top level shows the folders, then
  the Unfiled repertoires; `/repertoires?folder=<id>` opens one, with its
  rename and delete beside its name. Every repertoire moves between folders
  from its settings (the Folder section's tree: Unfiled, and each folder under
  it — CTA-68), each folder downloads as one `.pgn`, and a deleted
  folder keeps its repertoires (back to Unfiled) — the rule every folder in
  the app keeps. There is no nesting to guard: no cycles, no re-parenting.
- **Deleting is in bulk.** No row or card deletes itself: each carries a
  checkbox (the cards too), and the top bar's export bar — select-all, the
  count, the download and a delete — works in every view, the picks kept
  across a view switch. The delete asks first ("Delete N repertoires?") and
  goes in one write (`removeSavedRepertoires`) (CTA-68).
- **Annotations survive the tree** (CTA-69). `parsePgnTree` keeps a file's
  `{ comments }` (and `;` ones), `$N` NAGs and the `!`/`?` marks (read as
  NAGs 1–6) on the tree — `comments` / `preComments` (the text opening a
  variation) / `nags` on `VariationNode`, `comments` (before move 1) on
  `GameTree`, all optional and absent when empty — and `treeToPgn` writes
  them back, so a merge, Update and Save as copy lose none of them, and every
  edit keeps them on the moves that survive. `mergeTrees` keeps a text said
  twice about one move once — whitespace aside (`commentKey`: a course
  wraps one sentence differently in different chapters; the parser drops
  such a repeat on one move too, so an export merged before that reads
  clean) — joins different ones in file order, unions
  NAGs, and hangs each later game's opening comment before the first move
  that game added (the tree's own, when it added none): the 310-game Alapin
  course merges with all ~4,450 comments, less duplicates (2,511 kept). The
  variations explorer marks a commented move with a comment icon
  (`hasComments`: a comment after it or opening its line; `TreeMoveList`
  passes the mainline's plies as `annotatedPlies` and `markCommentedNodes`
  for the side lines — opt-in, so a list that does not ask marks nothing).
  The explorer also prints the engine's evals on the **mainline's cells
  only** (`mainlineEvalsOnly` on `MoveList` → `showEvals={false}` on the
  side-line tokens, which then do not subscribe to the evals at all) — the
  Analysis Board's too, since it is built on the explorer (CTA-73) —
  and the player shows what is written at the position on screen in a
  **comment block** above its footer, where the changes strip sits
  (the explorer's `AnnotationsBar.tsx`, over the pure `lib/moveAnnotations.ts`):
  the move with its marks, the comment opening its line, the comments after
  it, and the **attributes** read out of them as chips — `[%key value]`
  commands (`[%eval]`, `[%clk]`, `[%cal]`, any other by its own name) and an
  analysis export's trailing `+/= +1.31 (21 ply)` / `mate-in-12` (as
  assessment, eval, depth, mate). The stored comment is never rewritten.
  A game shows no block: a comment would give its answer away.
  **Comments are editable in the player**: the block adds one to the move
  on screen and edits or deletes each (the stored text, `[%…]` commands
  and all, in `CommentDialog.tsx`), and the move menu's *Add comment* adds
  one to any move — list or map. Each is `setComments` (`lib/gameTree.ts`:
  pure, id-preserving, the same tree back for a no-op) through the core's
  `replaceTree`, so it is a session change like a move added: Save lights
  up, the strip keeps it or Discard drops it. A game offers none.
- **A file and a paste are one record.** Both go through `readRepertoireText`
  and the same constructors. Line endings are normalised and a file name is
  never read, so the two routes cannot drift apart. `RepertoireUpload.test.tsx`
  asserts it through the screen.
- **A big tree is parsed after a paint.** `parsePgnTree` built its tree with one
  `addMove` per move, which is quadratic. It now builds in place (same ids, same
  output), which took a ~9,000-node one-tree repertoire from ~4.5s to ~1s.
  The remaining second is `chess.js` matching SANs, so the board parses behind a
  `setTimeout(0)` and shows that it is reading.
- **Nothing on the board writes.** A repertoire is the record; a move tried
  against it is exploration, and the Engine tab's clear puts it back.
- **Settings are the one thing edited after the fact** (`/repertoires/<id>/settings`):
  the title (the record's `name`), a description, the main color — the
  side it is played from, which the board opens facing and the preview card
  shows — whether the board opens drawing the next-move arrows
  (`showArrows`, on by default; CTA-63 — the player's Settings tab switches
  them for a session, and the games open without them), whether it opens
  **showing the play chances** (`chanceArrows`, off by default; CTA-71 — at
  a branch that carries `prc` marks the arrows are drawn white with a magenta
  border, the wider the likelier the move — an SVG overlay over the board,
  drawn by the player itself because the library's arrows vary only in
  colour (`views/explorer/chanceArrows.ts`) — and the next-moves bar
  prints each move's percentage; the player's Settings tab switches it for a
  session, and the games see neither), and
  whether it is
  **protected** (`protected`, on by default; CTA-63 — its board offers no
  "Update", only its settings and a copy; copies are never protected) — and,
  beside them though not one of them, the **folder** it is filed under
  (`folderId` stays a record field, written by `fileRepertoire` on the same
  Save; CTA-68). The settings are one `settings` object normalised field by field, so an
  option added later reads as its default on every older record; the recipe
  is the header of `lib/repertoireSettings.ts`. The write is in place and
  keeps the list order.
- **No Tree tab, no Lines tab.** The variations explorer already hangs every side
  line under its move, the CTA-53 reason; and a repertoire is one game. (The
  player's tabs are in the next section.) The Moves tab is kept mounted once opened
  (`BoardPanel`'s opt-in `keepMounted`), so switching tabs never re-mounts a
  9,000-move list.
- **A move list renders its structure once per game.** `MoveList`
  and `VariationLine` memoise the rows and side lines, and each
  token reads "am I current" and "what is my eval" from a selection store
  (`views/shared/moveSelection.ts`) whose subscriptions are keyed by node, ply
  and FEN. A step re-renders two tokens and an engine message re-renders none.
  Before, both redrew every token, which on a ~9,000-node repertoire was ~0.9s
  each — the engine's streamed lines alone kept the list redrawing faster than
  the reader could step. `findNode` / `pathTo` read a per-tree index
  (`lib/gameTree.ts`) instead of walking the tree, and the core memoises its
  `pgn`. Keep new per-token state in that store, not in the list's props.

## Playing a repertoire

Everything the player shows of its tree — the Moves tab, the Map, the comment
block, the next-moves bar, the arrows and the play-chance overlay — is the
shared **variations explorer** (`views/explorer/useVariationsExplorer.tsx`,
CTA-72), attached with one call and given what is the player's as options:
editing (`onEditTree`) and the comment block in the player only, the map
drawn from the session in the player and from the repertoire with its
coverage in Backtracking, and the required moves. The seam, the feature
spec and the flat and puzzle modes are in
[`.claude/rules/tree-views.md`](.claude/rules/tree-views.md); what follows
is the behaviour, wherever it is built.

A repertoire's own view, `/repertoires/<id>`, is the **player**
(`views/repertoires/RepertoirePlayer.tsx`, CTA-63): the board the repertoire
is read, tried and drilled on. The same screen, with a game's rules, is each of
its **games** at `/repertoires/<id>/games/<game>`, reached from the Games menu
in the player's header and on every list row and card. Composed from the v2
core, with two modules of its own beside the engine:

```
lib/repertoireTrainer.ts ─policy · judgeDrop─┐                    ┌─ lib/repertoireGames.ts (coverage, required, backtrack)
                                             ▼                    ▼
                           useTrainerModule (views/dev/core) ◀── useRepertoireGame (views/repertoires)
                             reply guard · timer · game mode        score · lines finished · coverage
                                             │ playVariation
                                             ▼
RepertoireBoard.tsx ─┐                 useBoardCore ──▶ BoardShell / BoardPanel ── TreeMoveList(extensionIds)
RepertoireGame.tsx ──┴─▶ RepertoirePlayer.tsx ── download: treeToPgn(session tree) ──▶ downloadPgn
```

**The player — every session's rules:**

- **The trainer answers only from the repertoire as it arrived**, behind the
  **Autoplay** setting — **off by default**, so opening a repertoire reads
  like a board and the reader moves both sides. On, it plays one of the file's
  moves at its turn **by its play chance** (*Play chances*, below; with none
  set, the move with more lines under it is played more often), and only in
  reply to a move — stepping back to its turn never moves a piece
  (`useTrainerModule`: the wrapped drop owes a reply where the move lands;
  navigating drops it). It asks the *original* tree, so it never moves inside
  a line the reader added.
- **Every move the file does not have is an extension** — added under the
  node on screen and tinted (`success.main`) in the move list through the
  optional `extensionIds` on `TreeMoveList` → `MoveList`, read per token from
  the selection store. `extensionIdsOf(sessionTree, nodeIdsOf(original))` is
  the whole of the tracking. Past a line's end the reader moves both colours.
- **Tabs: Moves · (Score) · Map · Settings · Engine** (a game adds Score;
  Get to the end has no Map). Settings holds the side
  (default: the main color; the board faces it; a change restarts), Autoplay,
  the next-move arrows and the engine's switch. The Engine tab is the other
  boards' own and is **disabled while the engine is off** (`BoardPanel`'s
  per-tab `disabled`). Moves stays mounted while another tab shows. The
  header keeps the opening line, the description, the Games menu, **Play**
  (CTA-65: a second control over the Autoplay setting — pressed and primary
  while it is on, and switching on answers at once when it is the trainer's
  turn, the Settings switch's own `changeAutoplay`; a game has none), Restart
  (back to the start, extensions kept), the download and the settings link.
- **Arrows are the reader's call**: the player opens as the repertoire's
  `showArrows` setting says (on by default), a game without them, and the
  Settings tab switches them for the session — every continuation at the
  node on screen through the shared `nextMoveArrowsOf` — the mainline's move
  green, side lines blue. Where the branch on screen carries play-chance
  marks and the `chanceArrows` switch is on (CTA-71, off by default, seeded
  from the repertoire's settings, and never in a game), the library arrows
  stand down and an SVG **overlay** draws the fork instead — every arrow
  **white with a magenta border, the wider the likelier the move**
  (the explorer's `ChanceArrows.tsx` over pure `chanceArrows.ts`, drawn
  over the board because `options.arrows` can vary only an arrow's colour) — and the
  next-moves bar prints each move's percentage beside its SAN, the same
  `chances` array feeding both, so the number and the width never disagree.
  The v2 boards, the Analysis Board among them, draw through the same
  helper. With Autoplay off the footer is
  the next-moves bar (CTA-54), whose hover draws that move's arrow; with it on,
  the trainer's status line.
- **The engine is off by default, and never an opponent**: on, the pinned
  best-variations block and the eval bar; no `onBestMove`. A line clicked in
  the block is exploration — the trainer does not answer it. The Engine tab's
  "Clear" drops the session's additions.
- **Changes are kept on the reader's say-so — update, or copy.** Nothing is
  written unasked (no autosave). While the session's tree differs from the
  record — `core.tree !== repertoire`: every edit makes a new tree and
  replaying a move that is there does not, so the test holds for the moves
  added today and for the edits to come (deleting a line, promoting a side
  line) with nothing to keep in step — the header's **Save** button (disabled
  while nothing has changed) takes the primary colour, and a click on it
  opens a strip above the footer (`RepertoireChangesBar.tsx`; it closes
  itself once the changes are saved or dropped) that offers three things:
  - **Update repertoire** — `withRepertoireTree` (`lib/savedRepertoires.ts`)
    writes the tree into the record, preview and size re-read, and the
    session becomes the new baseline (the additions stop being additions; the
    reader stays where they are). On a **protected** repertoire —
    `settings.protected`, on by default, so a stray click cannot overwrite a
    shipped or borrowed one — there is no Update: the strip says the
    repertoire is protected and, in Update's place, links to its settings
    (to switch protection off; leaving the board drops the unsaved changes,
    and the strip says so), with Save as copy beside it. No dialog. The screen parses the record it *opened*,
    once, so the write coming back as a new `saved` does not re-parse it and
    put the reader at the start with fresh ids.
  - **Save as copy** — `repertoireCopyOf` makes a new record, "‹name› (copy)",
    with the original's settings and folder — **unprotected**, since a copy
    exists to be edited — and the screen navigates to it at
    the position on screen (`?at=`). The original is untouched: how a shipped
    or borrowed repertoire becomes one's own.
  - **Discard** — back to the record, on the last repertoire position.
  A reload or closed tab with changes unsaved asks first (`beforeunload`).
  A game never writes and never shows the strip. The header's download
  writes the session tree out either way.

**A game is the player with rules** (`lib/repertoireGames.ts`, the session
state in `useRepertoireGame`). The trainer always plays, the Autoplay switch
is gone, a **Score** tab opens first, and the trainer module runs in **game
mode** (`drill`): each of the reader's moves at their own turn inside the
repertoire is judged *before* it is made (`judgeDrop`) — a repertoire move is
right; any other legal move is wrong and **taken back** (the drop refused, so
it never becomes an extension), the status saying "try again". **One verdict
per position**, the first try's; Restart judges afresh. A line is *finished*
when play — not navigation — reaches a leaf of the repertoire (the module's
`arrival`). The score (right, wrong, accuracy, a reset) is session-only.

- **Get to the end** (`end`) — the trainer picks by the play chances, as in
  the player; reaching a line's
  end finishes it ("N lines finished"), and Restart starts another. Past the
  end play is free, extending, unjudged.
- **Backtracking** (`backtrack`) — every line is to be covered. The trainer
  steers to uncovered lines (`backtrackingPolicy`). Where only some of the
  reader's moves still lead to an uncovered line, those are **required**
  (`requiredMovesAt`): a purple arrow (`REQUIRED_MOVE_ARROW_COLOR`, drawn
  whatever the arrows switch says) and the status line say so, and a finished
  line's move is refused — not a failure, it is a right move. When a line
  ends it is covered, and after a moment play goes **back** to the deepest
  position with an uncovered line under it (`backtrackTarget`), where the
  trainer answers if it is its turn; when none is left, the game is done.
  "Lines covered: X of N", and a "Start over" that uncovers everything.
  Its **Map** tab carries the coverage (*The map*, below).

**The map** (the player's and Backtracking's Map tab — the explorer's
`TreeMap.tsx` over the pure `lib/treeMap.ts`) draws the repertoire as an SVG tree:
depth left to right, a row per line, the mainline on the top row and side
lines dropping below their branch point.

- **Every move is a dot in the colour of the side that made it** — White's
  white, Black's black, each ringed in a theme token so it shows on either
  theme — larger at a line's end; the moves on the way to the position on
  screen carry a primary ring under a highlighted path, and a marker sits on
  that position, kept in view as play moves.
- **The player's map is the session's; a game's is the repertoire's.** The
  player draws the repertoire *and* the moves added this session, **as they
  are added** — their lines and a ring round their dots in the move list's
  extension colour (`success.main`), and "N added" in the header — so the
  reader always sees what they have added to the file. Backtracking draws the
  repertoire its coverage is defined on; inside a line the reader added there,
  the marker waits on the last repertoire position.
- **Coverage is the lines' colour, and a game's.** Backtracking passes it —
  covered lines green, a progress bar and "N lines left"; the player passes
  none — every line one neutral colour, and the tree's size in the header.
- **One interactive viewport, in the tab and full screen.** The tab's map
  and the full-screen MUI `Dialog` opened from it are the same component
  (`MapViewport`): the wheel zooms about the pointer and a drag pans (a native
  non-passive wheel listener; the arithmetic — `zoomViewAt`, `fitView`,
  `centerView` — is pure), with zoom, fit-all and "where am I" buttons. Both
  open at a readable 250% (`MAP_INITIAL_K`) centred on the reader and
  **follow** them — when play moves the marker out of view, the view
  re-centres on it at the same zoom. Each measures itself (`ResizeObserver`).
  The Map tab is kept mounted, so its view survives a trip to another tab.
- **Show moves is on by default** (one setting for both views): each move's
  SAN above its dot, in the drawing's units so labels scale with the view and
  never overlap (not drawn below 150%, where a hint says to zoom in), and only
  for the dots on screen (`mapLabelsIn` / `visibleRect`, capped at
  `MAP_LABEL_LIMIT`).
- **In the player, a written move is a link** — in the tab and full screen:
  clicking its dot goes to that position (and closes the dialog). A drag that starts on a dot still pans —
  the pointer is captured, and the click refused, only after it has travelled
  a few pixels. A game's map has no links: it is not a way to skip ahead.
- **And a right-click on a written move is the variations explorer's menu**
  (CTA-67, below) — the player's only, in the tab and full screen. One menu
  serves both views and opens above the full-screen dialog, which an edit
  leaves open, so the reader watches the map redraw from the edited tree: a
  promoted line moving up, a deleted one gone. The view keeps its zoom and
  pan; it moves only by the follow rule, which watches where the marker is
  drawn as well as which node it is on, since an edit can move one without
  the other. Only a move is bound (the right button never pans); below the
  label zoom there are no targets, and a game's map binds nothing.
- The edges and dots are a few path strings, not an element per move, so
  a ~9,000-node repertoire lays out in ~10ms.

**The variations explorer** (CTA-64) is the player's Moves tab — the merged
move list of CTA-53 (`TreeMoveList` over the shared `MoveList` /
`VariationLine`), renamed for what it has become — with lichess's right-click
menu on every move, mainline cell and side-line token alike
(`views/explorer/MoveContextMenu.tsx`, an MUI `Menu` at the pointer) — and,
since CTA-67, on every written move of the player's Map:

- **Promote variation** — the move's line goes one level up: at the closest
  branch where it is not `children[0]`, it becomes it. **Make main line** —
  the same at every level, so the path to the move is the mainline. Both only
  on a move inside a side line.
- **Delete from here** — the move and everything after it, after a dialog
  saying how much goes ("N moves / M lines"). Standing on a deleted move, the
  reader lands on the move it answered.
- **Copy variation PGN** — the line from the start to the move, the tree's
  tags and `SetUp` / `FEN` kept, its `Result` not (a line is not a finished
  game).
- **Add comment** (CTA-69) — a comment after the move, in a dialog;
  `setComments`, appended after the ones it has.

Four rules hold it together:

- **The edits are pure**, in `lib/gameTree.ts`: each returns a new tree with
  every surviving id kept (only the path to the move is copied), and a no-op
  hands back the same tree — so `core.tree !== repertoire` is still the whole
  of "changed", and an edit is a session change like a move added: the Save
  button, the strip (whose summary says "Lines reordered or deleted" when
  nothing was added), protection, the Map, the extension tint and `?at=` all
  follow it with no code of their own.
- **An edit is `replaceTree`, not `loadTree`** (`useBoardCore`): it keeps the
  node on screen when it survived, else its nearest surviving ancestor, where
  `loadTree` would step to the start.
- **The menu is opt-in** — `onEditTree` on `TreeMoveList`, which becomes
  `onContextMenuPly` / `onContextMenuNode` on `MoveList` → `VariationLine`.
  Without it nothing is bound and the right-click is the browser's: every
  other board, and the repertoire **games**, which never write.
  `TreeMap` takes the same `onEditTree` and holds its own menu.
- **It costs the big list nothing.** The handlers the list receives only set
  `TreeMoveList`'s menu state, so they are stable across steps, and the menu
  is a sibling of the memoised list rather than inside it — opening one
  re-renders no token (CTA-61's rule).

**A permanent link to a position**: `/repertoires/<id>?at=e4,c6,d4`
(`lib/repertoireLink.ts`). A position is the moves from the start as SAN — the
saved analysis' `sanPathTo` / `nodeAtSanPath`, since node ids are minted per
parse — joined by commas (SAN never holds one; `URLSearchParams` encodes `+`,
`#`, `=`). The player reads it once, when the tree lands, and writes every
step back with history **replace** (the Analysis Board's rule), so the
address bar is always a link to the position on screen: a reload, a bookmark,
a shared link or a map click all reopen there. A stale link goes as far as it
still matches, so a link into a line added in a session and never saved
reopens on the last repertoire move before it. The settings link carries it
back. A game ignores it and starts at the start.

**Play chances** (CTA-69) — how often the trainer plays each move at a
branch, the rules of the **lichess-tools** extension's random-next-move /
"play all variations" feature, so a study prepared for one behaves the same
in the other. `lib/playChance.ts` is the whole of the logic, and its header
is the reference; in short:

- **Where it is written: `prc:N` in the comment of the move it is about** —
  the branch's own move, the first move of its variation, never the move
  before the branch (lichess-tools ignores it there, and so does this; its
  users' classic mistake). `N` is 0–100, a decimal allowed, above 100 read
  as 100; `[%prc N]` is read too; the first mark on a move wins. Stored as
  comment text because that is what PGN (and a lichess study) can carry, so
  the file works in both tools — and nothing new is added to the model.
- **The rules, at one branch** (`playChances`):
  1. *No move marked* — lichess-tools' default: each move weighs **its lines
     within the next 8 plies** (`linesWithin`: the move itself the first ply;
     a path that ends, or reaches the eighth ply, is one line). Its manual's
     example: `1. e4 (1. d4 d5 2. Nc3 (2. Nf3)) 1... e5 2. Nf3` plays d4 2/3.
  2. *Every move marked* — the marks **scaled** to 100% (the forum's
     8 × `prc:5` + `prc:50` gives the last 50/90 ≈ 44%).
  3. *Some marked* — undocumented upstream, so **ours**: the marked take
     their percentages, the unmarked share what is left of 100 in proportion
     to their lines; nothing left, they get 0 and the marks are scaled.
  4. *`prc:0`* — never played; if every move comes to 0, rule 1 decides.
- **Who follows them**: the player's Autoplay and *Get to the end*
  (`playChancePolicy` in `lib/repertoireTrainer.ts`, from
  `useRepertoireGame`). Backtracking keeps steering to uncovered lines. The
  moves come from the repertoire as it was saved (the trainer's rule), but
  the **marks are read off the session's tree** (`marksFrom` — ids survive
  every edit), so a chance just changed counts before it is saved.
- **How they are set: per branch, not per move.** The move menu's *Play
  chances…* — on any move with alternatives, list or map — opens
  `PlayChanceDialog.tsx` over that move's branch: every move there, a %
  field each (empty: automatic), its line count, and the chance it will be
  played, worked out live by the same `playChances`. A dialog over the branch
  cannot put a mark on the move before it. Saving is `setPlayChances` (each
  move's comments rewritten by `commentsWithPlayChance`: the mark appended to
  its last comment, `{ … prc:40 }` as a lichess move carries it, an old one
  replaced, a comment left empty dropped) through `replaceTree` — a session
  change like any other. A typed `prc:40` in the comment dialog is the same
  text and works the same. The comment block shows a mark as a **Play
  chance** chip, not as prose (`readComment`).

What is designed for and not built: **saving extensions back**, a **persisted
score or coverage** (per position, per repertoire — what spaced repetition
needs; it goes where `useRepertoireGame` keeps them today), and **other
policies** (mainline-first, spaced repetition — each a new `TrainerPolicy`;
the play chances are the first weighted one). A new game is an id in `REPERTOIRE_GAMES`, its rules in
`lib/repertoireGames.ts`, its state in `useRepertoireGame`, and a title key.
`.claude/rules/chessboard-v2.md` §2.5 is the module's recipe.

## A mask is a costume, never a rule

Masked Pieces (`/engine/masked`, in the Engine folder) draws chosen piece types
with another piece's graphic while the game underneath stays ordinary legal
chess. The technique and this app's implementation of it are specified in
[`docs/chess_piece_masking_technique.docx.md`](docs/chess_piece_masking_technique.docx.md)
— §7 and §13 there are the two clauses the design answers to, and §15 is what
was built. The engineering reference — every surface, the record, the
invariants, tests, debugging and recipes — is
[`.claude/rules/masked-pieces.md`](.claude/rules/masked-pieces.md), which loads
when you work on its files. The short version:

- **It is Play with Engine's screen in a costume** (CTA-79). `MaskedPlay.tsx`
  renders `PlayScreen` with an optional `masking` prop — the mask, the notation
  switch, the engine-lines switch and a fourth tab, **Masking** — and nothing
  else: no mode flag, no fork, no hook of its own. Legality, captures, check,
  castling, en passant, promotion, the engine's evaluation and its moves, Play,
  Replay, Resign, side lines and the autosave are the true game's and identical
  to `/engine/play`. Nothing in `chess.js`, `lib/engine.ts`, the core, the tree
  or the PGN path knows the mask exists.
- **It is keyed on the piece *type*, not the piece.** `chess.js` gives a piece no
  stable identity, so per-piece masking would need a square → identity map
  maintained through every move, capture, castle, en passant and promotion — a
  second source of truth that can desync from the real position. A twelve-entry
  type map is a render-time lookup with no state at all, each colour is masked
  independently for free, and a promoted pawn is drawn as whatever a queen is
  drawn as because nothing recorded that it used to be a pawn.
- **Where it is applied**: the board (`options.pieces = maskedPieces(mask)`),
  the captured strips' icons, the material diff (hidden while anything is
  masked) — and, while the notation switch is on, **every printed move**: the
  move list and its side lines, the map's labels, the next-moves bar, the move
  menu, the comment block's label and the engine's lines, each through an
  optional `mask` (`maskSan` / `maskSanLine` / `maskNodeSan`) that every other
  screen leaves out. Not masked: the promotion picker (the reader's own choice),
  the squares, the evaluation.
- **The engine's best lines are off by default** behind the Masking tab's
  switch (`BoardPanel`'s `showVariations`): an engine line is a list of the
  pieces the mask hides. The eval bar and the score stay.
- **Its games are saved** with the engine games, the costume on the record
  (`PlayedGame.mask`); Saved games marks them *Masked* and continues them here
  in the same disguise, and the Analysis Board opens them unmasked — the PGN is
  the true game.

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
| Data | `navFolders()` + `navItems()` | The folder tree (`{ id, labelKey?, label?, icon, children? }`) and the screens, each naming its `folder`. Authored. **Functions**, so a dev-only entry can be a spread gated on `import.meta.env.DEV` (the Development section's were, CTA-60 to CTA-79). |
| Builder | `navTree.ts` | Pure `buildNavTree` — sub-folders before that folder's own screens at every level — plus `folderPath` (a screen's breadcrumb, and the chain the sidebar opens), `folderChain` (the same for a folder id, itself included), `navLabel` (catalog key *or* data label) and `navLabelKeys` (only the keys). |
| Renderer | `Sidebar.tsx` | A recursive `TreeRow`. Folders are `aria-expanded` toggles, screens are links. |

Consequences worth knowing:

- **Nesting a folder is a data edit.** Add it to `navFolders` (at any depth),
  give it a `labelKey` present in both catalogs, and point screens at it. The
  renderer already recurses — `navTree.test.ts` and `Sidebar.test.tsx` both
  carry fixtures nested deeper than anything shipped.
- **A node may be named by data.** A folder or screen can carry a `label`
  (`{ en, he }`, `lib/localizedText.ts`) rather than a `labelKey`; only
  `navLabel` and `navLabelKeys` know the difference, and `NavFolderId` is a
  plain `string` so a data-built id need not be a union member. Nothing shipped
  uses it since the old Library's generated folders went (CTA-75); the tests'
  nested fixtures do. The Library's collections are rows of `/library`, not
  sidebar folders.
- **One chain is open at a time, and the route decides which.** `Sidebar.tsx`
  holds an *open path* — the folder ids from the top of the tree down to one
  folder — so opening a folder under a different parent shuts the one that was
  open, while a sub-folder still opens inside its own parents. It is seeded from
  `folderPath(pathname)` and follows the route, adjusted during render against
  the previous pathname rather than in an effect, which
  `react-hooks/set-state-in-effect` rejects. A path that is no screen in the
  tree (the landing page, `/library/<collection>`) has no chain of its own and
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