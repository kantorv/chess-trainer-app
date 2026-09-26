import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { Link as RouterLink, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { PLAY_REFERENCE_KEY } from "../../../lib/gameReference";
import { mainline } from "../../../lib/gameTree";
import { openingOfLine } from "../../../lib/openings";
import { removePlayedGame } from "../../../lib/playedGameStore";
import {
  PLAYED_GAME_COLUMNS,
  PLAYED_GAMES_PATH,
  playedGameSummary,
  playedGameToTree,
  sortedPlayedGames,
  type PlayedGameColumn,
  type PlayedGameRow,
  type SortDirection,
} from "../../../lib/playedGames";
import { RightPanel } from "../../main/rightPanel";
import { savedListDate } from "../../shared/savedList";
import { useOpeningBook } from "../../shared/useOpeningBook";
import NewGameForm from "./NewGameForm";
import { usePlayedGames } from "./usePlayedGames";

/**
 * **The Lobby** (`/engine/games`; the Saved games list of CTA-74, a lobby
 * since CTA-82) — the board square holds the games, the right-hand panel the
 * new-game form (`NewGameForm.tsx`), whose Start button is how Play with
 * Engine is reached.
 *
 * The games of Play with Engine and, since CTA-79, of Masked Pieces — flat,
 * as the store keeps them — are a **sortable, paginated table** (CTA-100),
 * the Library's collection table's own pattern: a sticky header every column
 * of which sorts, `TablePagination` pinned beneath the one scrolling region,
 * and the table's whole state in the URL beside the filters — `?sort=`,
 * `?dir=`, `?page=`, `?rows=`, written with history replace, so a sorted or
 * filtered table is a shareable link and coming back from a game finds it
 * as it was left. A new sort or filter starts at the first page. The table
 * opens **Date-descending, newest first** — the order the flat list opened
 * in; a second click on a header turns it, a row missing the value sorts
 * last either way, and ties break by date. The rows per page are 10 / 25 /
 * 50, 25 the default.
 *
 * Columns, left to right: the row's controls, then White, White Elo, Black,
 * Black Elo, Result, Opening, Moves, Masked, Date. The controls are the
 * collection table's own pattern (CTA-100's follow-up): a **pick checkbox**
 * first — tick rows to mark them for the header's **Delete picked (N)**,
 * which asks first and removes them all; there is no per-row delete — then
 * the icon-only **Continue** (the play arrow, `?saved=<id>` — on
 * `/engine/play`, or `/engine/masked` for a masked game, in the same
 * disguise; only while the game is still on — a result decided by
 * `playedGameResult`, a resignation or the final position, CTA-90) and
 * **Analysis** (the flask, `?game=play/games/<id>` on the Analysis Board,
 * side lines and all — a masked game unmasked, since its PGN is the true
 * game), both with tooltips. The picks are the screen's, not the URL's —
 * a link carries the filter, not a hand-made selection. A record whose PGN
 * no longer parses keeps its row — it says so across the columns — and can
 * be picked like any other.
 *
 * The names are the flat list's row titles kept — the reader's side the
 * localized "Human", the engine's "Stockfish level N", by `settings.playAs`
 * — and the engine's Elo is the strength slider's own estimate
 * (`approximateElo`), an estimate and never a setting; the reader's side has
 * none and says "unknown", which is also how any unreadable value reads.
 * The side-lines count rides along as secondary text in the Moves cell. The
 * book loads lazily (`useOpeningBook`): until it lands the Opening cell is
 * empty and a sort by it applies to what is known, missing values last.
 *
 * **Filters** (CTA-82), combined, in the URL (`?color=white|black`,
 * `?opening=<name>`, history replace): the side the reader played
 * (`settings.playAs`), and the opening each game reached — the deepest one
 * eco.json names along its mainline (`openingOfLine`), offered from the
 * openings the list holds. The ~3MB book loads lazily (`useOpeningBook`);
 * until it lands the opening filter is off and the table is not narrowed by
 * it. Masked games are filtered like any other.
 */

type ColorFilter = "all" | "white" | "black";

const colorFilterOf = (value: string | null): ColorFilter =>
  value === "white" || value === "black" ? value : "all";

/** The rows a page can hold, and what a table opens with: the middle one. */
const ROWS_PER_PAGE = [10, 25, 50] as const;
const DEFAULT_ROWS_PER_PAGE = 25;
/** The columns whose values are numbers — sorted high first on the first click. */
const NUMERIC: ReadonlySet<PlayedGameColumn> = new Set(["date", "whiteElo", "blackElo", "moves"]);
/** The sort a table opens with: the day each game was begun, newest first. */
const DEFAULT_SORT: PlayedGameColumn = "date";
/** Which way a column sorts until the reader turns it: the date and the numbers high first. */
const defaultDirection = (column: PlayedGameColumn): SortDirection =>
  column === DEFAULT_SORT || NUMERIC.has(column) ? "desc" : "asc";

const isColumn = (value: string | null): value is PlayedGameColumn =>
  (PLAYED_GAME_COLUMNS as readonly string[]).includes(value ?? "");

function PlayedGameRow({
  row,
  picked,
  onTogglePicked,
}: {
  row: PlayedGameRow;
  picked: boolean;
  onTogglePicked: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  // The `?game=` reference `lib/gameReference.ts` resolves against the store's catalog.
  const reference = encodeURIComponent(`${PLAY_REFERENCE_KEY}/${PLAYED_GAMES_PATH}/${row.id}`);
  // What the row is called — its checkbox's label, as the old row title named it.
  const title = t("playedGames.players", { white: row.white, black: row.black });
  return (
    <TableRow data-testid={`played-games-row-${row.id}`}>
      {/* The pick, the collection table's own checkbox column: tick rows to
          mark them for the header's Delete picked. */}
      <TableCell padding="checkbox">
        <Checkbox
          size="small"
          checked={picked}
          onChange={() => onTogglePicked(row.id)}
          slotProps={{ input: { "aria-label": t("playedGames.pick", { title }) } }}
          data-testid={`played-games-pick-${row.id}`}
        />
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {/*
            Continue only while the game is on (CTA-90): the row's own
            result says whether it can — anything but `*` (a resignation,
            mate or a draw, `playedGameResult`) is a game that has ended.
          */}
          {row.readable && row.result === "*" && (
            <Tooltip title={t("playedGames.continue")}>
              <IconButton
                size="small"
                component={RouterLink}
                to={`${row.masked ? "/engine/masked" : "/engine/play"}?saved=${encodeURIComponent(row.id)}`}
                aria-label={t("playedGames.continue")}
                data-testid={`played-games-continue-${row.id}`}
              >
                <PlayArrowRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {row.readable && (
            <Tooltip title={t("playedGames.analyse")}>
              <IconButton
                size="small"
                component={RouterLink}
                to={`/tools/analysis?game=${reference}`}
                aria-label={t("playedGames.analyse")}
                data-testid={`played-games-analysis-${row.id}`}
              >
                <ScienceOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </TableCell>
      {row.readable ? (
        <>
          {/* The names are the old row titles: "Human" and "Stockfish level N", White first. */}
          <TableCell dir="auto" sx={{ whiteSpace: "nowrap" }}>
            {row.white}
          </TableCell>
          <TableCell>{row.whiteElo ?? t("playedGames.table.unknown")}</TableCell>
          <TableCell dir="auto" sx={{ whiteSpace: "nowrap" }}>
            {row.black}
          </TableCell>
          <TableCell>{row.blackElo ?? t("playedGames.table.unknown")}</TableCell>
          {/* PGN's own notation — 1-0, 0-1, 1/2-1/2, * while it is on. */}
          <TableCell dir="ltr" sx={{ whiteSpace: "nowrap" }}>
            {row.result}
          </TableCell>
          <TableCell dir="auto" sx={{ minWidth: 160 }}>
            {row.opening ?? ""}
          </TableCell>
          <TableCell>
            {row.moves}
            {row.variations > 0 && (
              <Typography
                variant="caption"
                component="span"
                sx={{ display: "block", color: "text.secondary" }}
              >
                {t("playedGames.variations", { count: row.variations })}
              </Typography>
            )}
          </TableCell>
          <TableCell>
            {row.masked && (
              <Chip
                size="small"
                variant="outlined"
                icon={<VisibilityOffRoundedIcon />}
                label={t("masking.marker")}
                data-testid={`played-games-masked-${row.id}`}
                sx={{ height: 20 }}
              />
            )}
          </TableCell>
          <TableCell dir="ltr" sx={{ whiteSpace: "nowrap" }}>
            {savedListDate(row.savedAt, i18n.language)}
          </TableCell>
        </>
      ) : (
        // A record whose PGN will not parse: the row says so across the columns,
        // and it can only be picked for deletion — it cannot be opened.
        <TableCell colSpan={PLAYED_GAME_COLUMNS.length} sx={{ color: "text.secondary" }}>
          {t("playedGames.unreadable")}
        </TableCell>
      )}
    </TableRow>
  );
}

function PlayedGames() {
  const { t } = useTranslation();
  const games = usePlayedGames();
  /**
   * The rows ticked for deletion, by id — the screen's, not the URL's: a
   * link carries the filter, not a hand-made selection (the collection
   * table's own rule).
   */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const togglePicked = (id: string) =>
    setPicked((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [searchParams, setSearchParams] = useSearchParams();
  const color = colorFilterOf(searchParams.get("color"));
  const openingParam = searchParams.get("opening");

  // Each record read once per change of the store: whether it parses, and its summary.
  const parsed = useMemo(
    () =>
      (games ?? []).map((saved) => {
        const tree = playedGameToTree(saved);
        return { saved, tree, readable: tree !== undefined, summary: playedGameSummary(saved, tree) };
      }),
    [games],
  );

  const book = useOpeningBook();
  /* The opening each game reached, by id — one walk per game, once the book lands. */
  const openings = useMemo(() => {
    const found = new Map<string, string>();
    if (book === null) return found;
    for (const { saved, tree } of parsed) {
      if (tree === undefined) continue;
      const opening = openingOfLine(
        book.book,
        book.positions,
        mainline(tree).map((node) => node.fen),
      );
      if (opening !== undefined) found.set(saved.id, opening.name);
    }
    return found;
  }, [parsed, book]);
  /* The openings on offer: those the list holds, by name. */
  const openingChoices = useMemo(
    () => [...new Set(openings.values())].sort((a, b) => a.localeCompare(b)),
    [openings],
  );
  // Only once the book has landed: until then the table is not narrowed by opening.
  const opening = book !== null && openingParam !== null ? openingParam : null;

  // The table's own state, in the URL beside the filters: the column it is
  // sorted by and which way (absent is the column's default), the page, and
  // the rows a page holds.
  const requestedSort = searchParams.get("sort");
  const sort: PlayedGameColumn = isColumn(requestedSort) ? requestedSort : DEFAULT_SORT;
  const requestedDirection = searchParams.get("dir");
  const direction: SortDirection =
    requestedDirection === "asc" || requestedDirection === "desc"
      ? requestedDirection
      : defaultDirection(sort);
  const requestedRows = Number(searchParams.get("rows"));
  const rowsPerPage = (ROWS_PER_PAGE as readonly number[]).includes(requestedRows)
    ? requestedRows
    : DEFAULT_ROWS_PER_PAGE;

  /**
   * The table's rows — the summary's derivations with their words on (the
   * names localized, the opening the book named), the filters applied and the
   * URL's sort followed, in one memo because every input is cheap and the
   * store is capped.
   */
  const shown = useMemo(() => {
    const kept = parsed
      .filter(({ summary }) => color === "all" || summary.playAs === color)
      .filter(({ saved }) => opening === null || openings.get(saved.id) === opening);
    return sortedPlayedGames(
      kept.map(({ saved, readable, summary }) => ({
        id: saved.id,
        white:
          summary.whiteName === "human"
            ? t("playedGames.human")
            : t("playedGames.engine", { level: summary.skillLevel }),
        whiteElo: summary.whiteElo,
        black:
          summary.blackName === "human"
            ? t("playedGames.human")
            : t("playedGames.engine", { level: summary.skillLevel }),
        blackElo: summary.blackElo,
        result: summary.result,
        opening: openings.get(saved.id),
        moves: summary.moves,
        variations: summary.variations,
        masked: summary.masked,
        savedAt: saved.savedAt,
        readable,
      })),
      sort,
      direction,
    );
  }, [parsed, openings, color, opening, sort, direction, t]);

  const filtered = color !== "all" || opening !== null;
  const lastPage = Math.max(0, Math.ceil(shown.length / rowsPerPage) - 1);
  const page = Math.min(Math.max(0, Number(searchParams.get("page")) || 0), lastPage);
  const pageRows = shown.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  /**
   * Change the table's URL state (history replace); a new sort or filter
   * starts at the first page. `null` removes whatever the key holds, so the
   * URL keeps only what differs from the default.
   */
  const setState = (patch: Record<string, string | null>, keepPage = false) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete("page");
        return next;
      },
      { replace: true },
    );

  /** A new column opens its own way; a second click turns it. The URL keeps only what is not the default. */
  const sortBy = (column: PlayedGameColumn) => {
    if (column !== sort) {
      setState({ sort: column === DEFAULT_SORT ? null : column, dir: null });
      return;
    }
    const turned: SortDirection = direction === "asc" ? "desc" : "asc";
    setState({ dir: turned === defaultDirection(column) ? null : turned });
  };

  return (
    <>
      <Box
        data-testid="played-games-screen"
        sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          sx={{
            flexShrink: 0,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {t("playedGames.title")}
              </Typography>
              <Typography
                data-testid="played-games-count"
                variant="caption"
                sx={{ display: "block", color: "text.secondary" }}
              >
                {games === undefined
                  ? ""
                  : filtered
                    ? t("playedGames.countFiltered", { shown: shown.length, count: games.length })
                    : t("playedGames.count", { count: games.length })}
              </Typography>
            </Box>
            {/* The picked rows' delete, saying how many are ticked — the
                collection table's own rule: the picks, then one delete. */}
            {picked.size > 0 && (
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineRoundedIcon fontSize="small" />}
                onClick={() => setDeleting(true)}
                data-testid="played-games-delete-picked"
                sx={{ flexShrink: 0 }}
              >
                {t("playedGames.deletePicked", { count: picked.size })}
              </Button>
            )}
          </Box>
          <Box
            data-testid="played-games-filters"
            sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mt: 1.25 }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={color}
              aria-label={t("playedGames.filters.color")}
              data-testid="played-games-filter-color"
              onChange={(_event, next: ColorFilter | null) => {
                if (next !== null) setState({ color: next === "all" ? null : next });
              }}
            >
              <ToggleButton value="all" data-testid="played-games-filter-color-all">
                {t("playedGames.filters.all")}
              </ToggleButton>
              <ToggleButton value="white" data-testid="played-games-filter-color-white">
                {t("playedGames.filters.white")}
              </ToggleButton>
              <ToggleButton value="black" data-testid="played-games-filter-color-black">
                {t("playedGames.filters.black")}
              </ToggleButton>
            </ToggleButtonGroup>
            <TextField
              select
              size="small"
              label={t("playedGames.filters.opening")}
              disabled={book === null}
              value={opening ?? ""}
              onChange={(event) =>
                setState({ opening: event.target.value === "" ? null : event.target.value })
              }
              helperText={book === null ? t("playedGames.filters.openingLoading") : undefined}
              slotProps={{
                htmlInput: { "data-testid": "played-games-filter-opening" },
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              sx={{ minWidth: 220, flex: "1 1 220px", maxWidth: 360 }}
            >
              <MenuItem value="">{t("playedGames.filters.allOpenings")}</MenuItem>
              {/* A choice named in the URL that no game reached is still shown as chosen. */}
              {opening !== null && !openingChoices.includes(opening) && (
                <MenuItem value={opening}>{opening}</MenuItem>
              )}
              {openingChoices.map((name) => (
                <MenuItem key={name} value={name} data-testid="played-games-filter-opening-option">
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>
        {games === undefined ? (
          <Typography data-testid="played-games-loading" sx={{ color: "text.secondary", p: 2 }}>
            {t("playedGames.loading")}
          </Typography>
        ) : (
          <>
            {/* The one region that scrolls, both ways: the columns and the links in a square. */}
            <TableContainer data-testid="played-games-body" sx={{ flex: 1, minHeight: 0 }}>
              <Table size="small" stickyHeader data-testid="played-games-table">
                <TableHead>
                  <TableRow>
                    {/* The picks' checkbox, and the row's Continue / Analysis icon buttons. */}
                    <TableCell padding="checkbox" />
                    <TableCell padding="checkbox" />
                    {PLAYED_GAME_COLUMNS.map((column) => (
                      <TableCell
                        key={column}
                        sortDirection={sort === column ? direction : false}
                        sx={{ whiteSpace: "nowrap", fontWeight: 600 }}
                      >
                        <TableSortLabel
                          active={sort === column}
                          direction={sort === column ? direction : "asc"}
                          onClick={() => sortBy(column)}
                          data-testid={`played-games-sort-${column}`}
                        >
                          {t(`playedGames.table.columns.${column}`)}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.map((row) => (
                    <PlayedGameRow
                      key={row.id}
                      row={row}
                      picked={picked.has(row.id)}
                      onTogglePicked={togglePicked}
                    />
                  ))}
                </TableBody>
              </Table>
              {shown.length === 0 && (
                <Typography
                  data-testid={games.length === 0 ? "played-games-empty" : "played-games-no-match"}
                  variant="body2"
                  sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
                >
                  {t(games.length === 0 ? "playedGames.empty" : "playedGames.noMatch")}
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
              labelRowsPerPage={t("playedGames.table.rowsPerPage")}
              onPageChange={(_event, next) => setState({ page: next === 0 ? null : String(next) }, true)}
              onRowsPerPageChange={(event) =>
                setState({
                  rows: Number(event.target.value) === DEFAULT_ROWS_PER_PAGE ? null : event.target.value,
                })
              }
              data-testid="played-games-pagination"
            />
          </>
        )}
      </Box>

      <RightPanel>
        <NewGameForm />
      </RightPanel>

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        data-testid="played-games-delete-dialog"
      >
        <DialogTitle>{t("playedGames.confirmDelete.title", { count: picked.size })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("playedGames.confirmDelete.body", { count: picked.size })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>{t("playedGames.confirmDelete.cancel")}</Button>
          <Button
            color="error"
            data-testid="played-games-delete-confirm"
            onClick={() => {
              // The rows are gone, so the picks go with them.
              for (const id of picked) void removePlayedGame(id);
              setPicked(new Set());
              setDeleting(false);
            }}
          >
            {t("playedGames.confirmDelete.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default PlayedGames;
