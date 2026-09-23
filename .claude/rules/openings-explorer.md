---
paths:
  - "src/views/openings/**"
  - "src/lib/openings*"
  - "src/lib/analysisHandOff*"
  - "src/views/board/core/useOpeningBookModule.ts"
  - "src/views/shared/CurrentOpening*"
  - "src/views/shared/useOpeningBook.ts"
  - "src/data/openings/**"
  - "scripts/vendorOpenings.mjs"
---

# The Openings explorer — `/openings`

`/openings` is where an opening is **played through beside the book**: a
full analysis board with eco.json's continuations from the position on
screen listed beside it, and a hand-off that takes everything explored to
the Analysis Board. This file is the whole reference for it: what it is
made of, the opening book underneath, the URL, the Analysis hand-off, the
rules that keep it correct, how to test it, how to debug it and how to
extend it. It is written for people and for LLM sessions alike. It loads
automatically when you work on the files in its `paths:` list.

This file is the authority for the Openings explorer and the opening book.
Everything the screen shares with the other boards is elsewhere:
[`chessboard.md`](./chessboard.md) (the board, the engine protocol, testing,
the core) and [`tree-views.md`](./tree-views.md) (the variations explorer);
the receiving end of the hand-off is [`analysis-board.md`](./analysis-board.md).

> **An explorer keeps nothing.** The screen has no Save, no
> folders and no store. Whatever the reader wants to keep goes to the
> Analysis Board (§5), which saves explicitly. **Do not add persistence here**
> (§9.5 says what to do instead).

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/views/openings/OpeningsBoard.tsx` | **The screen.** Composition only: the arrival (`arrivalOf`), the session, the book, the explorer, the arrows, the URL write-back, the two hand-offs, and the slots of `BoardShell` / `BoardPanel`. No behaviour hook of its own. |
| `src/views/openings/OpeningBookList.tsx` | **The Book tab.** Presentational: the rows (SAN, the opening's name, the ECO chip), a click plays a move, the pointer reports which row it is over. |
| `src/views/openings/openingArrows.ts` | **The board's one arrow set.** `openingArrowsOf(treeArrows, book, hoveredSan)` joins the explorer's next-move arrows with the book's. Pure. |
| `src/views/openings/Main.tsx` | Layout-only wrapper that `App.tsx` routes to (`openings-wrapper`). |
| `src/lib/analysisHandOff.ts` | **The hand-off to the Analysis Board** (§5): `analysisHandOffState` / `analysisHandOffOf`, and `lineTreeOf` (one SAN line played from a start, used by this screen's `?at=` arrival). Pure, non-throwing. |
| `src/lib/openings.ts` | **The opening book**, pure (§2): `loadOpeningBook`, `getPositionBook`, `findOpening`, `nextMoveOpenings` / `knownMoveOpenings`, `openingOfLine`, `stickyOpening`, and the two arrow colours. |
| `src/views/board/core/useOpeningBookModule.ts` | **The book as a capability module** (`chessboard.md` §9.2.2): the loaded book, the continuations from a FEN, their arrows, the hovered move. This screen is its one consumer. |
| `src/views/shared/CurrentOpening.tsx` | The live "current opening" line every game screen's panel carries (sticky), whose ECO chip links **into** this screen (`/openings?fen=`). |
| `src/views/shared/useOpeningBook.ts` | The book for the saved lists' cards (`openingOfLine` under each card). Not used here. |
| `src/data/openings/eco{A..E}.json` | The vendored book, ~3.2 MB, five lazy chunks. |
| `scripts/vendorOpenings.mjs` | Re-vendors the book from an eco.json checkout (§2.1). Manual, not part of the build. |
| `src/views/tools/analysis/AnalysisBoard.tsx`, `useAnalysisBoard.ts` | The **receiving** end of the hand-off: `arrivalOf(params, location.state)` and the `handOff` start option (§5.3). |
| `src/views/tools/analysis/useAnalysisSession.ts` | The session this screen composes (core + engine + Play + a baseline), shared with the Analysis Board and the Library's game board. |
| `src/views/tools/analysis/AnalysisLoad.tsx`, `AnalysisExport.tsx`, `AnalysisSettings.tsx`, `PlayToggleButton.tsx`, `EngineThinking.tsx` | The Analysis Board's tabs and header pieces, reused as they are. `AnalysisLoad` takes an optional `onSplit` and a `choiceLabelKey` for this screen (§3.4). |
| Tests | `src/views/openings/OpeningsBoard.test.tsx` (the screen), `openingArrows.test.ts`, `src/lib/analysisHandOff.test.ts`, `src/lib/openings.test.ts`, `src/views/shared/CurrentOpening.test.tsx`, the hand-off arrivals in `src/views/tools/analysis/AnalysisBoard.test.tsx`, and the two propagation tests (`src/views/board/boards.test.tsx`, `panelPropagation.test.tsx`). |

Routes and nav: `App.tsx` routes `/openings` to `views/openings/Main`. The
sidebar's **Openings** folder is `singleEntry` (`navFolders.ts`)
over one screen, `/openings` (`navItems.ts`, `nav.openings`), so it renders
as one row under the folder's name.

Locale keys: `openings.*` in `src/locales/en.ts` / `he.ts` (`tabs`, `current`
— read by `CurrentOpening`, `book`, `engineSwitch`, `controls`,
`load.choice`). Anything the screen shares with the Analysis Board is read
from `analysis.*` (the Load tab's errors, the engine settings, the arrows
switch's label, the export). `he` is typed `typeof en`, so a missing key is a
compile error.

---

## 1. What the screen is

```
 URL ?fen= ?at= ──arrivalOf──▶ { tree: lineTreeOf(start, at), nodeId, orientation }
                                         │  (read once)
                                         ▼
                          useAnalysisSession ── core (useBoardCore) · engine (useEngineModule) · Play (usePlayToggle)
                                         │
             ┌───────────────────────────┼─────────────────────────────┐
             ▼                           ▼                             ▼
 useOpeningBookModule({fen})   useVariationsExplorer({source: core,…})  URL write-back: ?fen= (non-standard start) + ?at=
   nextMoves · hoveredMove       moves · map · annotations ·
   (arrows unused: see §3.2)     nextMoves · arrows · overlay
             │                           │
             └──── openingArrowsOf ──────┘──▶ boardOptions.arrows
                                         ▼
                 BoardShell id="openings" / BoardPanel (tabs, header, footer)
                                         │
             header: Analysis ─▶ /tools/analysis?at=…  + location state (lib/analysisHandOff)
                     Play from here ─▶ /engine/play?fen=<position on screen>
```

- **A board with no behaviour hook of its own** (`chessboard.md` §9.4,
  the Library's game board's recipe): the session is the Analysis Board's
  (`useAnalysisSession`), the book is one capability module
  (`useOpeningBookModule`), and the tree view is the shared explorer
  (`useVariationsExplorer`). What is the screen's own — the Book tab, the
  joined arrows, the URL, the hand-offs — is in `OpeningsBoard.tsx`.
- **The game is a `GameTree`**, both colours move from any node, and a move
  from an earlier position is a side line (`addMove`). Nothing about that is
  specific to this screen.
- **No record, so no baseline in use.** The session still holds one (the tree
  as it arrived), but the screen reads neither `changed` nor `extensionIds`:
  nothing is "added" against a record, so the explorer is given no
  `extensionIds` / `addedIds` — the options `tree-views.md` §2 lists for a
  board that keeps no record (its Map stays: only Play with Engine's game
  view has none, CTA-91).
- **The engine is on at the start**, as on the Analysis Board: the pinned
  best variations, the eval bar and per-FEN evals in the move list. **Play**
  (off at the start) makes it play the side not at the bottom until paused,
  exactly as on the Analysis Board (`usePlayToggle`).
- `options.id` is **`openings`**, and every test id is prefixed `openings-`
  (`openings-screen`, `openings-board`, `openings-panel`,
  `openings-panel-tab-<id>`, `openings-book-move-<san>`, …).

---

## 2. The opening book — `lib/openings.ts`

### 2.1 The data

- **eco.json** (MIT, <https://github.com/JeffML/eco.json>), **vendored**
  into `src/data/openings/eco{A..E}.json`: about 16,000 positions, keyed by
  full FEN, each trimmed to `{ eco, name, moves }`. `eco_interpolated.json`
  is merged in, so the positions *along* a named line are there too, not
  only the final one.
- **Why vendored**: the app must work offline and on GitHub Pages,
  and the npm package fetches its data from GitHub at runtime. To refresh
  it, run `node scripts/vendorOpenings.mjs /path/to/eco.json/checkout` and
  commit the five files. It is not part of the build.
- **Names follow eco.json's convention**: `"Opening: Variation,
  SubVariation"`. Many positions share one ECO code, which names a family,
  not a line.

### 2.2 Loading

`loadOpeningBook()` dynamically imports the five shards, merges them and
**caches the promise**. Every consumer (the module, `CurrentOpening`,
`useOpeningBook`, the Library's index) gets the same object, so the ~3 MB
is downloaded at most once per session, and never on a screen that does not
ask. A shard that fails to load (for example, an offline reader on a stale
deploy) gives an **empty book**, not a rejection: every position then reads
as unknown.

Three React entry points share that one promise. Pick by what you need:

| Need | Use |
| --- | --- |
| The name of the position on screen, in a panel | `CurrentOpening` (sticky, with loading/unknown states) |
| The continuations from a position, and their arrows | `useOpeningBookModule({ enabled, fen })`; disabled, it loads nothing |
| The opening a whole saved line ended in (cards) | `useOpeningBook()` + `openingOfLine` |

### 2.3 Lookup

- `findOpening(book, fen, positionBook?)`: an **exact full-FEN** match first,
  then a **board-only** fallback through `getPositionBook(book)` (piece
  placement → the book's full FENs for it). That handles transpositions that
  differ only in castling rights, the side to move or en passant. Build the
  position book **once per book** (the module does) and pass it to every
  call.
- `nextMoveOpenings(fen, book, pb)`: every legal move from `fen`, each with
  the opening it leads to. `knownMoveOpenings` keeps only the named ones:
  **that is the Book tab**. An off-book move stays playable on the board; it
  just is not listed.
  Cost: one `chess.js` `moves({ verbose: true })` plus a lookup per move,
  every time the FEN on screen changes. That is cheap (a few dozen moves),
  but keep it out of any per-token or per-row loop.
- `openingOfLine(book, pb, fens)`: the **deepest** named position along a
  line (walks backwards). Used by the Library's index and the saved lists'
  cards.
- `stickyOpening(book, pb, fen, previous)`: `CurrentOpening`'s rule. An
  unnamed position keeps the last name the line earned, and stepping back
  past where it was earned clears it.
- **Non-throwing throughout**: a malformed FEN gives no moves, and an unknown
  position is `undefined`. An unrecognised position is a fact about chess,
  not an error.

---

## 3. The screen — `views/openings/OpeningsBoard.tsx`

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│ CurrentOpening (name + ECO chip)  [Analysis] [Play from here] [▶ Play] Engine ◉ │ header
├─────────────────────────────────────────────────────────────┤
│ ▸ pinned best variations (click a line to play it)          │ BoardPanel
│ status: score of the position                               │
│ Book · Moves · Map · Load · Export · Engine                 │ tabs (Book first, open on arrival)
│ the active tab (scrolls)                                    │
│ footer: comment block · Play's status line · next-moves bar (Moves tab only) │
│ |◀ ◀ ▶ ▶|                                            flip  │ BoardControls
└─────────────────────────────────────────────────────────────┘
```

| Tab | Content | Notes |
| --- | --- | --- |
| **Book** (`book`) | `OpeningBookList` over `book.nextMoves` | A click is `core.playVariation([san])` under the node on screen. A known move is followed, and a new one from an earlier node branches. Hover sets `book.setHoveredMove`. |
| **Moves** (`moves`) | the next-move arrows switch (`openings-arrows`), then `explorer.moves` | Kept mounted. The move menu edits (`onEditTree: core.replaceTree`); *Play chances…* is off. |
| **Map** (`map`) | `explorer.map` (`linked: true`) | Kept mounted. |
| **Load** (`load`) | `AnalysisLoad` **without `onSplit`**, `choiceLabelKey="openings.load.choice"` | One game or a merge replaces the tree (`core.loadTree` + `engine.clearAnalysis`); a FEN is `core.loadFen` (it turns the board). **No split**, because a split saves analyses. |
| **Export** (`export`) | `AnalysisExport` (`fileStem="opening"`) | FEN, and the PGN with or without comments, NAGs and side lines. |
| **Engine** (`engine`) | `AnalysisSettings` with `onClear` | **Clear** is `core.reset()` + `engine.clearAnalysis()`: back to the tree's **own start** (`startFenRef`): the `?fen=` position, or a loaded game's start. It is not the standard position. |

### 3.2 The arrows — `openingArrowsOf`

`options.arrows` is the **whole external set** (`chessboard.md` §3.4), so
the two producers are joined once, in a pure function:

1. the explorer's `arrows` (the tree's continuations through
   `nextMoveArrowsOf`: the mainline green, side lines blue; only a hovered
   next-moves-bar token while the switch is off), as they are;
2. each **book** move whose from→to the tree has **not** drawn, in
   `KNOWN_MOVE_ARROW_COLOR` (green);
3. the book row under the pointer recolours **its** arrow to
   `HOVERED_MOVE_ARROW_COLOR`, whichever set drew it.

The module's own `book.arrows` is **not used** here. It knows nothing about
the tree, and drawing both would stack two arrows on one move. Keys are
`from-to`, so two promotions on one square pair collapse to one arrow, which
is what the board can draw anyway. With the switch off, the book's arrows are
still drawn: the book is the screen's point, and the switch is the tree's.

### 3.3 Header

- **CurrentOpening** (`openings-current`, chip `openings-current-eco`). Its
  chip links to `/openings?fen=` like every other screen's. **On this screen
  that link does nothing visible**: the route does not remount, the arrival
  was read once, and the write-back (§4.2) replaces the pushed `?fen=` with
  the board's own URL (leaving one extra history entry). This is a known
  limitation, not a feature; see §9.8.
- **Analysis** (`openings-open-analysis`): §5.
- **Play from here** (`openings-play-from-here`):
  `navigate("/engine/play?fen=<core.fen>")`. Play with Engine takes the
  position as its start, and a position with Black to move sets the reader to
  Black.
- **Play** (`openings-play`) and the **engine switch**
  (`openings-setting-engine`): the Analysis Board's. Play is disabled while
  the engine is off, and a step back pauses it.

### 3.4 What is deliberately not here

No Save, no changes strip (`openings-changes` must never render), no
`beforeunload` prompt (nothing is lost that a reader was promised to keep),
no folders, no `?openings=<id>`, no `/openings/saved`, and no Load split
(`MergeSplitChoice` hides Split when `onSplit` is absent).

---

## 4. The URL

### 4.1 In: `arrivalOf`, read once

| Parameter | Meaning | Rule |
| --- | --- | --- |
| `?fen=` | the start position | `parseFen`. An unreadable one is the standard start. **A position turns the board** to the side to move. |
| `?at=` | the line on screen, as SAN from that start, comma-joined (`lib/repertoireLink.ts`) | **Replayed**: `lineTreeOf(start, atParamSans(at))` builds the tree, stopping at the first illegal SAN, and the board opens on its last move (`nodeAtParam`). |

Arrivals are read once, into state (`useState(() => arrivalOf(…))`):
arriving at a URL is what mounts the screen, and the screen rewrites its own
URL as the reader moves.

**Who links here**: `CurrentOpening`'s ECO chip on every game screen
(`?fen=`), and this screen's own address bar.

### 4.2 Out: the write-back

On every step, with **history replace**:

```
/openings[?fen=<core.tree.startFen, only when it is not the standard position>][&at=<SANs to the node on screen>]
```

Both are **derived from the tree**, not remembered from the arrival. So a
Load (a new start position, or none) or a Clear rewrites the link correctly
with no bookkeeping. **The link carries one line, not the tree.** Side lines
are not in it; the Analysis hand-off (§5) is how a tree travels.

---

## 5. The Analysis hand-off — `lib/analysisHandOff.ts`

### 5.1 Why location state

`?fen=` carries a position, and `?game=` carries a reference into a store
([`analysis-board.md`](./analysis-board.md) §3). An explored tree is neither: it is
too big for a URL and lives in no store. So it travels in the **router's
location state**, with the position on screen as the usual `?at=`:

```ts
navigate(
  { pathname: "/tools/analysis", search: "?at=e4,c5" },          // or no search at the start
  { state: analysisHandOffState(core.tree, core.orientation) },  // { analysisHandOff: { pgn, orientation } }
);
```

- The tree goes as **PGN** (`treeToPgn`: side lines, comments, NAGs and a
  non-standard start as `SetUp`/`FEN`). The state is then plain text, which
  the browser's history can structured-clone and which survives a reload.
  Never put a `GameTree` object in state: node ids and the per-tree
  `WeakMap` index do not survive a clone.
- `analysisHandOffOf(state)` reads it back with `parsePgnTree`, and is
  **non-throwing**: anything that is not a hand-off, or whose PGN does not
  parse, is `undefined`, and the board opens as if nothing were there.

### 5.2 Trade-offs, on purpose

- **Not a shareable link.** Copying the Analysis Board's URL gives `?at=`
  without the tree. A new tab or a middle-click carries no state. The button
  is a `navigate`, not a link, for that reason.
- **Survives a reload** of the same history entry (the browser keeps an
  entry's state).
- A sessionStorage slot was the alternative. It was rejected because it
  needs cleanup, leaks between tabs and has a "read once" race; router state
  has none of that.

### 5.3 The receiving end — the Analysis Board

- `AnalysisBoard.tsx`: `arrivalOf(params, location.state)` adds
  `handOff: analysisHandOffOf(state)` to the start.
- `useAnalysisBoard.ts`: **precedence** is `?analysis=` (a record) > **the
  hand-off** > `?game=` > `?fen=` > blank. A hand-off takes its own
  orientation, ignores `?move=`, and honours `?at=` (`nodeAtParam` against
  the handed-over tree).
- It is a **new, unsaved board**, the way a PGN loaded in the Load tab
  arrives: `loadedUnsaved` starts `true`, so Save opens the name-and-folder
  dialog (the name is seeded from the tags, which an explored tree usually
  lacks) and a reload or a closed tab asks first (`beforeunload`).
- **The state rides along the board's own URL writes**
  (`setSearchParams(…, { replace: true, state: urlState })`), so a reload
  keeps the tree, until a Load, a Clear or a save makes the board something
  else (`clearArrivalUrl` / `pointUrlAt` set `urlState` to `null`).
- **Gotcha, and why the effect compares presence**: the write-back effect
  checks `stateKept === (urlState !== null)`, not `location.state ===
  urlState`. `BrowserRouter` hands back a **clone** of the state, never the
  object written, so an identity check would rewrite the URL forever.
  `MemoryRouter` (the tests) keeps the object, so only a real browser shows
  that bug.

### 5.4 Using the hand-off from another screen

Any screen holding a `GameTree` can open it on the Analysis Board the same
way: `analysisHandOffState(tree, orientation)` as the state, and
`atParamOf(tree, nodeId)` as `?at=`. There is nothing to register. Do not
change the state's shape without keeping `analysisHandOffOf` able to read
the old one: a reload may still be holding it.

---

## 6. Invariants — never break these

1. **No behaviour hook.** The screen composes `useAnalysisSession` +
   `useOpeningBookModule` + `useVariationsExplorer`. New behaviour goes into a
   module or a pure function, not an `useOpenings` again.
2. **One panel, one square.** `BoardShell` / `BoardPanel`, under both
   propagation tests (`boards.test.tsx`, `panelPropagation.test.tsx`).
3. **Nothing is kept.** No store, no autosave, no Load split. Keeping means
   handing off to the Analysis Board.
4. **One arrow set, built in one place**: `openingArrowsOf`. Never pass
   `book.arrows` and `explorer.arrows` side by side.
5. **The book is lazy and shared.** Only `loadOpeningBook` imports the
   shards, and only dynamically. A static import of `src/data/openings/*`
   anywhere puts 3 MB into the main bundle.
6. **`lib/openings.ts` is pure and non-throwing**, and knows nothing about
   React, the game model or any screen.
7. **The URL is derived from the tree**, written with history replace.
   `?fen=` is validated with `parseFen`. A position turns the board.
8. **The hand-off is plain data** (PGN + orientation) and is read
   non-throwingly. `?fen=` and `?game=` are unchanged by it.
9. **The board never mirrors**, and SAN and ECO tokens take `dir="ltr"`
   (root `CLAUDE.md`, *Theming*).

---

## 7. Testing

- **Screen**: `src/views/openings/OpeningsBoard.test.tsx`. It mounts
  `OpeningsBoard` at `/openings` in a `MemoryRouter` with
  `RightPanelProvider`, a catch-all route, and a `Where` probe that records
  the path and (in an effect) the location state, which is how the hand-off
  is asserted.
- **Stubs**: `lib/engine` → `FakeEngine`, `react-chessboard` →
  `reactChessboardMock()` (both from `views/board/boardTestHarness.tsx`;
  `boardOptions()` reads what the board was last given, which is how drops,
  positions, orientation and arrows are asserted). `lib/openings` is mocked
  with a **tiny book**: `knownMoveOpenings` answers from a FEN-keyed record.
  The FEN constants it uses are declared with **`vi.hoisted`**, because
  `vi.mock` factories run before module-level `const`s. The real eco.json is
  ~3 MB and too slow per test; `lib/openings.test.ts` covers the real
  lookups over a fixture book.
- **The book loads over a promise**: wait for a row
  (`waitFor(… openings-book-move-e4 …)`) before asserting book rows or book
  arrows.
- **Pure parts**: `openingArrows.test.ts` (dedupe, colours, hover) and
  `lib/analysisHandOff.test.ts` (a structured-clone round trip, bad states,
  `lineTreeOf` stopping at an illegal SAN).
- **The receiving end**: `AnalysisBoard.test.tsx`, *a whole tree handed over
  by the Openings explorer* (mount with `{ pathname, search, state }`).
- **Shared skeleton**: the Openings explorer is a row of both propagation
  tests (`id: "openings"`), which assert the square, the panel, the pinned
  lines, the engine switch and the search of the position on screen.
- Commands:
  `npx vitest run src/views/openings src/lib/analysisHandOff.test.ts src/lib/openings.test.ts`,
  `npx vitest run src/views/tools/analysis/AnalysisBoard.test.tsx src/views/board`,
  then `yarn test:run`.
- Anything that needs real layout (arrow placement, the board's size) is a
  browser check, not jsdom (`chessboard.md` §8).

---

## 8. Debugging — symptoms and where they come from

| Symptom | Likely cause | Look at |
| --- | --- | --- |
| The Book tab is empty everywhere, and `CurrentOpening` says unknown for 1. e4 | the shards failed to load (the book is empty, not an error) | the network tab for `ecoA…E` chunks; `loadOpeningBook` |
| The Book tab stays empty in a test | the test asserted before the book promise settled, or the mock has no entry for that exact FEN (the key includes the clocks) | `waitFor` on a row; the mock's FEN keys |
| A move shows two arrows on one square pair | something is drawing `book.arrows` beside `openingArrowsOf` | `boardOptions` in `OpeningsBoard.tsx` |
| A book move's arrow is blue, not green | the tree already has that move as a side line: the tree's arrow wins, by design | §3.2 |
| The Analysis Board opens blank after the Analysis button | the state was dropped: a new tab, a middle-click, a `navigate` without `state`, or the PGN did not parse (`analysisHandOffOf` → `undefined`) | `location.state` on arrival; `analysisHandOffOf` |
| The Analysis Board loops rewriting its URL (browser only) | the write-back compared state by identity | §5.3, the gotcha |
| A reload of the Analysis Board loses the handed-over tree | a URL write went out without `state: urlState` | `AnalysisBoard.tsx` write-back effect |
| `/openings?at=…` opens at the start | the `?at=` SANs are not legal from the `?fen=` start (or `?fen=` is missing for a non-standard start): `lineTreeOf` stops at the first bad SAN | the link's `fen` and `at` |
| Clear goes to a position that is not the standard start | by design: Clear returns to the tree's own start (`?fen=` or a loaded game's) | §3.1 |
| Clicking the ECO chip on `/openings` does nothing | known: same route, no remount, arrival read once (§3.3) | §9.8 |
| Hebrew UI shows SAN reversed | a token lost its `dir="ltr"` | `OpeningBookList.tsx` |

---

## 9. Extending — recipes

### 9.1 A new tab

Add `{ id, label: t("openings.tabs.<id>"), content }` to `tabs` in
`OpeningsBoard.tsx` and the key to both catalogs. Add it to `KEEP_MOUNTED`
only if its mount is costly (`chessboard.md` §9.3.2). Assert it in
`OpeningsBoard.test.tsx`. Keep the Moves and Engine ids: both propagation
tests expect them.

### 9.2 Richer book rows (statistics, a second source)

The Book tab shows what `useOpeningBookModule` returns. For more per move
(games played, results, a masters database):

1. Put the data and its pure lookup in `src/lib/` (a new module beside
   `openings.ts`, lazy-loaded like it).
2. Extend the module's return, or add a **second capability module** under
   `views/board/core/`. Do not fold a network or database concern into the
   screen.
3. Render it in `OpeningBookList` (still presentational). If it changes
   which moves get arrows, change `openingArrowsOf` and its test.

### 9.3 Different arrow colours or rules

Colours are constants: `KNOWN_MOVE_ARROW_COLOR` / `HOVERED_MOVE_ARROW_COLOR`
(`lib/openings.ts`) for the book, and `nextMoveArrows.ts` for the tree (shared
by every board: changing those changes all of them). Rules (which set
wins, what hover does) live only in `openingArrowsOf`. Update
`openingArrows.test.ts`.

### 9.4 Re-vendoring the book

`node scripts/vendorOpenings.mjs /path/to/eco.json` → commit
`src/data/openings/*.json` → `npx vitest run src/lib/openings.test.ts` →
`yarn build` (check the five shards are still separate chunks).

### 9.5 "Can we save openings again?"

Do not bring back a saved-openings store. Keeping a tree is the Analysis
Board's job: the Analysis button hands it over, and the reader saves it
there, with folders, settings and IndexedDB storage. If a faster path is
wanted, add a button that hands off and opens the save dialog on arrival (a
flag in the hand-off state, read by `useAnalysisBoard`), rather than a
second store.

### 9.6 Handing a tree from another screen

See §5.4. If the Analysis Board should also accept a tree from elsewhere
with different semantics (for example, not "unsaved"), add a field to the
state and handle it in `useAnalysisBoard`'s start, keeping old states
readable.

### 9.7 A link that carries the whole tree

`?at=` carries one line, and that is deliberate: a tree does not fit in a
URL. If shareable trees are ever needed, they belong in a store with a
`?game=` key (`lib/gameReference.ts`, one registry line:
[`analysis-board.md`](./analysis-board.md) §3.1),
not in a longer query string.

### 9.8 Following a `?fen=` that changes while mounted

The screen reads its URL once. To make an in-app link to `/openings?fen=…`
(the ECO chip on this very screen) start a fresh board, either hide the
chip's link here (a `CurrentOpening` prop) or detect a `?fen=` that differs
from the one the screen wrote and `core.loadFen` it, adjusting during render
rather than in an effect (`react-hooks/set-state-in-effect`). Do not key the
route on `location.key`: the write-back's own `replace` mints a new key on
every step and would remount the board each move.
