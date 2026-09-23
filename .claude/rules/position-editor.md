---
paths:
  - "src/views/shared/positionEditor/**"
  - "src/lib/positionEditor*"
  - "src/views/engine/games/NewGameForm.tsx"
  - "src/lib/newGameLink*"
---

# The position editor — `views/shared/positionEditor/`

A board a **position** is set up on, piece by piece, as one screen-agnostic
component. The Lobby's new-game form hosts it in its **Board editor** tab;
the Analysis Board hosts it in its **Position** tab (CTA-87). This file is
the whole reference: the contract, the invariants, how a screen embeds it,
how to test it and how to extend it. It loads when you work on the files in
its `paths:` list.

[`chessboard.md`](./chessboard.md) is the authority on what a board *is*
(spare pieces and `ChessboardProvider` §2 and §5, testing a board §8).

**An editor owns a position, not a game.** It is the one board with no
`Game` and no `GameTree` behind it: pieces are put and removed, never moved by
a rule, so its `chess.js` is built with `{ skipValidation: true }` and is a
container rather than a rules authority. A position crosses to other screens
as `?fen=`, which each validates with `parseFen` and takes as initial state.

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/views/shared/positionEditor/PositionEditor.tsx` | **The component**: the legality report, the two palettes and the board inside a `ChessboardProvider` (pinned LTR), the resets, and the Position / FEN / PGN forms with their ingestion state (typed text, the multi-game picker, the two errors, the `.pgn` drop). |
| `src/views/shared/positionEditor/usePositionEditor.ts` | **The state** — the host's: the `chess.js` container, the FEN fields, the orientation, and every edit (`onPieceDrop`, `clearColor`, `setTurn`, `setCastlingRight`, `setEnPassant`, the resets, `loadFen`, `loadPosition`, `flipBoard`). Returns `fen`, `fields`, `problems`, `isValid`, `orientation`, `initialFen`. |
| `PositionFields.tsx`, `FenSetup.tsx`, `PgnSetup.tsx`, `PiecePalette.tsx` (same folder) | The Position form (FEN fields 2–4), the FEN form (paste in, copy out), the PGN form (a game's final position), one palette row with its trash. Presentational; each takes the host's `testId`. |
| `src/lib/positionEditor.ts` | Pure: `fenFields` / `fenFromFields`, `enPassantOptions`, `positionProblems`, `START_POSITION` / `EMPTY_POSITION`. |
| `src/views/shared/positionEditor/PositionEditor.test.tsx` | The component's tests, in a bare host (§5). |
| `src/views/engine/games/NewGameForm.tsx` | **The first host** — the Lobby's form (§3). |
| `src/views/tools/analysis/AnalysisBoard.tsx` | **The second host** — the Analysis Board's Position tab (§4). |
| `src/lib/newGameLink.ts` | `newGameParams(settings, side, evalBar, fen?)` — Start's link, `fen` included for a custom position. |

Locale keys: `positionEditor.*` in `src/locales/en.ts` / `he.ts` — top level,
like every shared piece's (`tabs`, `palette`, `fields`, `controls`,
`problems`, `fen`, `pgn`). The host's own words are its own (`playedGames.newGame.*`).

---

## 1. The contract

```tsx
const editor = usePositionEditor(initialFen?, { orientation? });   // the host owns it
<PositionEditor editor={editor} testId="…" boardMaxWidth={360} />

editor.fen        // the position as a FEN — always whole, illegal or not
editor.problems   // PositionProblem[] — empty when a game could start from it
editor.isValid    // problems.length === 0
```

| Prop | Type | What it is |
| --- | --- | --- |
| `editor` | `PositionEditorState` | The state from `usePositionEditor`. **The host's**: it lives above the component, so unmounting the editor (a tab switched away) loses no position, and the host can read and reset it from its own controls. |
| `testId` | `string` | The root `data-testid`, the prefix of every id under it (`${testId}-tab-fen`, `${testId}-turn-b`, `${testId}-reset-start`, `${testId}-problem-noWhiteKing`, …) and of the board's `options.id` (`${testId}-board`). Unique on the page. |
| `boardMaxWidth` | `number?` | The widest the board grows, in px. Absent, the column's full width. |

`usePositionEditor(initialFen?)` — the first render's value only, already
validated by the host (`parseFen`). Given: the board and fields start there,
the board faces its side to move, and a third reset, **Reset**, returns to it.
Absent: the standard start, facing White, no third reset.

`options.orientation` — the host **pins** which way the board faces. While
set, `editor.orientation` is it on every render: loads, Reset and Flip no
longer turn the board, and the component renders no Flip
(`editor.orientationPinned`). Unset, the editor turns the board by its own
rules, from where its own orientation last stood. The Lobby pins it to the
side chosen on the Game tab.

**Why a hook plus a component, not `onChange(fen, problems)`**: the host has
to *act* on the position (the Lobby's "Use the standard start" on another tab)
and keep it while the editor is unmounted. A controlled component would
need the whole field set and orientation lifted anyway; the hook is that
lifting, written once.

What the component does **not** do: route, navigate, read the URL, hand the
position anywhere, or store anything. Taking the position elsewhere is the
host's, and so is gating that on `isValid`. The one control the editor
switches off itself is the FEN tab's copy button.

---

## 2. Invariants — never break these

1. **Illegal is a state, not an error.** Every edit is allowed; `problems`
   reports. Nothing in the component refuses a position except `chess.js`'s
   second king of one colour, and the drop puts back whatever it lifted.
2. **`parseFen` guards the way in** (the FEN form, the host's `initialFen`);
   what the board holds is never re-validated into a throw.
3. **Only field 1 comes off the `chess.js` instance** (`{ skipValidation: true }`,
   only `put` / `remove` / `load`). Fields 2–6 are the hook's `fields`, so the
   controls round-trip.
4. **A position turns the board; arranging one does not.** `loadFen`,
   `loadPosition` (a PGN's final position) and Reset (back to the initial
   position) face the side to move; New board, Clear board, the trash and the
   side-to-move field leave the reader's viewpoint alone. A host's pin
   (`options.orientation`) beats all of it.
5. **`ChessboardProvider` carries every option**, `<Chessboard />` takes none,
   and the palettes are inside the provider (a `SparePiece` reaches the drag
   context only from there). `options.id` is `${testId}-board`.
6. **The board and palettes are pinned LTR** by the component's own
   `ForceLTR` — a host panel is not under `Layout.tsx`'s board-area one.
7. **Screen-agnostic.** No import of `react-router`, of any screen, of any
   store. A test renders it with no router (§5), and that is the check.
8. **A natural-height column.** It never scrolls itself; the host places it
   in a region that does (the Lobby's tab body).

---

## 3. Embedding it — the Lobby, the worked example

`NewGameForm.tsx` (`/engine/games`, the right-hand panel):

- The form holds `usePositionEditor(undefined, { orientation })` beside its
  settings, side and eval-bar state, the orientation pinned to the side chosen
  on the Game tab — White or Black at the bottom, as the reader will play;
  **Random** pins nothing, and the editor faces its own way with its Flip
  back. It renders two tabs, **Game** and **Board
  editor**; the Board editor tab is `<PositionEditor editor={editor}
  testId="new-game-editor" boardMaxWidth={360} />` inside the panel's one
  scrolling region. The games list keeps the board square.
- **Start** and the storage note sit below the tabs, visible on both.
- `customFen = editor.fen === START_POSITION ? undefined : editor.fen` — the
  standard start sends no `fen`, so an ordinary game's link is unchanged.
  `newGameParams(settings, side, evalBar, customFen)` writes it, from either
  tab.
- **Start is off** while the position cannot be played from: `editor.isValid`
  false, or a custom FEN `parseFen` refuses — the arrival's own gate, which
  would drop such a `?fen=` silently, asked here as a safety net under
  `positionProblems` (no disagreement is known: `chess.js` accepts castling rights
  with no rook and an en passant square with no pawn). Off, it is a plain
  disabled button, not a link, with a warning above it listing the problems.
- The **Game tab** says when a custom position is set (the FEN, an *Edit*
  that switches tabs, and *Use the standard start* → `editor.setStartingPosition`).
- Precedence on arrival is `arrivalOf`'s, unchanged: the Lobby always writes a
  `side`, which beats the position's side to move.

## 4. The second host — the Analysis Board's Position tab

Built (CTA-87): a `BoardPanel` tab (Moves · Map · Load · **Position** ·
Export · Engine) holding `usePositionEditor(core.fen)` — the position on
screen, seeded on the first render only — and a **Set position and analyze**
confirm. The hook's state is the screen's, so a switch of tab (the editor
unmounts; only Moves and Map stay mounted) loses nothing. The confirm loads
the edited FEN through the session's `loadFen` (`useAnalysisBoard`: a new
unsaved analysis, like any Load) and clears the arrival's URL — and a
position turns the board, so it faces the position's side to move, whatever
the board faced before. The gate is the Lobby's — `isValid` plus `parseFen`:
while the position cannot be analyzed, the confirm is a plain disabled button
with a warning above it listing the problems. `boardMaxWidth` 360. Nothing
in this folder changed for it.

---

## 5. Testing

- **The component** — `PositionEditor.test.tsx` renders it in a bare host
  (`usePositionEditor` + `<PositionEditor testId="editor">` + a `data-*` probe
  of `fen` / `isValid` / `problems`), **with no router**. `react-chessboard`
  is stubbed as the spare-piece trio (`ChessboardProvider` keeps the options,
  `Chessboard` renders them, `SparePiece` a div — `chessboard.md` §8); a test
  drags by calling the provider's `onPieceDrop`. It covers the palettes and
  the trash, the fields round-trip, orientation, the resets, an initial
  position, FEN in and out, PGN in (a picker for several games), the
  problems, the host's reading, the state surviving an unmount, and the
  board's id and LTR pin under Hebrew.
- **The host** — `PlayedGames.test.tsx`'s *Board editor* block (the Lobby
  mounts the form in its right panel): the two tabs with Start on both, the
  edited FEN on Start's link beside the Game tab's options, the Game tab's
  note and reset, Start off and why.
- **The second host** — `AnalysisBoard.test.tsx`'s *Position tab* block: the
  editor seeded from the position on screen (and only from it), the confirm
  loading the edited FEN as a new analysis that turns the board and clears
  the arrival's URL, the engine reading the confirmed position, the confirm
  off with the problems listed while the position cannot be analyzed, and
  the state surviving a switch of tab. The shared board stub keeps the
  editor's provider options while its tab is open — a spare-piece board
  renders with no options of its own (`boardTestHarness.tsx`,
  `chessboard.md` §8).
- `newGameLink.test.ts` — `newGameParams` with and without a `fen`.
- The board's actual drawing, palette sizing and drag are a browser check.

---

## 6. Recipes

- **A new host**: own `usePositionEditor(initialFen?)`, render
  `<PositionEditor editor testId>` in a scrolling region, read `fen` /
  `isValid`, gate what takes the position elsewhere on them (and `parseFen`),
  add a host test. Nothing in this folder changes.
- **A new problem** (`positionProblems`): add it to `PositionProblem` in
  `lib/positionEditor.ts`, detect it there (pure, non-throwing), and add
  `positionEditor.problems.<id>` to both catalogs. The report and the Lobby's
  warning list it with no other change.
- **A new reset or form**: a reset is a hook callback plus an entry in the
  component's `resets`; a form is a tab id in `FORM_TAB_IDS`, a
  presentational component taking `testId`, and `positionEditor.tabs.<id>`.
- **A new option on the component**: optional, its absence today's
  behaviour (`chessboard.md` §9.6's rule for shared pieces).
