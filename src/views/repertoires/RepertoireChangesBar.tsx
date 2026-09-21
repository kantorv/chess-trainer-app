import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * **What to do with a session's changes** (CTA-63) — the strip the player
 * shows above its footer while the session's tree differs from the record:
 * make them part of this repertoire, keep the repertoire as it is and save
 * a copy with them (and go on in the copy), or drop them.
 *
 * **A protected repertoire** (its settings; on by default) cannot be updated
 * from here: the strip says so, and in Update's place offers a link to its
 * settings, where protection is switched off — Save as copy (unprotected)
 * stays beside it. No dialog: the strip is where the choice already is.
 *
 * Presentational: the player decides what "changed" means (its tree is not
 * the one it opened, or last saved) and what each action does
 * (`withRepertoireTree` / `repertoireCopyOf`, `lib/savedRepertoires.ts`). The
 * summary is the player's too — today the moves added; a later edit (a line
 * deleted, a side line promoted) adds its own words, not a second strip.
 *
 * The Analysis Board (CTA-73) shows the same strip over its saved analysis:
 * `labelKey` names the locale block its words come from (the block carries
 * the same keys), and it never passes `protectedBy` — an analysis has no
 * protection.
 *
 * A Library game (CTA-75) shows it too: over an uploaded collection's game
 * as the Analysis Board does (`library.changes`), and over a **shipped**
 * one `readOnly` (`library.shippedChanges`) — no Update at all, a note saying
 * why, and Save as copy (into Saved analyses) and Discard.
 */
function RepertoireChangesBar({
  testId,
  labelKey = "repertoires.changes",
  summary,
  problem,
  protectedBy,
  readOnly = false,
  onUpdate,
  onCopy,
  onDiscard,
}: {
  testId: string;
  /** The locale block of the strip's words — `title`, `update`, `problem.*`, … */
  labelKey?: string;
  /** What changed, already worded — "2 moves added". */
  summary: string;
  /** Why the last save did not happen, if it did not — a key under `${labelKey}.problem`. */
  problem: string | null;
  /**
   * Set when the repertoire is protected: its settings screen, and where that
   * screen comes back to. Update is replaced by a link there.
   */
  protectedBy?: { settingsPath: string; from: string };
  /** Nothing to update: the note `${labelKey}.readOnly`, and only copy and discard. */
  readOnly?: boolean;
  onUpdate?: () => void;
  onCopy: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid={testId}
      role="region"
      aria-label={t(`${labelKey}.title`)}
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
        {t(`${labelKey}.title`)}
        <Typography
          component="span"
          variant="body2"
          data-testid={`${testId}-summary`}
          sx={{ color: "text.secondary", fontWeight: 400, marginInlineStart: 1 }}
        >
          {summary}
        </Typography>
      </Typography>
      {readOnly && (
        <Typography
          variant="caption"
          data-testid={`${testId}-read-only`}
          sx={{ display: "block", color: "text.secondary", mt: 0.25 }}
        >
          {t(`${labelKey}.readOnly`)}
        </Typography>
      )}
      {protectedBy !== undefined && (
        <Typography
          variant="caption"
          data-testid={`${testId}-protected`}
          sx={{ display: "block", color: "text.secondary", mt: 0.25 }}
        >
          {t(`${labelKey}.protected.note`)}
        </Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
        {readOnly ? null : protectedBy === undefined ? (
          <Tooltip title={t(`${labelKey}.updateHelp`)}>
            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={onUpdate}
              data-testid={`${testId}-update`}
            >
              {t(`${labelKey}.update`)}
            </Button>
          </Tooltip>
        ) : (
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={protectedBy.settingsPath}
            state={{ from: protectedBy.from }}
            data-testid={`${testId}-settings`}
          >
            {t(`${labelKey}.protected.settings`)}
          </Button>
        )}
        <Tooltip title={t(`${labelKey}.copyHelp`)}>
          <Button size="small" variant="outlined" onClick={onCopy} data-testid={`${testId}-copy`}>
            {t(`${labelKey}.copy`)}
          </Button>
        </Tooltip>
        <Button size="small" onClick={onDiscard} data-testid={`${testId}-discard`}>
          {t(`${labelKey}.discard`)}
        </Button>
      </Box>
      {problem !== null && (
        <Typography
          variant="caption"
          role="alert"
          data-testid={`${testId}-problem`}
          sx={{ display: "block", color: "error.main", mt: 0.5 }}
        >
          {t(`${labelKey}.problem.${problem}`)}
        </Typography>
      )}
    </Box>
  );
}

export default RepertoireChangesBar;
