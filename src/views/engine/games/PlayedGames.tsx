import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { Link as RouterLink, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { PLAY_REFERENCE_KEY } from "../../../lib/gameReference";
import { mainline } from "../../../lib/gameTree";
import { openingOfLine } from "../../../lib/openings";
import { removePlayedGame } from "../../../lib/playedGameStore";
import {
  PLAYED_GAMES_PATH,
  playedGameSummary,
  playedGameToTree,
  type PlayedGame,
  type PlayedGameSummary,
} from "../../../lib/playedGames";
import { RightPanel } from "../../main/rightPanel";
import SavedListRemoveButton from "../../shared/SavedListRemoveButton";
import { savedListDate, savedListLine } from "../../shared/savedList";
import { useOpeningBook } from "../../shared/useOpeningBook";
import NewGameForm from "./NewGameForm";
import { usePlayedGames } from "./usePlayedGames";

/**
 * **The Lobby** (`/engine/games`; the Saved games list of CTA-74, a lobby
 * since CTA-82) — the board square holds the games, the right-hand panel the
 * new-game form (`NewGameForm.tsx`), whose Start button is how Play with
 * Engine is reached.
 *
 * The list is the games of Play with Engine
 * and, since CTA-79, of Masked Pieces, as the store keeps them: **flat and newest first** (the game last
 * played on at the top), no folders. Each row is titled by its pairing,
 * White first ("Human - Stockfish level 10"), and says the mainline's length,
 * its side lines, the result as PGN writes it (`1-0`, `0-1`, `1/2-1/2`, `*`)
 * and when it was begun, and offers **Continue** (`?saved=<id>` on
 * `/engine/play` — at the node and on the side it was left — or, for a game
 * marked **Masked**, on `/engine/masked`, in the same disguise), **Analysis**
 * (`?game=play/games/<id>` on the Analysis Board, side lines and all — a
 * masked game unmasked, since its PGN is the true game) and a delete that
 * asks first.
 *
 * **Filters** (CTA-82), combined, in the URL (`?color=white|black`,
 * `?opening=<name>`, history replace): the side the reader played
 * (`settings.playAs`), and the opening each game reached — the deepest one
 * eco.json names along its mainline (`openingOfLine`), offered from the
 * openings the list holds. The ~3MB book loads lazily (`useOpeningBook`); until
 * it lands the opening filter is off and the list is not narrowed by it.
 * Masked games are filtered like any other.
 */

type ColorFilter = "all" | "white" | "black";

const colorFilterOf = (value: string | null): ColorFilter =>
  value === "white" || value === "black" ? value : "all";

function PlayedGameRow({
  saved,
  summary,
  readable,
  onDelete,
}: {
  saved: PlayedGame;
  summary: PlayedGameSummary;
  readable: boolean;
  onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  // The `?game=` reference `lib/gameReference.ts` resolves against the store's catalog.
  const reference = encodeURIComponent(`${PLAY_REFERENCE_KEY}/${PLAYED_GAMES_PATH}/${saved.id}`);
  const secondary = readable
    ? savedListLine([
        t("playedGames.moves", { count: summary.moves }),
        summary.variations > 0 ? t("playedGames.variations", { count: summary.variations }) : "",
        // PGN's own notation — 1-0, 0-1, 1/2-1/2, * while it is on.
        summary.result,
        savedListDate(saved.savedAt, i18n.language),
      ])
    : t("playedGames.unreadable");
  // The row's title is the game's pairing, White first.
  const human = t("playedGames.human");
  const engine = t("playedGames.engine", { level: summary.skillLevel });

  return (
    <ListItem
      disableGutters
      data-testid={`played-games-item-${saved.id}`}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1.5,
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 12rem" }}>
        <Typography
          variant="subtitle2"
          data-testid={`played-games-title-${saved.id}`}
          sx={{ fontWeight: 600, lineHeight: 1.3 }}
        >
          {t("playedGames.players", {
            white: summary.playAs === "white" ? human : engine,
            black: summary.playAs === "white" ? engine : human,
          })}
          {summary.masked && (
            <Chip
              size="small"
              variant="outlined"
              icon={<VisibilityOffRoundedIcon />}
              label={t("masking.marker")}
              data-testid={`played-games-masked-${saved.id}`}
              sx={{ marginInlineStart: 1, height: 20, verticalAlign: "middle" }}
            />
          )}
        </Typography>
        <Typography
          variant="caption"
          data-testid={`played-games-caption-${saved.id}`}
          sx={{
            display: "block",
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {secondary}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        {readable && (
          <>
            <Button
              component={RouterLink}
              to={`${summary.masked ? "/engine/masked" : "/engine/play"}?saved=${encodeURIComponent(saved.id)}`}
              size="small"
              variant="contained"
              data-testid={`played-games-continue-${saved.id}`}
            >
              {t("playedGames.continue")}
            </Button>
            <Button
              component={RouterLink}
              to={`/tools/analysis?game=${reference}`}
              size="small"
              variant="outlined"
              data-testid={`played-games-analysis-${saved.id}`}
            >
              {t("playedGames.analyse")}
            </Button>
          </>
        )}
        <SavedListRemoveButton
          id={saved.id}
          onRemove={onDelete}
          labelKey="playedGames"
          testIdPrefix="played-games"
        />
      </Box>
    </ListItem>
  );
}

function PlayedGames() {
  const { t } = useTranslation();
  const games = usePlayedGames();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const color = colorFilterOf(searchParams.get("color"));
  const openingParam = searchParams.get("opening");

  // Each record read once per change of the store: whether it parses, and its caption.
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
  // Only once the book has landed: until then the list is not narrowed by opening.
  const opening = book !== null && openingParam !== null ? openingParam : null;

  const rows = parsed.filter(
    ({ saved, summary }) =>
      (color === "all" || summary.playAs === color) &&
      (opening === null || openings.get(saved.id) === opening),
  );
  const filtered = color !== "all" || opening !== null;

  /** A filter written to the URL (history replace); `null` clears it. */
  const setFilter = (name: "color" | "opening", value: string | null) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );

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
                ? t("playedGames.countFiltered", { shown: rows.length, count: games.length })
                : t("playedGames.count", { count: games.length })}
          </Typography>
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
                if (next !== null) setFilter("color", next === "all" ? null : next);
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
              onChange={(event) => setFilter("opening", event.target.value === "" ? null : event.target.value)}
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
        {/* The one region that scrolls: the shell scrolls nothing in the square. */}
        <Box
          data-testid="played-games-body"
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          {games === undefined ? (
            <Typography data-testid="played-games-loading" sx={{ color: "text.secondary", p: 2 }}>
              {t("playedGames.loading")}
            </Typography>
          ) : games.length === 0 ? (
            <Typography
              data-testid="played-games-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("playedGames.empty")}
            </Typography>
          ) : rows.length === 0 ? (
            <Typography
              data-testid="played-games-no-match"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("playedGames.noMatch")}
            </Typography>
          ) : (
            <List disablePadding>
              {rows.map(({ saved, readable, summary }) => (
                <PlayedGameRow
                  key={saved.id}
                  saved={saved}
                  readable={readable}
                  summary={summary}
                  onDelete={setDeleting}
                />
              ))}
            </List>
          )}
        </Box>
      </Box>

      <RightPanel>
        <NewGameForm />
      </RightPanel>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        data-testid="played-games-delete-dialog"
      >
        <DialogTitle>{t("playedGames.confirmDelete.title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("playedGames.confirmDelete.body")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t("playedGames.confirmDelete.cancel")}</Button>
          <Button
            color="error"
            data-testid="played-games-delete-confirm"
            onClick={() => {
              if (deleting !== null) void removePlayedGame(deleting);
              setDeleting(null);
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
