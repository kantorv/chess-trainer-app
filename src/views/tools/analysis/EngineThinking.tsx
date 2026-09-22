import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

/** How often the dots move on — often enough to read as alive. */
export const THINKING_DOTS_MS = 400;

/**
 * **Play's status line** (CTA-73) — what the Analysis Board says while Play
 * is on, so a long search does not look like nothing happened: a spinner,
 * "Engine is thinking" with dots that move on every {@link THINKING_DOTS_MS},
 * and the depth the search has reached so far; at the reader's turn, that it
 * is theirs.
 *
 * The dots are a timer of this component's own, cleared on unmount and
 * whenever thinking stops, so nothing ticks while Play is off.
 */
function EngineThinking({
  thinking,
  depth,
  testId = "analysis-play",
}: {
  /** The root of its test ids — `${testId}-status`, `${testId}-depth`. */
  testId?: string;
  /** Whether the engine is searching for its move. */
  thinking: boolean;
  /** The depth reached so far in this search; 0 before the first result. */
  depth: number;
}) {
  const { t } = useTranslation();
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setDots((count) => (count % 3) + 1), THINKING_DOTS_MS);
    return () => clearInterval(timer);
  }, [thinking]);

  return (
    <Box
      role="status"
      aria-live="polite"
      data-testid={`${testId}-status`}
      data-status={thinking ? "thinking" : "your-move"}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.5,
        color: thinking ? "primary.main" : "text.secondary",
      }}
    >
      {thinking && <CircularProgress size={14} thickness={5} />}
      <Typography variant="body2" sx={{ fontWeight: thinking ? 600 : 400 }}>
        {thinking ? t("analysis.play.thinking") : t("analysis.play.yourMove")}
        {thinking && (
          // A fixed-width slot, so the line does not jiggle as the dots move.
          <Box component="span" aria-hidden sx={{ display: "inline-block", width: "1.5em" }}>
            {".".repeat(dots)}
          </Box>
        )}
      </Typography>
      {thinking && depth > 0 && (
        <Typography
          variant="caption"
          data-testid={`${testId}-depth`}
          sx={{ color: "text.secondary", marginInlineStart: "auto" }}
        >
          {t("analysis.play.depth", { depth })}
        </Typography>
      )}
    </Box>
  );
}

export default EngineThinking;
