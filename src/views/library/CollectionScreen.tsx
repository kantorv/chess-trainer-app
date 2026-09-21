import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
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
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";

import { removeCollection } from "../../lib/libraryCollectionStore";
import {
  COLLECTION_COLUMNS,
  filteredRows,
  gameTitleOf,
  RESULTS,
  sortedRows,
  type CollectionColumn,
  type CollectionRow,
  type CollectionSummary,
  type SortDirection,
} from "../../lib/libraryCollections";
import { downloadPgn } from "../../lib/pgnExport";
import { slugify } from "../../lib/pgnText";
import { RightPanel } from "../main/rightPanel";
import LibraryMiss from "./LibraryMiss";
import { loadCollectionGames, useCollectionRows } from "./useLibraryCollections";

/**
 * **A collection** (`/library/<collection>`, CTA-75) — its games as a table:
 * one row per game, the columns `lib/libraryCollections.ts` reads off the
 * tags (and the length it counts), **sorted** by a click on any header and
 * **filtered** by words (matched against every text column) and by result.
 * A row opens that game on the Library's analysis board.
 *
 * **The rows are the collection's index** (`lib/collectionIndex.ts`), read
 * whole — no game is parsed, or even fetched, to draw the table: a shipped
 * file's index is its own small chunk, and the PGN is fetched only for the
 * download. A game the index found unreadable is marked in its `#` cell.
 *
 * The sort, the filter and the page are the URL's (`?sort=`, `?dir=`, `?q=`,
 * `?result=`, `?page=`, `?rows=`, written with history replace), so going back
 * from a game finds the table as it was left, and a filtered table is a link.
 * Pages rather than one long table: the World Cup file is 674 rows.
 */

const ROWS_PER_PAGE = [50, 100, 250] as const;
/** The columns whose values are numbers — sorted high first on the first click. */
const NUMERIC: ReadonlySet<CollectionColumn> = new Set(["number", "whiteElo", "blackElo", "moves"]);

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

  const requestedSort = params.get("sort");
  const sort: CollectionColumn = isColumn(requestedSort) ? requestedSort : "number";
  const direction: SortDirection = params.get("dir") === "desc" ? "desc" : "asc";
  const text = params.get("q") ?? "";
  const requestedResult = params.get("result") ?? "";
  const result = (RESULTS as readonly string[]).includes(requestedResult) ? requestedResult : "";
  const requestedRows = Number(params.get("rows"));
  const rowsPerPage = (ROWS_PER_PAGE as readonly number[]).includes(requestedRows)
    ? requestedRows
    : ROWS_PER_PAGE[0];

  const shown = useMemo(
    () => sortedRows(filteredRows(rows, { text, result }), sort, direction),
    [rows, text, result, sort, direction],
  );
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

  const sortBy = (column: CollectionColumn) =>
    setState(
      column === sort
        ? { dir: direction === "asc" ? "desc" : "asc" }
        : { sort: column === "number" ? null : column, dir: NUMERIC.has(column) && column !== "number" ? "desc" : null },
    );

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
          <Tooltip title={t("library.table.download")}>
            <IconButton
              size="small"
              aria-label={t("library.table.download")}
              data-testid="library-table-download"
              onClick={async () => {
                const games = await loadCollectionGames(collection);
                if (games !== null) downloadPgn(slugify(collection.name) || "collection", games);
              }}
            >
              <DownloadRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {collection.source === "uploaded" && (
            <Tooltip title={t("library.table.delete")}>
              <IconButton
                size="small"
                aria-label={t("library.table.delete")}
                data-testid="library-table-delete"
                onClick={() => setDeleting(true)}
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
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
          <TextField
            select
            size="small"
            label={t("library.table.result")}
            value={result}
            onChange={(event) => setState({ result: event.target.value })}
            slotProps={{ htmlInput: { "data-testid": "library-table-result" } }}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">{t("library.table.anyResult")}</MenuItem>
            {RESULTS.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {/* The one region that scrolls, both ways: twelve columns in a square. */}
        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader data-testid="library-table">
            <TableHead>
              <TableRow>
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
              {t("library.table.noMatches")}
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
        <Box sx={{ color: "text.secondary", display: "grid", gap: 1 }}>
          <Typography variant="body2">{t("library.table.hint")}</Typography>
          <Typography variant="body2" data-testid="library-table-note">
            {t(
              collection.source === "shipped"
                ? "library.table.shippedNote"
                : "library.table.uploadedNote",
            )}
          </Typography>
        </Box>
      </RightPanel>
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        data-testid="library-delete-dialog"
      >
        <DialogTitle>{t("library.confirmDelete.title", { name: collection.name })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("library.confirmDelete.body", { count: collection.count })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>{t("library.confirmDelete.cancel")}</Button>
          <Button
            color="error"
            data-testid="library-delete-confirm"
            onClick={async () => {
              await removeCollection(collection.id);
              navigate("/library");
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
