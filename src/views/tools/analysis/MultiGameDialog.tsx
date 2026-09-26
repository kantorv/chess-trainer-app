import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import CallMergeRoundedIcon from "@mui/icons-material/CallMergeRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import { useTranslation } from "react-i18next";

import { addCollection } from "../../../lib/libraryCollectionStore";
import { collectionNameOfStem, readCollectionText } from "../../../lib/libraryCollections";
import { indexCollection } from "../../library/indexCollection";
import type { MultiGameChoice } from "./useAnalysisLoad";

/** What went wrong keeping the collection — `analysis.load.popup.problem.*`. */
type CollectionProblem = "unreadable" | "index" | "storage";

/**
 * **The popup a PGN of several games opens in the Analysis module** (CTA-101)
 * — the Analysis Board's Load tab and the analyses Lobby's form. Two choices,
 * and Cancel:
 *
 * - **Merge games** — `onMerge`: one tree onto the board, unsaved, with
 *   `[%games N]` at every branch (`mergeTrees`' counting). Off, saying why,
 *   while the games do not share a start position.
 * - **Save as games collection** — always offered. The popup keeps the text as
 *   a new Library collection itself, the way `/library/new` does: the same
 *   reading (`readCollectionText`), the same index pass (`indexCollection`,
 *   in a worker, a progress bar), then `addCollection` at the Library's top
 *   level, named by the same rule — the `Event` every game shares, else the
 *   file name's words, else "Pasted collection". `onSaved` takes the reader to
 *   its table.
 *
 * Cancel, Escape, the backdrop or the popup going away stop the index pass and
 * write nothing. The one moment nothing can be stopped is the write itself,
 * so the popup does not close while it runs. A failed pass or write is said in
 * the popup.
 */
function MultiGameDialog({
  testIdPrefix,
  choice,
  onMerge,
  onClose,
  onSaved,
}: {
  /** The root of every test id — each host keeps its own. */
  testIdPrefix: string;
  choice: MultiGameChoice;
  onMerge: () => void;
  /** Cancelled: the index pass, if any, is already stopped. */
  onClose: () => void;
  /** The new collection's id. */
  onSaved: (collectionId: string) => void;
}) {
  const { t } = useTranslation();
  const { reading } = choice;
  const count = reading.games.length;
  /** The index pass under way: how far it has got. */
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<CollectionProblem | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = indexing !== null || writing;

  // The popup going away stops the pass.
  useEffect(() => () => abortRef.current?.abort(), []);

  const saveCollection = async () => {
    const collection = readCollectionText(choice.text);
    if (!collection.ok) {
      setProblem("unreadable");
      return;
    }
    const name =
      collection.name ??
      (choice.fileStem === undefined
        ? t("library.upload.pastedName")
        : collectionNameOfStem(choice.fileStem));

    const controller = new AbortController();
    abortRef.current = controller;
    setProblem(null);
    setIndexing({ done: 0, total: collection.games.length });
    let rows;
    try {
      rows = await indexCollection(
        collection.games,
        (done, total) => setIndexing({ done, total }),
        controller.signal,
      );
    } catch {
      // Cancelled: the popup is already gone. Anything else failed.
      if (!controller.signal.aborted) {
        setIndexing(null);
        setProblem("index");
      }
      return;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
    if (controller.signal.aborted) return;

    setWriting(true);
    const added = await addCollection(name, collection.games, rows);
    setWriting(false);
    setIndexing(null);
    if ("problem" in added) {
      setProblem("storage");
      return;
    }
    onSaved(added.collection.id);
  };

  const cancel = () => {
    if (writing) return;
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  };

  return (
    <Dialog open onClose={cancel} maxWidth="xs" fullWidth data-testid={testIdPrefix}>
      <DialogTitle>{t("analysis.load.popup.title", { count })}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("analysis.load.popup.explain")}
          </Typography>
          {reading.skipped > 0 && (
            <Typography
              variant="caption"
              data-testid={`${testIdPrefix}-skipped`}
              sx={{ display: "block", color: "text.secondary", mt: 0.5 }}
            >
              {t("analysis.load.popup.skipped", { count: reading.skipped })}
            </Typography>
          )}
        </Box>

        <Box>
          <Button
            variant="contained"
            startIcon={<CallMergeRoundedIcon />}
            disabled={!reading.mergeable || busy}
            onClick={onMerge}
            data-testid={`${testIdPrefix}-merge`}
          >
            {t("analysis.load.popup.merge")}
          </Button>
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
            {t(
              reading.mergeable
                ? "analysis.load.popup.mergeHelp"
                : "analysis.load.popup.mergeUnavailable",
            )}
          </Typography>
        </Box>

        <Box>
          <Button
            variant="outlined"
            startIcon={<LibraryBooksRoundedIcon />}
            disabled={busy}
            onClick={() => void saveCollection()}
            data-testid={`${testIdPrefix}-collection`}
          >
            {t("analysis.load.popup.collection")}
          </Button>
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
            {t("analysis.load.popup.collectionHelp")}
          </Typography>
        </Box>

        {indexing !== null && (
          <Box data-testid={`${testIdPrefix}-indexing`} sx={{ display: "grid", gap: 1 }}>
            <Typography variant="body2" data-testid={`${testIdPrefix}-progress`}>
              {t("analysis.load.popup.indexing", { done: indexing.done, total: indexing.total })}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={indexing.total === 0 ? 0 : (100 * indexing.done) / indexing.total}
            />
          </Box>
        )}

        {problem !== null && (
          <Alert severity="error" data-testid={`${testIdPrefix}-problem`}>
            {t(`analysis.load.popup.problem.${problem}`)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} disabled={writing} data-testid={`${testIdPrefix}-cancel`}>
          {t("analysis.load.popup.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default MultiGameDialog;
