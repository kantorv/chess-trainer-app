import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { useTranslation } from "react-i18next";
import type { EngineOption } from "../../../lib/engine";
import {
  approximateElo,
  SETTING_UCI_OPTION,
  type EngineSettings as EngineSettingsValues,
} from "./usePlayWithEngine";

/**
 * The Engine tab: strength, search limits, how many lines to report, the two
 * resource knobs, which colour the human plays, and a new game.
 *
 * ## Why every option-backed control is rendered from what the engine declared
 *
 * Which UCI options exist, and what they will accept, is a property of the
 * **binary** in `public/stockfish/` — not of the UCI spec. Asked `uci`, the build
 * shipped here answers with, among others:
 *
 * ```
 * option name Threads type spin default 1 min 1 max 1
 * option name Hash type spin default 16 min 16 max 16
 * option name MultiPV type spin default 1 min 1 max 500
 * option name Skill Level type spin default 20 min 0 max 20
 * ```
 *
 * So `Threads` and `Hash` are not missing — they are **pinned**: a single-threaded
 * WASM worker with a fixed table, exactly as CTA-12 suspected. A slider that slid
 * from 1 to 4 threads would move and change nothing, and the reader would draw
 * conclusions from it. That is the failure this component exists to avoid, and it
 * needs three states rather than two:
 *
 * | The engine says | The control |
 * | --- | --- |
 * | nothing (no such option) | disabled — "this build has no such option" |
 * | `min` equals `max` | disabled — "this build fixes it at N" |
 * | a real range | live, with *that* range as its bounds |
 *
 * All three are read from the running worker, so swapping the binary for a
 * multi-threaded build turns the Threads slider back on with no code change.
 * `Engine.setOption` refuses to post an unknown name in any case, so the UI and
 * the wire cannot disagree.
 *
 * Depth and move time are not options — they are arguments to `go` — so they are
 * always available and are not gated on anything.
 *
 * Strength is `Skill Level` alone. This build declares no `UCI_Elo` and no
 * `UCI_LimitStrength`, so the Elo figure beside the slider is labelled as an
 * estimate of what that skill level plays like, never as a setting: writing a
 * number the engine never received into a box marked "Elo" would be a fiction.
 */

type EngineSettingsProps = {
  settings: EngineSettingsValues;
  onChange: (patch: Partial<EngineSettingsValues>) => void;
  /** What the running worker declared. Empty until the handshake lands. */
  engineOptions: ReadonlyMap<string, EngineOption>;
  showEvalBar: boolean;
  onShowEvalBarChange: (next: boolean) => void;
  onNewGame: () => void;
};

/**
 * A slider whose range comes from the engine, disabled with a reason when this
 * build has no such option.
 */
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
}: {
  optionName: string;
  option: EngineOption | undefined;
  label: string;
  value: number;
  fallbackMin: number;
  fallbackMax: number;
  step?: number;
  onChange: (next: number) => void;
  valueLabel?: string;
}) {
  const { t } = useTranslation();
  /*
    Absent from a *populated* map means the engine really does not have it.
    An empty map only means the handshake has not landed yet, so the control
    stays live rather than flashing "unsupported" on every mount.
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
          {t("playEngine.settings.unsupported", { option: optionName })}
        </Typography>
      )}

      {!unsupported && fixedAt !== undefined && (
        <Typography
          variant="caption"
          data-testid={`${testId}-fixed`}
          sx={{ color: "warning.main", display: "block" }}
        >
          {t("playEngine.settings.fixed", {
            option: optionName,
            value: fixedAt,
          })}
        </Typography>
      )}
    </Box>
  );
}

function EngineSettings({
  settings,
  onChange,
  engineOptions,
  showEvalBar,
  onShowEvalBarChange,
  onNewGame,
}: EngineSettingsProps) {
  const { t } = useTranslation();

  // Before the handshake there is nothing to judge a control against, so no
  // control is called unsupported.
  const handshakeLanded = engineOptions.size > 0;
  const optionFor = (name: string) =>
    handshakeLanded ? engineOptions.get(name) : { name, type: "spin" };


  return (
    <Box data-testid="engine-settings" sx={{ display: "grid", gap: 2 }}>
      <OptionSlider
        optionName={SETTING_UCI_OPTION.skillLevel}
        option={optionFor(SETTING_UCI_OPTION.skillLevel)}
        label={t("playEngine.settings.strength")}
        value={settings.skillLevel}
        fallbackMin={0}
        fallbackMax={20}
        onChange={(skillLevel) => onChange({ skillLevel })}
        valueLabel={t("playEngine.settings.strengthValue", {
          level: settings.skillLevel,
          elo: approximateElo(settings.skillLevel),
        })}
      />

      {/* Depth and move time are `go` arguments, not options — always available. */}
      <Box data-testid="engine-setting-depth">
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("playEngine.settings.depth")}
          </Typography>
          <Typography
            component="span"
            dir="ltr"
            variant="body2"
            data-testid="engine-setting-depth-value"
            sx={{ color: "text.secondary" }}
          >
            {settings.depth}
          </Typography>
        </Box>
        <Slider
          size="small"
          aria-label={t("playEngine.settings.depth")}
          value={settings.depth}
          min={1}
          // The wrapper clamps a search to 24 plies; offering more would be a
          // control that silently stops moving.
          max={24}
          step={1}
          onChange={(_event, next) => onChange({ depth: next as number })}
        />
      </Box>

      <Box data-testid="engine-setting-movetime">
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("playEngine.settings.moveTime")}
          </Typography>
          <Typography
            component="span"
            dir="ltr"
            variant="body2"
            data-testid="engine-setting-movetime-value"
            sx={{ color: "text.secondary" }}
          >
            {settings.moveTimeMs === 0
              ? t("playEngine.settings.moveTimeNone")
              : t("playEngine.settings.moveTimeValue", {
                  seconds: (settings.moveTimeMs / 1000).toFixed(1),
                })}
          </Typography>
        </Box>
        <Slider
          size="small"
          aria-label={t("playEngine.settings.moveTime")}
          value={settings.moveTimeMs}
          min={0}
          max={10000}
          step={250}
          onChange={(_event, next) => onChange({ moveTimeMs: next as number })}
        />
      </Box>

      <OptionSlider
        optionName={SETTING_UCI_OPTION.multiPv}
        option={optionFor(SETTING_UCI_OPTION.multiPv)}
        label={t("playEngine.settings.multiPv")}
        value={settings.multiPv}
        fallbackMin={1}
        fallbackMax={5}
        onChange={(multiPv) => onChange({ multiPv })}
      />

      <OptionSlider
        optionName={SETTING_UCI_OPTION.threads}
        option={optionFor(SETTING_UCI_OPTION.threads)}
        label={t("playEngine.settings.threads")}
        value={settings.threads}
        fallbackMin={1}
        fallbackMax={4}
        onChange={(threads) => onChange({ threads })}
      />

      <OptionSlider
        optionName={SETTING_UCI_OPTION.hashMb}
        option={optionFor(SETTING_UCI_OPTION.hashMb)}
        label={t("playEngine.settings.hash")}
        value={settings.hashMb}
        fallbackMin={1}
        fallbackMax={256}
        step={1}
        onChange={(hashMb) => onChange({ hashMb })}
      />

      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {t("playEngine.settings.playAs")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          fullWidth
          value={settings.playAs}
          data-testid="engine-setting-playas"
          onChange={(_event, next: "white" | "black" | null) => {
            // A group can deselect its active button; keep a colour selected.
            if (next) onChange({ playAs: next });
          }}
        >
          <ToggleButton value="white" data-testid="engine-setting-playas-white">
            {t("playEngine.settings.white")}
          </ToggleButton>
          <ToggleButton value="black" data-testid="engine-setting-playas-black">
            {t("playEngine.settings.black")}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <FormControlLabel
        control={
          <Switch
            checked={showEvalBar}
            data-testid="engine-setting-evalbar"
            onChange={(event) => onShowEvalBarChange(event.target.checked)}
          />
        }
        label={t("playEngine.settings.evalBar")}
      />

      <Button
        variant="outlined"
        startIcon={<RestartAltRoundedIcon />}
        data-testid="engine-new-game"
        onClick={onNewGame}
      >
        {t("playEngine.settings.newGame")}
      </Button>
    </Box>
  );
}

export default EngineSettings;
