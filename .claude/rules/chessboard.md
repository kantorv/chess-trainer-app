# Chessboard rules & patterns

How **this project** builds and operates chess boards, and the index to
everything else. Read this before adding a new board screen or customizing an
existing one.

- **UI library:** [`react-chessboard`](https://react-chessboard.vercel.app/?path=/docs/get-started--docs) **v5** (`^5.12.1`)
- **Rules engine:** [`chess.js`](https://www.npmjs.com/package/chess.js) **v1** (`^1.4.0`)
- **Analysis engine:** Stockfish WASM worker, wrapped by [`src/lib/engine.ts`](../../src/lib/engine.ts)
- **React 19** is required by react-chessboard v5.

---

## 0. Where to look

Everything about the library is already on disk. **Do not read `node_modules`
source and do not web-search for react-chessboard questions** — answer from
these instead.

**Loaded every session** (no need to open anything — it is already in context):

| File | Covers |
| --- | --- |
| **this file** | project conventions, the engine wrapper, the demo boards, v4→v5 |
| [`react-chessboard-options-api.md`](./react-chessboard-options-api.md) | **every `options.*` key** — type, default, purpose. All 43 of them. |
| [`react-chessboard-types-and-helpers.md`](./react-chessboard-types-and-helpers.md) | exported helpers (`generateBoard`, `fenStringToPositionObject`, `chessColumnToColumnIndex`, `getRelativeCoords`, …) and every handler-arg / data type (`PieceDropHandlerArgs`, `SquareHandlerArgs`, `PieceRenderObject`, `FenPieceString`, …) |

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

---

## 2. Creating a board

```tsx
import { Chessboard, type ChessboardOptions } from 'react-chessboard';

function MyBoard() {
  const chessboardOptions: ChessboardOptions = {
    id: 'my-board',
  };
  return <Chessboard options={chessboardOptions} />;
}
```

Rules:

- **Always pass a single `options` object typed as `ChessboardOptions`.** This
  catches misspelled / removed keys at compile time. Do not spread untyped
  literals.
- **Always set `options.id`** to a stable, unique string. The default is
  `"chessboard"`; two boards sharing an id on one page will conflict. The id is
  also the DOM id and is used by drag sensors.
- **No `boardWidth` prop in v5.** The board is fully responsive and fills its
  parent. Size it by constraining the container (the app already does this in
  `views/main/Layout.tsx` via `layout-board-square-body`). For a standalone
  board wrap it in a `max-width` box.
- **`ChessboardProvider`** is only needed for spare pieces / drag-from-palette
  setups or when you need `useChessboardContext`. Plain boards just use
  `<Chessboard>`.
- **The board must never mirror.** `Layout.tsx` wraps the board area in
  `ForceLTR` — files run a–h left to right in every language. See the root
  `CLAUDE.md` for why.

### Minimal state pattern (use this for any interactive board)

```tsx
// 1. chess.js in a REF, not state: handlers must see the latest game without
//    stale closures, and mutating it should not by itself trigger a render.
const chessGameRef = useRef(new Chess());
const chessGame = chessGameRef.current;

// 2. Mirror the position into state as a FEN string. Passing it back through
//    options.position makes <Chessboard> controlled — setting the string is
//    what re-renders the board.
const [chessPosition, setChessPosition] = useState(chessGame.fen());
```

To reset / load a position, replace the ref (`chessGameRef.current = new
Chess(fen)`) and then `setChessPosition(...)`.

---

## 3. Operations

> Option types, defaults and per-option examples are in
> [`react-chessboard-options-api.md`](./react-chessboard-options-api.md).
> This section is only the **project-specific** wiring around them.

### 3.1 Move by drag — `onPieceDrop`

```tsx
import type { PieceDropHandlerArgs } from 'react-chessboard';

function onPieceDrop({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs) {
  if (!targetSquare) return false; // dropped off the board

  try {
    chessGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
  } catch {
    return false; // chess.js throws on an illegal move -> snap back
  }

  setChessPosition(chessGame.fen());
  return true; // accept the move
}
```

- **Return value matters.** `true` = accept (board keeps the move), `false` =
  reject (board snaps the piece back). Return `true` for every move you actually
  applied — including the move that ends the game. Returning `false` after a
  successful `chess.js` move is a bug (it desyncs the board's internal drag
  state from the position).
- `targetSquare` is `null` when dropped outside the board — handle it first.
- `chess.js` `.move()` **throws** on illegal moves in v1; wrap in `try/catch`.
- `.move()` accepts `{ from: string; to: string; promotion?: string }` — plain
  strings, no cast needed.

### 3.2 Move by click — `onSquareClick`

Set `allowDragging: false` and drive a small "from / to" state machine.

```tsx
const [moveFrom, setMoveFrom] = useState('');
const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});

// options: { allowDragging: false, onSquareClick, squareStyles: optionSquares, position, id }
```

First click on an own piece: compute legal targets with
`chessGame.moves({ square, verbose: true })` and paint them via `squareStyles`.
Second click: if it matches a legal target, `chessGame.move(...)`; otherwise
treat it as selecting a new piece. Clear `moveFrom` + `optionSquares` after a
move.

`moves({ square })` types `square` as `chess.js` `Square` — cast with
`square as Square` when calling it.

Full worked example: `stories/basic-examples/ClickToMove.stories.tsx`.

### 3.3 Highlighting squares — `squareStyles`

Keyed by square id (`"e4"`), layered on top of the light/dark square styles.
Use it for legal-move dots, last-move highlight, selected square, check
indicator, right-click marks. The legal-move dot idiom used across the demos:

```tsx
newSquares[move.to] = {
  background: 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
  borderRadius: '50%',
};
```

### 3.4 Arrows

Arrows **you pass in** via `options.arrows` are external / controlled: they are
NOT auto-cleared on click or position change. Recompute the array yourself when
the position changes — see `Board3` deriving a single arrow from the engine's
best move. User-drawn (right-drag) arrows are separate and follow
`clearArrowsOnClick` / `clearArrowsOnPositionChange`.

### 3.5 Promotion

**v5 removed all built-in promotion UI** (`onPromotionPieceSelect`,
`showPromotionDialog`, `autoPromoteToQueen`, …). You must handle it yourself:

1. In `onPieceDrop`, detect a pawn reaching the last rank
   (`targetSquare` ends in `8` or `1`) and that the move is legal
   (`chessGame.moves({ square: sourceSquare })` contains `` `${targetSquare}=` ``).
2. Stash `{ sourceSquare, targetSquare }` in state and render your own
   piece picker (`defaultPieces` from `react-chessboard` gives you the SVGs;
   `chessColumnToColumnIndex` helps position it over the file).
3. On pick, `chessGame.move({ from, to, promotion })` and clear the stash.

The demos currently hardcode `promotion: 'q'` for simplicity — that is a
**demo-only shortcut**, not the pattern for the real app. Worked example:
`stories/advanced-examples/PiecePromotion.stories.tsx`.

---

## 4. Stockfish engine integration

Wrapper: [`src/lib/engine.ts`](../../src/lib/engine.ts). Worker script + wasm
live in `public/stockfish/` and are served from `/stockfish/stockfish.wasm.js`.

### API

| Method | Notes |
| --- | --- |
| `new Engine()` | Spawns a **dedicated Worker**. One per mounted board. |
| `evaluatePosition(fen, depth = 12)` | `position fen …` + `go depth …`. Depth is clamped to 24. |
| `onMessage(cb) => unsubscribe` | Parsed UCI messages. **Returns an unsubscribe fn — you must call it.** |
| `stop()` | `stop` — engine returns bestmove for the depth reached so far. |
| `terminate()` | `quit` + `worker.terminate()`. Call on unmount. |

Parsed message shape (`EngineMessage`): `bestMove` (`"e2e4"` or `"e7e8q"` with
promotion), `ponder`, `positionEvaluation` (centipawns, **string**),
`possibleMate`, `pv` (best line, space-separated moves), `depth` (number).

### Rules for using it from React

1. **Create the engine lazily in a ref**, not `useMemo`, not module scope:

   ```tsx
   const engineRef = useRef<Engine | null>(null);
   if (engineRef.current === null) engineRef.current = new Engine();
   const engine = engineRef.current;
   ```

   Module-scope workers leak across route changes and can never be torn down.

2. **Subscribe in an effect, unsubscribe on cleanup.** Never call
   `engine.onMessage(...)` inside a per-move function — that adds a new listener
   every move and never removes it.

   ```tsx
   useEffect(() => {
     const unsubscribe = engine.onMessage((msg) => { /* setState */ });
     return unsubscribe;
   }, [engine, chessGame]);
   ```

3. **Terminate on unmount** (also covers StrictMode's mount→unmount→remount):

   ```tsx
   useEffect(() => () => { engine.terminate(); engineRef.current = null; }, [engine]);
   ```

4. **Normalize the score.** Stockfish reports `cp` / `mate` from the
   **side-to-move's** perspective. To show "+ = White is better":
   `(chessGame.turn() === 'w' ? 1 : -1) * Number(positionEvaluation) / 100`.

5. **Filter shallow updates.** The engine streams partial results while it
   searches; ignore messages below a threshold depth (~10) to reduce churn.

6. On a new user move: `engine.stop()`, clear stale `pv` / mate state, update
   the position; let the "evaluate on position change" effect start the next
   search.

---

## 5. The four demo boards

| Route | File | Based on upstream story | Demonstrates |
| --- | --- | --- | --- |
| `/` | [`views/demos/basic/Board1.tsx`](../../src/views/demos/basic/Board1.tsx) | `Default` | Bare static board, `ChessboardOptions` typing |
| `/move` | [`views/demos/move/Board2.tsx`](../../src/views/demos/move/Board2.tsx) | `PlayVsRandom` | The core loop: ref-owned `chess.js` + controlled `position` + `onPieceDrop`; vs. a random mover |
| `/analyze` | [`views/demos/engine/Board3.tsx`](../../src/views/demos/engine/Board3.tsx) | `AnalysisBoard` | Stockfish eval per position, best move drawn as an `arrows` entry |
| `/player1` | [`views/player/engine_basic/Board.tsx`](../../src/views/player/engine_basic/Board.tsx) | (composed) | Play *against* the engine — engine moves are applied automatically |

The `MainN.tsx` files next to each board are layout-only wrappers (an MUI `Box`
with a `data-testid`); the board component is the unit of interest. Each
"upstream story" column entry names a file in
`docs/vendor/react-chessboard/stories/`.

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
- `boardWidth` — **removed**, board is responsive (size the container).
- All promotion props (`onPromotionPieceSelect`, `showPromotionDialog`,
  `autoPromoteToQueen`, `promotionToSquare`, …) — **removed**, handle promotion
  externally (§3.5).
- Premove props — **removed**, handle externally
  (`stories/advanced-examples/Premoves.stories.tsx`).
- Props are no longer passed individually — everything goes inside `options`.
- Handler signatures changed to single named-arg objects, e.g.
  `onPieceDrop({ sourceSquare, targetSquare, piece })` returning `boolean`.

Full detail: `docs/vendor/react-chessboard/G_UpgradeToV5.mdx`.

---

## 7. Checklist for a new board screen

- [ ] `options` typed as `ChessboardOptions`, unique `options.id` set.
- [ ] `chess.js` instance in a `useRef`; position mirrored to state via `fen()`.
- [ ] `onPieceDrop` (and/or `onSquareClick`) wraps `chess.js` `.move()` in
      `try/catch` and returns the correct boolean.
- [ ] Promotion handled properly, or an explicit `// demo shortcut` comment if
      hardcoding `'q'`.
- [ ] If using the engine: lazy ref, subscribe-in-effect + unsubscribe,
      `terminate()` on unmount, score normalized by turn.
- [ ] Any `setTimeout` / async work cleared on unmount.
- [ ] `tsc -b` clean.
