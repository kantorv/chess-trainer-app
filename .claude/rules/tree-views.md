---
paths:
  - "src/views/explorer/**"
  - "src/lib/treeMap*"
  - "src/lib/moveAnnotations*"
  - "src/views/shared/MoveList.tsx"
  - "src/views/shared/VariationLine.tsx"
  - "src/views/shared/moveSelection.ts"
  - "src/views/tools/analysis/nextMoveArrows.ts"
  - "src/views/tools/analysis/NextMovesBar.tsx"
---

# Tree views — how a board screen shows its game tree

How a board screen **attaches a view of its game tree** — the move list, the
map, the comments, the next-move arrows — instead of wiring them inline. The
shared explorer in [`src/views/explorer/`](../../src/views/explorer/)
implements it, and every board that shows a game tree is built on it: the
Analysis Board, Play with Engine and Masked Pieces, the Library's game board,
the Openings explorer and the repertoire player with its games.

What a move's annotations *are* — comments, `[%cmd]`s, the `prc` tag, NAG
glyphs — and how they are read and written is
[`pgn-annotations.md`](./pgn-annotations.md); this file only places them.

[`chessboard.md`](./chessboard.md) §9 owns the board core a tree view reads
from (`useBoardCore`) and the shell and panel its parts are placed into
(`BoardShell`, `BoardPanel`). This file says only what a *tree view* is.

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

The seam is [`treeView.ts`](../../src/views/explorer/treeView.ts):

| Concept | What it is |
| --- | --- |
| **`TreeViewSource`** | What every view reads: `tree`, `mainlineNodes`, `nodeId`, `goToNode`, `orientation`. `useBoardCore`'s return has this shape, so a screen passes `core` itself. |
| **`TreeViewParts`** | What every view returns: `moves` (a Moves tab's content), `map?` (a Map tab's content), `annotations?` and `nextMoves?` (footer pieces), `arrows` (`options.arrows`, the whole external set) and `overlay` (drawn over the board, `null` for none). The screen places each part in its own slot. |
| **A mode** | A hook `(source + the mode's own options) → TreeViewParts`. Only the explorer, `useVariationsExplorer`, is built. |

What the seam decides, and why:

- **A view returns parts, not a panel.** The screen already owns `BoardPanel`
  and `BoardShell`, under the propagation guarantee (`chessboard.md` §9); a
  view that rendered its own panel would be a second skeleton. The screen
  keeps the order, the tab ids and what surrounds each part (the player wraps
  `moves` in its "reading…" state and puts its changes strip between
  `annotations` and `nextMoves`).
- **A view knows the tree, never the screen.** Anything a screen means
  arrives as a plain value: ids to tint, a `MapCoverage`, required moves, a
  tree to draw other than the session's, `onEditTree` to allow editing. A
  view has no way to branch on which screen called it.
- **A view owns only the state its parts share** (the hovered continuation:
  the bar sets it, the arrows read it). State with one reader stays in the
  part (the map's zoom, the list's menu); state that means something to the
  screen stays in the screen (the open tab, the arrows switch).
- **Keyboard navigation is the source's**: `useTreeNavigation`, under
  `useBoardCore`, binds ← → Home End (the line) and ↑ ↓ (the sibling moves,
  wrapping) for every board. A view never binds keys.

### Adding a mode

1. **One hook** in `src/views/explorer/`, `use<Mode>View(options) →
   TreeViewParts`, whose options extend `{ testId, source }`, built from the
   pieces in this folder and in `views/shared/`.
2. **New logic in `src/lib/`, pure** (§4's `revealedTree`), never in the hook.
3. **One contract test** beside `useVariationsExplorer.test.tsx`: the parts it
   leaves out, the parts it gives, what its options switch.
4. **Change nothing else.** A new part is an optional field on
   `TreeViewParts`, which no existing screen has to place.

---

## 2. The variations explorer — `useVariationsExplorer`

### The contract

```ts
const parts = useVariationsExplorer({
  testId: string,                         // root of every test id: `${testId}-map`, `-annotations`, `-chance-arrows-overlay`, `-width-arrows-overlay`
  source: TreeViewSource,                 // `core`
  evalsByFen?: ReadonlyMap<string, Score>,
  extensionIds?: ReadonlySet<string>,
  onEditTree?: (next: GameTree) => void,  // the one switch for every edit — `core.replaceTree`
  playChances?: boolean,                  // the menu's *Play chances…* (default on); off where no trainer plays by them
  annotations?: boolean,                  // the comment block
  arrows?: {
    show: boolean; chances?: boolean; required?: readonly VariationNode[];
    widthSource?: ArrowWidthSource,       // CTA-98: what sizes the arrows — absent/"none", colour only
    palette?: ArrowPaletteId,             // CTA-98: the arrows' colours — absent, "classic"
  },
  map?: { tree?: GameTree; nodeId?: string | null; coverage?: MapCoverage; addedIds?: ReadonlySet<string>; linked?: boolean },
  mask?: PieceMask,                       // a masked board's notation
});
// → { moves, map?, annotations?, nextMoves, arrows, overlay }
```

### The features

| Feature | Part | Controlled by | Built from |
| --- | --- | --- | --- |
| **Move list**: numbered mainline pairs, the current move highlighted and scrolled into view, a click to any move | `moves` | always | `TreeMoveList` over the shared `MoveList` |
| **Side lines hung under their move**, clickable | `moves` | always | `TreeMoveList` → `VariationLine` |
| **Comment marker** on a commented move | `moves` | always | `hasComments`, `annotatedPlies`, `markCommentedNodes` |
| **Annotation glyphs** (NAGs, CTA-97) after the SAN — in the mainline's cells, the side lines and the map's labels, on every board, read-only ones included: the move mark first (`!` `!!` green, `?` orange, `??` red, `!?` magenta, `?!` blue, a shade per scheme), then the evaluation and the features, plain; a code outside the table as `$N` | `moves`, `map` | always | `NagGlyphs` + `nagToneSx.ts` (`views/shared/`), the map's `.map-nag` tspans, over `lib/moveAnnotations.ts`'s table (`nagGlyph`, `nagsInPrintOrder`, `nagTone`); a mainline cell reads `GameMove.nags` (`mainlineGame` carries it), a side-line token and a map label their node's |
| **Evals** on the mainline's cells only | `moves` | `evalsByFen` | `MoveList`'s `mainlineEvalsOnly` |
| **Masked notation** — every printed move in coordinates when the mask hides its piece | all but `arrows` / `overlay` | `mask` | `maskSanLine` / `maskNodeSan`; [`masked-pieces.md`](./masked-pieces.md) §4 |
| **Extension tint** on moves added this session | `moves` | `extensionIds` | the selection store |
| **Right-click move menu**: promote variation, make main line, delete from here (confirmed, with a count), copy variation PGN, add comment, add annotation…, play chances… | `moves`, `map` | `onEditTree` (*Play chances…* also `playChances`) | `MoveContextMenu`, `CommentDialog`, `NagDialog`, `PlayChanceDialog`, over the pure edits in `lib/gameTree.ts` and `lib/playChance.ts` |
| **Add annotation…** (CTA-97): three tabs — Move Assessment, Position Evaluation, Positional Features & Commentary — each glyph a toggle with its meaning, the move's current ones selected. Lichess's rule: one move assessment, one evaluation (picking the active one removes it), any number of features; codes outside the table untouched. **Each toggle is an edit** (`setNags`), so the list shows it at once and the changes strip offers to keep it | `moves`, `map` | `onEditTree` | `NagDialog` over `toggleNag` / `NAG_SECTIONS` (`lib/moveAnnotations.ts`) and `setNags` (`lib/gameTree.ts`) |
| **Comment block**: the move with its marks, the comment opening its line, the comments after it, their attributes as chips | `annotations` | `annotations` | `AnnotationsBar` over `lib/moveAnnotations.ts` |
| **Comment editing** in the block (add, edit, delete) | `annotations` | `onEditTree` | `CommentDialog` + `setComments` |
| **Next-moves bar**: the continuations at a branch; hovering one draws its arrow | `nextMoves` | always (nothing where there is no choice) | `views/tools/analysis/NextMovesBar.tsx` |
| **Next-move arrows**: mainline green, side lines blue, the hovered move red | `arrows` | `arrows.show` (off: only a hovered move's arrow) | `views/tools/analysis/nextMoveArrows.ts` |
| **Play-chance arrows**: white with a magenta border, width by chance, a percentage per move in the bar | `overlay` (+ `nextMoves`) | `arrows.chances`, and only where the branch carries a `prc` mark | `ChanceArrows` over `chanceArrows.ts` |
| **Width-sized arrows** (CTA-98): each continuation sized by a tag in its comment (`eval`, `games`, `prc`) or by the lines ahead, filled in the palette's colours; a move without the tag, where others have it, gray and half-transparent; a branch where none has it draws the ordinary arrows | `overlay` | `arrows.widthSource`, only while `arrows.show` | `ChanceArrows` with its `colors` (`weightedArrowColors`), over `lib/nextMoveWeights.ts` |
| **Arrow palette** (CTA-98): the mainline / side-line / hovered colours of every next-move arrow, library or overlay | `arrows`, `overlay` | `arrows.palette` | `NEXT_MOVE_ARROW_PALETTES` (`nextMoveArrows.ts`) |
| **Required moves**: purple, in place of every other arrow | `arrows` | `arrows.required` | `REQUIRED_MOVE_ARROW_COLOR` |
| **Map**: the tree as an SVG — tab and full screen, zoom, pan, fit, "where am I", following the reader, move labels, dots coloured by side | `map` | `map` | `TreeMap` over `lib/treeMap.ts` |
| Map **coverage** (covered lines green, a progress bar, "N left"), **added moves** ringed, **links** (a dot goes to its position), drawn from **another tree** | `map` | `map.coverage`, `map.addedIds`, `map.linked`, `map.tree` / `map.nodeId` | |

`onEditTree` is **the one switch for writing**. Without it the list, the map
and the comment block are read-only, and a right-click is the browser's. The
repertoire games pass nothing; a game never writes.

### The rules it keeps

- **Performance.** Each token reads "am I current" and "what is my eval" from
  the selection store (`views/shared/moveSelection.ts`, subscriptions keyed by
  node, ply and FEN), so a step re-renders two tokens and an engine message
  none. The list gets the source's stable `goToNode` and `onEditTree`; the
  menu is a sibling of the memoised list, so opening it re-renders no token.
  **Keep new per-token state in that store, not in the list's props.** A
  token's glyphs are read off the move it already holds, so they add nothing
  to either. The map is a few path strings: a ~9,000-node tree lays out in
  ~10 ms, and its labels are drawn only for the dots in view (`mapLabelsIn` /
  `visibleRect`).
- **An edit is `replaceTree`.** Every edit returns a new tree, id-preserving,
  through `onEditTree`; a no-op returns the same tree, so a screen's
  `tree !== original` stays the whole test for "changed".
- **Notation never mirrors.** The map is pinned LTR with `dir`, SAN in the
  menu and the comment block uses `dir="ltr"`, comment prose `dir="auto"`.
  The glyphs sit inside the SAN's own `dir="ltr"` token.
- **One set of arrows at a time**: required moves beat the chance overlay,
  which beats the width-sized overlay, which beats the library arrows. The
  screen passes `widthSource: "none"` for a tag its tree does not carry —
  availability is the screen's, not the view's. The chances and the bar's
  percentages come from one array, so the number and the width never
  disagree.

### How each board attaches it

| Board | Options | Placement |
| --- | --- | --- |
| **Repertoire player** | `onEditTree` (player only), `annotations` (player, once read), `arrows: { show, chances, required }`, `map: { tree, nodeId, coverage, addedIds, linked }` (none in Get to the end), `extensionIds` | `moves` behind "reading…", `map` once read, `nextMoves` on the Moves tab with Autoplay off |
| **Analysis Board** | `onEditTree: core.replaceTree`, `playChances: false`, `annotations: true`, `arrows: { show, widthSource, palette }` (its Arrows tab, CTA-98), `map: { addedIds, linked: true }`, `extensionIds` (the same set) | Moves and Map tabs (kept mounted); footer: `annotations`, the changes strip, Play's status line, `nextMoves` (Moves tab) |
| **Library game** | as the Analysis Board, with `arrows: { show }` — classic, colour only | as the Analysis Board |
| **Openings explorer** | the same without `addedIds` / `extensionIds` — nothing is added against a record | as above, without the strip |
| **Play with Engine** | the same without `addedIds` / `extensionIds`, and without `map` — nothing is added against a record, and (CTA-91) no Map is drawn or offered | Moves tab only (kept mounted); footer: `annotations`, Play's status line, the game-over result and its *Open in analysis* button (CTA-91), `nextMoves` (Moves tab) |
| **Masked Pieces** | Play with Engine's, plus `mask` while its notation switch is on | Play with Engine's |

The Openings explorer joins the view's `arrows` with the book's into one set
(`views/openings/openingArrows.ts`).

---

## 3. Flat — specified, not built

A **two-column mainline list with no variations**, with comments and arrows,
for a board where the game is one line and no branch can form. No board is
linear today.

```ts
const parts = useFlatView({
  testId, source,
  evalsByFen?,
  annotations?: boolean,           // read-only
  arrows?: { show: boolean },      // the next move along the line, when stepped back
  mask?: PieceMask,
});
// → { moves, annotations?, arrows, overlay: null }   — no map, no nextMoves
```

`moves` is the shared `MoveList` over `mainlineGame(source.tree)` with no
`branches` and no `onContextMenu*`; `arrows.show` draws `children[0]` of the
node on screen through `nextMoveArrowsOf`. No menu and no edits. The core
would need a way to refuse a move off the end of the mainline — an optional
predicate on `useBoardCore`, added with the first board that needs it.

---

## 4. Hidden / puzzle — specified, not built

The **next moves are hidden**: the reader solves against a tree of prepared
branches, and a variations player answers from it.

```ts
const parts = usePuzzleView({
  testId, source,                  // the solution tree plus whatever the reader has reached
  revealedIds: ReadonlySet<string>,// the moves played or shown — the screen's state
  annotations?: boolean,           // revealed moves' comments only
  hint?: VariationNode | null,     // one arrow, on request
});
// → { moves, annotations?, arrows, overlay: null }   — no map, no nextMoves (both give the answer away)
```

- `moves` is `TreeMoveList` over **`revealedTree(source.tree, revealedIds)`**,
  a pure helper to add to `lib/gameTree.ts`: the tree pruned to the revealed
  nodes, ids kept, so navigation, links and the selection store keep working.
- **The variations player is the repertoire trainer**, composed by the
  screen: `useTrainerModule({ repertoire: solutionTree, drill: true,
  trainerColor })` judges each move and plays the reply; the screen adds each
  node the module's `arrival` lands on to `revealedIds`.

---

## 5. Where the code is

| Path | What lives there |
| --- | --- |
| `src/views/explorer/treeView.ts` | §1: `TreeViewSource`, `TreeViewParts`. |
| `src/views/explorer/useVariationsExplorer.tsx` (+ `.test.tsx`) | §2: the explorer mode and its contract test. |
| `src/views/explorer/TreeMoveList.tsx` (+ test) | The variations list over `MoveList` / `VariationLine`: the ply↔node seam, comment markers, the tint, the mask, the opt-in menu. |
| `src/views/explorer/MoveContextMenu.tsx`, `CommentDialog.tsx`, `NagDialog.tsx`, `PlayChanceDialog.tsx` | The right-click menu and its three dialogs. |
| `src/views/explorer/TreeMap.tsx` | The map: `MapViewport`, the full-screen dialog, links and the menu. The pure layout and viewport arithmetic are `src/lib/treeMap.ts`, with `MapCoverage`. |
| `src/views/explorer/AnnotationsBar.tsx` | The comment block, presentational; the reading is `lib/moveAnnotations.ts`. |
| `src/views/explorer/ChanceArrows.tsx` + `chanceArrows.ts` (+ tests) | The play-chance overlay and its geometry; its optional per-arrow `colors` and `weightedArrowColors` draw the width-sized arrows (CTA-98). |
| `src/views/tools/analysis/nextMoveArrows.ts`, `NextMovesBar.tsx` | The next-move arrows and bar, imported by the explorer. |
| `src/views/shared/MoveList.tsx`, `VariationLine.tsx`, `moveSelection.ts`, `moveContextMenu.ts`, `moveTokenSx.ts` | The shared tokens under every list. |
| `src/views/shared/NagGlyphs.tsx`, `nagToneSx.ts` | A move's glyphs after its SAN, and the move marks' colours (the map's labels share them). |

Locale keys are top-level, like every shared piece's: `treeMap.*`,
`annotations.*`, `moveMenu.*`, `commentDialog.*`, `nagDialog.*`, `playChance.*`.
