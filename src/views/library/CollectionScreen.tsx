import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import PostAddRoundedIcon from "@mui/icons-material/PostAddRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";

import { DEFAULT_ANALYSIS_SETTINGS } from "../../lib/analysisSettings";
import { removeCollectionGames } from "../../lib/libraryCollectionStore";
import {
  batchFolderNameOf,
  COLLECTION_COLUMNS,
  COLLECTION_FILTER_PARAMS,
  collectionFacetsOf,
  filteredRows,
  gameTitleOf,
  RESULTS,
  sortedRows,
  type CollectionColumn,
  type CollectionFilterValues,
  type CollectionRow,
  type CollectionSummary,
  type SortDirection,
} from "../../lib/libraryCollections";
import {
  OPENING_LINE_PARAM,
  openingLineOfParam,
  openingLineParamOf,
  openingNodeAt,
  openingNodeOn,
  openingTreeOf,
} from "../../lib/openingTree";
import { downloadPgn } from "../../lib/pgnExport";
import { slugify } from "../../lib/pgnText";
import { batchAnalysesOf, newSavedAnalysisId } from "../../lib/savedAnalyses";
import {
  createAnalysisFolder,
  MAX_ANALYSIS_FOLDER_NAME,
  MAX_ANALYSIS_FOLDERS,
  removeAnalysisFolder,
} from "../../lib/savedAnalysisFolderStore";
import { addAnalyses, MAX_SAVED_ANALYSES } from "../../lib/savedAnalysisStore";
import { repertoireGameNamesOf } from "../../lib/savedRepertoires";
import { RightPanel } from "../main/rightPanel";
import SavedListExportBar from "../shared/SavedListExportBar";
import CollectionFilters from "./CollectionFilters";
import LibraryMiss from "./LibraryMiss";
import { loadCollectionGames, useCollectionRows } from "./useLibraryCollections";

/**
 * **A collection** (`/library/<collection>`, CTA-75) — its games as a table:
 * one row per game, the columns `lib/libraryCollections.ts` reads off the
 * tags (and the length it counts), **sorted** by a click on any header and
 * **filtered** by words (matched against every text column, the box over the
 * table) and by the right-hand panel's filters — player and side, opening,
 * event, dates, result (`CollectionFilters.tsx`; each shown only where the
 * collection has its field) — and, under the player and side, the **opening moves** played
 * on a small board (`OpeningFilterBoard.tsx`, CTA-76): the opening tree
 * (`lib/openingTree.ts`, merged from the index's `line` column) of **the
 * games the other filters leave** — filter by a player and side, and the
 * board shows that player's openings — rebuilt as they change (a few ms for
 * 10,000 games). Its line narrows the table last, and is kept as written
 * when the other filters leave no game on it (the board then says so); only
 * a line no game of the whole collection plays is cut back, where they part.
 * A row opens that game on the Library's analysis board.
 *
 * **Every row carries a checkbox**, and the top bar the saved lists' export
 * bar (`SavedListExportBar`): its select-all works on **the rows the filters
 * leave, on every page** — so filter, select all, download, and the file is
 * the filtered batch — and adds them to the picks (unticking removes just
 * those), while its chip counts every pick, whatever the filter now shows.
 * The download is one `.pgn` of the picked games, in collection order. In an
 * **uploaded** collection the bar also **deletes** the picked games (asked
 * first; `removeCollectionGames`, the games after them moving up) — the
 * whole collection is deleted from its row on `/library`. Picks
 * are the screen's, not the URL's: a link carries the filter, not a hand-made
 * selection.
 *
 * **Add games** (an upload's only — an empty collection starts here) opens
 * the upload screen on this collection (`/library/new?into=<id>`): a file or
 * a paste, checked as an upload is, added at the end.
 *
 * **Analyse** (CTA-77), beside the export bar, hands the picks to **Saved
 * analyses**: one new top-level folder, named after the collection, the
 * count and the filters that are on (`batchFolderNameOf`), and every picked
 * game saved into it as its own analysis, in collection order, all or
 * nothing — the Analysis Board's split (`AnalysisLoad.tsx`) over games
 * already read: the folder first, then the records (`batchAnalysesOf`, the
 * stored PGN as it is), the folder taken back out if they cannot be written.
 * A game the index marks unreadable is **left out, and the notice says how
 * many** — it would open on no board — rather than refusing the whole batch.
 * A snackbar says how many went where, with a link to the folder; the picks
 * stay.
 *
 * **The rows are the collection's index** (`lib/collectionIndex.ts`), read
 * whole — no game is parsed, or even fetched, to draw the table: a shipped
 * file's index is its own small chunk, and the PGN is fetched only for a
 * download of the picked games. (The whole collection downloads from its row
 * on `/library`.) A game the index found unreadable is marked in its `#` cell.
 *
 * **The newest games first**: the table opens sorted by date, descending
 * (undated games last, one day's games later first); `#` restores the
 * collection's own order.
 *
 * The sort, the filters and the page are the URL's (`?sort=`, `?dir=`, `?q=`,
 * `?player=`, `?color=`, `?opening=`, `?event=`, `?from=`, `?to=`,
 * `?result=`, `?line=`, `?page=`, `?rows=`, written with history replace), so going back
 * from a game finds the table as it was left, and a filtered table is a link.
 * Pages rather than one long table: the World Cup file is 674 rows.
 */

const ROWS_PER_PAGE = [50, 100, 250] as const;
/** The columns whose values are numbers — sorted high first on the first click. */
const NUMERIC: ReadonlySet<CollectionColumn> = new Set(["number", "whiteElo", "blackElo", "moves"]);

/** The sort a table opens with: the newest games first (undated ones last). */
const DEFAULT_SORT: CollectionColumn = "date";
/** Which way a column sorts until the reader turns it: the date and the numbers high first. */
const defaultDirection = (column: CollectionColumn): SortDirection =>
  column === DEFAULT_SORT || (NUMERIC.has(column) && column !== "number") ? "desc" : "asc";

const isColumn = (value: string | null): value is CollectionColumn =>
  (COLLECTION_COLUMNS as readonly string[]).includes(value ?? "");

function CollectionTable({
  collection,
  rows,
}: {
  collection: CollectionSummary;
  rows: readonly CollectionRow[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [deleting, setDeleting] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState(false);
  /** The picked games, by number. */
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set());

  const requestedSort = params.get("sort");
  const sort: CollectionColumn = isColumn(requestedSort) ? requestedSort : DEFAULT_SORT;
  const requestedDirection = params.get("dir");
  const direction: SortDirection =
    requestedDirection === "asc" || requestedDirection === "desc"
      ? requestedDirection
      : defaultDirection(sort);
  const text = params.get("q") ?? "";
  const requestedResult = params.get("result") ?? "";
  const requestedColor = params.get("color");
  const collectionTree = useMemo(() => openingTreeOf(rows), [rows]);
  const requestedLine = params.get(OPENING_LINE_PARAM) ?? "";
  // Followed as far as the collection's games go — a stale link lands where they part.
  const line = useMemo(
    () => openingNodeAt(collectionTree, openingLineOfParam(requestedLine)).line,
    [collectionTree, requestedLine],
  );
  const isoDate = (value: string | null) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? (value as string) : "");
  const filters: CollectionFilterValues = {
    player: params.get("player") ?? "",
    color: requestedColor === "white" || requestedColor === "black" ? requestedColor : "",
    opening: params.get("opening") ?? "",
    event: params.get("event") ?? "",
    from: isoDate(params.get("from")),
    to: isoDate(params.get("to")),
    result: (RESULTS as readonly string[]).includes(requestedResult) ? requestedResult : "",
    line: openingLineParamOf(line),
  };
  const requestedRows = Number(params.get("rows"));
  const rowsPerPage = (ROWS_PER_PAGE as readonly number[]).includes(requestedRows)
    ? requestedRows
    : ROWS_PER_PAGE[0];

  const facets = useMemo(() => collectionFacetsOf(rows), [rows]);
  const { player, color, event, from, to, result } = filters;
  const openingName = filters.opening;
  // Every filter but the line: the rows the board's tree is merged from.
  const narrowed = useMemo(
    () => filteredRows(rows, { text, result, player, color, opening: openingName, event, from, to }),
    [rows, text, result, player, color, openingName, event, from, to],
  );
  const openingTree = useMemo(() => openingTreeOf(narrowed), [narrowed]);
  const openingNode = useMemo(() => openingNodeOn(openingTree, line), [openingTree, line]);
  const shown = useMemo(
    () => sortedRows(filteredRows(narrowed, { text: "", result: "", line }), sort, direction),
    [narrowed, line, sort, direction],
  );
  const pickedShown = useMemo(() => shown.filter((row) => picked.has(row.number)).length, [shown, picked]);
  const allShownPicked = shown.length > 0 && pickedShown === shown.length;
  /** Select-all over the filtered rows: add them all, or — all picked already — take just them out. */
  const toggleAllShown = () =>
    setPicked((before) => {
      const next = new Set(before);
      for (const row of shown) {
        if (allShownPicked) next.delete(row.number);
        else next.add(row.number);
      }
      return next;
    });
  const togglePicked = (number: number) =>
    setPicked((before) => {
      const next = new Set(before);
      if (!next.delete(number)) next.add(number);
      return next;
    });
  const [analysing, setAnalysing] = useState(false);
  const [notice, setNotice] = useState<
    | { severity: "success"; message: string; folderId: string }
    | { severity: "error"; message: string }
    | null
  >(null);

  /** The picks into Saved analyses: a new folder, a record per readable game — or nothing. */
  const analysePicked = async () => {
    const failure = (message: string) => setNotice({ severity: "error", message });
    setAnalysing(true);
    try {
      const games = await loadCollectionGames(collection);
      if (games === null) return failure(t("library.table.picks.problem.read"));
      const unreadable = new Set(rows.filter((row) => row.unreadable).map((row) => row.number));
      const numbers = [...picked].sort((a, b) => a - b);
      const kept = numbers.filter((number) => games[number - 1] !== undefined && !unreadable.has(number));
      const skipped = numbers.length - kept.length;
      if (kept.length === 0) return failure(t("library.table.picks.problem.none"));

      const chunks = kept.map((number) => games[number - 1]);
      const names = repertoireGameNamesOf(chunks);
      const folderName = batchFolderNameOf(
        collection.name,
        { text, result, player, color, opening: openingName, event, from, to, line },
        {
          games: t("library.games", { count: kept.length }),
          white: t("library.table.picks.white"),
          black: t("library.table.picks.black"),
        },
        MAX_ANALYSIS_FOLDER_NAME,
      );
      const folder = await createAnalysisFolder(folderName, null);
      if (folder === undefined) {
        return failure(t("library.table.picks.problem.folder", { max: MAX_ANALYSIS_FOLDERS }));
      }
      const failed = await addAnalyses(
        batchAnalysesOf(
          newSavedAnalysisId,
          chunks.map((pgn, index) => ({ pgn, name: names[index] })),
          folder.id,
          DEFAULT_ANALYSIS_SETTINGS,
        ),
      );
      if (failed !== undefined) {
        // All or nothing: no empty folder is left behind.
        await removeAnalysisFolder(folder.id);
        return failure(
          failed === "too-many"
            ? t("library.table.picks.problem.tooMany", { max: MAX_SAVED_ANALYSES })
            : t("library.table.picks.problem.storage"),
        );
      }
      setNotice({
        severity: "success",
        folderId: folder.id,
        message: [
          t("library.table.picks.done", { count: kept.length, folder: folder.name }),
          skipped > 0 ? t("library.table.picks.skipped", { count: skipped }) : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    } finally {
      setAnalysing(false);
    }
  };

  const downloadPicked = async () => {
    const games = await loadCollectionGames(collection);
    if (games === null) return;
    const numbers = [...picked].sort((a, b) => a - b);
    downloadPgn(
      `${slugify(collection.name) || "collection"}-${numbers.length}-games`,
      numbers.map((number) => games[number - 1]).filter((pgn) => pgn !== undefined),
    );
  };

  const lastPage = Math.max(0, Math.ceil(shown.length / rowsPerPage) - 1);
  const page = Math.min(Math.max(0, Number(params.get("page")) || 0), lastPage);
  const pageRows = shown.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  /** Change some of the table's URL state; a new filter or sort starts at page 0. */
  const setState = (patch: Record<string, string | null>, keepPage = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete("page");
        return next;
      },
      { replace: true },
    );

  /** A new column opens its own way; a second click turns it. The URL keeps only what is not the default. */
  const sortBy = (column: CollectionColumn) => {
    if (column !== sort) {
      setState({ sort: column === DEFAULT_SORT ? null : column, dir: null });
      return;
    }
    const turned: SortDirection = direction === "asc" ? "desc" : "asc";
    setState({ dir: turned === defaultDirection(column) ? null : turned });
  };

  const gamePath = (number: number) =>
    `/library/${encodeURIComponent(collection.id)}/${number}`;
  const openGame = (number: number) =>
    navigate(gamePath(number), { state: { from: `${location.pathname}${location.search}` } });

  const cell = (value: string | number | undefined) => (value === undefined ? "" : value);

  return (
    <>
      <Box
        data-testid="library-table-screen"
        sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            pb: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Tooltip title={t("library.table.back")}>
            <IconButton
              size="small"
              component={RouterLink}
              to="/library"
              aria-label={t("library.table.back")}
              data-testid="library-table-back"
            >
              <ArrowBackRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              component="h1"
              dir="auto"
              data-testid="library-table-name"
              sx={{ fontWeight: 700, lineHeight: 1.3 }}
              noWrap
            >
              {collection.name}
            </Typography>
            <Typography
              variant="caption"
              data-testid="library-table-count"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {shown.length === rows.length
                ? t("library.games", { count: rows.length })
                : t("library.table.shown", { shown: shown.length, count: rows.length })}
            </Typography>
          </Box>
          {collection.source === "uploaded" && (
            <Tooltip title={t("library.table.addGamesHint")}>
              <Button
                size="small"
                variant={rows.length === 0 ? "contained" : "outlined"}
                startIcon={<PostAddRoundedIcon fontSize="small" />}
                component={RouterLink}
                to={`/library/new?into=${encodeURIComponent(collection.id)}`}
                data-testid="library-table-add-games"
                sx={{ flexShrink: 0 }}
              >
                {t("library.table.addGames")}
              </Button>
            </Tooltip>
          )}
          <SavedListExportBar
            testIdPrefix="library-picks"
            labelKey="library.table.picks"
            checked={allShownPicked}
            indeterminate={pickedShown > 0 && !allShownPicked}
            onToggleAll={toggleAllShown}
            selectedCount={picked.size}
            onClearSelected={() => setPicked(new Set())}
            onDownload={() => void downloadPicked()}
            onDelete={
              collection.source === "uploaded"
                ? () => {
                    setDeleteProblem(false);
                    setDeleting(true);
                  }
                : undefined
            }
          />
          <Tooltip title={t(analysing ? "library.table.picks.analysing" : "library.table.picks.analyseHint")}>
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled={picked.size === 0 || analysing}
                onClick={() => void analysePicked()}
                aria-busy={analysing}
                startIcon={
                  analysing ? <CircularProgress size={16} /> : <ShareRoundedIcon fontSize="small" />
                }
                data-testid="library-picks-analyse"
                sx={{ flexShrink: 0 }}
              >
                {t("library.table.picks.analyse")}
              </Button>
            </span>
          </Tooltip>
        </Box>

        <Box sx={{ flexShrink: 0, display: "flex", gap: 1, py: 1 }}>
          <TextField
            size="small"
            label={t("library.table.filter")}
            value={text}
            onChange={(event) => setState({ q: event.target.value })}
            slotProps={{ htmlInput: { "data-testid": "library-table-filter" } }}
            sx={{ flex: 1 }}
          />
        </Box>

        {/* The one region that scrolls, both ways: twelve columns in a square. */}
        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader data-testid="library-table">
            <TableHead>
              <TableRow>
                {/* The checkboxes' column: select-all is the export bar's. */}
                <TableCell padding="checkbox" />
                {COLLECTION_COLUMNS.map((column) => (
                  <TableCell
                    key={column}
                    sortDirection={sort === column ? direction : false}
                    sx={{ whiteSpace: "nowrap", fontWeight: 600 }}
                  >
                    <TableSortLabel
                      active={sort === column}
                      direction={sort === column ? direction : "asc"}
                      onClick={() => sortBy(column)}
                      data-testid={`library-table-sort-${column}`}
                    >
                      {t(`library.table.columns.${column}`)}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow
                  key={row.number}
                  hover
                  onClick={() => openGame(row.number)}
                  data-testid={`library-table-row-${row.number}`}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      size="small"
                      checked={picked.has(row.number)}
                      onChange={() => togglePicked(row.number)}
                      slotProps={{ input: { "aria-label": t("library.table.picks.pick", { title: gameTitleOf(row) }) } }}
                      data-testid={`library-picks-row-${row.number}`}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {row.number}
                    {row.unreadable && (
                      <Tooltip title={t("library.table.unreadable")}>
                        <WarningAmberRoundedIcon
                          color="warning"
                          aria-label={t("library.table.unreadable")}
                          data-testid={`library-table-unreadable-${row.number}`}
                          sx={{ fontSize: 16, verticalAlign: "text-bottom", marginInlineStart: 0.5 }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell dir="auto" sx={{ whiteSpace: "nowrap" }}>
                    {/* The row's link, for the keyboard and a middle click. */}
                    <Box
                      component={RouterLink}
                      to={gamePath(row.number)}
                      state={{ from: `${location.pathname}${location.search}` }}
                      onClick={(event: React.MouseEvent) => event.stopPropagation()}
                      aria-label={gameTitleOf(row)}
                      sx={{ color: "inherit", textDecoration: "none" }}
                    >
                      {cell(row.white)}
                    </Box>
                  </TableCell>
                  <TableCell>{cell(row.whiteElo)}</TableCell>
                  <TableCell dir="auto" sx={{ whiteSpace: "nowrap" }}>
                    {cell(row.black)}
                  </TableCell>
                  <TableCell>{cell(row.blackElo)}</TableCell>
                  <TableCell dir="ltr" sx={{ whiteSpace: "nowrap" }}>
                    {row.result}
                  </TableCell>
                  <TableCell dir="ltr" sx={{ whiteSpace: "nowrap" }}>
                    {cell(row.date)}
                  </TableCell>
                  <TableCell dir="ltr">{cell(row.round)}</TableCell>
                  <TableCell dir="auto" sx={{ whiteSpace: "nowrap" }}>
                    {cell(row.event)}
                  </TableCell>
                  <TableCell>{cell(row.eco)}</TableCell>
                  <TableCell dir="auto" sx={{ minWidth: 160 }}>
                    {cell(row.opening)}
                  </TableCell>
                  <TableCell>{row.moves}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {shown.length === 0 && (
            <Typography
              data-testid="library-table-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t(rows.length === 0 ? "library.table.noGames" : "library.table.noMatches")}
            </Typography>
          )}
        </TableContainer>
        <TablePagination
          component="div"
          sx={{ flexShrink: 0 }}
          count={shown.length}
          page={page}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[...ROWS_PER_PAGE]}
          labelRowsPerPage={t("library.table.rowsPerPage")}
          onPageChange={(_event, next) => setState({ page: next === 0 ? null : String(next) }, true)}
          onRowsPerPageChange={(event) =>
            setState({
              rows: Number(event.target.value) === ROWS_PER_PAGE[0] ? null : event.target.value,
            })
          }
          data-testid="library-table-pagination"
        />
      </Box>
      <RightPanel>
        {/* The aside does not scroll; the panel is its own scrolling column. */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", alignContent: "start", gap: 3 }}>
          <CollectionFilters
            facets={facets}
            values={filters}
            onChange={(patch) => setState(patch)}
            openingTree={collectionTree}
            openingNode={openingNode}
            line={line}
            onLine={(next) => setState({ [OPENING_LINE_PARAM]: openingLineParamOf(next) })}
            onClear={() =>
              setState(Object.fromEntries(COLLECTION_FILTER_PARAMS.map((key) => [key, null])))
            }
          />
          <Typography variant="body2" data-testid="library-table-note" sx={{ color: "text.secondary" }}>
            {t(
              collection.source === "shipped"
                ? "library.table.shippedNote"
                : "library.table.uploadedNote",
            )}
          </Typography>
        </Box>
      </RightPanel>
      {notice !== null && (
        <Snackbar
          open
          autoHideDuration={notice.severity === "success" ? 10_000 : null}
          onClose={(_event, reason) => {
            if (reason !== "clickaway") setNotice(null);
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity={notice.severity}
            variant="filled"
            onClose={() => setNotice(null)}
            data-testid="library-picks-analyse-notice"
            action={
              notice.severity === "success" ? (
                <Button
                  color="inherit"
                  size="small"
                  component={RouterLink}
                  to={`/tools/analysis/saved?folder=${encodeURIComponent(notice.folderId)}`}
                  data-testid="library-picks-analyse-open"
                >
                  {t("library.table.picks.openFolder")}
                </Button>
              ) : undefined
            }
            sx={{ alignItems: "center" }}
          >
            {notice.message}
          </Alert>
        </Snackbar>
      )}
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        data-testid="library-picks-delete-dialog"
      >
        <DialogTitle>{t("library.table.confirmDeleteGames.title", { count: picked.size })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("library.table.confirmDeleteGames.body", { name: collection.name })}
          </DialogContentText>
          {deleteProblem && (
            <Alert severity="error" sx={{ mt: 2 }} data-testid="library-picks-delete-problem">
              {t("library.table.confirmDeleteGames.problem")}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>{t("library.confirmDelete.cancel")}</Button>
          <Button
            color="error"
            data-testid="library-picks-delete-confirm"
            onClick={async () => {
              const failed = await removeCollectionGames(collection.id, [...picked]);
              if (failed !== undefined) {
                setDeleteProblem(true);
                return;
              }
              // The numbers after the deleted games have moved up: a pick would name another game.
              setPicked(new Set());
              setDeleting(false);
            }}
          >
            {t("library.confirmDelete.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** The route: the collection the URL names, or the miss. */
function CollectionScreen() {
  const { collectionId } = useParams();
  const { t } = useTranslation();
  const state = useCollectionRows(collectionId);
  if (state.status === "loading") {
    return (
      <Typography data-testid="library-loading" sx={{ color: "text.secondary", p: 2 }}>
        {t("library.table.loading")}
      </Typography>
    );
  }
  if (state.status === "missing") return <LibraryMiss what="collection" />;
  return <CollectionTable key={state.summary.id} collection={state.summary} rows={state.value} />;
}

export default CollectionScreen;
