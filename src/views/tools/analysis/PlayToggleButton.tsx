import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { useTranslation } from "react-i18next";

/**
 * **The header's Play / Pause** (CTA-73; shared since CTA-74) — the button
 * over `usePlayToggle`: the engine plays the other side's best move each turn,
 * until paused or a step back. Disabled while the engine is off, pressed and
 * primary while on, with a ring round it while the engine thinks. The Analysis
 * Board and Play with Engine both render it, each under its own test ids
 * (`${testId}`, `${testId}-spinner`).
 */
function PlayToggleButton({
  testId,
  engineOn,
  playing,
  thinking,
  onToggle,
}: {
  testId: string;
  engineOn: boolean;
  playing: boolean;
  thinking: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip
      title={t(
        !engineOn ? "analysis.play.engineOff" : playing ? "analysis.play.pause" : "analysis.play.start",
      )}
    >
      <span>
        <IconButton
          size="small"
          disabled={!engineOn}
          color={playing ? "primary" : "default"}
          onClick={onToggle}
          aria-label={t(playing ? "analysis.play.pause" : "analysis.play.start")}
          aria-pressed={playing}
          data-testid={testId}
          sx={{ flexShrink: 0, position: "relative" }}
        >
          {/* A ring round the button while the engine thinks. */}
          {thinking && (
            <CircularProgress
              size={30}
              thickness={3}
              data-testid={`${testId}-spinner`}
              sx={{ position: "absolute", pointerEvents: "none" }}
            />
          )}
          {playing ? <PauseRoundedIcon fontSize="small" /> : <PlayArrowRoundedIcon fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default PlayToggleButton;
