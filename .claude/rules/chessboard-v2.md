# Chessboard v2 — the unified board core

How a board screen is **built out of one core** instead of written again. This
is the spec the core implements (CTA-60), first proved by boards in a dev-only
Development section at `/dev/*`. The shipped screens moved onto it one issue
at a time: the **Analysis Board** is Analysis v2, shipped (CTA-73), **Play
with Engine** is Play v2, shipped (CTA-74), the **Library's game board** was
built on it from the start (CTA-75, which replaced the old Library and its
repertoire viewer), the **Openings explorer** was rebuilt on it (CTA-78, which
retired Openings v2 and the old screen), and **Masked Pieces**, the last, is
Play with Engine's screen in a costume (CTA-79, which retired Play v2, Masked
v2 and with them the Development section). Every game board is on it now; the
Board Editor, which edits a position, is the one board that is not.

Read [`chessboard.md`](./chessboard.md) first — it is still the authority on
what a board *is* (the library, the rules engine, the engine protocol, the
layout arithmetic, the testing discipline). Nothing here overrides it. This
file only says **who owns which of those rules** once every screen shares one
implementation.

---

## 0. Why this exists

Five board experiences drifted apart. The leaf components were already shared
(`views/shared/`, `lib/engineAnalysis.ts`); what was not shared is **which
screen composes which of them, and with what wiring**. So each improvement had
to be re-applied by hand, and four of them were re-applied to two screens and
forgotten on three:

| | CTA-50/51 per-FEN evals | CTA-53 merged move list (now the variations explorer) | CTA-54 next-moves bar | CTA-55 pinned click-to-play variations |
| --- | --- | --- | --- | --- |
| Analysis Board | ✅ | ✅ | ✅ | ✅ |
| Play with Engine | ✅ | ❌ | ❌ | ❌ |
| Masked Pieces | ✅ (inherits Play) | ❌ | ❌ | ❌ |
| Openings | ❌ | ❌ | ❌ | ❌ |
| Repertoire viewer | ❌ | ❌ | ❌ | ❌ |

Three separate behaviour hooks (`useAnalysisBoard` 712 lines,
`usePlayWithEngine` 670, `useOpenings` 383) and one inline screen (the old
Library's repertoire viewer, 367 — gone with that Library in CTA-75) was four
places to apply the fifth improvement to. **The layer that had no owner was
the composition** — and that is what this core is.

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
 useEngineModule   useOpeningBook…   useAutosave     useTrainerModule     usePlayToggle
  search · evals    book lines        a store         the repertoire       Play
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
component changes every board. That is asserted by **two** tests rather
than left to inspection: `devPanelPropagation.test.tsx` replaces `BoardPanel`
with a sentinel and renders every board, so a screen that grew a panel of
its own fails — which is the failure a reviewer cannot catch by reading, since
`<MyOwnPanel>` looks perfectly reasonable in isolation. `devBoards.test.tsx`
keeps the real panel and asserts what is inside it on each of them (the
repertoire screens have their own, `RepertoirePropagation.test.tsx`).

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
| `replaceTree` | `(tree) => void` | Replace the tree with an **edit of itself** (CTA-64 — promote, make main line, delete from here) *without* `loadTree`'s step to the start: the node on screen stays when it survived, else its nearest surviving ancestor. Marks dirty. |
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
rather than a mode: `(_, { isLive }) => isLive` refuses a drag off the live
position, so no branch can ever form. The dev board Play v2 passed it (until
CTA-79); every shipped board passes nothing and both colours move from any
node — the flat tree view ([`tree-views.md`](./tree-views.md) §3) is specified
for the next board that does. **This is not a mode flag** — the
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
— it does not exist for it, which is exactly the property the Analysis
Board's header comment states (`views/tools/analysis/AnalysisBoard.tsx`). A board that passes one is
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

**The Openings explorer does not use it** (CTA-78). An opening is explored,
not kept: the screen saves nothing and hands its tree to the Analysis Board
instead — that is not an omission to fix later, it is the screen's semantics.

### 2.4 Where a board writes

A shipped board writes its own real store, through its own record
constructor, over the shipped IndexedDB factory `lib/idbRecordStore.ts`
([`database.md`](./database.md)): Play with Engine and Masked Pieces `lib/playedGameStore.ts`
(through `useAutosave`), the Analysis Board and the Library the analyses'
store, explicitly. (While the boards were developed in the Development
section, a dev board wrote **dev-prefixed keys** over the same factory and
normalisers — `views/dev/core/devStores.ts`, `chessapp.dev.*` — so a v2 bug
could never damage a real record. It went with the section's last boards in
CTA-79; §5 says to bring the pattern back with the next board developed
there.)

---

### 2.5 `useTrainerModule` — the repertoire trainer

`src/views/dev/core/useTrainerModule.ts` (CTA-63), over the pure
`src/lib/repertoireTrainer.ts`.

```ts
const trainer = useTrainerModule({
  enabled: boolean,                 // off while the tree is being read
  core,                             // nodeId · fen · tree · onPieceDrop · resolvePromotion · playVariation
  repertoire: GameTree,             // the tree AS IT ARRIVED — what the trainer answers from
  trainerColor: "w" | "b",
  policy?: TrainerPolicy,           // default pickTrainerMove (uniform); the repertoire screens pass
                                    // playChancePolicy (lichess-tools prc:N, CTA-69) or backtrackingPolicy
  random?: () => number,            // injectable, so a test is deterministic
  delayMs?: number,
  drill?: boolean,                  // game mode: judge the reader's moves, take a wrong one back
  onJudged?: (verdict: "success" | "fail") => void,  // once per position — the first try's
  required?: VariationNode[],       // a game's constraint: the moves the reader must choose from here
});
// → { status: "trainer-thinking" | "your-move" | "out-of-book" | "try-again",
//     onPieceDrop, resolvePromotion,   // hand these to BoardShell in place of the core's
//     requestReply(at),                // "the session starts here"
//     arrival }                        // where the last PLAYED move landed, while on screen
```

A scripted opponent that answers **only from a repertoire**. What it owns:

- **The reply guard: a move, never a position.** A reply is owed only at the
  node a reader's move lands on — noted by the wrapped `onPieceDrop` /
  `resolvePromotion` it hands back — or where the screen calls
  `requestReply` (the session's start, which is how it moves first as
  White). Navigating anywhere drops what is owed, in the same render; stepping
  back to the trainer's turn never moves a piece.
- **The timer**, cleared on navigation, on a new move and on unmount.
- **Moving through the core**: `playVariation([san])` under the node on
  screen, so a move the tree has is followed. Never `appendMove` (the end of
  the mainline), and never `chess.js` directly.
- **Asking the original tree.** A node the reader added is not in it, so the
  policy has nothing there — the trainer cannot move inside an extension.
- **Game mode (`drill`).** At the reader's own turn, where the repertoire has
  a move, the wrapped drop **judges before the core sees it**
  (`judgeDrop`, pure, in `lib/repertoireTrainer.ts` — by the from/to squares
  every node carries, with `chess.js` only *read* for legality): a repertoire
  move is a success and goes on; any other legal move is a failure and is
  **taken back** by refusing the drop — it never enters the tree; an illegal
  drop, or a move past the line's end, is not judged. A promotion is judged
  by the piece picked. **One verdict per position**: the first try's;
  retries after a failure count nothing, and `requestReply` (a restart)
  judges the line afresh. Verdicts go out through `onJudged`; the status is
  `try-again` while a wrong try stands.
- **`required` and `arrival`, for the games.** A repertoire move outside
  `required` is refused in game mode, unjudged (Backtracking: a right move,
  but a finished line's). `arrival` is the node the last *played* move —
  reader's or trainer's — landed on, `null` after navigation, so a game
  reads "a line was just finished" off it and navigating onto a line's end
  never counts. The games' rules are `lib/repertoireGames.ts`; their session
  state is the screen's (`useRepertoireGame`).

**Adding a policy, a scoring rule or a mode.** A new trainer (weighted,
mainline-first, spaced repetition) is a new function of type `TrainerPolicy`
in `lib/repertoireTrainer.ts`, passed as `policy` — never a branch in
`pickTrainerMove` or in the module. `playChancePolicy` (CTA-69) is the worked
example: lichess-tools' `prc:N` play chances, their rules pure in
`lib/playChance.ts`, handed in by `useRepertoireGame` with a mark reader over
the session's tree — nothing in the module changed for it. What a verdict is *worth* — the session
tally today (`DrillScore` / `withVerdict`), a persisted per-position record
for spaced repetition later — is the screen's `onJudged`, never the
module's. A further mode is one more option here, beside `drill`. None of it
touches `useBoardCore`, and the extension marker (`extensionIdsOf`, the move
list's `extensionIds`) keeps working unchanged, because it is derived from
the tree rather than recorded.

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

One component, every board its consumer, and the slots are the only per-board part:

```
┌──────────────────────────────────────┐
│ header slot                          │  fixed   — opening line, hand-offs, the engine switch
├──────────────────────────────────────┤
│ ▸ pinned BestVariations              │  fixed   — ONE block, every board (CTA-55)
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
| `mask` | `PieceMask?` | Masked notation inside the block (Masked Pieces, while its notation switch is on). |
| `showVariations` | `boolean?` | Whether the block shows at all — on by default. Masked Pieces passes its engine-lines switch (off by default, CTA-79): an engine line names the pieces the mask hides. The status row stays. |
| `tabs` | `readonly { id, label, content, disabled? }[]` | One tab is rendered at a time, never three with two hidden — unless `keepMounted` names it. `disabled` greys a tab out (the Play repertoire screen's Engine tab while its engine is off); the screen keeps `activeTab` off a disabled tab. |
| `keepMounted` | `readonly string[]?` | Opt-in: these tabs mount on first open and then stay mounted, hidden, while another shows — for a body whose mount is the cost (the Repertoires board keeps `moves`). Each has its own scrolling region; showing one again scrolls its `aria-current` move into view. |
| `activeTab` / `onTabChange` | | The screen's state — a screen may need to know the tab (CTA-54's arrows). |
| `footer` | `ReactNode?` | A sibling of the scrolling region, so it stays put while the tab scrolls. |
| `ply` / `lastPly` / `onSelectPly` / `onFlip` | | Straight through to the shared `BoardControls`. |

Two rules it keeps for every consumer:

- **One tab is rendered at a time** by default. The move list scrolls its
  selection into view, and a hidden copy would be scrolling a zero-height box
  on every move. `keepMounted` is the deliberate exception (CTA-61): a hidden
  token's `scrollIntoView` is a no-op, and the panel re-scrolls the current
  move when the tab shows again. Use it for a tab whose mount is expensive,
  not as a default — every kept tab keeps rendering while hidden.
- **The panel is a non-scrolling flex column and exactly one child scrolls.**
  The shell's aside does not scroll (`Layout.tsx`), so `flex: 1` +
  `minHeight: 0` + `overflowY: auto` on the tab region is what keeps a long
  move list off the board square.

---

## 4. The derivation table — the boards

Every board composed from the core, and exactly what it picks. Nothing else
differs.

| Board | route | Base options | Engine | Book | Autosave | Tabs | Header slot | Footer slot | Board options slot | Tree view ([`tree-views.md`](./tree-views.md)) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Analysis Board** (Analysis v2, the reference — shipped, CTA-73) | `/tools/analysis` | `?fen=`, `?game=`+`?move=`, `?analysis=`, `?at=` | ✅ switch; its best move played **for the opponent's side, only while Play is on** (a header toggle, disabled with the engine off, paused by a step back) | header line only | ❌ **explicit save** — Save opens the changes strip (Update / Save as copy / Discard) over a record, or a name-and-folder dialog; the real store, nested folders | Moves · Map · Load · Export · Engine | name + opening + Save + Play/Pause + saved list + settings + switch | comment block, the changes strip, the next-moves bar | next-move arrows (a switch, on) | **`useVariationsExplorer`** — Moves, Map, comment block, next-moves bar, arrows; editing on, `playChances: false` |
| **Play with Engine** (Play v2, shipped — CTA-74) | `/engine/play` | `?fen=`, `?saved=`; no `canMoveAt` — a move from an earlier node is a side line | ✅ switch; its best move played **for the side not at the bottom, only while Play is on** — the shared **`usePlayToggle`**, here **on from the start**, paused by a step back or a change of side, off for good once resigned | header line only | ✅ **`useAutosave`** → `lib/playedGameStore.ts` (a tree, flat list at `/engine/games`) | Moves · Map · Engine (`EngineSettings`) | opening + side toggle + Play/Pause + Replay + Resign + games list + switch | comment block, the resignation line or Play's status line, the next-moves bar | next-move arrows (a switch, on) | **`useVariationsExplorer`** — the Analysis Board's options without `addedIds` |
| **Masked Pieces** (shipped, CTA-79 — [`masked-pieces.md`](./masked-pieces.md)) | `/engine/masked` | Play with Engine's, verbatim — the same `PlayScreen` and `usePlayGame` | Play with Engine's; the pinned lines **off** until the Masking tab's switch (`showVariations`) | header line only | ✅ Play with Engine's, the costume on the record (`PlayedGame.mask`) | Moves · Map · Engine · **Masking** | Play with Engine's | Play with Engine's | `pieces: maskedPieces(mask)`; `capturedPieces` the same; `hideMaterialDiff` while anything is masked | Play with Engine's, with `mask` (the notation switch) |
| **Library game** (shipped, CTA-75) | `/library/<collection>/<game>` | the game (`parsePgnTree`), `?at=` | ✅ switch; its best move played **for the opponent's side, only while Play is on** — the Analysis Board's session, `useAnalysisSession` | header line only | ❌ **explicit save** — the changes strip: an uploaded collection's game **Update**s in place or **Save as copy** inserts a copy after it; a shipped one is read-only (`readOnly`) and its copy goes to Saved analyses | Moves · Map · Info · Export · Engine | back + players + game N of M + opening + previous / next game + Save + Play/Pause + switch | comment block, the changes strip, Play's status line, the next-moves bar | next-move arrows (a switch, on) | **`useVariationsExplorer`** — the Analysis Board's options |
| **Openings explorer** (shipped, CTA-78) | `/openings` | `?fen=` (turns the board), `?at=` (replayed with `lineTreeOf`) | ✅ switch; Play as on the Analysis Board — the Analysis Board's session, `useAnalysisSession` | ✅ **`useOpeningBookModule`** — the Book tab (a click plays a move, from any node) and the book's arrows | ❌ **nothing is kept** — no Save, no strip; the header's **Analysis** hands the whole tree to the Analysis Board (`lib/analysisHandOff.ts`) | Book · Moves · Map · Load (merge only) · Export · Engine | opening + Analysis + Play from here + Play/Pause + switch | comment block, Play's status line, the next-moves bar | the tree's next-move arrows (a switch, on) joined with the book's (`openingArrows.ts`) | **`useVariationsExplorer`** — Play with Engine's options (no `addedIds`) |
| **Repertoire player** (shipped, CTA-63) | `/repertoires/<id>`, and `/games/<end\|backtrack>` | `orientation`: the reader's side | ✅ switch, **off by default**, no reply — the opponent is **`useTrainerModule`** (§2.5): behind Autoplay in the player, always in a game (game mode, a game's policy and required moves from `useRepertoireGame`) | ❌ | ❌ (session-only; leaves by download) | Moves — the variations explorer (extensions tinted; the player's right-click move menu, CTA-64) · Score (games) · Map (the player's; Backtracking's with coverage) · Settings (side, Autoplay, arrows, engine switch) · Engine (disabled while off) | name + opening + Games menu + Play (toggles Autoplay; CTA-65) + restart + download + settings link (a game: its title, back) | next-moves bar, or the trainer's status line | next-move arrows (off by default); a required move's arrow | **`useVariationsExplorer`** (CTA-72) — the explorer mode: Moves, Map, comment block, next-moves bar, arrows, chance overlay; editing and the comment block the player's only |

**Next-move arrows are one helper.** `nextMoveArrowsOf` (`views/tools/analysis/nextMoveArrows.ts`)
builds the arrows for a position's continuations — `children[0]`, the
mainline, in `NEXT_MOVE_ARROW_COLOR`, every side line in
`SIDELINE_NEXT_MOVE_ARROW_COLOR`, the hovered one in the hover colour.
The Analysis Board, Play with Engine, the Library's game board, the Openings
explorer (which adds the book's arrows beside them), Masked Pieces and the
two repertoire screens draw through it, so a change of colour reaches them
all.

Read the table as the specification of the derived classes. Three things it
makes visible, which were the drift:

- **Masked Pieces adds nothing but a costume** (CTA-79, as Masked v2 did in
  the Development section before it). It renders Play with Engine's own
  screen, `PlayScreen`, with one optional prop — the mask, the notation and
  lines switches and a Masking tab — which becomes `pieces` on the board
  options and the strips, `hideMaterialDiff`, and `mask` on the notation (the
  explorer and the panel). No mode flag reaches the core, and the masking
  stays between the state and the pixels exactly as §5 of `chessboard.md`
  requires.
- **The Openings explorer is the Library's game board's recipe again**
  (CTA-78): `useAnalysisSession` plus one capability module,
  `useOpeningBookModule`, and no behaviour hook — what is its own (the Book
  tab, the joined arrows, the Analysis hand-off) is in the screen. (Openings
  v2, the dev board it replaced, and Repertoire v2, the old Library's line
  viewer, were retired in CTA-78 and CTA-75.)
- **The Library's game board adds no behaviour hook.** It composes the
  Analysis Board's own session, `useAnalysisSession`
  (`views/tools/analysis/`: core + engine + `usePlayToggle` + a baseline,
  extracted from `useAnalysisBoard` for exactly this), and writes the few
  lines that are its own — where Update and Save as copy put the tree — in the
  screen.
- **Play with Engine gained CTA-53/54/55** the same way (CTA-74), and lost
  its Variations tab — the lines are pinned above every tab now, so a tab for
  them would be the same component twice.

---

## 5. How to add a new board type

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

3. **Register one nav entry and one route.** A board still being built goes
   behind the **Development** gate, which CTA-79 closed with its last boards
   and a new board opens again: a `NavItem` (and, the first time, a
   `dev` folder) spread into `navItems()` / `navFolders()` behind
   `import.meta.env.DEV`, and one route in `App.tsx` inside a
   `import.meta.env.DEV ? [...] : []` array, as a `React.lazy` dynamic
   import — so the production build carries no chunk of it (§6). If it
   persists, give it dev-prefixed keys over the shipped store factory
   (§2.4). The CTA-60 versions of all three are in git history
   (`views/dev/devNav.ts`, `views/dev/core/devStores.ts`, `App.tsx`'s
   `devRoutes`). A shipped board is one ordinary `navItems()` entry and one
   route.

4. **Two locale keys** — `en.ts` and `he.ts` both, because `he` is typed
   `typeof en` and a missing key is a compile error.

5. **One test**, following §8 of `chessboard.md`: stub `react-chessboard`
   (including `defaultPieces`, which the captured strips reach for), and assert
   the screen renders the shared panel skeleton's test ids — which is what puts
   the new board under the same propagation guarantee as the others — add it
   to the `BOARDS` of `devBoards.test.tsx` and `devPanelPropagation.test.tsx`.

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
- **`options.id` is unique on the page** — `analysis`, `play-with-engine`,
  `masked-play`, `openings`, and so on.
- **A shared piece changes only backward compatibly.** Under `views/shared/`,
  `views/explorer/`, `views/dev/core/` or `src/lib/`, a new behaviour is an
  optional prop whose absence is today's behaviour (Masked Pieces' `mask`,
  `showVariations`, `capturedPieces`, CTA-79), with every screen's tests
  passing unchanged. (Every game board is on v2 since CTA-79; the rule that
  the screens not yet on it stayed byte-identical has nothing left to guard.)
- **A Development section never ships.** When one is open (§5), everything
  under `/dev/*` is gated on `import.meta.env.DEV`, in `navFolders()`,
  `navItems()` and `App.tsx`, and the routes are `React.lazy` dynamic imports
  inside the dead branch so the production bundle carries no dev chunk at
  all. Verified by grepping `dist/` after a build: no `/dev/*` path of ours
  (the vendored Stockfish worker's Emscripten runtime names `/dev/stdin` and
  `/dev/tty`), no `dev-*` test id, no `chessapp.dev.*` storage key, and no
  extra chunk. None is open since CTA-79.

  **The core is not the Development section, and since CTA-61 it ships.** The
  Repertoires board (`views/repertoires/RepertoireBoard.tsx`, `/repertoires/<id>`)
  is the first shipped screen composed from the core, so `useBoardCore`,
  `useEngineModule`, `BoardShell` and `BoardPanel` are in the
  production bundle by design — imported statically from `views/dev/core/`,
  where they still live. (`TreeMoveList` and its menu ship too, from the
  shared explorer in `views/explorer/` since CTA-72 — see
  [`tree-views.md`](./tree-views.md).) Since CTA-63 `useTrainerModule` ships
  too — the repertoire player is a repertoire's own view — and since CTA-73
  the Analysis Board is a core screen too, since CTA-75 the Library's
  game board, since CTA-78 the Openings explorer (with
  `useOpeningBookModule`) and since CTA-79 Masked Pieces. A shipped screen
  must not import anything of a Development section — only `core/` (and the
  shared `views/explorer/`, which is not the dev section, and ships).

  **The one residue a Development section leaves, and why it is accepted.**
  Its `dev.*` strings in `src/locales/en.ts` and `he.ts` *do* ship — a few
  hundred bytes of text that nothing in a production build reads. A locale
  catalog is one plain object, so a property cannot be tree-shaken out of it,
  and gating the block would give up the two guarantees the catalogs exist
  for: `he: typeof en` making a missing translation a compile error, and
  `locales.test.ts` asserting that every key the nav returns resolves in both
  languages. Dead text in the bundle is the cheaper of the two prices; the
  block goes when the section closes (CTA-79 removed it).

---

## 7. Where the code is

| Path | What lives there |
| --- | --- |
| `src/views/dev/core/useBoardCore.ts` | §1 — the base. |
| `src/views/dev/core/useEngineModule.ts` | §2.1 — the engine, and §4 of `chessboard.md` in one file. |
| `src/views/dev/core/useOpeningBookModule.ts` | §2.2 — the book and its arrows (the book itself: [`openings-explorer.md`](./openings-explorer.md) §2). |
| `src/views/dev/core/useAutosave.ts` | §2.3 — write-on-change. |
| `src/views/dev/core/useTrainerModule.ts` + `src/lib/repertoireTrainer.ts` | §2.5 — the repertoire trainer: the reply guard and timer (the module), the policy and the extension fold (pure). |
| `src/views/dev/core/BoardShell.tsx` | §3.1 — the board square, over the shared `EngineBoardSquare`. |
| `src/views/dev/core/BoardPanel.tsx` | §3.2 — **the** panel skeleton and the pinned variations block. |
| `src/views/explorer/` | **The shared tree views** (CTA-72; was `TreeMoveList.tsx` + `MoveContextMenu.tsx` here) — the variations explorer (the merged move list of CTA-53 with its opt-in right-click menu of CTA-64, the map, the comment block, the play-chance overlay) as a pluggable mode, `useVariationsExplorer`, over one seam (`treeView.ts`). A board attaches a tree view by passing `core` and placing the parts it gets back in this file's slots; its own spec is [`tree-views.md`](./tree-views.md). The repertoire player passes it everything; its games pass no `onEditTree`; the Analysis Board, Play with Engine and Masked Pieces, the Library's game board and the Openings explorer pass editing without the play chances — Masked Pieces also its `mask`. |
| `src/views/tools/analysis/` | §4 — the Analysis Board, Analysis v2 shipped (CTA-73): `useAnalysisSession.ts` (core + engine + Play + the baseline — shared with the Library's game board, CTA-75, and the Openings explorer, CTA-78), `useAnalysisBoard.ts` (that session plus the saved record) and `AnalysisBoard.tsx`, plus `PlayToggleButton.tsx` / `EngineThinking.tsx` (Play's header button and status line, shared with Play with Engine). Under both propagation tests. |
| `src/views/dev/core/usePlayToggle.ts` | **Play** — the engine playing the side not at the bottom while on, pausing on a step back, a change of side, the engine off, the game over or `finished` (a resignation) (CTA-73, a module since CTA-74). The Analysis Board (off at the start) and Play with Engine (on) compose it. |
| `src/views/engine/play/` | §4 — Play with Engine, Play v2 shipped (CTA-74): `usePlayGame.ts` (core + engine + `usePlayToggle` + the autosave), `PlayScreen.tsx` (the screen, shared with Masked Pieces since CTA-79) and `PlayWithEngine.tsx` (the route). Under both propagation tests. |
| `src/views/engine/masked/` | §4 — Masked Pieces (CTA-79): `MaskedPlay.tsx` (the route and the costume's state — `PlayScreen` with `masking`) and `MaskEditor.tsx`. Under both propagation tests. Its own reference: [`masked-pieces.md`](./masked-pieces.md). |
| `src/views/library/LibraryGameBoard.tsx` | §4 — the Library's game board (CTA-75): `useAnalysisSession` + the explorer, and the collection's Update / Save as copy. Under both propagation tests. |
| `src/views/openings/OpeningsBoard.tsx` | §4 — the Openings explorer (CTA-78): `useAnalysisSession` + `useOpeningBookModule` + the explorer, and the Analysis hand-off. Under both propagation tests, in Openings v2's place. Its own reference: [`openings-explorer.md`](./openings-explorer.md). |
| `src/views/dev/devBoards.test.tsx` | The five boards — the Analysis Board, Play with Engine, Masked Pieces, the Library game board and the Openings explorer — rendered for real: the shared square, the shared skeleton, and the one thing each board keeps as its own. `devPanelPropagation.test.tsx` renders the same five. (Until CTA-79 the Development section's Play v2 and Masked v2 were among them.) |
| `src/views/dev/devPanelPropagation.test.tsx` | The propagation assertion of §0 — `BoardPanel` replaced by a sentinel. |
| `src/views/repertoires/RepertoireBoard.tsx` | The first **shipped** board composed from the core (CTA-61) — the core over the reader's own one-game repertoire; since CTA-63 the route over the player below. `RepertoirePropagation.test.tsx` puts it under the same propagation assertion as the other boards. |
| `src/views/repertoires/RepertoirePlayer.tsx` | Since CTA-63 the screen behind `RepertoireBoard.tsx` and `RepertoireGame.tsx` — the repertoire player and its games, the trainer (§2.5) as the opponent. Both routes are under the same propagation assertion. |
| `src/views/dev/devTestHarness.tsx` | The `Engine` and `<Chessboard>` stand-ins §8 of `chessboard.md` requires, written once for every board. |
