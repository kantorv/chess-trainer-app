# Tree views — how a board screen shows its game tree

How a board screen **attaches a view of its game tree** — the move list, the
map, the comments, the next-move arrows — instead of wiring them inline. This
is the spec the shared explorer in [`src/views/explorer/`](../../src/views/explorer/)
implements (CTA-72). The repertoire player (`/repertoires/<id>` and its games)
and, since CTA-73, the Analysis Board (`/tools/analysis`) and, since CTA-74,
Play with Engine (`/engine/play`) are built on it. The other screens will move
onto it in later issues.

Read [`chessboard-v2.md`](./chessboard-v2.md) first. It owns the board core a
tree view reads from (`useBoardCore`), the shell and panel a view's parts are
placed into (`BoardShell`, `BoardPanel`) and the capability modules. This
file says only what a *tree view* is, and nothing here overrides that file.

---

## 0. Why this exists

The repertoire player's variations explorer (CTA-53 → CTA-71: the move list
with side lines, comments, the map, the right-click menu and its dialogs, the
play-chance arrows) worked, and readers liked it. But it lived in three places:

- the list and the menu were in `views/dev/core/`;
- the map and the comment block were in `views/repertoires/`;
- the chance arrows were in `views/tools/analysis/`.

The wiring that joined them — the hovered move, the chances at the branch, the
comment being edited, which arrows win — sat inline in a 1,232-line
`RepertoirePlayer.tsx`. A second screen that wanted the explorer would have
had to copy that wiring. This spec gives the wiring one owner, and gives every
screen one way to attach a view.

---

## 1. The architecture: one seam, three concepts

```
 board screen                         tree view (a mode = one hook)                 board screen's slots
┌───────────────┐   TreeViewSource   ┌──────────────────────────────┐  TreeViewParts  ┌────────────────────────────┐
│ useBoardCore  │ ─────────────────▶ │ useVariationsExplorer(opts)  │ ──────────────▶ │ BoardPanel tabs: moves,map │
│ (tree, nodeId,│   + mode options   │ (flat / puzzle: specified,   │                 │ BoardPanel footer: notes,  │
│  goToNode, …) │   (plain values)   │  not built — §3, §4)         │                 │   next moves               │
└───────────────┘                    └──────────────────────────────┘                 │ BoardShell: arrows, overlay│
                                                                                      └────────────────────────────┘
```

There are three concepts, all in [`treeView.ts`](../../src/views/explorer/treeView.ts):

| Concept | What it is |
| --- | --- |
| **`TreeViewSource`** | What every view reads: `tree`, `mainlineNodes`, `nodeId`, `goToNode`, `orientation`. The return of `useBoardCore` already has this shape, so a v2 screen passes `core` itself. |
| **`TreeViewParts`** | What every view returns: `moves` (a Moves tab's content), `map?` (a Map tab's content), `annotations?` and `nextMoves?` (footer pieces), `arrows` (`options.arrows`, the whole external set) and `overlay` (drawn over the board, `null` for none). The screen places each part in its own slot. |
| **A mode** | A hook `(source + the mode's own options) → TreeViewParts`. `TreeViewMode` names them. Only `explorer` is built. |

What the seam decides, and why:

- **A view returns parts, not a panel.** The screen already owns a panel
  (`BoardPanel`) and a shell (`BoardShell`), and those are covered by the
  propagation guarantee (`chessboard-v2.md` §0). A view that rendered its own
  panel would be a second panel skeleton. Parts are what the existing slots
  take, and the screen keeps control of the order, the tab ids and what
  surrounds each part. For example, the player wraps `moves` in its "reading…"
  state, and puts its changes strip between `annotations` and `nextMoves`.
- **A view knows the tree, never the screen.** It gets no saved record, no
  trainer and no game. Anything a screen means arrives as a plain value: a set
  of ids to tint, a `MapCoverage` to colour lines by, a list of required moves,
  a tree to draw other than the session's, or `onEditTree` to allow editing.
  So a view has no way to branch on which screen called it.
- **A view owns only the state its parts share.** An example is the hovered
  continuation: the next-moves bar sets it and the arrows read it. State with
  one reader stays in the part (the map's zoom, the list's menu). State that
  means something to the screen stays in the screen (which tab is open,
  whether arrows are switched on).
- **Keyboard navigation is the source's job, not the view's.**
  `useTreeNavigation`, under `useBoardCore`, binds ← → Home End ↑ ↓ for every
  board over a tree. A view never binds keys, so every mode behaves the same
  way.

### Adding a mode — the recipe

1. **Add its name** to `TreeViewMode` in `treeView.ts`.
2. **Add one hook** in `src/views/explorer/`, `use<Mode>View(options) →
   TreeViewParts`, whose options extend `{ testId, source }`. Build the parts
   from the pieces this folder already has, and from `views/shared/`.
3. **Put new logic in `src/lib/`, pure**, if the mode needs any (§4's
   `revealedTree`). Never put it in the hook.
4. **Add one test** of the hook's contract, next to
   `useVariationsExplorer.test.tsx`: the parts it leaves out, the parts it
   gives and what its options switch.
5. **Change nothing else.** `useBoardCore`, `BoardShell`, `BoardPanel` and the
   seam's two types stay as they are. If a mode needs a new part, add an
   optional field to `TreeViewParts`, and no existing screen has to place it.

---

## 2. The rich variations explorer — `useVariationsExplorer`

[`src/views/explorer/useVariationsExplorer.tsx`](../../src/views/explorer/useVariationsExplorer.tsx).
It is the repertoire player's explorer, feature for feature. It was extracted
with no change in behaviour, and every existing player, game, map, annotation
and play-chance test passes unchanged.

### The contract

```ts
const parts = useVariationsExplorer({
  testId: string,                         // root of every test id: `${testId}-map`, `-annotations`, `-chance-arrows-overlay`
  source: TreeViewSource,                 // `core`
  evalsByFen?: ReadonlyMap<string, Score>,
  extensionIds?: ReadonlySet<string>,
  onEditTree?: (next: GameTree) => void,  // the one switch for every edit — `core.replaceTree`
  playChances?: boolean,                  // the menu's *Play chances…* (default on); off where no trainer plays by them (CTA-73)
  annotations?: boolean,                  // the comment block
  arrows?: { show: boolean; chances?: boolean; required?: readonly VariationNode[] },
  map?: { tree?: GameTree; nodeId?: string | null; coverage?: MapCoverage; addedIds?: ReadonlySet<string>; linked?: boolean },
});
// → { moves, map?, annotations?, nextMoves, arrows, overlay }
```

### The features, required or opt-in

| Feature | Part | Required / opt-in | Controlled by | Built from |
| --- | --- | --- | --- | --- |
| **Move list**: numbered mainline pairs, the current move highlighted and scrolled into view, a click to go to any move | `moves` | required | — | `TreeMoveList` over the shared `MoveList` |
| **Side lines hung under their move** (CTA-53), clickable, with the ply↔node seam | `moves` | required | — | `TreeMoveList` → `VariationLine` |
| **Comment marker** on a commented move, in the mainline and in side lines (CTA-69) | `moves` | required | — | `hasComments`, `annotatedPlies`, `markCommentedNodes` |
| **Evals** on the mainline's cells only | `moves` | opt-in | `evalsByFen` | `MoveList`'s `mainlineEvalsOnly` |
| **Extension tint** on moves added this session (CTA-63) | `moves` | opt-in | `extensionIds` | the selection store, keyed by node and by ply |
| **Right-click move menu**: promote variation, make main line, delete from here (confirmed, with a count), copy variation PGN, add comment, play chances… (CTA-64/69) | `moves`, `map` | opt-in | `onEditTree` (*Play chances…* also `playChances`, on by default) | `MoveContextMenu`, `CommentDialog`, `PlayChanceDialog`, over the pure edits in `lib/gameTree.ts` and `lib/playChance.ts` |
| **Comment block**: the move with its marks, the comment that opens its line, the comments after it, and their attributes as chips | `annotations` | opt-in | `annotations` | `AnnotationsBar` over `lib/moveAnnotations.ts` |
| **Comment editing** in the block (add, edit, delete) | `annotations` | opt-in | `onEditTree` | `CommentDialog` + `setComments` |
| **Next-moves bar** (CTA-54): the continuations at a branch, and hovering one draws its arrow | `nextMoves` | required (renders nothing where there is no choice) | — | `views/tools/analysis/NextMovesBar.tsx` |
| **Next-move arrows**: the mainline's move green, side lines blue, the hovered move red | `arrows` | opt-in | `arrows.show` (off: only a hovered move's arrow) | `views/tools/analysis/nextMoveArrows.ts` |
| **Play-chance arrows** (CTA-71): white with a magenta border, width by chance, and a percentage per move in the bar | `overlay` (+ `nextMoves`) | opt-in, and only where the branch carries a `prc` mark | `arrows.chances` | `ChanceArrows` over `chanceArrows.ts`, with `playChances` feeding both |
| **Required moves**: drawn in purple in place of every other arrow | `arrows` | opt-in | `arrows.required` | `REQUIRED_MOVE_ARROW_COLOR` |
| **Map**: the tree as an SVG — the tab and full screen, zoom, pan, fit, "where am I", following the reader, move labels, dots coloured by side (CTA-63/67) | `map` | opt-in | `map` | `TreeMap` over `lib/treeMap.ts` |
| Map **coverage**: covered lines green, a progress bar, "N left" | `map` | opt-in | `map.coverage` | `MapCoverage` |
| Map **added moves** ringed in the extension colour, "N added" | `map` | opt-in | `map.addedIds` | |
| Map **links**: clicking a dot goes to its position | `map` | opt-in | `map.linked` | `source.goToNode` |
| Map drawn from **another tree** (Backtracking draws the original repertoire under a session that has grown) | `map` | opt-in | `map.tree`, `map.nodeId` | |
| **Keyboard navigation** (← → Home End, ↑ ↓ through siblings) | — | required, provided by the source | — | `useTreeNavigation` under `useBoardCore` |

`onEditTree` is **the one switch for writing**. Without it, the list, the map
and the comment block are read-only, and a right-click is left to the browser.
The repertoire games pass nothing, and a game never writes.

### The rules it keeps

These are the explorer's own rules, and every future mode keeps them too:

- **Performance (CTA-61).** Each token reads "am I current" and "what is my
  eval" from the selection store (`views/shared/moveSelection.ts`). So a step
  re-renders two tokens, and an engine message re-renders none. The list gets
  the source's own stable `goToNode` and `onEditTree`, and the menu is a
  sibling of the memoised list, never inside it. The map is a few path
  strings, so a ~9,000-node tree lays out in about 10ms. The hook itself walks
  nothing per step except the continuations lookup, which reads the tree's
  index.
- **An edit is `replaceTree`.** Every edit comes back as a new tree, through
  `onEditTree`. A no-op returns the same tree, so a screen's
  `tree !== original` stays the whole test for "changed".
- **The board never mirrors, and neither does notation.** The map is pinned
  LTR with `dir`, the SAN in the menu and the comment block uses
  `dir="ltr"`, and comment prose uses `dir="auto"` (root `CLAUDE.md`).
- **Only one set of arrows at a time.** Required moves beat the chance
  overlay, and the chance overlay beats the library arrows. The chances and
  the bar's percentages come from one array.

### What stays the screen's — the repertoire player as the worked example

`RepertoirePlayer.tsx` builds its parts with one call and places them:

| Screen's decision | Passed as |
| --- | --- |
| The player edits and a game never does | `onEditTree: game === undefined ? core.replaceTree : undefined` |
| The comment block is the player's (a game is a test) | `annotations: game === undefined && shown === "ready"` |
| The arrows switch and the chances switch are session state seeded from the record's settings; Backtracking's required moves | `arrows: { show, chances, required: rules.required }` |
| The player's map draws the session; Backtracking's draws the repertoire with its coverage; Get to the end has none | `map: hasMap ? { tree, nodeId: mapNodeId, coverage, addedIds, linked } : undefined` |
| Where each part goes: `moves` behind "reading…", `map` only once the tree is read, `nextMoves` only on the Moves tab and with Autoplay off | the screen's own JSX |

The trainer, the game rules, the saved record, `?at=`, the changes strip and
the Settings and Score tabs are all the player's, and the explorer never sees
any of them.

### The Analysis Board — the second screen on it (CTA-73)

`views/tools/analysis/AnalysisBoard.tsx` passes the player's options minus
the trainer's: `onEditTree: core.replaceTree` (the menu and the comment
block edit, a session change like a move added), `playChances: false`
(nothing on the board plays by chance, so the menu does not offer to set
them), `annotations: true`, `arrows: { show }` (a switch in its Engine tab,
on), and `map: { addedIds, linked: true }` — the session's tree, the moves
added since the saved record (or the arrival) ringed, every dot a link. The
extension tint is the same set. It places `moves` and `map` in its Moves
and Map tabs (both kept mounted) and `annotations`, its changes strip and
`nextMoves` (on the Moves tab) in its footer.

### Play with Engine — the third (CTA-74)

`views/engine/play/PlayWithEngine.tsx` passes the Analysis Board's options
without `addedIds` / `extensionIds` (nothing is "added" against a record — the
whole game is the reader's): `onEditTree: core.replaceTree`,
`playChances: false`, `annotations: true`, `arrows: { show }` (a switch in its
Engine tab, on) and `map: { linked: true }`. A game against the engine is a
tree there — a move by hand from an earlier position is a side line — so it
takes the explorer rather than the flat mode below. It places `moves` and
`map` in its Moves and Map tabs (both kept mounted) and `annotations`, Play's
status line and `nextMoves` (on the Moves tab) in its footer.

---

## 3. Flat — specified, not built

A **two-column mainline list with no variations**, but with comments and
arrows. It is meant for a board where the game is one line — where the
reader and the engine take turns and a branch cannot form
(`canMoveAt: isLive`), as on the pre-v2 Play with Engine and Masked Pieces.
(Play with Engine v2, CTA-74, branches, and so took the explorer.)

```ts
const parts = useFlatView({
  testId, source,                  // a linear tree: `mainlineGame` / `treeFromGame` bridge it both ways
  evalsByFen?,                     // the per-ply evals a saved game records (CTA-50)
  annotations?: boolean,           // the comment block, as in §2 — read-only
  arrows?: { show: boolean },      // the next move along the line, when stepped back
  mask?: PieceMask,                // Masked Pieces: coordinates for a hidden piece's move
});
// → { moves, annotations?, arrows, overlay: null }   — no map, no nextMoves
```

- `moves` is the shared `MoveList` over `mainlineGame(source.tree)`, with **no
  `branches`**. It carries `annotatedPlies` and `evalsByFen`, and never
  `onContextMenu*`.
- `arrows.show` draws `children[0]` of the node on screen, which is the only
  continuation there is, through `nextMoveArrowsOf`. At the live position
  there is none, so nothing is drawn.
- No menu and no edits: a played game is not edited move by move. A screen
  that wanted the explorer's menu would use the explorer.
- It needs no core change: the linear screen already holds a tree (the v2
  core), and every piece above exists.

---

## 4. Hidden / puzzle — specified, not built (a puzzle screen)

The **next moves are hidden**. The reader solves an interactive puzzle against
a tree of pre-existing branches (a study's lines), and an optional
**variations player** answers them from the tree. The screen does not exist
yet.

```ts
const parts = usePuzzleView({
  testId, source,                  // the session's tree: the solution tree plus whatever the reader has reached
  revealedIds: ReadonlySet<string>,// the moves the reader has played or been shown — the screen's state
  annotations?: boolean,           // the comments of revealed moves only
  hint?: VariationNode | null,     // one arrow, when the reader asks for a hint
});
// → { moves, annotations?, arrows, overlay: null }   — no map, no nextMoves (both would give the answer away)
```

- `moves` is `TreeMoveList` over **`revealedTree(source.tree, revealedIds)`**,
  a pure helper to add to `lib/gameTree.ts` with the mode. It is the tree
  pruned to the revealed nodes, keeping their ids, so navigation, `?at=`-style
  links and the selection store all keep working. The list therefore shows
  only moves already played.
- No next-moves bar, no arrows except `hint`, and no map: each of those would
  give the solution away. That is the rule that already keeps them out of the
  repertoire games.
- **The variations player is the repertoire trainer**, composed by the screen,
  not by the view: `useTrainerModule({ repertoire: solutionTree, drill: true,
  trainerColor })` judges each move before it is made, and plays the reply
  from the solution. The screen adds each node the trainer or the reader
  lands on to `revealedIds` (the module's `arrival`).
- It needs no core change: the trainer module, `drill`, `judgeDrop` and the
  list all exist, and the new pieces are one pure helper and one hook.

---

## 5. Where the code is

| Path | What lives there |
| --- | --- |
| `src/views/explorer/treeView.ts` | §1: `TreeViewSource`, `TreeViewParts`, `TreeViewMode`. |
| `src/views/explorer/useVariationsExplorer.tsx` (+ `.test.tsx`) | §2: the explorer mode, and its contract test. |
| `src/views/explorer/TreeMoveList.tsx` (+ test) | The variations list over `MoveList` / `VariationLine`: the ply↔node seam, the comment markers, the tint, and the opt-in menu. The dev boards render it directly. |
| `src/views/explorer/MoveContextMenu.tsx`, `CommentDialog.tsx`, `PlayChanceDialog.tsx` | The right-click menu and its two dialogs. |
| `src/views/explorer/TreeMap.tsx` | The map: `MapViewport`, the full-screen dialog, links and the menu. The pure layout is `src/lib/treeMap.ts` (it was `lib/repertoireMap.ts`), with `MapCoverage`. |
| `src/views/explorer/AnnotationsBar.tsx` | The comment block. It is presentational; the reading is `lib/moveAnnotations.ts`. |
| `src/views/explorer/ChanceArrows.tsx` + `chanceArrows.ts` (+ tests) | The play-chance overlay and its geometry. |
| `src/views/tools/analysis/nextMoveArrows.ts`, `NextMovesBar.tsx` | **Not moved**: they stayed beside the Analysis Board, which since CTA-73 is itself built on the explorer. The explorer imports them from there. |
| `src/views/shared/MoveList.tsx`, `VariationLine.tsx`, `moveSelection.ts`, `moveContextMenu.ts` | The shared tokens under every list, unchanged. |

The locale keys follow the shared-pieces rule (root `CLAUDE.md`): the map's
strings are the top-level `treeMap.*` block and the comment block's are
`annotations.*` (they were `repertoires.play.map.*` and
`repertoires.annotations.*`, with the English unchanged). The menu's
`moveMenu.*`, `commentDialog.*` and `playChance.*` were already top-level.

---

## 6. Where the build departed from the first spec

The issue asked that the spec follow what was actually built. These are the
places it changed:

- **A hook returning parts, not a `<VariationsExplorer>` component.** The
  first sketch was one component with slots. But the explorer's pieces live
  in four different slots of two components (tabs, footer, arrows, overlay),
  and the player interleaves its own pieces between them. One component could
  only have taken all of that over by rendering the panel itself, which is
  the second skeleton §1 rules out.
- **`nextMoveArrows.ts` and `NextMovesBar.tsx` stayed in `tools/analysis/`**
  (see §5). The play-chance overlay, which only the player used, moved.
- **The map was renamed and made generic** (`RepertoireMap` → `TreeMap`,
  prop `repertoire` → `tree`, `lib/repertoireMap.ts` → `lib/treeMap.ts`). Its
  coverage type became `MapCoverage`, a structural type that Backtracking's
  `Coverage` satisfies, so `lib/treeMap.ts` no longer imports
  `lib/repertoireGames.ts`.
- **The dev boards switched imports only.** They still render `TreeMoveList`
  directly; moving them onto modes is part of the Analysis and Openings
  follow-ups.
