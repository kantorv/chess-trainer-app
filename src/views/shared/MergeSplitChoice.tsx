import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CallMergeRoundedIcon from "@mui/icons-material/CallMergeRounded";
import CallSplitRoundedIcon from "@mui/icons-material/CallSplitRounded";
import { useTranslation } from "react-i18next";

/**
 * **The choice a text of many games makes** — merge them into one tree, or
 * split them into one record each. Presentational: the caller says what each
 * does (the Repertoires section writes repertoires, CTA-61; the Analysis
 * Board loads a merge onto its board and saves a split, CTA-73), and this
 * only lays the choice out — the count, the skipped games, a Merge that says
 * why it is off when the games do not share a start, a Split that says how
 * many it makes, and the caller's problem, already worded.
 *
 * `labelKey` names the locale block (`title`, `explain`, `skipped`, `merge`,
 * `mergeHelp`, `mergeUnavailable`, `split`, `splitHelp`) and `testIdPrefix`
 * the ids, because each section's tests are the contract on its words — the
 * saved-list machinery's rule.
 */
function MergeSplitChoice({
  labelKey,
  testIdPrefix,
  count,
  skipped,
  mergeable,
  onMerge,
  onSplit,
  problem,
}: {
  labelKey: string;
  testIdPrefix: string;
  /** How many playable games the text holds. */
  count: number;
  /** How many were left out — no moves, or unreadable. */
  skipped: number;
  /** Whether the games share a start position, so one tree can hold them. */
  mergeable: boolean;
  onMerge: () => void;
  onSplit: () => void;
  /** What went wrong with the last choice, already worded; `null` for nothing. */
  problem: string | null;
}) {
  const { t } = useTranslation();

  return (
    <Box
      data-testid={testIdPrefix}
      sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t(`${labelKey}.title`, { count })}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t(`${labelKey}.explain`)}
        </Typography>
        {skipped > 0 && (
          <Typography
            variant="caption"
            data-testid={`${testIdPrefix}-skipped`}
            sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
          >
            {t(`${labelKey}.skipped`, { count: skipped })}
          </Typography>
        )}
      </Box>

      <Box>
        <Button
          variant="contained"
          startIcon={<CallMergeRoundedIcon />}
          disabled={!mergeable}
          onClick={onMerge}
          data-testid={`${testIdPrefix}-merge`}
        >
          {t(`${labelKey}.merge`)}
        </Button>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
        >
          {t(mergeable ? `${labelKey}.mergeHelp` : `${labelKey}.mergeUnavailable`)}
        </Typography>
      </Box>

      <Box>
        <Button
          variant="outlined"
          startIcon={<CallSplitRoundedIcon />}
          onClick={onSplit}
          data-testid={`${testIdPrefix}-split`}
        >
          {t(`${labelKey}.split`, { count })}
        </Button>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
        >
          {t(`${labelKey}.splitHelp`)}
        </Typography>
      </Box>

      {problem !== null && (
        <Alert severity="error" data-testid={`${testIdPrefix}-problem`}>
          {problem}
        </Alert>
      )}
    </Box>
  );
}

export default MergeSplitChoice;
