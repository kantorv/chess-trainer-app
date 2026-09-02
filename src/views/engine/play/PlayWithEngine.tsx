import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import {
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from "react-chessboard";
import { RightPanel } from "../../main/rightPanel";
import EvalBar, {
  EVAL_BAR_GAP_PX,
  EVAL_BAR_TOTAL_PX,
} from "../../shared/EvalBar";
import PromotionPicker from "../../shared/PromotionPicker";
import EnginePanel from "./EnginePanel";
import { usePlayWithEngine } from "./usePlayWithEngine";

/**
 * Play with Engine — a full game against Stockfish, with the game and the
 * engine's thinking in the shell's right-hand panel.
 *
 * The screen fills two of the shell's regions and draws no columns of its own:
 *
 * - the **board square** holds the evaluation bar and the board, side by side;
 * - the **right-hand panel** (`<RightPanel>`) holds `EnginePanel` — the Game /
 *   Engine / Variations tabs over the board controls.
 *
 * All the behaviour lives in `usePlayWithEngine`; this component is the layout
 * and the board options. `<RightPanel>` portals the panel out of this tree, so
 * it still shares this screen's state by closure and nothing is threaded through
 * the shell.
 *
 * ### How the eval bar and the board split the square
 *
 * The shell hands this screen a square of side S and computes it without knowing
 * anything about the bar (the scope decision on CTA-12: `Layout.tsx` is not
 * changed). The bar takes a fixed strip out of that square and the board gives up
 * the width, so the board is a `S - EVAL_BAR_TOTAL_PX` square. The bar's height
 * is the same computed value rather than `100%`, which is what keeps its ends
 * flush with the board's rather than standing a strip's width taller.
 */
function PlayWithEngine() {
  const { t } = useTranslation();
  const state = usePlayWithEngine();

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  const chessboardOptions: ChessboardOptions = {
    id: "play-with-engine",
    position: state.fen,
    boardOrientation: state.orientation,
    /*
      The move that produced the position on screen. External arrows are never
      cleared by the board itself (`.claude/rules/chessboard.md` §3.4), so this
      is the whole set for the current ply, recomputed on every change.
    */
    arrows: state.arrows,
    onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      state.onPieceDrop({ sourceSquare, targetSquare }),
    /*
      Draggable only on the live position, on the human's turn, with no promotion
      picker open. Off the live position the board is a review of an earlier ply
      and a drag would apply to a position nobody is looking at.
    */
    allowDragging:
      state.isLive && !state.isEngineThinking && state.promotion === null,
  };

  // The bar is inside the square, so the board gives up its width. Without it
  // the board takes the whole square back.
  const boardSide = state.showEvalBar
    ? `calc(100% - ${EVAL_BAR_TOTAL_PX}px)`
    : "100%";

  return (
    <>
      <Box
        data-testid="play-with-engine-screen"
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-start",
          /*
            The gap is the other half of `EVAL_BAR_TOTAL_PX`, so bar + gap +
            board comes to exactly the square the shell handed over. Any other
            value here and the row overflows, flex shrinks the board, and it
            stops being square.
          */
          gap: state.showEvalBar ? `${EVAL_BAR_GAP_PX}px` : 0,
        }}
      >
        {state.showEvalBar && (
          <Box sx={{ height: boardSide, display: "flex" }}>
            <EvalBar
              score={topLine?.score ?? null}
              orientation={state.orientation}
              label={t("board.evalBar")}
            />
          </Box>
        )}

        {/*
          `position: relative` so the promotion picker, which is absolutely
          positioned in percentages of the board, has this box to measure
          against — it overlays the board exactly.
        */}
        <Box
          data-testid="play-with-engine-board"
          sx={{
            position: "relative",
            width: boardSide,
            height: boardSide,
            // The width is already exact; never let flex shave a pixel off it,
            // which would make the board a rectangle.
            flexShrink: 0,
          }}
        >
          <Chessboard options={chessboardOptions} />

          {state.promotion && (
            <PromotionPicker
              targetSquare={state.promotion.to}
              orientation={state.orientation}
              color={state.humanColor}
              onSelect={state.resolvePromotion}
            />
          )}
        </Box>
      </Box>

      <RightPanel>
        <EnginePanel state={state} />
      </RightPanel>
    </>
  );
}

export default PlayWithEngine;
