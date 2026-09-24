import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import {
  subscribeUploadedCollections,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
import { libraryFoldersSnapshot, subscribeLibraryFolders } from "../../lib/libraryFolderStore";
import { playedGamesSnapshot, subscribePlayedGames } from "../../lib/playedGameStore";
import { analysisFoldersSnapshot, subscribeAnalysisFolders } from "../../lib/savedAnalysisFolderStore";
import { savedAnalysesSnapshot, subscribeSavedAnalyses } from "../../lib/savedAnalysisStore";
import { repertoireFoldersSnapshot, subscribeRepertoireFolders } from "../../lib/savedRepertoireFolderStore";
import { savedRepertoiresSnapshot, subscribeSavedRepertoires } from "../../lib/savedRepertoireStore";
import {
  estimatedLibraryGamesPayload,
  estimatedPayloadBytes,
  formatBytes,
  readBrowserStorage,
  type BrowserStorageEstimate,
} from "../../lib/storageDiagnostics";
import { RightPanel } from "../main/rightPanel";

/**
 * **Storage** (`/settings/storage`, CTA-94) — how much space the app's data
 * takes on this device: the browser's own estimates for the whole origin
 * (`navigator.storage.estimate()`), and the reader's records per category —
 * counted exactly, sized by the app's own payload estimate
 * (`lib/storageDiagnostics.ts`; the research is `docs/indexed-db.md`).
 *
 * Every number says what it is: the browser's figures are estimates, the
 * sizes are **estimated payloads** — never disk or IndexedDB sizes — and a
 * number the browser does not report reads "not available", never zero. The
 * built-in collections are files fetched over the network, not records in
 * the reader's browser, so they belong to the origin usage only and are not
 * listed as stored records.
 *
 * The counts and payloads are the stores' snapshots (the Export tab's
 * pattern: a subscription starts each read), so nothing is read twice. The
 * Library's games are the bulk case and are never read: each collection's
 * games are estimated from its index rows. Reads only: nothing is written,
 * and nothing throws.
 */

/** One store's live list — a subscription starts the first read. */
const useRows = <Row,>(
  subscribe: (onChange: () => void) => () => void,
  snapshot: () => readonly Row[] | undefined,
): readonly Row[] | undefined => useSyncExternalStore(subscribe, snapshot);

/** What the rows hold, estimated. `undefined` while the read is out — shown as "…". */
const usePayload = (rows: readonly unknown[] | undefined): number | undefined =>
  useMemo(
    () =>
      rows === undefined
        ? undefined
        : rows.reduce<number>((total, row) => total + estimatedPayloadBytes(row), 0),
    [rows],
  );

function StorageTab() {
  const { t } = useTranslation();

  const playedGames = useRows(subscribePlayedGames, playedGamesSnapshot);
  const analyses = useRows(subscribeSavedAnalyses, savedAnalysesSnapshot);
  const analysisFolders = useRows(subscribeAnalysisFolders, analysisFoldersSnapshot);
  const repertoires = useRows(subscribeSavedRepertoires, savedRepertoiresSnapshot);
  const repertoireFolders = useRows(subscribeRepertoireFolders, repertoireFoldersSnapshot);
  const libraryFolders = useRows(subscribeLibraryFolders, libraryFoldersSnapshot);
  const collections = useRows(subscribeUploadedCollections, uploadedCollectionsSnapshot);

  const playedPayload = usePayload(playedGames);
  const analysesPayload = usePayload(analyses);
  const analysisFoldersPayload = usePayload(analysisFolders);
  const repertoiresPayload = usePayload(repertoires);
  const repertoireFoldersPayload = usePayload(repertoireFolders);
  const libraryFoldersPayload = usePayload(libraryFolders);
  const collectionsPayload = usePayload(collections);

  const [browser, setBrowser] = useState<BrowserStorageEstimate | undefined>();
  // The Library's games, estimated from the indexes — kept beside the
  // collections it answers for, so a change shows "…" until re-measured.
  const [games, setGames] = useState<{ collections: readonly unknown[]; payload: number } | undefined>();

  // The browser's estimates, read once on arrival.
  useEffect(() => {
    let current = true;
    void readBrowserStorage().then((estimate) => {
      if (current) setBrowser(estimate);
    });
    return () => {
      current = false;
    };
  }, []);

  // The collections are the only way the games change, so the estimate is
  // re-made exactly when they do.
  useEffect(() => {
    if (collections === undefined) return;
    let current = true;
    void estimatedLibraryGamesPayload(collections).then((payload) => {
      if (current) setGames({ collections, payload });
    });
    return () => {
      current = false;
    };
  }, [collections]);

  const gamesCount = collections?.reduce((total, collection) => total + collection.count, 0);
  const gamesPayload = games !== undefined && games.collections === collections ? games.payload : undefined;

  /*
    The reader's data, per category: played games (chessapp.engine), analyses
    and their folders (chessapp.analyses), repertoires and their folders
    (chessapp.repertoires), Library collections, their games and their
    folders (chessapp.library).
  */
  const categories = [
    { id: "playedGames", records: playedGames?.length, payload: playedPayload },
    { id: "analyses", records: analyses?.length, payload: analysesPayload },
    { id: "analysisFolders", records: analysisFolders?.length, payload: analysisFoldersPayload },
    { id: "repertoires", records: repertoires?.length, payload: repertoiresPayload },
    { id: "repertoireFolders", records: repertoireFolders?.length, payload: repertoireFoldersPayload },
    { id: "collections", records: collections?.length, payload: collectionsPayload },
    { id: "collectionGames", records: gamesCount, payload: gamesPayload },
    { id: "libraryFolders", records: libraryFolders?.length, payload: libraryFoldersPayload },
  ] as const;

  /** One browser figure: "…" while the estimate is out, "not available" where the browser reports none. */
  const browserRow = (testId: string, labelKey: string, value: number | null | undefined) => (
    <TableRow>
      <TableCell>{t(labelKey)}</TableCell>
      <TableCell align="right" data-testid={testId}>
        {value === undefined ? "…" : value === null ? t("settings.storage.notAvailable") : <span dir="ltr">{formatBytes(value)}</span>}
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <Box data-testid="settings-storage" sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("settings.storage.intro")}
        </Typography>

        <Box data-testid="settings-storage-browser">
          <Typography variant="subtitle2" component="h2">
            {t("settings.storage.browser.title")}
          </Typography>
          <Table size="small">
            <TableBody>
              {browserRow("settings-storage-usage", "settings.storage.browser.usage", browser?.usage)}
              {browserRow(
                "settings-storage-indexeddb",
                "settings.storage.browser.indexedDb",
                browser?.indexedDB,
              )}
              {browserRow("settings-storage-quota", "settings.storage.browser.quota", browser?.quota)}
            </TableBody>
          </Table>
        </Box>

        <Box data-testid="settings-storage-data">
          <Typography variant="subtitle2" component="h2">
            {t("settings.storage.data.title")}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("settings.storage.data.category")}</TableCell>
                <TableCell align="right">{t("settings.storage.data.records")}</TableCell>
                <TableCell align="right">{t("settings.storage.data.payload")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>{t(`settings.storage.data.categories.${category.id}`)}</TableCell>
                  <TableCell align="right" data-testid={`settings-storage-${category.id}-records`}>
                    {category.records === undefined ? "…" : category.records}
                  </TableCell>
                  <TableCell align="right" data-testid={`settings-storage-${category.id}-payload`}>
                    {category.payload === undefined ? (
                      "…"
                    ) : (
                      <span dir="ltr">{formatBytes(category.payload)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
            {t("settings.storage.note")}
          </Typography>
        </Box>
      </Box>

      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("settings.storage.panel")}
        </Typography>
      </RightPanel>
    </>
  );
}

export default StorageTab;
