# Index — where to look

Jump straight to the file that answers the question. Read the specific file,
not the whole folder. If the answer is a project convention rather than a
library fact, it is in [`.claude/rules/chessboard.md`](../../../.claude/rules/chessboard.md)
instead.

## Already in context — don't open these

`D_OptionsApi.mdx` and `E_FunctionsAndTypes.mdx` are **generated into
`.claude/rules/` and loaded every session**. If your question is "what does
option X do", "what's its default", or "what's the shape of type Y", you
already have the answer — see
[`react-chessboard-options-api.md`](../../../.claude/rules/react-chessboard-options-api.md)
and
[`react-chessboard-types-and-helpers.md`](../../../.claude/rules/react-chessboard-types-and-helpers.md).
The `.mdx` originals stay here only as the regeneration source.

## Prose docs, read on demand

| File | Answers |
| --- | --- |
| `A_GetStarted.mdx` | What the library is, feature list, install, 30-second quick start. |
| `B_BasicExamples.mdx` | Narrated walkthroughs: default board, wiring `chess.js`, spare pieces, click-to-move, click-or-drag. Points at the matching story files. |
| `C_AdvancedExamples.mdx` | Narrated walkthroughs: analysis board, mini puzzles, multiplayer, premoves, promotion picker, four-player, 3D board. |
| `G_UpgradeToV5.mdx` | Full v4→v5 breaking changes. `chessboard.md` §6 carries the summary; open this only when the summary doesn't cover your case. |
| `F_Contributing.mdx` | Upstream contribution process. Not relevant to this repo. |

## Runnable examples (`stories/*.stories.tsx`)

Each story is a complete, compiling component. `title:` in the file is its
Storybook path.

### `stories/basic-examples/`

| File | Shows |
| --- | --- |
| `Default.stories.tsx` | Bare static board, minimal `options`. Mirror of app `Board1`. |
| `PlayVsRandom.stories.tsx` | The core loop: ref-owned `chess.js` + controlled `position` + `onPieceDrop`, opponent plays random legal moves. Mirror of app `Board2`. |
| `ClickToMove.stories.tsx` | `allowDragging: false` + `onSquareClick` from/to state machine + legal-target highlights via `squareStyles`. |
| `ClickOrDragToMove.stories.tsx` | Both input modes on one board at once. |
| `SparePieces.stories.tsx` | `ChessboardProvider` + drag-from-palette / position editing. Mirror of app `BoardEditor`. |

### `stories/advanced-examples/`

| File | Shows |
| --- | --- |
| `AnalysisBoard.stories.tsx` | Stockfish eval per position, best move rendered as an `arrows` entry. Mirror of app `Board3`. |
| `PiecePromotion.stories.tsx` | **The real promotion pattern** — detect pawn→last rank, render your own piece picker, `move({ …, promotion })`. Use this instead of the demo `'q'` shortcut. |
| `Premoves.stories.tsx` | Premove queue handled in app code (v5 removed built-in premoves). |
| `MiniPuzzles.stories.tsx` | Load a FEN, accept only the solution line, advance on correct move. |
| `Multiplayer.stories.tsx` | Two clients sharing a position; `boardOrientation` per side. |
| `FourPlayerChess.stories.tsx` | `chessboardRows`/`chessboardColumns` > 8 and the position-object form (FEN can't express it). |
| `3DBoard.stories.tsx` | Wholesale custom `pieces` render map (`.webp` sprites), custom `boardStyle`. |

### `stories/options/`

One file per option — `<OptionName>.stories.tsx` is a live demo of
`options.<optionName>`. Open the one named after the option you're setting
(e.g. tuning arrows → `Arrows.stories.tsx` + `ArrowOptions.stories.tsx`;
per-square styling → `SquareStyles.stories.tsx`; restricting pickups →
`CanDragPiece.stories.tsx`).

Note: `OnSquareMouseDown` / `OnSquareMouseUp` / `OnSquareClick` stories all
carry the same `title:` upstream — open them by filename.
