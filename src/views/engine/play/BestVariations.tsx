import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { formatScore, numberedVariation } from "../../../lib/engineAnalysis";
import type { Analysis } from "./usePlayWithEngine";

/**
 * The Variations tab: the top lines the engine is considering for the position
 * on screen, each with its score and its principal variation in SAN, under the
 * depth the search has reached.
 *
 * Presentational — it takes the analysis the screen collected and renders it, so
 * it can be driven straight from a fixture. Lines arrive out of order and fill in
 * as the search deepens, so gaps in the `MultiPV` set are normal and are simply
 * not rendered.
 *
 * SAN and the scores are Latin text in a panel that mirrors under Hebrew, so
 * every token carries `dir="ltr"` — an **attribute**, never a CSS declaration,
 * which the RTL emotion cache would flip into the bug it is meant to prevent
 * (see the root `CLAUDE.md`).
 */

type BestVariationsProps = {
  analysis: Analysis;
  /** How many lines the engine was asked for, so a partial set can say so. */
  requested: number;
};

const sanSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

function BestVariations({ analysis, requested }: BestVariationsProps) {
  const { t } = useTranslation();

  // The array is indexed by MultiPV rank, so a set still filling in has holes.
  const lines = analysis.lines.filter((line) => line !== undefined);

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
          {t("playEngine.variations.title")}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          data-testid="analysis-depth"
          label={t("playEngine.variations.depth", { depth: analysis.depth })}
        />
      </Box>

      {lines.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("playEngine.variations.thinking")}
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
                {numberedVariation(analysis.fen, line.san)}
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
          {t("playEngine.variations.partial", {
            shown: lines.length,
            requested,
          })}
        </Typography>
      )}
    </Box>
  );
}

export default BestVariations;
