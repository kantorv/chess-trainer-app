import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import {
  Chessboard,
  type Arrow,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from "react-chessboard";
import type { Score } from "../../lib/engineAnalysis";
import EvalBar, { EVAL_BAR_GAP_PX, EVAL_BAR_TOTAL_PX } from "./EvalBar";
import PromotionPicker, { type PromotionChoice } from "./PromotionPicker";

/**
 * The board square of a screen that plays a game against the engine: the
 * evaluation bar, the board, and the promotion picker overlaid on it.
 *
 * Extracted from `PlayWithEngine.tsx` when a second screen — Masked Pieces —
 * came to need exactly the same square. Both render this; the only thing they
 * differ by is what is passed in, which for the masked screen is a `pieces`
 * renderer (see `lib/pieceMask.ts`). Forking it would have put the width
 * discipline below in two files, to drift apart.
 *
 * Presentational, like everything else in `views/shared/`: it takes props and
 * knows nothing about which screen is rendering it, so neither screen's hook is
 * imported here.
 *
 * ### How the eval bar and the board split the square
 *
 * The shell hands the screen a square of side S and computes it without knowing
 * anything about the bar (`Layout.tsx` is not changed for one). The bar takes a
 * fixed strip out of that square and the board gives up the width, so the board
 * is a `S - EVAL_BAR_TOTAL_PX` square. Bar width + gap must come to exactly that
 * constant, and the board box must have `flexShrink: 0`, or flex shaves the
 * difference off and the board stops being square
 * (`.claude/rules/chessboard.md` §5). The bar's height is the same computed
 * value rather than `100%`, which is what keeps its ends flush with the board's
 * rather than standing a strip's width taller.
 */

type EngineBoardSquareProps = {
  /**
   * `options.id`, and the root of the two `data-testid`s this renders
   * (`<id>-screen`, `<id>-board`). Unique per screen: two boards sharing an id
   * on one page conflict (`.claude/rules/chessboard.md` §2).
   */
  id: string;

  /** The position on screen — not necessarily the live one. */
  position: string;
  orientation: "white" | "black";
  /** The whole arrow set for this ply; the board never clears external ones. */
  arrows: Arrow[];
  allowDragging: boolean;
  onPieceDrop: (args: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => boolean;
  /**
   * Board options merged over the ones computed here — how a screen adds
   * something of its own without this component knowing what it is. `id`,
   * `position` and the handlers above are set after it, so it cannot quietly
   * take them over.
   */
  boardOptions?: ChessboardOptions;

  showEvalBar: boolean;
  /** Already normalised to White's perspective (`lib/engineAnalysis.ts`). */
  score: Score | null;

  /** The pending promotion, or `null` when no picker is open. */
  promotion: { from: string; to: string } | null;
  /** Whose promotion it is — the picker offers that colour's pieces. */
  humanColor: "w" | "b";
  onResolvePromotion: (piece: PromotionChoice | null) => void;
};

function EngineBoardSquare({
  id,
  position,
  orientation,
  arrows,
  allowDragging,
  onPieceDrop,
  boardOptions,
  showEvalBar,
  score,
  promotion,
  humanColor,
  onResolvePromotion,
}: EngineBoardSquareProps) {
  const { t } = useTranslation();

  const chessboardOptions: ChessboardOptions = {
    ...boardOptions,
    id,
    position,
    boardOrientation: orientation,
    arrows,
    onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      onPieceDrop({ sourceSquare, targetSquare }),
    allowDragging,
  };

  // The bar is inside the square, so the board gives up its width. Without it
  // the board takes the whole square back.
  const boardSide = showEvalBar ? `calc(100% - ${EVAL_BAR_TOTAL_PX}px)` : "100%";

  return (
    <Box
      data-testid={`${id}-screen`}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-start",
        /*
          The gap is the other half of `EVAL_BAR_TOTAL_PX`, so bar + gap + board
          comes to exactly the square the shell handed over. Any other value here
          and the row overflows, flex shrinks the board, and it stops being
          square.
        */
        gap: showEvalBar ? `${EVAL_BAR_GAP_PX}px` : 0,
      }}
    >
      {showEvalBar && (
        <Box sx={{ height: boardSide, display: "flex" }}>
          <EvalBar
            score={score}
            orientation={orientation}
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
        data-testid={`${id}-board`}
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

        {promotion && (
          <PromotionPicker
            targetSquare={promotion.to}
            orientation={orientation}
            color={humanColor}
            onSelect={onResolvePromotion}
          />
        )}
      </Box>
    </Box>
  );
}

export default EngineBoardSquare;
