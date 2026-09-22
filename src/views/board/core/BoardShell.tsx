import { useMemo, type ReactNode } from "react";
import Box from "@mui/material/Box";
import type { ChessboardOptions, PieceRenderObject } from "react-chessboard";
import { capturedSummaryOf } from "../../../lib/capturedPieces";
import type { Score } from "../../../lib/engineAnalysis";
import { pathTo } from "../../../lib/gameTree";
import { RightPanel } from "../../main/rightPanel";
import EngineBoardSquare from "../../shared/EngineBoardSquare";
import BoardPanel, { type BoardPanelProps } from "./BoardPanel";
import type { BoardCore } from "./useBoardCore";

/**
 * **The shell every v2 board is laid out by** — §3.1 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * Two of the app shell's regions, and no columns of its own:
 *
 * ```
 * BoardShell
 * ├── EngineBoardSquare   (views/shared — eval bar + captured strips + board + promotion)
 * │     boardOptions ← the screen's slot: arrows, pieces, anything else
 * └── <RightPanel>        (portalled out of this tree; state is shared by closure)
 *       └── BoardPanel    (the one panel skeleton — §3.2)
 * ```
 *
 * ## It renders the layout arithmetic; it does not repeat it
 *
 * The eval bar's width discipline and the captured strips' height discipline
 * are §5 of `.claude/rules/chessboard.md`, and that section's own rule is that
 * **a third screen with an eval bar renders `EngineBoardSquare` rather than
 * copying the `calc()`**. Five screens is well past three, so this component's
 * whole job on the board side is deriving that component's props — the sums stay
 * in exactly one file, where a change to them reaches every board at once.
 *
 * ## What it computes so no screen repeats it
 *
 * The captured-pieces summary: walked from the line the reader is standing on,
 * against the tree's **own** start position rather than the standard one, so a
 * study that begins mid-game reports the pieces taken *in it* and a promotion
 * counts as a gain for the side that made it.
 *
 * ## What it deliberately leaves to the screen
 *
 * `boardOptions` — the arrows a board draws, the `pieces` renderer a masked
 * board hands over, anything else `react-chessboard` takes. It is merged
 * *under* the options derived here, so a screen cannot quietly take over the
 * id, the position or the drop handler. And `overlay`, for the one thing
 * those options cannot express — a screen's own drawing over the board, in
 * its own SVG, when per-arrow size is the message (`chanceArrows.ts`). And
 * every panel slot, because what goes in them is the whole of what one
 * board is and another is not.
 */

type BoardShellProps = {
  /**
   * `options.id`, and the root of the board square's test ids. Unique on the
   * page: two boards sharing an id conflict (`chessboard.md` §2).
   */
  id: string;
  /** The base — everything the square reads comes off it. */
  core: BoardCore;

  /** The eval bar's score, already normalised to White. `null` hides nothing. */
  score?: Score | null;
  /** Whether the eval bar is on. Off, the board takes the whole square back. */
  showEvalBar?: boolean;

  /** Merged *under* the options derived here — arrows, `pieces`, and so on. */
  boardOptions?: ChessboardOptions;
  /** Renderers for the captured strips' icons — a mask's costumes, or default. */
  capturedPieces?: PieceRenderObject;
  /**
   * Whether dragging is allowed at all. An open promotion picker always blocks
   * it — the move it is asking about has not been decided yet — so a screen
   * passing `true` still gets that guard.
   */
  allowDragging?: boolean;
  /**
   * Hide the material difference on the captured strips. The masked board's
   * one need: the diff is derived from the true pieces, so showing it under a
   * mask is the information leak §13 of the masking technique forbids.
   */
  hideMaterialDiff?: boolean;

  /**
   * Drawn over the board, inside its relative box — the screen's own overlay
   * layer, passed straight through to `EngineBoardSquare`'s slot.
   */
  overlay?: ReactNode;

  /** Everything the panel needs but its `ply`/`lastPly`/`onSelectPly`/`onFlip`. */
  panel: Omit<
    BoardPanelProps,
    "ply" | "lastPly" | "onSelectPly" | "onFlip" | "testId"
  > & { testId?: string };

  /**
   * Wrapped around both regions' contents — the PGN drop target the Analysis
   * screens put on the board *and* the panel, which are two separate subtrees
   * once the panel is portalled out, so one target cannot span them.
   */
  regionProps?: Record<string, unknown>;
};

function BoardShell({
  id,
  core,
  score = null,
  showEvalBar = true,
  boardOptions,
  capturedPieces,
  allowDragging = true,
  hideMaterialDiff = false,
  overlay,
  panel,
  regionProps,
}: BoardShellProps) {
  /*
    The captured pieces for the position on screen, walked from the tree's own
    start position — the study-friendly baseline, not the standard one. The
    diff is the position on screen against that same start, so a promotion
    counts as a gain for the side that made it.
  */
  const captured = useMemo(() => {
    const summary = capturedSummaryOf(
      pathTo(core.tree, core.nodeId),
      core.tree.startFen,
      core.fen,
    );
    return hideMaterialDiff ? { ...summary, materialDiff: 0 } : summary;
  }, [core.tree, core.nodeId, core.fen, hideMaterialDiff]);

  return (
    <>
      <Box
        data-testid={`${id}-region`}
        {...regionProps}
        sx={{ width: "100%", height: "100%" }}
      >
        <EngineBoardSquare
          id={id}
          position={core.fen}
          orientation={core.orientation}
          squareStyles={core.squareStyles}
          // The picker's question has not been answered, so nothing else may
          // move until it is — whatever the screen asked for.
          allowDragging={allowDragging && core.promotion === null}
          onPieceDrop={core.onPieceDrop}
          boardOptions={boardOptions}
          overlay={overlay}
          showEvalBar={showEvalBar}
          score={score}
          captured={captured}
          capturedPieces={capturedPieces}
          promotion={core.promotion}
          // The side promoting is the side to move in the position the pawn is
          // being pushed from — on a branching board that is either colour.
          humanColor={core.turn}
          onResolvePromotion={core.resolvePromotion}
        />
      </Box>

      <RightPanel>
        <Box
          {...regionProps}
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <BoardPanel
            {...panel}
            testId={panel.testId ?? `${id}-panel`}
            ply={core.ply}
            lastPly={core.lastPly}
            onSelectPly={core.goToPly}
            onFlip={core.flipBoard}
          />
        </Box>
      </RightPanel>
    </>
  );
}

export default BoardShell;
