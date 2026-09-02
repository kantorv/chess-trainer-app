import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { useTranslation } from "react-i18next";
import type { EngineOption } from "../../../lib/engine";
import OptionSlider from "../../shared/OptionSlider";
import {
  ANALYSIS_UCI_OPTION,
  type AnalysisSettings as AnalysisSettingsValues,
} from "./useAnalysisBoard";

/**
 * The Engine tab: whether to analyse at all, how hard, how many lines, whether
 * to show the bar, and a way back to an empty board.
 *
 * Shorter than the Play with Engine tab on purpose. There is no opponent here,
 * so there is no colour to pick and no strength to set — an analysis board wants
 * the engine's best answer, and weakening it would only produce worse analysis.
 * What is left is the two `go` arguments, `MultiPV`, and the two switches.
 *
 * The two switches are **independent**, which is the point of having both: the
 * bar can stay up over a position nothing is analysing, and the engine can run
 * with the bar hidden.
 *
 * `MultiPV` is rendered through the shared `<OptionSlider>`, so it reports
 * itself as absent or pinned when the running build says so rather than
 * pretending to drive something.
 */

type AnalysisSettingsProps = {
  settings: AnalysisSettingsValues;
  onChange: (patch: Partial<AnalysisSettingsValues>) => void;
  /** What the running worker declared. Empty until the handshake lands. */
  engineOptions: ReadonlyMap<string, EngineOption>;
  engineOn: boolean;
  onEngineOnChange: (next: boolean) => void;
  showEvalBar: boolean;
  onShowEvalBarChange: (next: boolean) => void;
  onClear: () => void;
};

function AnalysisSettings({
  settings,
  onChange,
  engineOptions,
  engineOn,
  onEngineOnChange,
  showEvalBar,
  onShowEvalBarChange,
  onClear,
}: AnalysisSettingsProps) {
  const { t } = useTranslation();

  // Before the handshake there is nothing to judge a control against, so no
  // control is called unsupported.
  const handshakeLanded = engineOptions.size > 0;
  const optionFor = (name: string) =>
    handshakeLanded ? engineOptions.get(name) : { name, type: "spin" };

  return (
    <Box data-testid="analysis-settings" sx={{ display: "grid", gap: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={engineOn}
            data-testid="analysis-setting-engine"
            onChange={(event) => onEngineOnChange(event.target.checked)}
          />
        }
        label={t("analysis.settings.engineOn")}
      />

      {/* Depth and move time are `go` arguments, not options — always available,
          but pointless to offer while nothing is being searched. */}
      <Box
        data-testid="engine-setting-depth"
        sx={{ opacity: engineOn ? 1 : 0.6 }}
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
            {t("analysis.settings.depth")}
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
          disabled={!engineOn}
          aria-label={t("analysis.settings.depth")}
          value={settings.depth}
          min={1}
          // The wrapper clamps a search to 24 plies; offering more would be a
          // control that silently stops moving.
          max={24}
          step={1}
          onChange={(_event, next) => onChange({ depth: next as number })}
        />
      </Box>

      <Box
        data-testid="engine-setting-movetime"
        sx={{ opacity: engineOn ? 1 : 0.6 }}
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
            {t("analysis.settings.moveTime")}
          </Typography>
          <Typography
            component="span"
            dir="ltr"
            variant="body2"
            data-testid="engine-setting-movetime-value"
            sx={{ color: "text.secondary" }}
          >
            {settings.moveTimeMs === 0
              ? t("analysis.settings.moveTimeNone")
              : t("analysis.settings.moveTimeValue", {
                  seconds: (settings.moveTimeMs / 1000).toFixed(1),
                })}
          </Typography>
        </Box>
        <Slider
          size="small"
          disabled={!engineOn}
          aria-label={t("analysis.settings.moveTime")}
          value={settings.moveTimeMs}
          min={0}
          max={10000}
          step={250}
          onChange={(_event, next) => onChange({ moveTimeMs: next as number })}
        />
      </Box>

      <OptionSlider
        optionName={ANALYSIS_UCI_OPTION.multiPv}
        option={optionFor(ANALYSIS_UCI_OPTION.multiPv)}
        label={t("analysis.settings.multiPv")}
        value={settings.multiPv}
        fallbackMin={1}
        fallbackMax={5}
        onChange={(multiPv) => onChange({ multiPv })}
      />

      <FormControlLabel
        control={
          <Switch
            checked={showEvalBar}
            data-testid="analysis-setting-evalbar"
            onChange={(event) => onShowEvalBarChange(event.target.checked)}
          />
        }
        label={t("analysis.settings.evalBar")}
      />

      <Button
        variant="outlined"
        startIcon={<RestartAltRoundedIcon />}
        data-testid="analysis-clear"
        onClick={onClear}
      >
        {t("analysis.settings.clear")}
      </Button>
    </Box>
  );
}

export default AnalysisSettings;
