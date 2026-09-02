import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { EngineOption } from "../../lib/engine";

/**
 * A slider for one UCI option, rendered from **what the running engine
 * declared** rather than from a list written here.
 *
 * Which options exist, and what they will accept, is a property of the binary in
 * `public/stockfish/` — not of the UCI spec. Asked `uci`, the build shipped here
 * answers with, among others:
 *
 * ```
 * option name Threads type spin default 1 min 1 max 1
 * option name Hash type spin default 16 min 16 max 16
 * option name MultiPV type spin default 1 min 1 max 500
 * option name Skill Level type spin default 20 min 0 max 20
 * ```
 *
 * So `Threads` and `Hash` are not missing — they are **pinned**. A slider that
 * slid from 1 to 4 threads would move and change nothing, and the reader would
 * draw conclusions from it. That is the failure this component exists to avoid,
 * and it needs three states rather than two:
 *
 * | The engine says | The control |
 * | --- | --- |
 * | nothing (no such option) | disabled — "this build has no such option" |
 * | `min` equals `max` | disabled — "this build fixes it at N" |
 * | a real range | live, with *that* range as its bounds |
 *
 * Swapping the binary for a multi-threaded build therefore turns the Threads
 * slider back on with no code change. Both engine screens render their
 * option-backed controls through this one component, which is why it sits in
 * `shared/` — `EngineSettings` (Play with Engine) and `AnalysisSettings` (the
 * Analysis Board) differ in *which* options they show, never in how one is
 * judged.
 */

export type OptionSliderProps = {
  /** The UCI name, e.g. `"Skill Level"` — also what the two notices name. */
  optionName: string;
  /** What the engine declared for it, or `undefined` when it declared nothing. */
  option: EngineOption | undefined;
  label: string;
  value: number;
  /** Bounds to use before the handshake lands and the engine's own arrive. */
  fallbackMin: number;
  fallbackMax: number;
  step?: number;
  onChange: (next: number) => void;
  /** Overrides the plain number shown beside the label. */
  valueLabel?: string;
};

function OptionSlider({
  optionName,
  option,
  label,
  value,
  fallbackMin,
  fallbackMax,
  step = 1,
  onChange,
  valueLabel,
}: OptionSliderProps) {
  const { t } = useTranslation();
  /*
    Absent from a *populated* map means the engine really does not have it.
    An empty map only means the handshake has not landed yet, so the caller
    passes a placeholder and the control stays live rather than flashing
    "unsupported" on every mount.
  */
  const unsupported = option === undefined;
  /*
    Declared, but with nothing to choose: `min` and `max` are the same number, so
    the engine accepts exactly one value. Disabled like an absent option, but for
    a different reason and with a different thing to say.
  */
  const fixedAt =
    option?.min !== undefined && option.min === option.max
      ? option.min
      : undefined;

  const testId = `engine-setting-${optionName.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Box
      data-testid={testId}
      sx={{ opacity: unsupported || fixedAt !== undefined ? 0.6 : 1 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography
          component="span"
          dir="ltr"
          variant="body2"
          data-testid={`${testId}-value`}
          sx={{ color: "text.secondary" }}
        >
          {valueLabel ?? value}
        </Typography>
      </Box>

      <Slider
        size="small"
        disabled={unsupported || fixedAt !== undefined}
        aria-label={label}
        value={value}
        // The engine's own bounds when it gave them; the fallback is only ever
        // used before the handshake lands.
        min={option?.min ?? fallbackMin}
        max={option?.max ?? fallbackMax}
        step={step}
        onChange={(_event, next) => onChange(next as number)}
      />

      {unsupported && (
        <Typography
          variant="caption"
          data-testid={`${testId}-unsupported`}
          sx={{ color: "warning.main", display: "block" }}
        >
          {t("engineOption.unsupported", { option: optionName })}
        </Typography>
      )}

      {!unsupported && fixedAt !== undefined && (
        <Typography
          variant="caption"
          data-testid={`${testId}-fixed`}
          sx={{ color: "warning.main", display: "block" }}
        >
          {t("engineOption.fixed", { option: optionName, value: fixedAt })}
        </Typography>
      )}
    </Box>
  );
}

export default OptionSlider;
