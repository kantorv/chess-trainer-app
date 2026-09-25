---
paths:
  - "src/views/tools/analysis/**"
  - "src/lib/savedAnalyses*"
  - "src/lib/savedAnalysisStore*"
  - "src/lib/savedAnalysisFolders*"
  - "src/lib/savedAnalysisFolderStore*"
  - "src/lib/savedAnalysisDb*"
  - "src/lib/savedGameFolders*"
  - "src/lib/analysisSettings*"
  - "src/lib/arrowSettings*"
  - "src/lib/nextMoveWeights*"
  - "src/lib/gameReference*"
  - "src/lib/gameCatalog*"
  - "src/lib/pgnExport*"
  - "src/views/shared/folders/**"
---

# The Analysis Board and Saved analyses — `/tools/analysis`

A board a game is **worked on**: both colours move from any node, every
alternative is kept as a side line, the engine analyses the position on
screen, and the whole tree is saved **when the reader says so**, filed into
folders at `/tools/analysis/saved`. It is also where every other screen sends
a game or a position to be analysed (`?fen=`, `?game=`, the Openings
explorer's hand-off). The board core, the engine protocol and testing are
[`chessboard.md`](./chessboard.md); the move list, map and arrows
[`tree-views.md`](./tree-views.md); the stores [`database.md`](./database.md).

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/views/tools/analysis/AnalysisBoard.tsx` | **The screen**: the arrivals (`arrivalOf`), the slots, the header, the URL write-back. `AnalysisBoardRoute` waits for the stores a URL names. |
| `src/views/tools/analysis/useAnalysisSession.ts` | **The shareable session**: core + engine + `usePlayToggle` + a **baseline** (the tree as it arrived or was last kept), `changed`, `extensionIds`. The Library's game board and the Openings explorer compose it too. |
| `src/views/tools/analysis/useAnalysisBoard.ts` | That session plus **the saved record**: Save / Update / Save as copy / Discard, the Load tab's new boards, the arrival precedence. |
| `src/views/tools/analysis/AnalysisLoad.tsx` | The Load tab: a PGN by file or paste (one game; several merged or split) or a FEN, over `useAnalysisLoad`. `onSplit`, `choiceLabelKey` and `onLoadPosition` optional — the Openings explorer loads without a split. |
| `src/views/tools/analysis/useAnalysisLoad.ts` | **The Load route's state** (CTA-96): the pipeline behind `AnalysisLoad`, on its own so a host can place its pieces itself — the analyses Lobby's form puts the FEN field and the `.pgn` pick in its editor's row and the paste box below. |
| `src/views/tools/analysis/AnalysisExport.tsx` | The Export tab: FEN, PGN with or without comments / NAGs / side lines, copy and download. |
| `src/views/tools/analysis/AnalysisSettings.tsx` | The Engine tab (depth, move time, lines, the eval bar, Clear) — also the repertoire player's and the Openings explorer's. |
| `src/views/tools/analysis/AnalysisArrows.tsx`, `ArrowSettingsFields.tsx` | The Arrows tab (CTA-98, §1.1): the next-move arrows switch, the width source and the palette. The two fields are shared with the settings screen. |
| `src/views/tools/analysis/SaveAnalysisDialog.tsx` | A new board's name and folder. |
| `src/views/tools/analysis/PlayToggleButton.tsx`, `EngineThinking.tsx` | Play's header button and status line, shared with every board that has Play. |
| `src/views/tools/analysis/useTreeNavigation.ts` | The core's navigation (node id as state, the keys). |
| `src/views/tools/analysis/nextMoveArrows.ts`, `NextMovesBar.tsx` | The next-move arrows and bar every board draws through ([`tree-views.md`](./tree-views.md)). |
| `src/views/tools/analysis/saved/SavedAnalyses.tsx` | `/tools/analysis/saved`: the list and preview cards, the folders, the picks and bulk delete. |
| `src/views/tools/analysis/saved/NewAnalysisForm.tsx` | The saved list's right-hand panel (CTA-87/96): the shared position editor over a **Start** that opens the Analysis Board on the edited position; the form's header carries the editor's resets (New, Clear, Flip), its `controls` row the FEN field and the `.pgn` pick, and under the editor the paste box — `useAnalysisLoad` placed by hand, a whole game handed to the board as `analysisHandOff` location state, a position PGN or FEN setting the editor up ([`position-editor.md`](./position-editor.md) §4). |
| `src/views/tools/analysis/saved/AnalysisSettingsScreen.tsx` | `/tools/analysis/saved/<id>/settings`. |
| `src/views/tools/analysis/saved/useSavedAnalyses.ts`, `useAnalysisFolders.ts` | The store bindings (`undefined` until read). |
| `src/views/shared/folders/` | The nested-folder components (rows, cards, breadcrumb, name / move / delete dialogs, picker), each taking a `labelKey` and a test-id prefix. |
| `src/lib/savedAnalyses.ts` | **The record**, pure: `SavedAnalysis`, `savedAnalysisOf`, `savedAnalysisFrom` (the normaliser), `savedAnalysisDerivedName`, `splitAnalysesOf`, `batchAnalysesOf`, `savedAnalysisCatalogOf`. |
| `src/lib/savedAnalysisStore.ts` | **The store** (`chessapp.analyses`, object store `analyses`): `saveAnalysis`, `addAnalyses`, `fileSavedAnalysis`, `renameSavedAnalysis`, `updateSavedAnalysisSettings`, `removeSavedAnalyses`, `unfileAnalysesIn`, `findSavedAnalysisGame`; cap `MAX_SAVED_ANALYSES` (20,000). |
| `src/lib/savedAnalysisFolders.ts` + `savedAnalysisFolderStore.ts` | The folders: an `AnalysisFolder` *is* a `GameFolder` (`lib/savedGameFolders.ts`, the nested model: cycles cut, dangling parents read as top level); create / rename / move (never into its own subtree) / delete (sub-folders re-parent, analyses become Unfiled); cap 100. |
| `src/lib/analysisSettings.ts` | `AnalysisSettings`, the defaults, `ANALYSIS_UCI_OPTION`, `analysisSettingsFrom`. |
| `src/lib/arrowSettings.ts` | The Arrows tab's ids (CTA-98): `ArrowWidthSource`, `ArrowPaletteId`, their defaults and readers (`arrowWidthSourceFrom`, `arrowPaletteFrom`). |
| `src/lib/nextMoveWeights.ts` | Each width source's weights at a branch (`nextMoveWeights`), the `[%eval]` reader (`evalOf`), and which sources a tree offers (`arrowWidthSourcesIn`). Pure. The `games` tag's reader is `lib/gamesTag.ts`. |
| `src/lib/gameReference.ts` + `gameCatalog.ts` | **The `?game=` carrier** (§3). |
| `src/lib/pgnExport.ts` | `downloadPgn` — several stored PGN records joined with a blank line (`pgnFileOf`), saved as a file. Also Settings' Export's (`downloadBinaryFile`, [`import-export.md`](./import-export.md)). |
| Tests | `AnalysisBoard.test.tsx` (every arrival, Save, Load, Export, Play, the hand-off, the Arrows tab), `useTreeNavigation.test.ts`, `EngineThinking.test.tsx`, `nextMoveArrows.test.ts`, `src/lib/nextMoveWeights.test.ts`, `saved/SavedAnalyses.test.tsx` (the list and the panel's new-analysis form), `saved/AnalysisSettingsScreen.test.tsx`, `src/lib/savedAnalyses.test.ts`, `savedAnalysisStore.test.ts`, `savedAnalysisFolderStore.test.ts`, `savedGameFolders.test.ts`, `gameReference.test.ts`, and the propagation tests in `src/views/board/`. |

Routes and nav: the **Analysis** folder is `singleEntry` and renders as one
row to `/tools/analysis/saved`; the board itself has no nav entry and is the
list's **New** button. `options.id` is `analysis`. Locale keys: `analysis.*`
(the board) and `savedAnalyses.*` (the list, its folders, the settings
screen).

---

## 1. The board

- **A `GameTree`, both colours from any node.** A move from an earlier
  position is a side line; replaying one that is there follows it.
- **The engine and the eval bar are switched independently.** The engine
  moves a piece only while the header's **Play** is on (`usePlayToggle`, off
  at the start, disabled while the engine is off, paused by any step that is
  not one move forward), and then only for the side not at the bottom.
- **Tabs: Moves · Map · Load · Export · Engine · Arrows.** Moves and Map are
  kept mounted. The footer holds the comment block, the changes strip, Play's
  status line and the next-moves bar (on the Moves tab).
- **The explorer**: editing on (the move menu and the comment block —
  `core.replaceTree`), *Play chances…* off, the moves added since the baseline
  tinted in the list and ringed on the map, every map dot a link.
- **Load is a new analysis.** The Load tab reads a PGN the way a repertoire is
  read (`readRepertoireText`): one game goes onto the board unsaved; several
  ask **merge** (one tree on the board, unsaved) or **split** (one analysis
  per game, saved into a new folder named after the text — `addAnalyses`, all
  or nothing — and the reader is taken to `/tools/analysis/saved?folder=<id>`).
  A FEN is a position: it turns the board.
- **Export** writes the FEN, and the PGN with or without comments, NAGs and
  side lines (`treeToPgn`'s `PgnExportOptions`).

### 1.1 The Arrows tab (CTA-98)

The next-move arrows, and only this board's — every other board keeps the
classic, colour-only arrows. Three settings, all the **session's**, opened as
the record says (a new board: on, None, Classic):

- **Next move arrows** — the switch (moved here from the Engine tab, test id
  `analysis-arrows`). Off: only a hovered move's arrow, as before.
- **Width source** — one of five radios (`lib/arrowSettings.ts`), each
  continuation's weight worked out by `nextMoveWeights` and drawn on the
  play-chance arrows' absolute scale (`chanceArrowWidth` over 0–1) by the
  explorer's overlay:

  | Source | Read from | Width |
  | --- | --- | --- |
  | **None** | — | the library arrows, colour only |
  | **Evaluation** | `[%eval X]` in the move's own comment, or the trailing `+1.31 (21 ply)` shape — White's view, turned to the mover's | loss vs the best tagged move: the best widest, a hairline at 300 cp (`EVAL_HAIRLINE_CP`) or worse; a mate for the mover best, against it a hairline |
  | **Games** | `games:N` / `[%games N]` (`lib/gamesTag.ts`) | `N / Σ N` over the tagged moves |
  | **Play chance** | `prc:N` / `[%prc N]` | the marks scaled to 100% over the tagged moves |
  | **Lines ahead** | nothing (`linesWithin`, 8 plies) | each move's share — always offered |

  **A tag radio is disabled while no move in the tree carries it**
  (`arrowWidthSourcesIn`, recomputed on every new tree — a load, a comment
  edited). A choice whose tag is gone is **kept**, shown checked and disabled
  with a note, and the board **draws as None** until the tag is back. At a
  branch where **some** moves carry the tag the untagged ones are drawn gray
  and half-transparent at a fixed modest width (`UNTAGGED_ARROW_CHANCE`);
  where **none** do, the ordinary palette arrows are drawn, so the board stays
  readable past the tagged part of a game.
- **Colours** — a palette (`NEXT_MOVE_ARROW_PALETTES` in `nextMoveArrows.ts`):
  **Classic** (`#4caf50` / `#2196f3` / `#f44336`, every board's), **Lichess**
  (its brushes, `#15781B` / `#003088` / `#882020`) and **Colour-blind safe**
  (Okabe–Ito, `#0072B2` / `#E69F00` / `#CC79A7`) — mainline / side line /
  hovered, each apart from the untagged gray. It colours the library arrows
  and the width-sized ones alike.

---

## 2. Saving

Nothing is written unasked. The session holds a **baseline** — the tree as it
arrived, was loaded, or was last saved — and `core.tree !== baseline` is the
whole of "changed" (every edit makes a new tree; replaying a move that is
there does not).

- **Over a record** (`?analysis=`, or once saved) the header's **Save** lights
  and opens the changes strip (`RepertoireChangesBar` under this screen's
  `labelKey`): **Update analysis** (the record takes the tree, the place in
  it, the orientation and the settings; its name and folder stay), **Save as
  copy** ("‹name› (copy)", same folder; the session goes on in it) or
  **Discard** (back to the baseline).
- **A board with no record** — blank, a `?fen=` / `?game=` arrival, a PGN
  just loaded, a tree handed over — saves through `SaveAnalysisDialog`: a name
  (seeded from the tags) and a folder.
- **A reload or closed tab with changes unsaved asks first** (`beforeunload`).
- **The record is a tree as PGN** (`treeToPgn` / `parsePgnTree` — side lines,
  comments and NAGs are the point), the `AnalysisSettings`, the orientation,
  **where the reader stands** as SAN from the root (`sanPathTo` /
  `nodeAtSanPath` — node ids do not survive a PGN round trip; the path stops
  at the last move it recognises), the name, the folder, and the settings of
  §2.1. A record lacking a newer field reads as its default (named by its
  tags, Unfiled, arrows on) — no version bump.

### 2.1 A record's settings — `/tools/analysis/saved/<id>/settings`

The title (`name`), a `description` (shown under the title on the board), the
side the board opens facing (`orientation`), whether it opens drawing the
next-move arrows (`showArrows`), what sizes them (`arrowWidthSource`,
`"none"`) and their colours (`arrowPalette`, `"classic"`) — §1.1, CTA-98 —
and the folder (`folderId`, `null` Unfiled) — one draft, written on Save in
place (`updateSavedAnalysisSettings`). Every width source is offered on the
screen; whether the tree carries its tag is the board's to say. A missing or
unknown `arrowWidthSource` / `arrowPalette` reads as its default. Linked
from the board's header (off while there are unsaved changes) and from every
row and card. A flip or the Arrows tab on the board is the session's:
Update keeps the stored settings, a copy takes the original's, a new board's
first save takes what it shows.

### 2.2 The store

IndexedDB (`chessapp.analyses`, object stores `analyses` and `folders`, over
`idbRecordStore`). Every write is a promise; a quota refusal answers
`"storage"`, never throws. Reads are the kept snapshot, `undefined` until the
first read lands — so a screen arriving by URL (`?analysis=`,
`?game=analysis/…`, the settings screen) says it is reading and waits rather
than calling the record missing. The cap is **20,000** because a split and the
Library's Analyse make a record per game; measured with the Carlsen fixture,
20,000 records are ~20 MB, written in one batch in ~0.6 s and read in ~0.1 s.

---

## 3. Arriving — the URL

Read once (`arrivalOf`); **precedence** `?analysis=` > a handed-over tree >
`?game=` > `?fen=` > blank.

| Arrival | What it is |
| --- | --- |
| `?analysis=<id>` | A saved record: its tree, its node, its orientation, its settings. |
| location state `analysisHandOff` | A whole tree from the Openings explorer (`lib/analysisHandOff.ts`, [`openings-explorer.md`](./openings-explorer.md) §5): a new unsaved board with the tree's orientation. |
| `?game=<key>/<path>/<id>` (+ `?move=`) | A game from a store, re-read with `parsePgnTree` (§3.1). Opens facing White. |
| `?fen=` | A position (`parseFen`; ignored if it does not pass). Turns the board. |
| `?at=` | The line on screen as SAN from the start (`lib/repertoireLink.ts`); **beats** `?move=` and a record's own place. |

**The URL is a permanent link.** `?at=` is written back with history replace
on every step, beside what the board is (`?analysis=<id>` once it is a record,
the arrival's parameters before that, nothing after a Load).

### 3.1 `?game=` — a reference into a store

A FEN fits in a URL; a game does not, so the game hand-off carries
`?game=<key>/<path>/<id>` and the board looks the game up itself
(`resolveGameReference`). It keeps what `?fen=` is good for — bookmarkable,
validated, ignored when it does not resolve, taken as *initial* state.

- **A reference resolves against a store's catalog** (`lib/gameCatalog.ts`: a
  `path` and its games, each with its PGN and mainline). `catalogsByKey` in
  `lib/gameReference.ts` is the whole mapping: `analysis`
  (`savedAnalysisCatalogOf`; `findSavedAnalysisGame` parses only the record
  named), `play` (the games against the engine, `playedGameCatalogOf`) and
  `library` (`library/<collection>/<n>`, [`game-collections.md`](./game-collections.md)
  §6.7). **A line in that registry is the whole cost of a new producer of
  games.**
- **A store read asynchronously makes the board wait** (`AnalysisBoardRoute`:
  `isReferenceRead` / `loadReferencedGames`, and the saved analyses' first
  read).
- **`?move=` rides beside it**: the mainline ply to open at, read by
  `parseMoveParam` (anything not a non-negative integer is ignored; past the
  end clamps). With no `?move=`, a game's **`StartPly` tag** declares its own
  opening ply (`initialPlyOf` — absent, unreadable or past the end is ply 0).
  One line: `parseMoveParam(?move=) ?? initialPlyOf(game)`.

---

## 4. Saved analyses — `/tools/analysis/saved`

- **Newest first, filed into a nested tree of folders**; `?folder=<id>` is
  where the reader stands (a split lands there). The top level shows the
  folders, then the Unfiled analyses.
- **The panel is the new-analysis form** (CTA-87): the shared position editor
  and a **Start** that opens the Analysis Board — the edited position riding
  along as `?fen=` when it is not the standard start, which turns the board
  to its side to move ([`position-editor.md`](./position-editor.md) §4). The
  form's header carries the editor's resets (**New, Clear, Flip**); the
  editor's own controls row holds the **quick loads** — a FEN field and a
  `.pgn` pick, side by side — and the paste box sits under the editor
  (`useAnalysisLoad`, the Load route's pipeline placed by hand; the form
  renders `AnalysisLoad` not at all). A PGN of more than one move (or a
  merge) is handed to the board as `analysisHandOff` location state facing
  White (a game does not turn the board); a split lands in its new folder
  here; a PGN of a single move or none, like a FEN, sets the editor up
  instead (`onLoadPosition` / `onLoadFen`). The editor offers no tabs of its
  own (`forms={["position"]}`, the fields always shown —
  [`position-editor.md`](./position-editor.md)).
- **A list or preview boards** at the saved lists' two card sizes
  (`views/shared/cardSize.ts`), each card showing the position and side the
  reader **was standing on** (`options.id` `saved-analyses-preview-<id>`).
- **Every row and card** has an **Open** button (a card's board), the settings
  gear and a checkbox; the export bar (select-all takes the whole folder)
  downloads the picks and deletes them in bulk, asking first.
- **Folders** are created, renamed, moved (never into their own subtree),
  deleted keeping their contents (sub-folders re-parent, analyses Unfiled) and
  downloaded as one `.pgn`.
- **Paged, and parsed a page at a time**: 48 a page (`SAVED_ANALYSES_PAGE`)
  in every view, each record's tree parsed once when its page shows and kept
  while it is the stored one; counts, downloads and picks read the records
  unparsed.

---

## 5. Invariants

1. **Nothing is written unasked**; `core.tree !== baseline` is "changed".
2. **The engine moves only while Play is on**, only the opponent's side, only
   for the position on screen.
3. **A record is PGN plus a SAN path**, read back through its normaliser; a
   missing field is its default.
4. **An arrival is read once**, validated, and ignored when it does not pass.
5. **A route naming a record waits for its store's first read.**
6. **`?fen=` and `?game=` are additive** — a new producer is a catalog entry,
   never a new parameter.

---

## 6. Recipes

- **A new `?game=` producer**: a `…CatalogOf` over its store and one entry in
  `catalogsByKey`; if its store is read asynchronously, teach
  `isReferenceRead` / `loadReferencedGames` about it. Test it in
  `gameReference.test.ts` and as an arrival in `AnalysisBoard.test.tsx`.
- **A new record setting**: the field on `SavedAnalysis`, its default in
  `savedAnalysisFrom`, a section in `AnalysisSettingsScreen`, and where the
  board reads it on open. No version bump.
- **A new tab**: a `tabs` entry in `AnalysisBoard.tsx` and
  `analysis.tabs.<id>` in both catalogs; keep the `moves` and `engine` ids,
  which the propagation tests expect.
- **The new-analysis form** (the shared position editor in the saved list's
  panel, a second host of it): [`position-editor.md`](./position-editor.md) §4.
