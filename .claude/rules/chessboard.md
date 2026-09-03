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
| **this file** | project conventions, the engine wrapper and its protocol discipline, the board screens, v4→v5, testing a board |
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
live in `public/stockfish/`, served under Vite's `base` — so the worker URL is
built from `import.meta.env.BASE_URL`, never hardcoded to the site root. The app
deploys to GitHub Pages at `/chess-trainer-app/`, where a bare
`/stockfish/stockfish.wasm.js` 404s; `new Worker()` reports that as an async
`error` event rather than throwing, so the board simply never evaluates.

### API

| Method | Notes |
| --- | --- |
| `new Engine()` | Spawns a **dedicated Worker**. One per mounted board. |
| `search(fen, { depth = 12, movetime })` | The one to use. Depth is clamped to 24; `movetime` is milliseconds and is omitted when 0. **May not start immediately** — see §4.1. |
| `evaluatePosition(fen, depth = 12)` | `search(fen, { depth })`. Kept for the two demo boards. |
| `onMessage(cb) => unsubscribe` | Parsed UCI messages. **Returns an unsubscribe fn — you must call it.** |
| `setOption(name, value) => boolean` | Buffered, not posted (§4.1). `false` means this build will not take it — either it has no such option or it has pinned it. |
| `whenOptionsReady(cb) => unsubscribe` | Runs `cb` once `options` is complete, immediately if the handshake already landed. |
| `options` / `supportsOption(name)` | What the **running worker** declared, from its own `uci` reply. |
| `stop()` | `stop` — engine returns bestmove for the depth reached so far. |
| `terminate()` | `quit` + `worker.terminate()`. Call on unmount. |

Parsed message shape (`EngineMessage`): `bestMove` (`"e2e4"` or `"e7e8q"` with
promotion), `ponder`, `positionEvaluation` (centipawns, **string**),
`possibleMate`, `pv` (best line, space-separated moves), `depth` (number),
`multipv` (1-based line rank), and `fen` — **the position this result is for**.

`fen` has no UCI equivalent; the wrapper stamps it on. Without it you cannot tell
a result for the position on screen from one still draining out of the search it
replaced, which is how a screen ends up playing a move computed for a position
the player has navigated away from.

### 4.1 The protocol discipline — why `search` and `setOption` are deferred

**The build in `public/stockfish/` abandons a running search if it receives a
`setoption` while searching.** Not an error, not an ignored command: no
`bestmove`, no further `info`, and the board never evaluates again. It is silent,
so it does not look like a protocol bug — it looks like a broken worker.

`Engine` therefore buffers everything and posts it only when the engine can take
it. Nothing goes out before `uciok` (until the engine lists its options there is
no way to tell a real one from a name this build has never heard of), and nothing
goes out while a search is running (a `stop` goes instead, and the `bestmove`
that ends the search resumes the queue). Options are applied to an idle engine,
and a waiting search starts only afterwards — so a search always runs under the
settings that were asked for.

Consequences for a caller:

- **Call `search()` whenever the position changes; do not sequence it yourself.**
  A second call before the first has started replaces it, so rapid stepping
  through a game does not build a queue of searches nobody is looking at.
- **A pinned option is never sent.** An option whose `min` equals its `max` has
  one legal value, so posting it can only be a no-op — except that
  `setoption name Threads value 1`, this build's *own declared default*, is
  itself fatal to it. `setOption` returns `false` for those.
- **Never hardcode the option roster.** `Threads` and `Hash` exist here but are
  pinned (`min 1 max 1`, `min 16 max 16`); there is no `UCI_Elo` and no
  `UCI_LimitStrength`, so strength is `Skill Level` only and any Elo figure shown
  is an estimate, never a setting. Read `engine.options` and render three states:
  absent, pinned, and adjustable. `views/engine/play/EngineSettings.tsx` is the
  worked example, and doing it this way means swapping the binary changes the UI
  with no code change.

### Rules for using it from React

1. **Create the engine lazily in a ref, resolved at call time — never during
   render**, not `useMemo`, not module scope:

   ```tsx
   const engineRef = useRef<Engine | null>(null);
   const getEngine = useCallback(() => (engineRef.current ??= new Engine()), []);
   ```

   Module-scope workers leak across route changes and can never be torn down.
   Reading the engine during render (`const engine = engineRef.current`) looks
   equivalent but dies under StrictMode: its mount → unmount → remount runs the
   cleanups and then the effects again **with no render in between**, so every
   effect keeps the instance that rule 3 just terminated and the board is silent
   for the rest of the session. `getEngine()` rebuilds it instead. Call it from
   the effects and the move handlers; the engine is then absent from their
   dependency arrays.

2. **Subscribe in an effect, unsubscribe on cleanup.** Never call
   `engine.onMessage(...)` inside a per-move function — that adds a new listener
   every move and never removes it.

   Declare this effect **first**, so on a StrictMode remount it is the one that
   rebuilds the worker before the evaluate effect asks it for a search.

   ```tsx
   useEffect(() => {
     const unsubscribe = getEngine().onMessage((msg) => { /* setState */ });
     return unsubscribe;
   }, [getEngine, chessGame]);
   ```

3. **Terminate on unmount** (also covers StrictMode's mount→unmount→remount):

   ```tsx
   useEffect(() => () => { engineRef.current?.terminate(); engineRef.current = null; }, []);
   ```

4. **Normalize the score — through `lib/engineAnalysis.ts`, not by hand.**
   Stockfish reports `cp` / `mate` from the **side-to-move's** perspective, so
   the same number means White on one turn and Black on the next. `scoreFromUci`
   is the single place that flip happens; `formatScore` and `evalBarFraction`
   then assume White's perspective, and a mate prints as `M5`, never as the
   five-figure centipawn number it would otherwise imply.

   Pass the turn of **the position that was searched** (read it off that FEN),
   not `chessGame.turn()` — on a screen where the board can show an earlier ply
   those are different, and mixing them inverts every evaluation shown.

5. **Filter shallow updates.** The engine streams partial results while it
   searches; ignore messages below a threshold depth (~10) to reduce churn.

6. On a new user move: `engine.stop()`, clear stale `pv` / mate state, update
   the position; let the "evaluate on position change" effect start the next
   search.

---

## 5. The board screens

| Route | File | Based on upstream story | Demonstrates |
| --- | --- | --- | --- |
| `/` | [`views/demos/basic/Board1.tsx`](../../src/views/demos/basic/Board1.tsx) | `Default` | Bare static board, `ChessboardOptions` typing |
| `/move` | [`views/demos/move/Board2.tsx`](../../src/views/demos/move/Board2.tsx) | `PlayVsRandom` | The core loop: ref-owned `chess.js` + controlled `position` + `onPieceDrop`; vs. a random mover |
| `/analyze` | [`views/demos/engine/Board3.tsx`](../../src/views/demos/engine/Board3.tsx) | `AnalysisBoard` | Stockfish eval per position, best move drawn as an `arrows` entry |
| `/player1` | [`views/player/engine_basic/Board.tsx`](../../src/views/player/engine_basic/Board.tsx) | (composed) | Play *against* the engine — engine moves are applied automatically. The **minimal** reference for the engine-move loop; deliberately left alone by CTA-12 |
| `/engine/play` | [`views/engine/play/PlayWithEngine.tsx`](../../src/views/engine/play/PlayWithEngine.tsx) | (composed) | The full screen: eval bar, move list, MultiPV variations, live UCI settings, a real promotion picker. Takes a `?fen=` starting position |
| `/tools/analysis` | [`views/tools/analysis/AnalysisBoard.tsx`](../../src/views/tools/analysis/AnalysisBoard.tsx) | (composed) | Analysis: a **variation tree** (`lib/gameTree.ts`), PGN/FEN set-up and export, both colours movable, engine and eval bar switched independently |
| `/tools/editor` | [`views/tools/editor/BoardEditor.tsx`](../../src/views/tools/editor/BoardEditor.tsx) | `SparePieces` | Position editing: `ChessboardProvider` + spare-piece palettes, `{ skipValidation: true }`, illegal positions reported rather than refused, hand-off to either of the two screens above |

The `MainN.tsx` files next to each board are layout-only wrappers (an MUI `Box`
with a `data-testid`); the board component is the unit of interest. Each
"upstream story" column entry names a file in
`docs/vendor/react-chessboard/stories/`.

The first four are **demos** — the smallest thing that shows one idea, and worth
keeping small. `/engine/play`, `/tools/analysis` and `/tools/editor` are real
screens; when the two kinds disagree about how much to handle (promotion is the
standing example), the demo's shortcut is the one that stays.

**Two rules the Play with Engine screen is built on, worth reusing:**

- **Search the position on screen, not the live one.** The player can step back
  at any time. Everything shown — evaluation, variations, depth — describes the
  ply being looked at, so that is what gets searched; the engine's move is played
  only when the search that produced it was for the live position. Dragging is
  disabled off the live position, because a drag there would apply to a position
  nobody is looking at.
- **Anything sharing the board square with the board takes width out of it.** The
  shell hands the screen a square and knows nothing about an eval bar
  (`Layout.tsx` is not changed for one). Bar width + gap must come to exactly the
  constant subtracted from the board's side, and the board box needs
  `flexShrink: 0`, or flex shaves the difference off and the board stops being
  square.

**And two the Analysis Board adds:**

- **An analysis board never moves a piece by itself.** It reads `info` lines and
  ignores `bestmove` entirely — the branch that plays one does not exist in
  `useAnalysisBoard`. That is why it is a separate hook rather than
  `usePlayWithEngine` with a mode flag: the two differ on whether the engine
  moves, whether both colours are draggable, and whether searching is
  unconditional, which is all of the behaviour there is.
- **A screen that can branch navigates by node, not by ply.** See the root
  `CLAUDE.md` on the tree; the shared `BoardControls` still take a ply, and
  `useTreeNavigation` derives one from the line the reader is standing on.

**And two the Board Editor adds:**

- **Spare pieces mean `ChessboardProvider`, and the options move with them.**
  Every option that would have gone on `<Chessboard>` goes on the provider
  instead and the board itself takes no props (§2, and
  `stories/basic-examples/SparePieces.stories.tsx`) — a `SparePiece` can only
  reach the drag context from inside it. `onPieceDrop` then does the whole job:
  `piece.isSparePiece` says whether it came from a palette, and a `null`
  `targetSquare` — anywhere off the board, the palettes and the trash included —
  is a deletion. The provider renders no element, so it costs the layout nothing.
- **A board being edited is illegal on the way to being legal.** It is a
  `chess.js` built with `{ skipValidation: true }`, only ever `put` to and
  `remove`d from, and `lib/positionEditor.ts` *reports* what is wrong instead of
  refusing it — see the root `CLAUDE.md`. The one thing `chess.js` still refuses
  is a second king of one colour, so `put` returning `false` is a real branch and
  the drop has to put back whatever it lifted.

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

---

## 8. Testing a board screen

**Stub `<Chessboard>` in Vitest.** jsdom has no layout engine, so the board
measures a zero-sized square and throws `Square width not found` from a mount
effect — an uncaught exception that fails the whole test file, not just the
assertion that touched it. Tests are about the screen *around* the board, so
mock the component and assert the position it was handed:

```tsx
vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options: { position?: string } }) => (
    <div data-testid="board" data-position={options.position} />
  ),
}));
```

The type-only `import type { ChessboardOptions }` in the component under test is
erased at compile time, so the mock does not have to provide it. Anything that
depends on the board actually rendering — sizing, drag, arrows — belongs in a
browser check, not in jsdom. `views/games/load_pgn/LoadPgn.test.tsx` is the
worked example.

**Stub whatever the screen actually imports.** A spare-piece screen reaches for
three exports, not one: the options go to `ChessboardProvider`, the palettes are
`SparePiece`s, and `<Chessboard>` takes nothing — so the stub keeps the options
from the *provider* and the board renders what it finds there.
`views/tools/editor/BoardEditor.test.tsx` is that version.

jsdom's CSS parser also drops properties it does not implement — `aspect-ratio`
among them — so a `toHaveStyle` assertion on one silently fails. Assert the
constant that can drift (the width `calc`) and leave what the browser makes of
it to a browser check.
