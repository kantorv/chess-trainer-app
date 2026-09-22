import { useState, useSyncExternalStore } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Typography from "@mui/material/Typography";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { useTranslation } from "react-i18next";

import {
  EXPORT_CATEGORIES,
  hasExportSelection,
  type ExportCategory,
  type ExportSelection,
} from "../../lib/dataExport";
import { exportZip, ExportReadError } from "../../lib/dataExportSource";
import {
  subscribeUploadedCollections,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
import { downloadBinaryFile } from "../../lib/pgnExport";
import { playedGamesSnapshot, subscribePlayedGames } from "../../lib/playedGameStore";
import { savedAnalysesSnapshot, subscribeSavedAnalyses } from "../../lib/savedAnalysisStore";
import {
  savedRepertoiresSnapshot,
  subscribeSavedRepertoires,
} from "../../lib/savedRepertoireStore";
import { shippedCollections } from "../../lib/shippedCollections";
import { RightPanel } from "../main/rightPanel";

/**
 * **Export** (`/settings/export`, CTA-86) — the reader's data out, as one zip
 * of PGN files and a `manifest.json` (`lib/dataExport.ts` says what is where).
 *
 * Four categories, each all or nothing, with how many items each holds;
 * Collections has one more box, for the shipped collections — the reader's
 * uploads always go with it, the shipped ones only when that is ticked too.
 * The counts are the stores' snapshots (a subscription starts each read);
 * the export itself reads each store it needs again (`loadExportSource`), so
 * it never builds from a store still loading.
 *
 * Reads only. A failure — a collection that cannot be read, a browser that
 * refuses the download — is said here, never thrown.
 */

const INITIAL: ExportSelection = {
  collections: false,
  games: false,
  analyses: false,
  repertoires: false,
  shippedCollections: false,
};

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; fileName: string }
  | { kind: "failed"; collection?: string };

const useCount = (
  subscribe: (listener: () => void) => () => void,
  snapshot: () => readonly unknown[] | undefined,
): number | undefined => useSyncExternalStore(subscribe, () => snapshot()?.length);

function ExportTab() {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ExportSelection>(INITIAL);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const uploaded = useCount(subscribeUploadedCollections, uploadedCollectionsSnapshot);
  const counts: Record<ExportCategory, number | undefined> = {
    collections:
      uploaded === undefined
        ? undefined
        : uploaded + (selection.shippedCollections ? shippedCollections.length : 0),
    games: useCount(subscribePlayedGames, playedGamesSnapshot),
    analyses: useCount(subscribeSavedAnalyses, savedAnalysesSnapshot),
    repertoires: useCount(subscribeSavedRepertoires, savedRepertoiresSnapshot),
  };

  const tick = (key: keyof ExportSelection) => (_event: unknown, checked: boolean) => {
    setSelection((current) => ({ ...current, [key]: checked }));
    setStatus({ kind: "idle" });
  };

  const run = async () => {
    setStatus({ kind: "working" });
    try {
      const { fileName, bytes } = await exportZip(selection, { appVersion: __APP_VERSION__ });
      setStatus(
        downloadBinaryFile(fileName, bytes, "application/zip")
          ? { kind: "done", fileName }
          : { kind: "failed" },
      );
    } catch (error) {
      setStatus({
        kind: "failed",
        collection: error instanceof ExportReadError ? error.collection : undefined,
      });
    }
  };

  const working = status.kind === "working";

  return (
    <>
      <Box data-testid="settings-export" sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("settings.export.intro")}
        </Typography>

        <FormGroup>
          {EXPORT_CATEGORIES.map((category) => (
            <Box key={category}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selection[category]}
                    onChange={tick(category)}
                    disabled={working}
                    data-testid={`settings-export-${category}`}
                  />
                }
                label={
                  <>
                    {t(`settings.export.categories.${category}`)}{" "}
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                      data-testid={`settings-export-${category}-count`}
                    >
                      ({counts[category] ?? "…"})
                    </Typography>
                  </>
                }
              />
              {category === "collections" && (
                <FormControlLabel
                  sx={{ display: "flex", paddingInlineStart: 4 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={selection.shippedCollections}
                      onChange={tick("shippedCollections")}
                      disabled={working || !selection.collections}
                      data-testid="settings-export-shipped"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {t("settings.export.includeShipped", { count: shippedCollections.length })}
                    </Typography>
                  }
                />
              )}
            </Box>
          ))}
        </FormGroup>

        <Box>
          <Button
            variant="contained"
            startIcon={<DownloadRoundedIcon />}
            disabled={!hasExportSelection(selection) || working}
            onClick={() => void run()}
            data-testid="settings-export-run"
          >
            {t(working ? "settings.export.working" : "settings.export.run")}
          </Button>
        </Box>

        {status.kind === "done" && (
          <Alert severity="success" data-testid="settings-export-done">
            {t("settings.export.done", { fileName: status.fileName })}
          </Alert>
        )}
        {status.kind === "failed" && (
          <Alert severity="error" data-testid="settings-export-failed">
            {status.collection === undefined
              ? t("settings.export.failed")
              : t("settings.export.unreadable", { name: status.collection })}
          </Alert>
        )}
      </Box>

      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("settings.export.panel")}
        </Typography>
      </RightPanel>
    </>
  );
}

export default ExportTab;
