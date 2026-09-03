import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import {
  formatScore,
  numberedVariation,
  type Analysis,
} from "../../lib/engineAnalysis";
import { maskSanLine, type PieceMask } from "../../lib/pieceMask";

/**
 * The Variations tab: the top lines the engine is considering for the position
 * on screen, each with its score and its principal variation in SAN, under the
 * depth the search has reached.
 *
 * Presentational — it takes the analysis the screen collected and renders it, so
 * it can be driven straight from a fixture. Lines arrive one rank at a time and
 * fill in as the search deepens, so a `MultiPV` set with gaps in it is normal;
 * what reaches the screen is the ranks that are both present and still asked
 * for, which is `requested`'s second job (see below).
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
};

const sanSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

function BestVariations({ analysis, requested, mask }: BestVariationsProps) {
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
          {lines.map((line) => (
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
                {numberedVariation(
                  analysis.fen,
                  // Every line starts from the analysed position, which is the
                  // board the mask needs in order to name the squares.
                  mask === undefined
                    ? line.san
                    : maskSanLine(mask, analysis.fen, line.san),
                )}
              </Typography>
            </Box>
          ))}
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
