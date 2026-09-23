# Chessboard rules & patterns

How **this project** builds and operates chess boards: the library
conventions, the engine protocol, the layout arithmetic, testing, and the
**board core** every game board is composed from (§9). Read it before adding a
board screen or changing one.

- **UI library:** [`react-chessboard`](https://react-chessboard.vercel.app/?path=/docs/get-started--docs) **v5** (`^5.12.1`)
- **Rules engine:** [`chess.js`](https://www.npmjs.com/package/chess.js) **v1** (`^1.4.0`)
- **Analysis engine:** Stockfish WASM worker, wrapped by [`src/lib/engine.ts`](../../src/lib/engine.ts)
- **React 19** is required by react-chessboard v5.

---

## 0. Where to look

Everything about the library is already on disk. **Do not read `node_modules`
source and do not web-search for react-chessboard questions** — answer from
these instead.

**Loaded every session:**

| File | Covers |
| --- | --- |
| **this file** | project conventions, the engine wrapper and its protocol, the layout rules, testing a board, the board core |
| [`react-chessboard-options-api.md`](./react-chessboard-options-api.md) | **every `options.*` key** — type, default, purpose |
| [`react-chessboard-types-and-helpers.md`](./react-chessboard-types-and-helpers.md) | exported helpers (`generateBoard`, `fenStringToPositionObject`, `chessColumnToColumnIndex`, …) and every handler-arg / data type |

**Loaded when you work on their paths** (each file's `paths:` frontmatter):

| File | Module |
| --- | --- |
| [`tree-views.md`](./tree-views.md) | `src/views/explorer/` — how a board shows its game tree (move list, map, comments, next-move arrows) |
| [`analysis-board.md`](./analysis-board.md) | the Analysis Board, Saved analyses, the `?game=` hand-off |
| [`play-with-engine.md`](./play-with-engine.md) | Play with Engine, the Lobby, the played games |
| [`masked-pieces.md`](./masked-pieces.md) | Masked Pieces — Play with Engine in a costume |
| [`repertoires.md`](./repertoires.md) | the Repertoires section — the list, the player, the trainer and its games |
| [`openings-explorer.md`](./openings-explorer.md) | the Openings explorer and the opening book |
| [`game-collections.md`](./game-collections.md) | the Library |
| [`position-editor.md`](./position-editor.md) | the shared position editor |
| [`database.md`](./database.md) | every store (IndexedDB) |

**On disk, read on demand** — [`docs/vendor/react-chessboard/`](../../docs/vendor/react-chessboard/),
routed by its [`INDEX.md`](../../docs/vendor/react-chessboard/INDEX.md):

| Need | Open |
| --- | --- |
| A worked, compiling example of one option | `stories/options/<OptionName>.stories.tsx` |
| A full feature pattern (promotion picker, premoves, puzzles, multiplayer, 3D) | `stories/advanced-examples/` |
| The core interaction patterns (click-to-move, spare pieces, play-vs-random) | `stories/basic-examples/` |
| Narrative walkthroughs of the above | `B_BasicExamples.mdx`, `C_AdvancedExamples.mdx` |
| The full v4→v5 migration detail (§6 here is the summary) | `G_UpgradeToV5.mdx` |

On conflict **this file wins** — the two vendored rules files are upstream
reference and say nothing about how we wire things up.

---

## 1. Core principle: the board is pure UI

`react-chessboard` renders pieces on squares and reports pointer events. It has
**no concept of chess rules, turns, legality, check, or game over.** All of that
is `chess.js`. Keep the two cleanly separated:

```
chess.js (rules + state)  ->  FEN string  ->  <Chessboard options={{ position }} />
        ^                                              |
        |________________ onPieceDrop / onSquareClick __|
```

In the board core (§9) the game is a `GameTree` and `chess.js` is a *rules
oracle*: `useBoardCore` is the only place `.move()` is called.

---

## 2. Creating a board

```tsx
import { Chessboard, type ChessboardOptions } from 'react-chessboard';

const chessboardOptions: ChessboardOptions = { id: 'my-board' };
return <Chessboard options={chessboardOptions} />;
```

- **Always pass a single `options` object typed as `ChessboardOptions`.** This
  catches misspelled / removed keys at compile time.
- **Always set `options.id`** to a stable string, **unique on the page** (the
  default `"chessboard"` collides; the id is also the DOM id and is used by
  drag sensors). A list screen that renders a board per card takes the item's
  id — `saved-analyses-preview-<id>`, `repertoires-preview-<id>`.
- **No `boardWidth` prop in v5.** The board fills its parent; size it by
  constraining the container (`views/main/Layout.tsx`'s board square).
- **`ChessboardProvider`** is needed only for spare pieces or
  `useChessboardContext`. When you use it, **every option moves to it** and
  `<Chessboard />` takes none; it renders no element of its own.
  `views/shared/positionEditor/PositionEditor.tsx` is the in-repo example.
- **The board must never mirror.** `Layout.tsx` wraps the board area in
  `ForceLTR` — files run a–h left to right in every language. A board outside
  the board area (a panel, a filter) carries its own `ForceLTR`.

### Minimal state pattern (a board outside the core)

```tsx
// chess.js in a REF: handlers see the latest game without stale closures,
// and mutating it does not by itself render.
const chessGameRef = useRef(new Chess());
// The position mirrored into state — setting it is what re-renders the board.
const [chessPosition, setChessPosition] = useState(chessGameRef.current.fen());
```

To reset or load, replace the ref and then `setChessPosition(...)`. A game
board uses the core (§9) instead.

---

## 3. Operations

> Option types, defaults and examples are in
> [`react-chessboard-options-api.md`](./react-chessboard-options-api.md). This
> section is only the project-specific wiring.

### 3.1 Move by drag — `onPieceDrop`

```tsx
function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
  if (!targetSquare) return false;           // dropped off the board
  try {
    chessGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
  } catch {
    return false;                            // chess.js v1 throws on an illegal move
  }
  setChessPosition(chessGame.fen());
  return true;
}
```

- **The return value matters**: `true` keeps the move, `false` snaps the piece
  back. Return `true` for every move you applied — including a promotion
  applied a moment later once the picker answers; returning `false` there
  snaps the pawn back and then jumps it forward.
- `targetSquare` is `null` when dropped outside the board — handle it first.

### 3.2 Move by click — `onSquareClick`

Set `allowDragging: false` and drive a small from/to state machine: the first
click on an own piece paints the legal targets
(`chessGame.moves({ square: square as Square, verbose: true })`) through
`squareStyles`; the second click moves or reselects. Worked example:
`stories/basic-examples/ClickToMove.stories.tsx`.

### 3.3 Highlighting squares — `squareStyles`

Keyed by square id, layered over the square colours. Styles passed in are
**external**: the board never clears them, so every position hands it the
whole set (`lastMoveSquareStyles` in `lib/gameNavigation.ts`, the
lichess-style last-move highlight). The legal-move dot:

```tsx
newSquares[move.to] = {
  background: 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
  borderRadius: '50%',
};
```

### 3.4 Arrows

Arrows passed in via `options.arrows` are **controlled**: never auto-cleared
on click or position change. Recompute the whole array whenever the position
changes. User-drawn (right-drag) arrows are separate and follow
`clearArrowsOnClick` / `clearArrowsOnPositionChange`. Every board's next-move
arrows come from one helper, `nextMoveArrowsOf`
(`views/tools/analysis/nextMoveArrows.ts`).

### 3.5 Promotion

**v5 has no built-in promotion UI.** Detect a pawn reaching the last rank with
a legal promotion among `chessGame.moves({ square, verbose: true })`, stash
`{ from, to }`, render the picker (`views/shared/PromotionPicker.tsx`, over
`defaultPieces`), and apply the move on pick. The core does all of this
(`promotion` / `resolvePromotion`). Hardcoding `promotion: 'q'` is a demo-only
shortcut. Worked example: `stories/advanced-examples/PiecePromotion.stories.tsx`.

---

## 4. Stockfish engine integration

Wrapper: [`src/lib/engine.ts`](../../src/lib/engine.ts). Worker script + wasm
live in `public/stockfish/`, served under Vite's `base` — so the worker URL is
built from `import.meta.env.BASE_URL`, never hardcoded to the site root. The app
deploys to GitHub Pages at `/chess-trainer-app/`, where a bare
`/stockfish/stockfish.wasm.js` 404s, and `new Worker()` reports that as an
async `error` event rather than throwing — the board simply never evaluates.

### API

| Method | Notes |
| --- | --- |
| `new Engine()` | Spawns a **dedicated Worker**. One per mounted board. |
| `search(fen, { depth = 12, movetime })` | Depth is clamped to 24; `movetime` is milliseconds, omitted when 0. **May not start immediately** — §4.1. |
| `onMessage(cb) => unsubscribe` | Parsed UCI messages. **You must call the unsubscribe.** |
| `setOption(name, value) => boolean` | Buffered, not posted (§4.1). `false` means this build will not take it — no such option, or pinned. |
| `whenOptionsReady(cb) => unsubscribe` | Runs `cb` once `options` is complete, at once if the handshake already landed. |
| `options` / `supportsOption(name)` | What the **running worker** declared in its own `uci` reply. |
| `stop()` | The engine returns the bestmove for the depth reached. |
| `terminate()` | `quit` + `worker.terminate()`. Call on unmount. |

A parsed message (`EngineMessage`) has `bestMove` (`"e2e4"`, `"e7e8q"`),
`ponder`, `positionEvaluation` (centipawns, a **string**), `possibleMate`,
`pv`, `depth`, `multipv` (1-based) and `fen` — **the position this result is
for**, stamped on by the wrapper. Without it a result for the position on
screen cannot be told from one still draining out of the search it replaced.

### 4.1 The protocol discipline — why `search` and `setOption` are deferred

**The build in `public/stockfish/` abandons a running search if it receives a
`setoption` while searching**: no `bestmove`, no further `info`, and the board
never evaluates again. It is silent, so it looks like a broken worker.

`Engine` therefore buffers everything and posts it only when the engine can
take it: nothing before `uciok`, nothing while a search runs (a `stop` goes
instead, and the `bestmove` that ends the search resumes the queue). Options go
to an idle engine, and a waiting search starts only afterwards.

- **Call `search()` whenever the position changes; do not sequence it
  yourself.** A second call before the first has started replaces it.
- **A pinned option is never sent.** An option whose `min` equals its `max`
  can only be a no-op — except that `setoption name Threads value 1`, this
  build's own declared default, is itself fatal to it. `setOption` returns
  `false` for those.
- **Never hardcode the option roster.** `Threads` and `Hash` are pinned here
  (`min 1 max 1`, `min 16 max 16`); there is no `UCI_Elo` and no
  `UCI_LimitStrength`, so strength is `Skill Level` only and any Elo shown is
  an estimate. Read `engine.options` and render three states: absent, pinned,
  adjustable (`views/engine/play/EngineSettings.tsx`). Swapping the binary
  then changes the UI with no code change.

### Rules for using it from React

All of these live in `useEngineModule` (§9.2.1); a board never writes them
again.

1. **Create the engine lazily in a ref, resolved at call time — never during
   render**, not `useMemo`, not module scope:
   `const getEngine = useCallback(() => (engineRef.current ??= new Engine()), [])`.
   Reading the ref during render dies under StrictMode: its mount → unmount →
   remount runs the cleanups and then the effects again **with no render in
   between**, so every effect keeps the terminated instance. `getEngine()`
   rebuilds it.
2. **Subscribe in an effect, unsubscribe on cleanup**, and declare that effect
   **first**, so on a StrictMode remount it rebuilds the worker before the
   search effect asks it for a search.
3. **Terminate on unmount**.
4. **Normalize the score through `lib/engineAnalysis.ts`.** Stockfish reports
   `cp` / `mate` from the side to move's perspective; `scoreFromUci` is the
   one place that flips it to White's, against the turn of **the searched
   FEN** — never the live position's, which on a board showing an earlier ply
   is the other side and inverts every evaluation.
5. **Filter shallow updates** (below ~depth 10).
6. **Search the position on screen, not the live one.** Everything shown
   describes the position being looked at, and an engine move is played only
   when the search that produced it was for the position on screen.

---

## 5. Board-square layout rules

The shell (`Layout.tsx`) hands a screen a fixed square and knows nothing about
what shares it.

- **Anything sharing the board square takes width out of the board.** Eval-bar
  width + gap must come to exactly the constant subtracted from the board's
  side, and the board box needs `flexShrink: 0`, or flex shaves the difference
  off and the board stops being square. The arithmetic lives in exactly one
  file, [`views/shared/EngineBoardSquare.tsx`](../../src/views/shared/EngineBoardSquare.tsx),
  which every game board renders through `BoardShell`. **Never copy the
  `calc()`.**
- **The captured-pieces strips are that rule for height.** Two 20px strips sit
  on the board's top and bottom edges; their height + gap equals
  `CAPTURED_STRIPS_TOTAL_PX`, the board box is a `calc` of it off **both**
  width and height (one percentage base, so it stays square), and nothing
  shrinks. A strip with nothing in it still renders, so the board does not
  resize on the first capture. The constants and the strip are in
  [`views/shared/CapturedPieces.tsx`](../../src/views/shared/CapturedPieces.tsx).
  The position editor and the preview boards carry none.
- **A screen that scrolls inside the square divides it itself**: a flex column,
  a `flexShrink: 0` top bar over a `flex: 1; minHeight: 0; overflowY: auto`
  region. **A grid of cards inside it needs `gridAutoRows: "max-content"`** —
  an `auto` row in a box of definite height is stretched to share that height
  (`alignContent: "start"` does not stop it), the cards are squashed and
  clipped by `Card`'s `overflow: hidden`, and nothing ever overflows to scroll.
- **A position turns the board; a game does not.** A `?fen=` arrival faces the
  side to move; a game (`?game=`, a Library game, a loaded PGN) opens facing
  White, because a PGN's side to move at ply 0 says nothing about which side is
  studied. `useBoardCore`'s `loadFen` turns, `loadTree` and `reset` do not.
- **`options.pieces` is the only honest place to disguise a piece**
  (Masked Pieces): the board goes on reporting true squares, so legality and
  promotion never learn anything happened. Never reach for `squareRenderer`, a
  doctored `position`, or anything that changes what `chess.js` holds.
- **Spare pieces mean `ChessboardProvider`** (§2), and `onPieceDrop` does the
  whole job: `piece.isSparePiece` says it came from a palette, and a `null`
  `targetSquare` is a deletion. A board being *edited* is `chess.js` built with
  `{ skipValidation: true }`, only `put` / `remove`d — see
  [`position-editor.md`](./position-editor.md).

---

## 6. v4 → v5 cheat sheet

If you paste a v4 snippet from the web, translate it:

- Every `customX` prop lost its prefix: `customArrows` → `arrows`,
  `customBoardStyle` → `boardStyle`, `customSquareStyles` → `squareStyles`,
  `customPieces` → `pieces`, `customSquare` → `squareRenderer`, …
- `arePiecesDraggable` → `allowDragging`; `areArrowsAllowed` →
  `allowDrawingArrows`; `allowDragOutsideBoard` → `allowDragOffBoard`;
  `animationDuration` → `animationDurationInMs`; `showBoardNotation` →
  `showNotation`; `isDraggablePiece` → `canDragPiece`.
- `boardWidth` — **removed**, the board is responsive (size the container).
- All promotion props and premove props — **removed**, handle them externally
  (§3.5; `stories/advanced-examples/Premoves.stories.tsx`).
- Everything goes inside `options`; handlers take one named-arg object, e.g.
  `onPieceDrop({ sourceSquare, targetSquare, piece })` returning `boolean`.

Full detail: `docs/vendor/react-chessboard/G_UpgradeToV5.mdx`.

---

## 7. Checklist for a new board

- [ ] A game board is composed from the core (§9.5) — no behaviour hook, no
      panel, no layout arithmetic of its own.
- [ ] `options` typed as `ChessboardOptions`, a unique `options.id`.
- [ ] Outside the core: `chess.js` in a `useRef`, `.move()` in `try/catch`,
      the right boolean from `onPieceDrop`, promotion handled.
- [ ] Spare pieces: `ChessboardProvider` with the options on **it** (§5).
- [ ] Anything sharing the square: its size and gaps sum to the constant
      subtracted from the board's side, and the board box has
      `flexShrink: 0` (§5).
- [ ] Any `setTimeout` / async work cleared on unmount.
- [ ] `npx tsc -b` clean, `yarn test:run` green, `yarn lint` adding no
      findings.

---

## 8. Testing a board screen

**Stub `<Chessboard>` in Vitest.** jsdom has no layout, so the board measures a
zero-sized square and throws `Square width not found` from a mount effect —
an uncaught exception that fails the whole file. Tests are about the screen
around the board, so mock the component and assert what it was handed. The
game boards share one stub, `reactChessboardMock()` in
[`views/board/boardTestHarness.tsx`](../../src/views/board/boardTestHarness.tsx)
(`boardOptions()` reads the last options — how drops, positions, orientation
and arrows are asserted), beside `FakeEngine` (the `lib/engine` stand-in) and
`openingsMock`.

- **Stub what the screen actually imports.** A spare-piece screen needs
  `ChessboardProvider` (keeping the options), `Chessboard` and `SparePiece`
  (`PositionEditor.test.tsx`). A screen with captured strips needs
  `defaultPieces` too (any renderer keyed by the twelve piece types).
- **jsdom's CSS parser drops what it does not implement** — `aspect-ratio`
  among them — so a `toHaveStyle` on one silently fails. Assert the constant
  that can drift (the width `calc`) and leave the rest to a browser check.
- Anything that needs real layout — sizing, drag, arrow placement — is a
  browser check, not jsdom.

---

## 9. The board core

Every game board — the Analysis Board, Play with Engine, Masked Pieces, the
Library's game board, the Openings explorer and the repertoire player — is
**composed from one core** in `src/views/board/core/`: a base hook, capability
modules the screen opts into, and one shell/panel layer with slots. The
position editor, which holds a position rather than a game, is the one board
that is not.

```
                       ┌─────────────────────────────────────┐
   the base ──────────▶│ useBoardCore()                      │  tree, node navigation,
                       │  GameTree · useTreeNavigation       │  rules oracle, promotion,
                       │  chess.js oracle · promotion        │  orientation, the FEN on screen
                       └─────────────────┬───────────────────┘
                                         │  composed by the screen, never flagged inside the base
      ┌──────────────────┬───────────────┼────────────────┬─────────────────────┐
      ▼                  ▼               ▼                ▼                     ▼
 useEngineModule   useOpeningBook…   useAutosave     useTrainerModule     usePlayToggle
  search · evals    book lines        a store         the repertoire       Play
  options · REPLY?  arrows · hover
                                         │
                                         ▼
                           ┌─────────────────────────────┐
   the shell ─────────────▶│ BoardShell + BoardPanel     │
                           │  EngineBoardSquare (shared) │
                           │  pinned BestVariations      │
                           │  tab strip · BoardControls  │
                           └─────────────────────────────┘
```

It is composition, not class inheritance, and not mode flags: a screen picks
modules and fills slots. **The propagation guarantee** is that the panel
skeleton and the pinned best-variations block exist in one component, so a
change there reaches every board. Two tests assert it:
`views/board/panelPropagation.test.tsx` replaces `BoardPanel` with a sentinel
and renders every board (a screen that grew a panel of its own fails), and
`views/board/boards.test.tsx` renders the real panel and asserts what is in it
(the repertoire screens have `RepertoirePropagation.test.tsx`).

How a board shows its tree — the move list, map, comments and next-move
arrows — is a **tree view** from `src/views/explorer/`; see
[`tree-views.md`](./tree-views.md).

### 9.1 The base — `useBoardCore`

Everything every board has, and nothing any single board has:

- **The `GameTree` as the one game shape.** A linear game is the degenerate
  tree; `mainlineGame` / `treeFromGame` bridge both ways. Both colours move
  from any node, and a move from an earlier position is a side line.
- **Node-based navigation** through `useTreeNavigation`: the node id is the
  state and the ply is derived, because clicking inside a side line changes
  *which line is current*. Everything ply-shaped still comes out, so
  `BoardControls` drive a tree unmodified.
- **The `chess.js` rules oracle** — one instance in a ref, moved to whichever
  FEN is asked about. The position comes from the tree.
- **The promotion picker's state**, **orientation and flip**, **the FEN on
  screen and the turn in it**, and a **`dirty` flag** (the reader has done
  something).

| Field | Type | What it is |
| --- | --- | --- |
| `tree` | `GameTree` | The game, side lines and all. |
| `nodeId` | `string \| null` | The selected node; `null` is the start position. |
| `line` | `VariationNode[]` | The whole line the selection sits on. |
| `mainlineNodes` | `VariationNode[]` | The mainline, walked once. |
| `ply` / `lastPly` | `number` | Indices into `line` — what `BoardControls` speak. |
| `fen` / `turn` | `string` / `"w" \| "b"` | The position on screen, and who moves in it. |
| `squareStyles` | `Record<string, CSSProperties>` | The last-move highlight — the whole external set. |
| `goToNode` / `goToPly` | | Navigation. |
| `orientation` / `flipBoard` / `setOrientation` | | Which way the board faces. |
| `promotion` / `resolvePromotion` | `{from,to} \| null` / `(piece \| null) => void` | The picker. |
| `onPieceDrop` | `(args) => boolean` | The drop handler. |
| `playVariation` | `(sans) => void` | Replay a SAN prefix under the node on screen (clicking an engine line, the trainer's reply, a book move). |
| `loadTree` / `loadFen` / `reset` | | Replace the whole game; only `loadFen` turns the board. |
| `replaceTree` | `(tree) => void` | Replace the tree with **an edit of itself** (promote, delete from here, a comment) without stepping to the start: the node on screen stays when it survived, else its nearest surviving ancestor. |
| `dirty` / `markDirty` | | Whether this board is the reader's own work. |
| `pgn` | `string` | `treeToPgn(tree)`, memoised on the tree. |

```ts
useBoardCore({
  fen?: string,            // a position arriving — turns the board
  tree?: GameTree,         // a whole game arriving — does NOT turn the board
  ply?: number,            // the mainline ply an arriving game opens at (?move=)
  nodeId?: string | null,  // a place inside the tree — a reopened record
  orientation?: "white" | "black",
  dirty?: boolean,         // a reopened record starts dirty
})
```

Every field is read on the **first render only**: arriving at a URL mounts the
screen, so there is no later change to follow. A parameter that will not parse
is the caller's to reject; it arrives as `undefined`.

The base keeps these rules for every screen: only it calls `.move()`;
**replaying a move that is already there is not a new variation** (`addMove`
returns the existing node and the same tree by reference, so `dirty` is set
only when the tree grew); `loadFen` turns the board and `loadTree` / `reset` do
not; the promotion drop returns `true`.

### 9.2 The capability modules

Each is a hook the **screen** composes; none is a flag in the base, and none
knows which screen calls it.

#### 9.2.1 `useEngineModule` — the engine

```ts
const engine = useEngineModule({
  enabled: boolean,                     // the engine's switch
  fen: string,                          // the position ON SCREEN — never the live one
  depth: number,
  moveTimeMs: number,
  uciOptions: Readonly<Record<string, number>>,   // name → requested value
  onUciOptionsReady?: (clamped: Readonly<Record<string, number>>) => void,
  onBestMove?: (bestMove: string, searchedFen: string) => void,
});
// → { analysis, evalsByFen, engineOptions, clearAnalysis }
```

It owns all of §4: the lazy ref, subscribe-first, terminate on unmount; the
**`uci` handshake** — what the worker declared is `engineOptions`, and the
requested values are **clamped into those bounds** and reported through
`onUciOptionsReady` (the module never learns what a setting *means*);
`setOption` pushed before the search effect; searching the position on screen,
stopping when switched off, never searching a terminal position; **per-FEN
evals** (the score a search *finished* with, recorded at its `bestmove`); and
scores normalised against the searched FEN's turn.

**The engine's reply is `onBestMove`, and that is the whole Play/Analysis
difference.** A board that passes none has no branch that moves a piece. One
that passes it is responsible for the guard — in practice `usePlayToggle`
(§9.2.6).

#### 9.2.2 `useOpeningBookModule` — the book

```ts
const book = useOpeningBookModule({ enabled: boolean, fen: string });
// → { nextMoves, arrows, hoveredMove, setHoveredMove, opening, book, positionBook }
```

The eco.json continuations from the position on screen and their arrows,
recomputed on every position and hover. Disabled, it loads nothing (the book
is ~3 MB). The Openings explorer is its consumer
([`openings-explorer.md`](./openings-explorer.md)).

#### 9.2.3 `useAutosave` — persistence

```ts
useAutosave({ enabled: boolean, record: T | undefined, save: (record: T) => void });
```

Write-on-change and nothing else. `record` is `undefined` while there is
nothing worth writing; **the store's own idempotency** keeps a mount or a
settings clamp from re-ordering a list. The record is built by the screen.
Play with Engine and Masked Pieces use it; the Analysis Board, the Library and
the repertoires save **explicitly**, and the Openings explorer keeps nothing.

#### 9.2.4 Where a board writes

Each board writes its own store through its own record constructor, over
`lib/idbRecordStore.ts` ([`database.md`](./database.md)): the played games
(`lib/playedGameStore.ts`), the saved analyses, the repertoires, the Library's
collections. A board under development in a Development section (§9.5) writes
**dev-prefixed databases** over the same factory, so a bug there can never
damage a real record.

#### 9.2.5 `useTrainerModule` — the repertoire trainer

```ts
const trainer = useTrainerModule({
  enabled: boolean,
  core,                             // nodeId · fen · tree · onPieceDrop · resolvePromotion · playVariation
  repertoire: GameTree,             // the tree AS IT ARRIVED — what the trainer answers from
  trainerColor: "w" | "b",
  policy?: TrainerPolicy,           // default pickTrainerMove; playChancePolicy, backtrackingPolicy
  random?: () => number,            // injectable, so a test is deterministic
  delayMs?: number,
  drill?: boolean,                  // game mode: judge the reader's moves, take a wrong one back
  onJudged?: (verdict: "success" | "fail") => void,  // once per position — the first try's
  required?: VariationNode[],       // the moves the reader must choose from here
});
// → { status, onPieceDrop, resolvePromotion, requestReply(at), arrival }
```

A scripted opponent that answers **only from a repertoire**:

- **The reply guard: a move, never a position.** A reply is owed only where a
  reader's move lands (the wrapped `onPieceDrop` / `resolvePromotion` it hands
  back) or where the screen calls `requestReply` (the session's start).
  Navigating drops what is owed; stepping back to the trainer's turn never
  moves a piece.
- **It moves through the core** (`playVariation([san])` under the node on
  screen) and **asks the original tree**, so it cannot move inside a line the
  reader added.
- **Game mode (`drill`)**: at the reader's turn, where the repertoire has a
  move, the drop is judged **before** the core sees it (`judgeDrop`, pure, in
  `lib/repertoireTrainer.ts`): a repertoire move goes on, any other legal move
  is refused and never enters the tree. **One verdict per position**, the first
  try's; `requestReply` (a restart) judges afresh. A repertoire move outside
  `required` is refused, unjudged. `arrival` is the node the last *played* move
  landed on (`null` after navigation), which is how a game tells a line was
  finished.
- **A new policy is a new `TrainerPolicy` function**, passed as `policy`; what
  a verdict is worth is the screen's `onJudged`. Neither touches the module or
  the core. The repertoire games are in [`repertoires.md`](./repertoires.md).

#### 9.2.6 `usePlayToggle` — Play

```ts
const play = usePlayToggle({ core, engineOn, initial?, finished? });
// → { playing, thinking, engineTurn, onBestMove, toggle, restart }
```

The engine playing **the side not at the bottom** while Play is on: its
`onBestMove` plays a finished search's move only when the search was for the
node on screen and it is that side's turn. Play pauses on any step that is not
one move forward, a change of side (the flip — the reader's side *is* the
orientation), the engine switched off, the game over, or `finished` (a
resignation). Pressing Play at the engine's turn with a search of that position
finished plays at once. The Analysis Board, the Library's game board and the
Openings explorer start it off; Play with Engine starts it on. The header
button and status line are `PlayToggleButton.tsx` / `EngineThinking.tsx`
(`views/tools/analysis/`).

### 9.3 The shell and the panel

#### 9.3.1 `BoardShell` — the board square

Renders the shared `views/shared/EngineBoardSquare` (eval bar, captured
strips, board, promotion picker) and derives its props from the core and the
modules; the captured-pieces summary is computed here from the core's line.
The screen's `boardOptions` slot takes arrows, `pieces`, anything else; the
panel is portalled into the shell's right-hand aside (`RightPanel`).

```
BoardShell
├── EngineBoardSquare   (shared: eval bar + captured strips + board + promotion)
│     boardOptions ← the screen's slot
└── <RightPanel>
      └── BoardPanel
```

#### 9.3.2 `BoardPanel` — the panel skeleton

```
┌──────────────────────────────────────┐
│ header slot                          │  fixed
│ ▸ pinned BestVariations              │  fixed — ONE block, every board
│ tab strip                            │  fixed
│ status: the score of the position    │  fixed — only with an engine
│ the active tab's content             │  SCROLLS — the only scrolling region
│ footer slot                          │  fixed
│ |◀ ◀ ▶ ▶|                      flip  │  fixed — BoardControls
└──────────────────────────────────────┘
```

| Prop | Type | Notes |
| --- | --- | --- |
| `testId` | `string` | The panel's root, and the root of every id under it. |
| `header` / `footer` | `ReactNode?` | Fixed slots above the variations block and below the tab region. |
| `analysis` | `Analysis?` | Absent ⇒ no variations block and no status row. |
| `requestedMultiPv` | `number?` | How many lines were asked for. |
| `engineOn` | `boolean?` | The block renders nothing while off; the status row says so. |
| `onPlayVariation` | `((sans) => void)?` | Present ⇒ the lines are clickable. |
| `mask` | `PieceMask?` | Masked notation in the block (Masked Pieces). |
| `showVariations` | `boolean?` | Whether the block shows at all — on by default. |
| `tabs` | `readonly { id, label, content, disabled? }[]` | One is rendered at a time unless `keepMounted` names it; the screen keeps `activeTab` off a disabled tab. |
| `keepMounted` | `readonly string[]?` | Tabs that mount on first open and stay mounted, hidden — for a body whose mount is the cost (a 9,000-move list). Showing one again scrolls its current move into view. |
| `activeTab` / `onTabChange` | | The screen's state. |
| `ply` / `lastPly` / `onSelectPly` / `onFlip` | | Straight through to `BoardControls`. |

**One tab is rendered at a time** by default (a hidden move list would scroll a
zero-height box on every move); **the panel is a non-scrolling flex column and
exactly one child scrolls** (`flex: 1; minHeight: 0; overflowY: auto`), because
the shell's aside does not scroll.

### 9.4 The boards

Every board composed from the core, and what it picks. Each module's file has
the detail.

| Board | Session | Engine reply | Book | Saving | Tabs | Tree view |
| --- | --- | --- | --- | --- | --- | --- |
| **Analysis Board** `/tools/analysis` | `useAnalysisSession` (+ the saved record: `useAnalysisBoard`) | Play (off at start) | — | explicit: Save → changes strip or name-and-folder dialog | Moves · Map · Load · Export · Engine | explorer, editing on, *Play chances…* off, `addedIds` |
| **Play with Engine** `/engine/play` | `usePlayGame` | Play (on from the start) | — | `useAutosave` → played games | Moves · Map · Engine | explorer, as the Analysis Board without `addedIds` |
| **Masked Pieces** `/engine/masked` | `usePlayGame` (the same `PlayScreen`) | as Play with Engine | — | as Play with Engine, the costume on the record | + Masking | as Play with Engine, plus `mask` |
| **Library game** `/library/<c>/<n>` | `useAnalysisSession` | Play (off) | — | explicit: Update / Save as copy (shipped: copy to Saved analyses) | Moves · Map · Info · Export · Engine | as the Analysis Board |
| **Openings explorer** `/openings` | `useAnalysisSession` | Play (off) | `useOpeningBookModule` | nothing is kept; hands the tree to the Analysis Board | Book · Moves · Map · Load · Export · Engine | as Play with Engine |
| **Repertoire player** `/repertoires/<id>` (+ `/games/<game>`) | the core + `useTrainerModule` | none — the trainer is the opponent | — | explicit: Update / Save as copy (a game never writes) | Moves · (Score) · Map · Settings · Engine | the full explorer; editing and comments in the player only |

Next-move arrows are one helper, `nextMoveArrowsOf` — the mainline's move
green, side lines blue, the hovered one in the hover colour — so a change of
colour reaches every board.

### 9.5 Adding a board

The whole cost of a new board, say a **puzzle trainer** (a position arrives,
the reader plays the solution, the engine never moves):

1. **Pick the capabilities** in a small screen hook: `useBoardCore({ fen })`,
   `useEngineModule` with **no** `onBestMove`, no book, no autosave.
2. **Supply the slots**: `<BoardShell id="puzzle" core={…} analysis={…}
   evalsByFen={…} panel={{ header, tabs, footer, … }} />`, with the tree view
   from `useVariationsExplorer` (or the puzzle mode, `tree-views.md` §4).
3. **One route in `App.tsx` and one `navItems()` entry.** A board still being
   built goes behind a **Development section**: its nav folder and entries are
   spreads in `navFolders()` / `navItems()` gated on `import.meta.env.DEV`, its
   route a `React.lazy` import inside an `import.meta.env.DEV ? [...] : []`
   array (so the production bundle carries no chunk of it), and a store it
   writes gets dev-prefixed database names (§9.2.4). Verify after `yarn build`
   by grepping `dist/` for its paths, test ids and database names (the
   Stockfish runtime's own `/dev/stdin` and `/dev/tty` are expected).
4. **Locale keys** in `en.ts` and `he.ts` both (`he` is typed `typeof en`).
5. **One test** stubbing `react-chessboard` (with `defaultPieces`), and a row
   in `boards.test.tsx` and `panelPropagation.test.tsx`.

What is **not** on that list, and must not appear: a behaviour hook of its
own, a copy of the `calc()`, an `engine.ts` subscription, a `setoption` call,
a second panel, or a locale block repeating `moveList.*` / `variations.*` /
`board.*`.

### 9.6 What a board must never do

- **Call `.move()` outside the base**; `chess.js` owns the rules.
- **Break the engine discipline of §4.1**, which lives in `useEngineModule`
  and nowhere else.
- **Normalise a score against anything but the searched FEN's turn.**
- **Repeat the layout arithmetic** of §5 outside `EngineBoardSquare.tsx`.
- **Mirror under RTL.** A panel token that must stay LTR takes the `dir`
  attribute, not a CSS declaration (the RTL stylis plugin flips it).
- **Share an `options.id`** — `analysis`, `play-with-engine`, `masked-play`,
  `openings`, `library-game`, `repertoire-board`, `repertoire-game`.
- **Change a shared piece incompatibly.** Under `views/shared/`,
  `views/explorer/`, `views/board/core/` or `src/lib/`, a new behaviour is an
  optional prop whose absence is today's behaviour, with every screen's tests
  passing unchanged.
- **Ship a Development section**, or import anything of one from a shipped
  screen.
