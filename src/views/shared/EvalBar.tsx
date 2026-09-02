import Box from "@mui/material/Box";
import {
  evalBarFraction,
  formatScore,
  type Score,
} from "../../lib/engineAnalysis";

/**
 * The evaluation bar: a thin vertical strip beside the board, White's share
 * filled from the bottom.
 *
 * The lichess / chess.com placement — flush against the board's edge, inside the
 * screen's own box. It is the board's furniture, not the panel's, so it lives in
 * the square the shell hands the screen and the board gives up its width. The
 * shell's square computation (`Layout.tsx`) is untouched.
 *
 * Two consequences of sitting inside the board square:
 *
 * - **It does not mirror under Hebrew**, because the whole square is wrapped in
 *   `ForceLTR`. That is the right answer for a bar that has to stay welded to a
 *   board which itself never mirrors — a bar that jumped to the far side while
 *   the board stayed put would be reading as a different board's bar.
 * - **It flips with the board.** Turning the board around turns the bar with it,
 *   so the side you are playing is always the end nearest you.
 *
 * Presentational: the score comes in already normalised to White's perspective
 * (`lib/engineAnalysis.ts`), so nothing here has to know whose turn it is.
 */

/** Width of the strip, and the gap between it and the board, in pixels. */
export const EVAL_BAR_WIDTH_PX = 18;
export const EVAL_BAR_GAP_PX = 8;
/** What the strip and the gap take out of the board's side, together. */
export const EVAL_BAR_TOTAL_PX = EVAL_BAR_WIDTH_PX + EVAL_BAR_GAP_PX;

type EvalBarProps = {
  /** Already in White's perspective; `null` before the engine has said anything. */
  score: Score | null;
  /** Which way the board is facing, so the bar faces the same way. */
  orientation: "white" | "black";
  /** Accessible name — the bar is otherwise two coloured rectangles. */
  label: string;
};

function EvalBar({ score, orientation, label }: EvalBarProps) {
  const whiteShare = evalBarFraction(score);
  const text = formatScore(score);

  return (
    <Box
      data-testid="eval-bar"
      role="img"
      aria-label={`${label}: ${text}`}
      /*
        The value is exposed as a data attribute as well as in the label: it is
        what a test asserts on, and reading it off the rendered height would mean
        asserting on a percentage string that layout rounds.
      */
      data-score={text}
      data-white-share={whiteShare.toFixed(4)}
      sx={{
        width: `${EVAL_BAR_WIDTH_PX}px`,
        flexShrink: 0,
        display: "flex",
        // White at the bottom for a White-facing board; turning the board over
        // turns the bar with it.
        flexDirection: orientation === "white" ? "column-reverse" : "column",
        borderRadius: 0.5,
        overflow: "hidden",
        // The dark half is the ground the light half is painted onto, so only
        // one of the two needs a size.
        bgcolor: "grey.900",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        data-testid="eval-bar-white"
        sx={{
          height: `${whiteShare * 100}%`,
          bgcolor: "common.white",
          transition: "height 240ms ease-out",
        }}
      />
    </Box>
  );
}

export default EvalBar;
