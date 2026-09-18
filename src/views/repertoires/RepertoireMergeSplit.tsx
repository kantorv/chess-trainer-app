import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CallMergeRoundedIcon from "@mui/icons-material/CallMergeRounded";
import CallSplitRoundedIcon from "@mui/icons-material/CallSplitRounded";
import { useTranslation } from "react-i18next";

import type { RepertoireSettings } from "../../lib/repertoireSettings";
import {
  mergedRepertoireOf,
  newSavedRepertoireId,
  splitRepertoiresOf,
  type RepertoireReading,
} from "../../lib/savedRepertoires";
import {
  addRepertoires,
  MAX_SAVED_REPERTOIRES,
  type SavedRepertoireProblem,
} from "../../lib/savedRepertoireStore";

/**
 * **The choice a text of many games has to make** — merge them into one
 * repertoire, or split them into one each (CTA-61; the rule is in
 * `lib/savedRepertoires.ts`, "A repertoire is one game").
 *
 * Shown in two places, which is why it is its own component: the upload
 * screen, when what was picked or pasted holds several games, and a
 * repertoire's own route, when the record was saved before the rule and
 * still holds several — then `replacing` is its id, and what the reader picks
 * takes its place in the list (a merge keeps the id, so the URL goes on
 * working), carrying its `settings` over.
 *
 * Merge is offered only when the games share a start position; otherwise the
 * button says why it is off. Split says how many repertoires it makes. Both
 * write through `addRepertoires`, all or nothing.
 */
type RepertoireMergeSplitProps = {
  reading: Extract<RepertoireReading, { ok: true }>;
  /** The name the reader typed, if any — else the text's own. */
  typedName: string;
  /** A stored record this replaces — one from before the one-game rule. */
  replacing?: string;
  /** Settings to keep on what is made — a replaced record's own. */
  settings?: RepertoireSettings;
  /** Called with where to go: the merged repertoire's board, or the list. */
  onDone: (path: string) => void;
};

function RepertoireMergeSplit({
  reading,
  typedName,
  replacing,
  settings,
  onDone,
}: RepertoireMergeSplitProps) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<SavedRepertoireProblem | null>(null);
  const count = reading.games.length;

  const withSettings = <T extends { settings: RepertoireSettings }>(record: T): T =>
    settings === undefined ? record : { ...record, settings };

  const merge = () => {
    const record = mergedRepertoireOf(replacing ?? newSavedRepertoireId(), reading, typedName);
    if (record === undefined) return;
    const failed = addRepertoires([withSettings(record)], replacing);
    if (failed !== undefined) return setProblem(failed);
    onDone(`/repertoires/${encodeURIComponent(record.id)}`);
  };

  const split = () => {
    const records = splitRepertoiresOf(newSavedRepertoireId, reading, typedName).map(
      withSettings,
    );
    const failed = addRepertoires(records, replacing);
    if (failed !== undefined) return setProblem(failed);
    onDone("/repertoires");
  };

  return (
    <Box
      data-testid="repertoire-choice"
      sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("repertoires.choice.title", { count })}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("repertoires.choice.explain")}
        </Typography>
        {reading.skipped > 0 && (
          <Typography
            variant="caption"
            data-testid="repertoire-choice-skipped"
            sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
          >
            {t("repertoires.choice.skipped", { count: reading.skipped })}
          </Typography>
        )}
      </Box>

      <Box>
        <Button
          variant="contained"
          startIcon={<CallMergeRoundedIcon />}
          disabled={!reading.mergeable}
          onClick={merge}
          data-testid="repertoire-choice-merge"
        >
          {t("repertoires.choice.merge")}
        </Button>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
        >
          {t(
            reading.mergeable
              ? "repertoires.choice.mergeHelp"
              : "repertoires.choice.mergeUnavailable",
          )}
        </Typography>
      </Box>

      <Box>
        <Button
          variant="outlined"
          startIcon={<CallSplitRoundedIcon />}
          onClick={split}
          data-testid="repertoire-choice-split"
        >
          {t("repertoires.choice.split", { count })}
        </Button>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
        >
          {t("repertoires.choice.splitHelp")}
        </Typography>
      </Box>

      {problem !== null && (
        <Alert severity="error" data-testid="repertoire-choice-problem">
          {problem === "too-many"
            ? t("repertoires.choice.tooMany", { max: MAX_SAVED_REPERTOIRES })
            : t("repertoires.upload.problem.storage")}
        </Alert>
      )}
    </Box>
  );
}

export default RepertoireMergeSplit;
