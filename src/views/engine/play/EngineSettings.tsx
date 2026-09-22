import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { EngineOption } from "../../../lib/engine";
import OptionSlider from "../../shared/OptionSlider";
import {
  approximateElo,
  ENGINE_SETTING_BOUNDS,
  SETTING_UCI_OPTION,
  type EngineSettings as EngineSettingsValues,
} from "../../../lib/engineSettings";

/**
 * The Engine tab: strength, search limits, how many lines to report, the two
 * resource knobs and the eval bar. (Which colour the reader plays, and a new
 * game, are the header's — the side toggle and Replay — on both screens that
 * render this tab, Play with Engine and Masked Pieces.) The Lobby's new-game
 * form (`views/engine/games/NewGameForm.tsx`, CTA-82) renders it too, over an
 * engine that is handshaken but never searches.
 *
 * Every option-backed control is a `<OptionSlider>` (`views/shared/`), which
 * renders it from what the running worker declared — present, pinned, or absent.
 * That rule and the reasons for it live with the component; this tab only
 * decides *which* options a player of a game wants to see.
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
};

function EngineSettings({
  settings,
  onChange,
  engineOptions,
  showEvalBar,
  onShowEvalBarChange,
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
        fallbackMin={ENGINE_SETTING_BOUNDS.skillLevel.min}
        fallbackMax={ENGINE_SETTING_BOUNDS.skillLevel.max}
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
          min={ENGINE_SETTING_BOUNDS.depth.min}
          // The wrapper clamps a search to 24 plies; offering more would be a
          // control that silently stops moving.
          max={ENGINE_SETTING_BOUNDS.depth.max}
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
          min={ENGINE_SETTING_BOUNDS.moveTimeMs.min}
          max={ENGINE_SETTING_BOUNDS.moveTimeMs.max}
          step={250}
          onChange={(_event, next) => onChange({ moveTimeMs: next as number })}
        />
      </Box>

      <OptionSlider
        optionName={SETTING_UCI_OPTION.multiPv}
        option={optionFor(SETTING_UCI_OPTION.multiPv)}
        label={t("playEngine.settings.multiPv")}
        value={settings.multiPv}
        fallbackMin={ENGINE_SETTING_BOUNDS.multiPv.min}
        fallbackMax={ENGINE_SETTING_BOUNDS.multiPv.max}
        maxOffered={ENGINE_SETTING_BOUNDS.multiPv.max}
        onChange={(multiPv) => onChange({ multiPv })}
      />

      <OptionSlider
        optionName={SETTING_UCI_OPTION.threads}
        option={optionFor(SETTING_UCI_OPTION.threads)}
        label={t("playEngine.settings.threads")}
        value={settings.threads}
        fallbackMin={ENGINE_SETTING_BOUNDS.threads.min}
        fallbackMax={ENGINE_SETTING_BOUNDS.threads.max}
        onChange={(threads) => onChange({ threads })}
      />

      <OptionSlider
        optionName={SETTING_UCI_OPTION.hashMb}
        option={optionFor(SETTING_UCI_OPTION.hashMb)}
        label={t("playEngine.settings.hash")}
        value={settings.hashMb}
        fallbackMin={ENGINE_SETTING_BOUNDS.hashMb.min}
        fallbackMax={ENGINE_SETTING_BOUNDS.hashMb.max}
        step={1}
        onChange={(hashMb) => onChange({ hashMb })}
      />

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

    </Box>
  );
}

export default EngineSettings;
