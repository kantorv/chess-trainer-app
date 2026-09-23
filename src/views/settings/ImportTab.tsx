import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useTranslation } from "react-i18next";

import { EXPORT_CATEGORIES } from "../../lib/dataExport";
import {
  importWritesOf,
  readImport,
  type ImportChoices,
  type ImportCurrent,
  type ImportDump,
  type ImportProblem,
} from "../../lib/dataImport";
import {
  applyImport,
  IMPORT_CAPS,
  loadImportCurrent,
  type ImportResult,
  type ImportResults,
} from "../../lib/dataImportTarget";
import { indexCollection } from "../library/indexCollection";
import { RightPanel } from "../main/rightPanel";
import ImportDialog from "./ImportDialog";
import IncompatibleImportDialog from "./IncompatibleImportDialog";

/**
 * **Import** (`/settings/import`, CTA-89) — an Export's zip back into the
 * app. Picking a file reads it (`lib/dataImport.ts`'s `readImport`) and the
 * stores (`loadImportCurrent`), and writes nothing: a zip that will not do
 * opens {@link IncompatibleImportDialog}, one that will opens
 * {@link ImportDialog} on its categories and clashes. Confirming re-reads the
 * stores, plans again against what they hold now, and writes
 * (`applyImport`) — an uploaded collection's games indexed first, with the
 * Library's worker — then says per category what came of it, in an `Alert`.
 * Nothing throws.
 */

type Status =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "choosing"; fileName: string; dump: ImportDump; current: ImportCurrent }
  | { kind: "incompatible"; fileName: string; problem: ImportProblem; pgnFiles: readonly string[] }
  | { kind: "working"; indexing?: { name: string; done: number; total: number } }
  | { kind: "done"; results: ImportResults };

/** One category's line of the report. */
const resultText = (t: (key: string, values?: Record<string, unknown>) => string, category: string, result: ImportResult) => {
  const values = { category: t(`settings.export.categories.${category}`) };
  switch (result.status) {
    case "done":
      return t("settings.import.result.done", { ...values, ...result.report });
    case "refused":
      return t(
        result.cap.kind === "records" ? "settings.import.result.refusedRecords" : "settings.import.result.refusedFolders",
        { ...values, ...result.cap },
      );
    case "failed":
      return t(
        result.failure === "too-many"
          ? "settings.import.result.tooMany"
          : result.failure === "indexing"
            ? "settings.import.result.indexing"
            : "settings.import.result.storage",
        values,
      );
  }
};

function ImportTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const onPicked = async (files: FileList | null) => {
    const file = files?.[0];
    // Cleared at once, so picking the same file again still fires a change.
    if (inputRef.current !== null) inputRef.current.value = "";
    if (file === undefined) return;
    setStatus({ kind: "reading" });
    const reading = readImport(new Uint8Array(await file.arrayBuffer()));
    if (!reading.ok) {
      setStatus({ kind: "incompatible", fileName: file.name, problem: reading.problem, pgnFiles: reading.pgnFiles });
      return;
    }
    setStatus({ kind: "choosing", fileName: file.name, dump: reading.dump, current: await loadImportCurrent() });
  };

  const run = async (dump: ImportDump, choices: ImportChoices) => {
    setStatus({ kind: "working" });
    // Planned again against the stores as they are now, not as the dialog opened on them.
    const writes = importWritesOf(dump, await loadImportCurrent(), choices, { caps: IMPORT_CAPS });
    const results = await applyImport(writes, {
      index: (games, name) =>
        indexCollection(games, (done, total) => setStatus({ kind: "working", indexing: { name, done, total } })),
    });
    setStatus({ kind: "done", results });
  };

  const busy = status.kind === "reading" || status.kind === "working";
  const reported = status.kind === "done" ? EXPORT_CATEGORIES.filter((category) => status.results[category]) : [];

  return (
    <>
      <Box data-testid="settings-import" sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("settings.import.intro")}
        </Typography>

        <Box>
          {/* A label wrapping a hidden input — the file dialog opens only from a
              real `<input type="file">`. */}
          <Button
            component="label"
            variant="contained"
            startIcon={<UploadFileRoundedIcon />}
            disabled={busy}
            data-testid="settings-import-choose"
          >
            {t("settings.import.choose")}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".zip,application/zip"
              data-testid="settings-import-input"
              onChange={(event) => void onPicked(event.target.files)}
            />
          </Button>
        </Box>

        {busy && (
          <Box data-testid="settings-import-working">
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {status.kind === "working" && status.indexing !== undefined
                ? t("settings.import.indexing", status.indexing)
                : t(status.kind === "reading" ? "settings.import.reading" : "settings.import.working")}
            </Typography>
            <LinearProgress
              variant={status.kind === "working" && status.indexing !== undefined ? "determinate" : "indeterminate"}
              value={
                status.kind === "working" && status.indexing !== undefined && status.indexing.total > 0
                  ? (100 * status.indexing.done) / status.indexing.total
                  : 0
              }
            />
          </Box>
        )}

        {status.kind === "done" && (
          <Alert
            severity={reported.every((category) => status.results[category]?.status === "done") ? "success" : "warning"}
            data-testid="settings-import-done"
          >
            {reported.map((category) => {
              const result = status.results[category];
              return (
                result !== undefined && (
                  <Box key={category} data-testid={`settings-import-result-${category}`}>
                    {resultText(t, category, result)}
                  </Box>
                )
              );
            })}
          </Alert>
        )}
      </Box>

      {status.kind === "choosing" && (
        <ImportDialog
          fileName={status.fileName}
          dump={status.dump}
          current={status.current}
          onCancel={() => setStatus({ kind: "idle" })}
          onImport={(choices) => void run(status.dump, choices)}
        />
      )}
      {status.kind === "incompatible" && (
        <IncompatibleImportDialog
          fileName={status.fileName}
          problem={status.problem}
          pgnFiles={status.pgnFiles}
          onClose={() => setStatus({ kind: "idle" })}
        />
      )}

      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("settings.import.panel")}
        </Typography>
      </RightPanel>
    </>
  );
}

export default ImportTab;
