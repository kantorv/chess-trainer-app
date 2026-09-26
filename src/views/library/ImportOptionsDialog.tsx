import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { IndexedRow } from "../../lib/collectionIndex";
import { addCollection, appendCollectionGames, removeCollection } from "../../lib/libraryCollectionStore";
import {
  collectionFacetsOf,
  collectionMetadataOf,
  collectionNameOfStem,
  filteredRows,
  sharedEventOf,
  type CollectionImportFile,
  type CollectionImportSource,
  type CollectionRow,
  type CollectionSummary,
  type RowFilter,
} from "../../lib/libraryCollections";
import { formatBytes } from "../../lib/storageDiagnostics";
import { indexCollection } from "./indexCollection";

/** A non-negative whole number typed into an Elo box, else no bound. */
const eloBound = (value: string): number | undefined => (/^\d+$/.test(value.trim()) ? Number(value) : undefined);

/**
 * **The import-options popup** (CTA-103) — what `/library/new` opens once a
 * picked `.pgn` or `.zip`, a paste, or *Add games* (`?into=`) has been read,
 * **before** anything is indexed or kept.
 *
 * - **What came in**: the file's name and size and the games read; for a zip,
 *   each `.pgn` in it with its own count; then the games' metadata at a glance
 *   (`collectionMetadataOf`: players, the Elo span, the date span, events).
 * - **Filters, applied before the index pass**, each shown only where some game
 *   carries its field (as the table's, `collectionFacetsOf`): min / max Elo
 *   (both players within; a game missing an Elo is out while one is set), a
 *   date range (`dateBounds`' partial dates; a game with no date is out while
 *   one is set) and players (several OR'd, typed free as chips — the table's
 *   filter, CTA-95). All go through `filteredRows`, so they cannot drift from
 *   the table's. A live "N of M" count; Import is off at none.
 * - **Import** indexes the kept games only (`indexCollection`, one pass over
 *   every file, a progress bar), then writes: `?into=` appends every file's
 *   games to that collection in one write; otherwise **one collection per
 *   file** holding any game, filed in `folderId` — a single text named as
 *   typed, else the `Event` its games share, else its file name's words, else
 *   "Pasted collection"; several files by their `Event`, else their names. A
 *   failed write takes back the collections it had already added, so it is all
 *   or nothing.
 *
 * Cancel, Escape, the backdrop or the popup going away stop the index pass and
 * write nothing. The one moment nothing can be stopped is the write itself, so
 * the popup does not close while it runs (the pattern of `MultiGameDialog`,
 * CTA-101).
 */
function ImportOptionsDialog({
  source,
  into,
  typedName,
  folderId,
  onClose,
  onDone,
}: {
  source: CollectionImportSource;
  /** Add games: every kept game goes to the end of this collection. */
  into?: CollectionSummary;
  /** The name field's text — a single text's collection name when not blank. */
  typedName: string;
  folderId: string | null;
  /** Cancelled: the index pass, if any, is already stopped. */
  onClose: () => void;
  /** Kept: where the reader goes now. */
  onDone: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [minElo, setMinElo] = useState("");
  const [maxElo, setMaxElo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [players, setPlayers] = useState<string[]>([]);
  /** The index pass under way: how far it has got. */
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = indexing !== null || writing;

  // The popup going away stops the pass.
  useEffect(() => () => abortRef.current?.abort(), []);

  const allRows = useMemo(() => source.files.flatMap((file) => file.rows), [source]);
  const metadata = useMemo(() => collectionMetadataOf(allRows), [allRows]);
  const facets = useMemo(() => collectionFacetsOf(allRows), [allRows]);

  const filter = useMemo<RowFilter>(
    () => ({
      text: "",
      result: "",
      player: players,
      minElo: eloBound(minElo),
      maxElo: eloBound(maxElo),
      from,
      to,
    }),
    [players, minElo, maxElo, from, to],
  );
  /** Each file's rows the filters keep. */
  const kept = useMemo(() => source.files.map((file) => filteredRows(file.rows, filter)), [source, filter]);
  const keptCount = kept.reduce((sum, rows) => sum + rows.length, 0);
  const filtering =
    players.length > 0 ||
    filter.minElo !== undefined ||
    filter.maxElo !== undefined ||
    from !== "" ||
    to !== "";

  const nameOf = (file: CollectionImportFile, rows: readonly CollectionRow[]): string =>
    (source.files.length === 1 ? typedName.trim() : "") ||
    sharedEventOf(rows) ||
    (file.stem === undefined ? t("library.upload.pastedName") : collectionNameOfStem(file.stem));

  const confirm = async () => {
    // Each file's kept games, in file order; a file that keeps none makes nothing.
    const batches = source.files
      .map((file, index) => {
        const rows = kept[index] ?? [];
        return { file, rows, games: rows.map((row) => file.games[row.number - 1] as string) };
      })
      .filter((batch) => batch.games.length > 0);
    const games = batches.flatMap((batch) => batch.games);
    if (games.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setProblem(null);
    setIndexing({ done: 0, total: games.length });
    let indexed: IndexedRow[];
    try {
      indexed = await indexCollection(games, (done, total) => setIndexing({ done, total }), controller.signal);
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
    if (into !== undefined) {
      const failed = await appendCollectionGames(into.id, games, indexed);
      setWriting(false);
      setIndexing(null);
      if (failed !== undefined) {
        setProblem(failed);
        return;
      }
      onDone(`/library/${encodeURIComponent(into.id)}`);
      return;
    }

    const added: string[] = [];
    let offset = 0;
    for (const batch of batches) {
      const rows = indexed.slice(offset, offset + batch.games.length);
      offset += batch.games.length;
      const result = await addCollection(nameOf(batch.file, batch.rows), batch.games, rows, undefined, undefined, folderId);
      if ("problem" in result) {
        // All or nothing: the collections this import had already added go again.
        for (const id of added) await removeCollection(id);
        setWriting(false);
        setIndexing(null);
        setProblem(result.problem);
        return;
      }
      added.push(result.collection.id);
    }
    setWriting(false);
    setIndexing(null);
    onDone(added.length === 1 ? `/library/${encodeURIComponent(added[0] as string)}` : "/library");
  };

  const cancel = () => {
    if (writing) return;
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  };

  const eloField = (testId: string, label: string, value: string, onChange: (value: string) => void) => (
    <TextField
      type="number"
      size="small"
      label={label}
      value={value}
      disabled={busy}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min: 0, step: 50, "data-testid": testId },
      }}
    />
  );

  const eventsShown = metadata.events.slice(0, 3).join(", ");

  return (
    <Dialog open onClose={cancel} maxWidth="sm" fullWidth data-testid="library-import">
      <DialogTitle>
        {into === undefined ? t("library.upload.options.title") : t("library.upload.options.intoTitle", { name: into.name })}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box>
          <Typography variant="body2" dir="auto" data-testid="library-import-source" sx={{ fontWeight: 600 }}>
            {source.name ?? t("library.upload.options.pasted")}
            {" · "}
            <span dir="ltr">{formatBytes(source.size)}</span>
            {" · "}
            {t("library.upload.options.games", { count: metadata.games })}
          </Typography>
          {source.zip && (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 0, listStyle: "none", display: "grid", gap: 0.25 }}>
              {source.files.map((file, index) => (
                <Typography
                  key={`${file.name ?? ""}-${index}`}
                  component="li"
                  variant="body2"
                  data-testid={`library-import-file-${index}`}
                  sx={{ color: "text.secondary", display: "flex", gap: 1 }}
                >
                  <Box component="span" dir="auto" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                    {file.name}
                  </Box>
                  <span dir="ltr">{formatBytes(file.size)}</span>
                  <span>
                    {filtering
                      ? t("library.upload.options.fileKept", { kept: kept[index]?.length ?? 0, count: file.games.length })
                      : t("library.upload.options.games", { count: file.games.length })}
                  </span>
                </Typography>
              ))}
            </Box>
          )}
          <Box
            data-testid="library-import-summary"
            sx={{ mt: 1, display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.5, color: "text.secondary" }}
          >
            <Typography variant="caption" data-testid="library-import-summary-players">
              {t("library.upload.options.players", { count: metadata.players })}
            </Typography>
            {metadata.elo !== undefined && (
              <Typography variant="caption" data-testid="library-import-summary-elo">
                {t("library.upload.options.eloSpan")}{" "}
                <span dir="ltr">{`${metadata.elo.min}–${metadata.elo.max}`}</span>
              </Typography>
            )}
            {metadata.dates !== undefined && (
              <Typography variant="caption" data-testid="library-import-summary-dates">
                {t("library.upload.options.dateSpan")}{" "}
                <span dir="ltr">{`${metadata.dates.first} – ${metadata.dates.last}`}</span>
              </Typography>
            )}
            <Typography variant="caption" dir="auto" data-testid="library-import-summary-events">
              {t("library.upload.options.events", { count: metadata.events.length })}
              {metadata.events.length > 0 &&
                `: ${eventsShown}${metadata.events.length > 3 ? ", …" : ""}`}
            </Typography>
          </Box>
        </Box>

        {(facets.players.length > 0 || metadata.elo !== undefined || facets.dates !== undefined) && (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
              {t("library.upload.options.filters")}
            </Typography>
            {metadata.elo !== undefined && (
              <Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  {eloField("library-import-min-elo", t("library.upload.options.minElo"), minElo, setMinElo)}
                  {eloField("library-import-max-elo", t("library.upload.options.maxElo"), maxElo, setMaxElo)}
                </Box>
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
                  {t("library.upload.options.eloHelp")}
                </Typography>
              </Box>
            )}
            {facets.dates !== undefined && (
              <Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  <TextField
                    type="date"
                    size="small"
                    label={t("library.filters.from")}
                    value={from}
                    disabled={busy}
                    onChange={(event) => setFrom(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { min: facets.dates.min, max: to || facets.dates.max, "data-testid": "library-import-from" },
                    }}
                  />
                  <TextField
                    type="date"
                    size="small"
                    label={t("library.filters.to")}
                    value={to}
                    disabled={busy}
                    onChange={(event) => setTo(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { min: from || facets.dates.min, max: facets.dates.max, "data-testid": "library-import-to" },
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
                  {t("library.upload.options.dateHelp")}
                </Typography>
              </Box>
            )}
            {facets.players.length > 0 && (
              // The table's player filter (CTA-95): chips, several names OR'd, part of a name typed free.
              <Autocomplete
                multiple
                freeSolo
                size="small"
                disableCloseOnSelect
                disabled={busy}
                options={facets.players}
                value={players}
                onChange={(_event, value) => setPlayers(value)}
                data-testid="library-import-player"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t("library.upload.options.playerFilter")}
                    helperText={t("library.upload.options.playersHelp")}
                  />
                )}
              />
            )}
          </Box>
        )}

        {source.files.length > 1 && (
          <Typography variant="caption" sx={{ color: "text.secondary" }} data-testid="library-import-several">
            {t(into === undefined ? "library.upload.options.several" : "library.upload.options.severalInto")}
          </Typography>
        )}

        <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="library-import-count">
          {t("library.upload.options.count", { kept: keptCount, count: metadata.games })}
        </Typography>

        {indexing !== null && (
          <Box data-testid="library-import-indexing" sx={{ display: "grid", gap: 1 }}>
            <Typography variant="body2" data-testid="library-import-progress">
              {t("library.upload.indexing", { done: indexing.done, total: indexing.total })}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={indexing.total === 0 ? 0 : (100 * indexing.done) / indexing.total}
            />
          </Box>
        )}

        {problem !== null && (
          <Alert severity="error" data-testid="library-import-problem">
            {t(`library.upload.problem.${problem}`)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} disabled={writing} data-testid="library-import-cancel">
          {t("library.upload.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={keptCount === 0 || busy}
          onClick={() => void confirm()}
          data-testid="library-import-confirm"
        >
          {t(into === undefined ? "library.upload.options.import" : "library.upload.intoSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ImportOptionsDialog;
