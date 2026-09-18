# Chessboard v2 — the unified board core

How a board screen is **built out of one core** instead of written again. This
is the spec the `/dev/*` screens implement (CTA-60); the five shipped board
screens are untouched by it and stay the reference until v2 is polished.

Read [`chessboard.md`](./chessboard.md) first — it is still the authority on
what a board *is* (the library, the rules engine, the engine protocol, the
layout arithmetic, the testing discipline). Nothing here overrides it. This
file only says **who owns which of those rules** once five screens share one
implementation.

---

## 0. Why this exists

Five board experiences drifted apart. The leaf components were already shared
(`views/shared/`, `lib/engineAnalysis.ts`); what was not shared is **which
screen composes which of them, and with what wiring**. So each improvement had
to be re-applied by hand, and four of them were re-applied to two screens and
forgotten on three:

| | CTA-50/51 per-FEN evals | CTA-53 merged move list | CTA-54 next-moves bar | CTA-55 pinned click-to-play variations |
| --- | --- | --- | --- | --- |
| Analysis Board | ✅ | ✅ | ✅ | ✅ |
| Play with Engine | ✅ | ❌ | ❌ | ❌ |
| Masked Pieces | ✅ (inherits Play) | ❌ | ❌ | ❌ |
| Openings | ❌ | ❌ | ❌ | ❌ |
| Repertoire viewer | ❌ | ❌ | ❌ | ❌ |

Three separate behaviour hooks (`useAnalysisBoard` 712 lines,
`usePlayWithEngine` 670, `useOpenings` 383) and one inline screen
(`LibraryVariationDetail` 367) is four places to apply the fifth improvement
to. **The layer that has no owner today is the composition** — and that is
what this core is.

### The mental model: base and derived, realized as composition

The vocabulary is "class" and "subclass", and the model is exactly that: a
**base** every board is, plus **capabilities** a board opts into, plus a
**shell** that fixes the layout. What it is *not* is ES class inheritance —
this is a React 19 hooks codebase, and a class component would be a
regression. The realization is composition:

```
                       ┌─────────────────────────────────────┐
   the base ──────────▶│ useBoardCore()                      │  tree, node navigation,
                       │  GameTree · useTreeNavigation       │  rules oracle, promotion,
                       │  chess.js oracle · promotion        │  orientation, the FEN on screen
                       │  orientation · fen · applyMove      │
                       └─────────────────┬───────────────────┘
                                         │  composed by the screen, never flagged inside the base
      ┌──────────────────┬───────────────┼────────────────┬─────────────────────┐
      ▼                  ▼               ▼                ▼                     ▼
 useEngineModule   useOpeningBook…   useAutosave     (nothing)            (nothing)
  search · evals    book lines        dev stores
  options · REPLY?  arrows · hover
      │                  │               │
      └──────────────────┴───────────────┴────────────────┬─────────────────────┘
                                                          ▼
                                            ┌─────────────────────────────┐
   the shell ──────────────────────────────▶│ BoardShell + BoardPanel     │
                                            │  EngineBoardSquare (shared) │
                                            │  pinned BestVariations      │
                                            │  tab strip · BoardControls  │
                                            └─────────────────────────────┘
```

**The propagation guarantee** is the whole point: the pinned best-variations
block and the panel skeleton exist in **one component**, so changing that
component changes all five boards. That is asserted by **two** tests rather
than left to inspection: `devPanelPropagation.test.tsx` replaces `BoardPanel`
with a sentinel and renders all five boards, so a screen that grew a panel of
its own fails — which is the failure a reviewer cannot catch by reading, since
`<MyOwnPanel>` looks perfectly reasonable in isolation. `devBoards.test.tsx`
keeps the real panel and asserts what is inside it on each of the five.

---

## 1. The base — `useBoardCore`

`src/views/dev/core/useBoardCore.ts`. Everything **every** board has, and
nothing any single board has.

### What it owns

- **The `GameTree` as the one game shape.** The Analysis Board is the
  reference: a tree is the general case and a linear game is the degenerate
  one. `mainlineGame` / `treeFromGame` already bridge both directions and are
  tested both ways, so a linear screen loses nothing by holding a tree.
- **Node-based navigation**, through the shipped `useTreeNavigation`: the node
  id is the state and the ply is derived from it, because clicking a move
  inside a side line changes *which line is current* and no ply can say that.
  Everything ply-shaped still comes out, so the shared `BoardControls` drive a
  tree unmodified.
- **The `chess.js` rules oracle** — one instance in a ref, moved to whichever
  FEN is being asked about, reloaded only when the FEN actually differs. It is
  an oracle, not the game: the position comes from the tree.
- **The promotion picker's state** — the one move `onPieceDrop` cannot finish
  by itself.
- **Orientation and flip.**
- **The FEN of the position on screen**, and the turn in it.
- **A `dirty` flag** — whether the reader has actually done something, which is
  what the persistence capability gates on.

### The returned surface

Exactly this, and a screen reads nothing else off the base:

| Field | Type | What it is |
| --- | --- | --- |
| `tree` | `GameTree` | The game, side lines and all. |
| `nodeId` | `string \| null` | The selected node; `null` is the start position. |
| `line` | `VariationNode[]` | The whole line the selection sits on. |
| `ply` / `lastPly` | `number` | Indices into `line` — what `BoardControls` speak. |
| `fen` | `string` | The position on screen. |
| `turn` | `"w" \| "b"` | Whose move it is in that position. |
| `squareStyles` | `Record<string, CSSProperties>` | The last-move highlight; the whole external set. |
| `goToNode` / `goToPly` | `(id \| ply) => void` | Navigation. |
| `liveFen` | `string` | The position at the **end of the mainline** — what a linear board plays on. |
| `isLive` | `boolean` | Whether the selection *is* that end. |
| `orientation` / `flipBoard` | `"white" \| "black"` / `() => void` | Which way the board faces. |
| `promotion` / `resolvePromotion` | `{from,to} \| null` / `(piece \| null) => void` | The picker. |
| `onPieceDrop` | `(args) => boolean` | The drop handler — see `canMoveAt` below. |
| `applyMove` | `(from, to, promo?) => boolean` | A move already checked for legality. |
| `appendMove` | `(move) => boolean` | Add at the **end of the mainline** — the engine's reply. |
| `playVariation` | `(sans) => void` | Replay a SAN prefix under the node on screen (CTA-55). |
| `loadTree` / `loadFen` / `reset` | | Replace the whole game; `loadFen` also turns the board. |
| `dirty` / `markDirty` | `boolean` / `() => void` | Whether this board is the reader's own work. |
| `pgn` | `string` | `treeToPgn(tree)` — what a Position tab copies. |

### The options it takes

```ts
useBoardCore({
  fen?: string,            // a position arriving — turns the board to the side to move
  tree?: GameTree,         // a whole game arriving — does NOT turn the board
  ply?: number,            // the mainline ply an arriving game opens at (?move=)
  nodeId?: string | null,  // a place inside the tree — a reopened record
  orientation?: "white" | "black",  // a reopened record's own viewpoint
  dirty?: boolean,         // a reopened record starts dirty
  canMoveAt?: (fen: string, core: { isLive: boolean }) => boolean,
})
```

Every field but `canMoveAt` is read on the **first render only**: arriving at a
URL is what mounts the screen, so there is no later change to follow, and
reading one in an effect would mean writing state from one. A parameter that
will not parse is the caller's to reject; it arrives as `undefined`.

`canMoveAt` is the **one** seam a linear board needs, and it is a predicate
rather than a mode: Play v2 passes `(_, { isLive }) => isLive`, so a drag off
the live position is refused and no branch can ever form; the other four pass
nothing and both colours move from any node. **This is not a mode flag** — the
base has no branch on "am I a play board"; it asks a question the screen
answers.

### The rules the base keeps

These are `chessboard.md`'s, restated as the base's responsibilities so no
screen has to remember them:

- **The board is pure UI and `chess.js` owns the rules** (§1). The base is the
  only place `.move()` is called.
- **Replaying a move that is already there is not a new variation.** `addMove`
  returns the existing node and the same tree by reference, so
  `dirty` is set only when the tree actually grew.
- **A position turns the board; a game does not** — `loadFen` turns,
  `loadTree` does not, `reset` does not.
- **The promotion drop returns `true`.** Returning `false` would snap the pawn
  back and then jump it forward when the choice lands.

---

## 2. The capability modules

Each is a hook the **screen** composes. None of them is a flag inside the base,
and none of them knows which screen is calling it.

### 2.1 `useEngineModule` — the engine

`src/views/dev/core/useEngineModule.ts`.

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
// → { analysis: Analysis, evalsByFen: ReadonlyMap<string, Score>, engineOptions }
```

It owns, once, everything §4 of `chessboard.md` requires:

- the **lazy ref resolved at call time** (`getEngine()`), never read during
  render, so StrictMode's mount → unmount → remount cannot leave a dead worker;
- **subscribe in an effect, declared first**, with the returned unsubscribe;
- **terminate on unmount**;
- the **`uci` handshake**: what the running worker declared is published as
  `engineOptions`, and the caller's requested values are **clamped into the
  bounds it declared** and reported back through `onUciOptionsReady` — the
  generalization of the two shipped clamps (Play clamps four names, Analysis
  one), so the module never learns what a setting *means*;
- **`setOption` pushed before the search effect**, so on any render where both
  run the options go out ahead of the `go` that should honour them;
- **searching the position on screen**, stopping the running search when the
  switch goes off, and never searching a terminal position;
- **per-FEN evals** (CTA-50/51): the score a search *finished* with, recorded
  when its `bestmove` lands — not per streamed line, each of which is shallower
  than the last;
- **scores normalized through `lib/engineAnalysis.ts` against the turn of the
  searched FEN**, never `chess.js`'s current turn.

**The engine's reply is `onBestMove`, and that is the whole of the Play/Analysis
difference.** A board that passes no callback has no branch that moves a piece
— it does not exist for it, which is exactly the property
`useAnalysisBoard`'s header comment defends today. A board that passes one is
responsible for the guard: play it only if the search was for the live
position, it is the engine's turn, and the game is not over.

### 2.2 `useOpeningBookModule` — the book

`src/views/dev/core/useOpeningBookModule.ts`.

```ts
const book = useOpeningBookModule({ enabled: boolean, fen: string });
// → { nextMoves, arrows, hoveredMove, setHoveredMove, opening, book, positionBook }
```

The eco.json lookup for the position on screen, its known continuations, and
**their arrows** — the whole external set, recomputed on every position and
hover, because `options.arrows` is controlled and the board never clears it
(§3.4). Disabled, it loads nothing: the ~3MB book is not pulled into a screen
that does not list continuations.

### 2.3 `useAutosave` — persistence

`src/views/dev/core/useAutosave.ts`.

```ts
useAutosave({ enabled: boolean, record: T | undefined, save: (record: T) => void });
```

Write-on-change, and nothing else: `enabled` is the screen's `persist`,
`record` is `undefined` while there is nothing worth writing (no moves, not
dirty), and the **store's own idempotency** is what keeps a mount or a settings
clamp from re-ordering a list. The record is built by the screen, because only
the screen knows what its record *is*.

**Openings v2 does not use it.** An opening is explored and discarded far more
often than it is kept, so it saves on a button — that is not an omission to fix
later, it is the screen's semantics.

### 2.4 `devStores` — where a dev board writes

`src/views/dev/core/devStores.ts`. Dev screens persist to **separate
dev-prefixed keys through the shipped `lib/recordStore.ts` factory and the
shipped normalisers**:

| Store | Key |
| --- | --- |
| dev saved games | `chessapp.dev.savedGames.v1` |
| dev saved analyses | `chessapp.dev.savedAnalyses.v1` |
| dev saved openings | `chessapp.dev.savedOpenings.v1` |

Same code path, different key. So autosave, resume and reopen are genuinely
exercised, while a v2 bug can never damage a real saved game, analysis or
opening — asserted by `devStores.test.ts`, which writes a dev record and then
reads the shipped snapshots back empty.

---

## 3. The shell and the panel

`src/views/dev/core/BoardShell.tsx` and `BoardPanel.tsx`. This is the layer
that has no owner today, and the reason the issue exists.

### 3.1 `BoardShell` — the board square

It renders the **shipped** `views/shared/EngineBoardSquare`. It does *not*
copy the layout arithmetic: §5 of `chessboard.md` says a third screen with an
eval bar renders that component rather than repeating the `calc()`, and five
screens is well past three. So the eval-bar width discipline, the
captured-strip height discipline and the promotion overlay stay in exactly one
file, and `BoardShell`'s job is only to derive that component's props from the
core plus the capabilities:

```
BoardShell
├── EngineBoardSquare   (shared: eval bar + captured strips + board + promotion)
│     boardOptions ← the screen's slot: arrows, pieces, anything else
└── <RightPanel>        (portalled out of this tree; state is shared by closure)
      └── BoardPanel
```

The captured-pieces summary is computed here from the core's line, so no screen
repeats the walk.

### 3.2 `BoardPanel` — the panel skeleton

One component, five consumers, and the slots are the only per-board part:

```
┌──────────────────────────────────────┐
│ header slot                          │  fixed   — opening line, hand-offs, the engine switch
├──────────────────────────────────────┤
│ ▸ pinned BestVariations              │  fixed   — ONE block, all five boards (CTA-55)
├──────────────────────────────────────┤
│ tab strip                            │  fixed   — the tabs the screen supplied
├──────────────────────────────────────┤
│ status: the score of the position    │  fixed   — only when the board has an engine
├──────────────────────────────────────┤
│ the active tab's content             │  SCROLLS — the only scrolling region
├──────────────────────────────────────┤
│ footer slot                          │  fixed   — the next-moves bar, the explorer, a save button
├──────────────────────────────────────┤
│ |◀ ◀ ▶ ▶|                      flip  │  fixed   — the shared BoardControls
└──────────────────────────────────────┘
```

The slot contract:

| Prop | Type | Notes |
| --- | --- | --- |
| `testId` | `string` | The panel's root, and the root of every id under it. |
| `header` | `ReactNode?` | Rendered above the variations block. |
| `analysis` | `Analysis?` | Absent ⇒ no variations block and no status row: a board with no engine. |
| `requestedMultiPv` | `number?` | How many lines were asked for — the block's gap handling. |
| `engineOn` | `boolean?` | The block renders nothing while off; the status row says so. |
| `onPlayVariation` | `((sans) => void)?` | Present ⇒ the lines are clickable (CTA-55). Absent ⇒ plain text. |
| `mask` | `PieceMask?` | Masked notation inside the block. |
| `tabs` | `readonly { id, label, content }[]` | One tab is rendered at a time, never three with two hidden. |
| `activeTab` / `onTabChange` | | The screen's state — a screen may need to know the tab (CTA-54's arrows). |
| `footer` | `ReactNode?` | A sibling of the scrolling region, so it stays put while the tab scrolls. |
| `ply` / `lastPly` / `onSelectPly` / `onFlip` | | Straight through to the shared `BoardControls`. |

Two rules it keeps for every consumer:

- **One tab is rendered at a time.** The move list scrolls its selection into
  view, and a hidden copy would be scrolling a zero-height box on every move.
- **The panel is a non-scrolling flex column and exactly one child scrolls.**
  The shell's aside does not scroll (`Layout.tsx`), so `flex: 1` +
  `minHeight: 0` + `overflowY: auto` on the tab region is what keeps a long
  move list off the board square.

---

## 4. The derivation table — the five boards

Every `/dev/*` screen, and exactly what it picks. Nothing else differs.

| Board | route | Base options | Engine | Book | Autosave | Tabs | Header slot | Footer slot | Board options slot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Analysis v2** (the reference) | `/dev/analysis` | `?fen=`, `?game=`+`?move=`, `?analysis=` | ✅ switch, **no reply** | header line only | ✅ dev analyses | Moves · Engine · Position | opening + Play-from-here + switch | next-moves bar (CTA-54) | next-move arrows |
| **Play v2** | `/dev/play` | `?fen=`, `?saved=`; `canMoveAt: isLive` | ✅ switch, **reply** | header line only | ✅ dev games | Moves · Engine | opening + New game + switch | next-moves bar | — |
| **Masked v2** | `/dev/masked` | Play v2's, verbatim | ✅ switch, **reply** | header line only | ❌ (a mask cannot be restored on `/dev/play`) | Moves · Engine · Mask | Play v2's | Play v2's | `pieces: maskedPieces(mask)` |
| **Openings v2** | `/dev/openings` | `?fen=`, `?openings=` | ✅ switch, no reply | ✅ continuations + arrows | ❌ **button-triggered save** | Moves · Engine · Tree | opening + Save + switch | the explorer list | book arrows |
| **Repertoire v2** | `/dev/repertoire` | `?game=library/<path>/<id>` | ✅ switch, no reply | header line only | ❌ (a shipped file is not the reader's work) | Moves · Engine · Tree · Info | opening + switch | next-moves bar | next-move arrows |

Read the table as the specification of the derived classes. Three things it
makes visible, which were the drift:

- **Masked v2 adds nothing but the mask.** It composes the same
  `usePlayBoard` Play v2 does — one hook, called twice from two screens — and
  differs by two props: `pieces` on the board options and `mask` on the
  notation. No mode flag reaches the core, and the masking stays between the
  state and the pixels exactly as §5 of `chessboard.md` requires.
- **Openings v2 and Repertoire v2 gain CTA-51/53/54/55 by composition**, not by
  four ports. They keep what is theirs: Openings its continuations and its
  button-triggered save; Repertoire its tree replay.
- **Play v2 gains CTA-53/54/55** the same way, and loses its Variations tab —
  the lines are pinned above every tab now, so a tab for them would be the same
  component twice.

---

## 5. How to add a sixth board type

A worked recipe. The claim this spec makes is that this is the **whole** cost:
no new hook, no copied layout arithmetic, no second panel skeleton.

Say the sixth board is a **puzzle trainer**: a position arrives, the reader
plays the solution, the engine is on but must never move, and a wrong move is
undone.

1. **Pick the capabilities.** Base, yes. Engine with **no** `onBestMove` (it
   must never move). No book. No autosave — a puzzle is not the reader's own
   work. So:

   ```ts
   // src/views/dev/puzzle/usePuzzleBoard.ts
   const core = useBoardCore({ fen: initialFen });
   const [settings, setSettings] = useState(DEFAULT_ANALYSIS_SETTINGS);
   const [engineOn, setEngineOn] = useState(true);
   const engine = useEngineModule({
     enabled: engineOn,
     fen: core.fen,
     depth: settings.depth,
     moveTimeMs: settings.moveTimeMs,
     uciOptions: { [ANALYSIS_UCI_OPTION.multiPv]: settings.multiPv },
     onUciOptionsReady: (clamped) => setSettings((s) => ({ ...s, multiPv: clamped[…] })),
     // no onBestMove: this board never moves a piece
   });
   return { ...core, ...engine, settings, setSettings, engineOn, setEngineOn };
   ```

2. **Supply the slots.**

   ```tsx
   // src/views/dev/puzzle/PuzzleV2.tsx
   <BoardShell
     id="dev-puzzle"
     core={state}
     analysis={state.analysis}
     evalsByFen={state.evalsByFen}
     panel={{
       header: <CurrentOpening fen={state.fen} testId="dev-puzzle-opening" />,
       engineOn: state.engineOn,
       requestedMultiPv: state.settings.multiPv,
       onPlayVariation: state.playVariation,
       tabs: [
         { id: "moves", label: t("dev.tabs.moves"), content: <MoveList … /> },
         { id: "engine", label: t("dev.tabs.engine"), content: <AnalysisSettings … /> },
       ],
     }}
   />
   ```

3. **Register one nav entry and one route.** `views/dev/devNav.ts` gets a
   `NavItem`, and `App.tsx`'s dev-gated array gets one lazy route. Both are one
   line each.

4. **Two locale keys** — `en.ts` and `he.ts` both, because `he` is typed
   `typeof en` and a missing key is a compile error.

5. **One test**, following §8 of `chessboard.md`: stub `react-chessboard`
   (including `defaultPieces`, which the captured strips reach for), and assert
   the screen renders the shared panel skeleton's test ids — which is what puts
   the sixth board under the same propagation guarantee as the other five.

What is **not** on that list, and must not appear on it: a behaviour hook of
its own, a copy of the `calc()` arithmetic, an `engine.ts` subscription, a
`setoption` call, a second panel column, or a locale block that repeats
`moveList.*` / `variations.*` / `board.*`.

---

## 6. What v2 must never do

The non-negotiables, carried over. Any of these broken is a bug regardless of
what a screen gains:

- **The board is pure UI; `chess.js` owns the rules.** Only the base calls
  `.move()`.
- **The engine lifecycle discipline of `chessboard.md` §4.1** — nothing before
  `uciok`, no `setoption` during a search, a lazy ref resolved at call time,
  subscribe-in-effect with unsubscribe, terminate on unmount. It lives in
  `useEngineModule` and nowhere else.
- **Scores normalized through `lib/engineAnalysis.ts`, against the turn of the
  searched FEN** — not the live one, which on a board showing an earlier ply is
  a different side and inverts every evaluation shown.
- **The eval-bar width and captured-strip height arithmetic of §5** stays in
  `views/shared/EngineBoardSquare.tsx`. v2 renders it; v2 does not repeat it.
- **The board never mirrors under RTL.** `Layout.tsx`'s `ForceLTR` covers the
  board area; a panel token that must stay LTR takes the `dir` attribute, not a
  CSS declaration the RTL stylis plugin would flip.
- **`options.id` is unique on the page** — `dev-analysis-board`,
  `dev-play-board`, and so on.
- **The five shipped board screens are not touched.** `views/engine/play`,
  `views/masked/play`, `views/tools/analysis`, `views/tools/openings` and
  `views/library/LibraryVariationDetail.tsx` stay byte-identical; a shared piece
  under `views/shared/` or `src/lib/` may only change backward compatibly, with
  the shipped screens' tests passing unchanged.
- **The Development section never ships.** Everything under `/dev/*` is gated
  on `import.meta.env.DEV`, in `navFolders()`, `navItems()` and `App.tsx`, and
  the routes are `React.lazy` dynamic imports inside the dead branch so the
  production bundle carries no dev chunk at all. Verified by grepping `dist/`
  after a build: no `/dev/*` path, no `dev-*` test id, no `chessapp.dev.*`
  storage key, and no extra chunk.

  **The core is not the Development section, and since CTA-61 it ships.** The
  Repertoires board (`views/repertoires/RepertoireBoard.tsx`, `/repertoires/<id>`)
  is the first shipped screen composed from the core, so `useBoardCore`,
  `useEngineModule`, `BoardShell`, `BoardPanel` and `TreeMoveList` are in the
  production bundle by design — imported statically from `views/dev/core/`,
  where they still live. What the gate keeps out is unchanged: the five
  derived `/dev/*` boards, `devNav.ts` and `devStores.ts` (the dev-prefixed
  keys), none of which a shipped screen imports. A shipped screen must not
  import `devStores.ts` or anything outside `core/`.

  **The one residue, and why it stays.** The `dev.*` strings in
  `src/locales/en.ts` and `he.ts` *do* ship — a few hundred bytes of text that
  nothing in a production build reads. A locale catalog is one plain object, so
  a property cannot be tree-shaken out of it, and gating the block would give
  up the two guarantees the catalogs exist for: `he: typeof en` making a
  missing translation a compile error, and `locales.test.ts` asserting that
  every key the nav returns resolves in both languages — which is how a
  dev-only label, the one kind nobody would ever notice missing, is covered at
  all. Dead text in the bundle is the cheaper of the two prices. Nothing
  *executable*, addressable or persistent leaks, which is what the gate is for.

---

## 7. Where the code is

| Path | What lives there |
| --- | --- |
| `src/views/dev/core/useBoardCore.ts` | §1 — the base. |
| `src/views/dev/core/useEngineModule.ts` | §2.1 — the engine, and §4 of `chessboard.md` in one file. |
| `src/views/dev/core/useOpeningBookModule.ts` | §2.2 — the book and its arrows. |
| `src/views/dev/core/useAutosave.ts` | §2.3 — write-on-change. |
| `src/views/dev/core/devStores.ts` | §2.4 — the dev-prefixed keys. |
| `src/views/dev/core/BoardShell.tsx` | §3.1 — the board square, over the shared `EngineBoardSquare`. |
| `src/views/dev/core/BoardPanel.tsx` | §3.2 — **the** panel skeleton and the pinned variations block. |
| `src/views/dev/analysis/` · `play/` · `masked/` · `openings/` · `repertoire/` | §4 — the five derived boards. |
| `src/views/dev/devNav.ts` | The dev-gated sidebar folder and its entries. |
| `src/views/dev/devBoards.test.tsx` | The five boards rendered for real: the shared square, the shared skeleton, and the one thing each board keeps as its own. |
| `src/views/dev/devPanelPropagation.test.tsx` | The propagation assertion of §0 — `BoardPanel` replaced by a sentinel. |
| `src/views/dev/core/devStores.test.ts` | The dev/shipped key isolation of §2.4, in both directions. |
| `src/views/repertoires/RepertoireBoard.tsx` | The first **shipped** board composed from the core (CTA-61) — Repertoire v2 plus a Lines tab. `RepertoirePropagation.test.tsx` puts it under the same propagation assertion as the five dev boards. |
| `src/views/dev/devTestHarness.tsx` | The `Engine` and `<Chessboard>` stand-ins §8 of `chessboard.md` requires, written once for five boards. |
