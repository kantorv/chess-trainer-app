import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { SavedRepertoireProblem } from "../../lib/savedRepertoireStore";

/**
 * **What to do with a session's changes** (CTA-63) — the strip the player
 * shows above its footer while the session's tree differs from the record:
 * make them part of this repertoire, keep the repertoire as it is and save
 * a copy with them (and go on in the copy), or drop them.
 *
 * Presentational: the player decides what "changed" means (its tree is not
 * the one it opened, or last saved) and what each action does
 * (`withRepertoireTree` / `repertoireCopyOf`, `lib/savedRepertoires.ts`). The
 * summary is the player's too — today the moves added; a later edit (a line
 * deleted, a side line promoted) adds its own words, not a second strip.
 */
function RepertoireChangesBar({
  testId,
  summary,
  problem,
  onUpdate,
  onCopy,
  onDiscard,
}: {
  testId: string;
  /** What changed, already worded — "2 moves added". */
  summary: string;
  /** Why the last save did not happen, if it did not. */
  problem: SavedRepertoireProblem | null;
  onUpdate: () => void;
  onCopy: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid={testId}
      role="region"
      aria-label={t("repertoires.changes.title")}
      sx={{
        mb: 1,
        px: 1,
        py: 0.75,
        border: "1px solid",
        borderColor: "success.main",
        borderRadius: 1,
        bgcolor: "background.paper",
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t("repertoires.changes.title")}
        <Typography
          component="span"
          variant="body2"
          data-testid={`${testId}-summary`}
          sx={{ color: "text.secondary", fontWeight: 400, marginInlineStart: 1 }}
        >
          {summary}
        </Typography>
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
        <Tooltip title={t("repertoires.changes.updateHelp")}>
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={onUpdate}
            data-testid={`${testId}-update`}
          >
            {t("repertoires.changes.update")}
          </Button>
        </Tooltip>
        <Tooltip title={t("repertoires.changes.copyHelp")}>
          <Button size="small" variant="outlined" onClick={onCopy} data-testid={`${testId}-copy`}>
            {t("repertoires.changes.copy")}
          </Button>
        </Tooltip>
        <Button size="small" onClick={onDiscard} data-testid={`${testId}-discard`}>
          {t("repertoires.changes.discard")}
        </Button>
      </Box>
      {problem !== null && (
        <Typography
          variant="caption"
          role="alert"
          data-testid={`${testId}-problem`}
          sx={{ display: "block", color: "error.main", mt: 0.5 }}
        >
          {t(`repertoires.changes.problem.${problem}`)}
        </Typography>
      )}
    </Box>
  );
}

export default RepertoireChangesBar;
