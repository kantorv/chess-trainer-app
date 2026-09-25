import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import {
  ARROW_PALETTES,
  ARROW_WIDTH_SOURCES,
  type ArrowPaletteId,
  type ArrowWidthSource,
} from "../../../lib/arrowSettings";
import { NEXT_MOVE_ARROW_PALETTES } from "./nextMoveArrows";

/**
 * **How the next-move arrows are drawn** (CTA-98) — the two choices beside
 * the arrows switch, shared by the Analysis Board's Arrows tab (the session's)
 * and a saved analysis' settings screen (what the board opens on). Each takes
 * the value and reports the next; neither knows which screen it is on.
 *
 * - {@link ArrowWidthSourceField} — what sizes each arrow, one at a time. On
 *   the board, `available` greys out a tag no move in the tree carries, and a
 *   chosen one that is not there says the arrows are drawn as None.
 * - {@link ArrowPaletteField} — the colours, each preset with its swatches.
 *
 * Test ids hang off `idPrefix`: `-width-<source>` and `-palette-<id>` on the
 * radios' inputs.
 */

const captionSx = { display: "block", color: "text.secondary", lineHeight: 1.3 } as const;

export function ArrowWidthSourceField({
  idPrefix,
  value,
  onChange,
  available,
}: {
  idPrefix: string;
  value: ArrowWidthSource;
  onChange: (next: ArrowWidthSource) => void;
  /** The sources the tree on screen can be drawn by; absent, every one is offered. */
  available?: ReadonlySet<ArrowWidthSource>;
}) {
  const { t } = useTranslation();
  const drawnAsNone = available !== undefined && !available.has(value);
  return (
    <FormControl component="fieldset" data-testid={`${idPrefix}-width`}>
      <FormLabel component="legend" sx={{ typography: "body2", fontWeight: 600, mb: 0.5 }}>
        {t("analysis.arrows.widthSource")}
      </FormLabel>
      <RadioGroup value={value} onChange={(_event, next) => onChange(next as ArrowWidthSource)}>
        {ARROW_WIDTH_SOURCES.map((source) => {
          const disabled = available !== undefined && !available.has(source);
          return (
            <FormControlLabel
              key={source}
              value={source}
              disabled={disabled}
              sx={{ alignItems: "flex-start", mx: 0, mb: 0.5 }}
              control={
                <Radio
                  size="small"
                  sx={{ pt: 0.25 }}
                  slotProps={{ input: { "data-testid": `${idPrefix}-width-${source}` } as object }}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">{t(`analysis.arrows.sources.${source}`)}</Typography>
                  <Typography variant="caption" sx={captionSx}>
                    {t(disabled ? "analysis.arrows.unavailable" : `analysis.arrows.sourceHelp.${source}`)}
                  </Typography>
                </Box>
              }
            />
          );
        })}
      </RadioGroup>
      {drawnAsNone && (
        <Typography
          variant="caption"
          role="status"
          data-testid={`${idPrefix}-width-drawn-as-none`}
          sx={{ ...captionSx, color: "warning.main" }}
        >
          {t("analysis.arrows.drawnAsNone")}
        </Typography>
      )}
    </FormControl>
  );
}

export function ArrowPaletteField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: ArrowPaletteId;
  onChange: (next: ArrowPaletteId) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormControl component="fieldset" data-testid={`${idPrefix}-palette`}>
      <FormLabel component="legend" sx={{ typography: "body2", fontWeight: 600, mb: 0.5 }}>
        {t("analysis.arrows.palette")}
      </FormLabel>
      <RadioGroup value={value} onChange={(_event, next) => onChange(next as ArrowPaletteId)}>
        {ARROW_PALETTES.map((id) => {
          const colors = NEXT_MOVE_ARROW_PALETTES[id];
          return (
            <FormControlLabel
              key={id}
              value={id}
              sx={{ mx: 0 }}
              control={
                <Radio
                  size="small"
                  slotProps={{ input: { "data-testid": `${idPrefix}-palette-${id}` } as object }}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="body2">{t(`analysis.arrows.palettes.${id}`)}</Typography>
                  {/* Mainline, side line, hovered — the order the tab's help names them. */}
                  <Box aria-hidden="true" sx={{ display: "flex", gap: 0.5 }}>
                    {[colors.mainline, colors.sideline, colors.hovered].map((color) => (
                      <Box
                        key={color}
                        sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: color }}
                      />
                    ))}
                  </Box>
                </Box>
              }
            />
          );
        })}
      </RadioGroup>
      <Typography variant="caption" sx={captionSx}>
        {t("analysis.arrows.paletteHelp")}
      </Typography>
    </FormControl>
  );
}
