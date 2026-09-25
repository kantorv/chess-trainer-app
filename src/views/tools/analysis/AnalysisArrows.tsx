import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { ArrowPaletteId, ArrowWidthSource } from "../../../lib/arrowSettings";
import { ArrowPaletteField, ArrowWidthSourceField } from "./ArrowSettingsFields";

/**
 * **The Analysis Board's Arrows tab** (CTA-98): the next-move arrows switch
 * (moved here from the Engine tab), what sizes them and their colours — all
 * the session's, opened as the record's settings say. `available` is what the
 * tree on screen carries (`arrowWidthSourcesIn`), recomputed by the screen as
 * the tree changes.
 */
function AnalysisArrows({
  showArrows,
  onShowArrowsChange,
  widthSource,
  onWidthSourceChange,
  available,
  palette,
  onPaletteChange,
}: {
  showArrows: boolean;
  onShowArrowsChange: (next: boolean) => void;
  widthSource: ArrowWidthSource;
  onWidthSourceChange: (next: ArrowWidthSource) => void;
  available: ReadonlySet<ArrowWidthSource>;
  palette: ArrowPaletteId;
  onPaletteChange: (next: ArrowPaletteId) => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="analysis-arrows-tab"
      sx={{ display: "flex", flexDirection: "column", gap: 2, px: 1, py: 1 }}
    >
      <Box>
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Switch
              size="small"
              checked={showArrows}
              data-testid="analysis-arrows"
              onChange={(event) => onShowArrowsChange(event.target.checked)}
            />
          }
          label={t("analysis.settings.arrows")}
        />
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {t("analysis.arrows.showHelp")}
        </Typography>
      </Box>
      <ArrowWidthSourceField
        idPrefix="analysis-arrows"
        value={widthSource}
        onChange={onWidthSourceChange}
        available={available}
      />
      <ArrowPaletteField idPrefix="analysis-arrows" value={palette} onChange={onPaletteChange} />
    </Box>
  );
}

export default AnalysisArrows;
