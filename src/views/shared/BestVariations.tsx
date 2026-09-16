import { Fragment } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import {
  formatScore,
  variationNumbering,
  type Analysis,
} from "../../lib/engineAnalysis";
import { maskSanLine, type PieceMask } from "../../lib/pieceMask";
import { moveSx, sanTokenSx } from "./moveTokenSx";

/**
 * The top lines the engine is considering for the position on screen, each with
 * its score and its principal variation in SAN, under the depth the search has
 * reached. Play with Engine and Masked Pieces show this as their Variations
 * tab; the Analysis Board pins it above its tabs (CTA-55), where a line is
 * also something the reader plays — see `onSelectMove`.
 *
 * Presentational — it takes the analysis the screen collected and renders it, so
 * it can be driven straight from a fixture. Lines arrive one rank at a time and
 * fill in as the search deepens, so a `MultiPV` set with gaps in it is normal;
 * what reaches the screen is the ranks that are both present and still asked
 * for, which is `requested`'s second job (see below).
 *
 * A variation is printed one token per move, the move's number inside the token
 * the way the tree viewer's tokens carry theirs (`VariationLine.tsx`) and a
 * plain space between, so the line reads `23. Nf3 Qe7 24. Rd1` and wraps at
 * the panel's edge rather than overflowing it. Whether a move is clickable is
 * decided by `onSelectMove` alone:
 *
 * - **without it** the moves render as plain text — the two engine screens'
 *   tab, which the reader reads while playing their own moves beside it.
 *   Nothing is clickable, and the DOM is the text it always was.
 * - **with it** each move is a button, and a click hands over the SAN prefix
 *   up to and including the move clicked — the lichess analysis behaviour:
 *   clicking the third move of a line plays all three. The prefix carries the
 *   *true* SANs even under a mask, because the click is behaviour and the
 *   mask never touches that (`lib/pieceMask.ts`); what the token *prints* is
 *   what is disguised.
 *
 * SAN and the scores are Latin text in a panel that mirrors under Hebrew, so
 * every token carries `dir="ltr"` — an **attribute**, never a CSS declaration,
 * which the RTL emotion cache would flip into the bug it is meant to prevent
 * (see the root `CLAUDE.md`).
 */

type BestVariationsProps = {
  analysis: Analysis;
  /**
   * The current `MultiPV` — how many lines the engine was asked for. It both
   * bounds what is rendered (ranks above it are leftovers from a wider search)
   * and lets a set that has not filled up yet say so.
   */
  requested: number;
  /**
   * Optional piece mask (`lib/pieceMask.ts`), for the same reason `MoveList`
   * takes one: a variation printed in SAN names the pieces in it, and the
   * engine's lines are full of moves by pieces the board is hiding. With a mask
   * those moves are printed as coordinates. Without one nothing changes.
   */
  mask?: PieceMask;
  /**
   * Play a line: a click on its Nth move hands over the first N SANs — the
   * prefix up to and including the move clicked. Optional because the two
   * engine screens render this view plain; without it no move is a button
   * (see the component note).
   */
  onSelectMove?: (san: readonly string[]) => void;
};

const sanSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

function BestVariations({
  analysis,
  requested,
  mask,
  onSelectMove,
}: BestVariationsProps) {
  const { t } = useTranslation();

  /*
    The array is indexed by MultiPV rank, which leaves two kinds of entry that
    must not reach the screen.

    A set still *filling in* has holes, because lines arrive one rank at a time.
    A set left over from a *wider* search has ranks above the current `MultiPV`:
    lowering the setting re-searches the same position, so the analysis state is
    kept rather than replaced, and the ranks the engine has stopped reporting
    would otherwise sit there looking live while only rank 1 moved. Asking for
    one line has to show one line.
  */
  const lines = analysis.lines.filter(
    (line) => line !== undefined && line.multipv <= requested,
  );

  return (
    <Box data-testid="best-variations">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("variations.title")}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          data-testid="analysis-depth"
          label={t("variations.depth", { depth: analysis.depth })}
        />
      </Box>

      {lines.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("variations.thinking")}
        </Typography>
      ) : (
        <Box
          component="ol"
          sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.75 }}
        >
          {lines.map((line) => {
            /*
              What the tokens print: the true SANs, disguised when a mask is in
              force. A click below still hands over the true ones, because the
              mask is a costume, never a rule — and every line starts from the
              analysed position, which is the board the mask needs in order to
              name the squares.
            */
            const display =
              mask === undefined
                ? line.san
                : maskSanLine(mask, analysis.fen, line.san);
            const prefixes = variationNumbering(analysis.fen, display.length);

            return (
              <Box
                component="li"
                key={line.multipv}
                data-testid={`variation-${line.multipv}`}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1,
                  p: 0.75,
                  borderRadius: 0.5,
                  bgcolor: "action.hover",
                }}
              >
                <Typography
                  component="span"
                  dir="ltr"
                  data-testid={`variation-${line.multipv}-score`}
                  sx={{
                    ...sanSx,
                    fontWeight: 700,
                    flexShrink: 0,
                    minWidth: "3.5rem",
                  }}
                >
                  {formatScore(line.score)}
                </Typography>
                <Typography
                  component="span"
                  dir="ltr"
                  data-testid={`variation-${line.multipv}-line`}
                  sx={{ ...sanSx, color: "text.secondary", minWidth: 0 }}
                >
                  {display.map((san, index) => (
                    <Fragment key={index}>
                      {/*
                        A plain space between the tokens, so the line reads as
                        one sentence and wraps at the panel's edge.
                      */}
                      {index > 0 && " "}
                      {onSelectMove === undefined ? (
                        `${prefixes[index]}${san}`
                      ) : (
                        <ButtonBase
                          dir="ltr"
                          data-testid={`variation-${line.multipv}-move-${index + 1}`}
                          data-san={line.san[index]}
                          onClick={() =>
                            onSelectMove(line.san.slice(0, index + 1))
                          }
                          sx={{ ...moveSx, ...sanTokenSx }}
                        >
                          {`${prefixes[index]}${san}`}
                        </ButtonBase>
                      )}
                    </Fragment>
                  ))}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {lines.length > 0 && lines.length < requested && (
        <Typography
          variant="caption"
          data-testid="variations-partial"
          sx={{ color: "text.secondary", display: "block", mt: 1 }}
        >
          {t("variations.partial", {
            shown: lines.length,
            requested,
          })}
        </Typography>
      )}
    </Box>
  );
}

export default BestVariations;
