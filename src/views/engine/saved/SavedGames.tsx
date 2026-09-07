import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import ArticleRounded from "@mui/icons-material/ArticleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ViewComfyRounded from "@mui/icons-material/ViewComfyRounded";
import ViewListRounded from "@mui/icons-material/ViewListRounded";
import ViewModuleRounded from "@mui/icons-material/ViewModuleRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import {
  ENGINE_REFERENCE_KEY,
  gameReferenceOf,
} from "../../../lib/gameReference";
import { finalFenOf, type Game } from "../../../lib/gameModel";
import type { LibraryGame } from "../../../lib/libraryCatalog";
import {
  getPositionBook,
  loadOpeningBook,
  openingOfLine,
  type OpeningBook,
  type OpeningEntry,
  type PositionBook,
} from "../../../lib/openings";
import { savedGameSummary, type SavedGame } from "../../../lib/savedGames";
import {
  removeSavedGame,
  savedGamesCatalog,
} from "../../../lib/savedGameStore";
import { RightPanel } from "../../main/rightPanel";
import { cardSizeTrack, type CardSize } from "../../library/cardSize";
import { useSavedGames } from "./useSavedGames";

/**
 * **Saved games** — every game the reader has played against the engine, newest
 * first, each with somewhere to take it.
 *
 * It sits in the Engine folder beside Play with Engine, because these are that
 * screen's games: nothing was uploaded, imported or shipped, and there is no
 * catalog to browse. Play with Engine writes a row on every move
 * (`usePlayWithEngine`), so this screen has nothing to save and no form — it is
 * a list of games and three destinations.
 *
 * ### Two ways to look at the same list
 *
 * A row says what a game *is*; a board says what it *looks like*, and for a game
 * you are coming back to that is often the faster way to recognise it. So the
 * top bar carries a three-way toggle — the list, small boards, big boards — and
 * the two board settings are the library list screen's own two, through
 * [`cardSize.ts`](../../library/cardSize.ts) rather than a second copy of the
 * grid track. The list stays the default: it is what the screen shipped with, so
 * a reader is left with exactly what they had and the boards are something
 * offered.
 *
 * **A saved game's card previews the position it was left at**, not the one it
 * started from — which is where it deliberately parts company with
 * `LibraryList`, whose cards preview a game's *first* position because that is
 * where a replay begins. A saved game is not a game to replay from move one; it
 * is one to pick back up, so the board shows what the reader will be looking at
 * a click later. `libraryItemFen` is therefore not what this screen reads.
 *
 * ### Where a row can go, and why those three
 *
 * | Destination | Carries | Because |
 * | --- | --- | --- |
 * | Play with Engine | `?saved=<id>` | it is the only screen that can *play on*, and the id is what restores the side and the settings as well as the moves |
 * | Analysis Board, Load PGN | `?game=engine/saved/<id>` | they replay a game, so the game has to cross — and it crosses as the reference the two of them already take |
 *
 * The second is the section-agnostic hand-off (`lib/gameReference.ts`) and not a
 * transport of this screen's own: the saved games are presented to it as a
 * catalog, so neither destination learns that a game can come from here. The
 * first is `?saved=` rather than `?game=` for the one thing that reference
 * cannot carry — a `LibraryGame` is moves, and resuming needs the engine
 * settings too.
 *
 * Continuing is the **primary** action in both views: in the list it is the one
 * filled button, and on a card it is the board itself. The other two are text
 * buttons beside it in the list and icon buttons in the card's footer, because a
 * 160px card has no room for three words — and they sit *outside* the card's
 * action area, since a button inside a button is neither valid nor clickable.
 *
 * ### A row the store has and the catalog does not
 *
 * The list is built from the **store**, not from the catalog: a record whose PGN
 * will not parse is absent from the catalog, and building the list from that
 * would leave the reader with a row they can neither open nor delete because it
 * is not rendered at all. So such a row is listed, says so, and offers the one
 * action that still means something. It has no board either — there is no
 * position to draw — so in the board view it is a card with the message in it.
 */

/** The list, or one of the two board sizes. */
type SavedGamesView = "list" | CardSize;

/** What the screen opens on — what it shipped with, so nothing is taken away. */
const DEFAULT_VIEW: SavedGamesView = "list";

/** How a game stands, as a locale key under `savedGames.result`. */
const resultKey = (result: string | undefined): string => {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  if (result === "1/2-1/2") return "draw";
  return "inProgress";
};

/**
 * A card's preview board. Read-only, and showing the position the game was left
 * at — see the note above on why that is not `libraryItemFen`. Each board takes
 * the game's own id, since `options.id` has to be unique across the page and
 * this screen shows many at once.
 */
const previewOptions = (id: string, game: Game): ChessboardOptions => ({
  id: `saved-games-preview-${id}`,
  position: finalFenOf(game),
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

/** The three links a readable game offers, or `undefined` when it is not one. */
const destinationsOf = (saved: SavedGame, item: LibraryGame | undefined) => {
  if (item === undefined) return undefined;
  const reference = encodeURIComponent(gameReferenceOf(ENGINE_REFERENCE_KEY, item));
  return {
    resume: `/engine/play?saved=${encodeURIComponent(saved.id)}`,
    analysis: `/tools/analysis?game=${reference}`,
    loadPgn: `/games/load-pgn?game=${reference}`,
  };
};

type EntryProps = {
  saved: SavedGame;
  /** The catalog's parse of it, or `undefined` for a record that will not read. */
  item: LibraryGame | undefined;
};

type CardProps = EntryProps & {
  /** What the game opened with, once the book has loaded and if it names one. */
  opening: OpeningEntry | undefined;
};

/**
 * The two lines that identify a game in either view: which side the reader had,
 * and then how long it is, how it stands, at what strength and when.
 *
 * A hook rather than a pure helper because every part of it is translated, and
 * not exported because both callers are in this file — a non-component export
 * from a `.tsx` costs fast refresh, which is why `cardSize.ts` is its own module
 * and this is not.
 */
const useCaption = ({ saved, item }: EntryProps) => {
  const { t, i18n } = useTranslation();
  const summary = savedGameSummary(saved, item?.game);

  /*
    The reader's own clock and their own language: `updatedAt` is stored as ISO
    so the record stays plain JSON, and it is a date rather than notation, so it
    is the one thing here formatted for the reader rather than written the way
    PGN writes it.
  */
  const played = new Date(saved.updatedAt);
  const when = Number.isNaN(played.valueOf())
    ? ""
    : played.toLocaleDateString(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  return {
    primary: t(`savedGames.playingAs.${summary.playAs}`),
    secondary:
      item === undefined
        ? t("savedGames.unreadable")
        : [
            t("savedGames.moves", { count: summary.moves }),
            t(`savedGames.result.${resultKey(summary.result)}`),
            t("savedGames.level", { level: summary.skillLevel }),
            when,
          ]
            .filter((part) => part !== "")
            .join(" · "),
  };
};

/** The delete control, identical in both views. */
function RemoveButton({ id }: { id: string }) {
  const { t } = useTranslation();

  return (
    <IconButton
      size="small"
      aria-label={t("savedGames.remove")}
      data-testid={`saved-games-remove-${id}`}
      onClick={() => removeSavedGame(id)}
    >
      <DeleteOutlineRoundedIcon fontSize="small" />
    </IconButton>
  );
}

function SavedGameRow({ saved, item }: EntryProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption({ saved, item });
  const to = destinationsOf(saved, item);

  return (
    <ListItem
      disableGutters
      data-testid={`saved-games-item-${saved.id}`}
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
        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {primary}
        </Typography>
        <Typography
          variant="caption"
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
        {to !== undefined && (
          <>
            <Button
              component={RouterLink}
              to={to.resume}
              size="small"
              variant="contained"
              data-testid={`saved-games-continue-${saved.id}`}
            >
              {t("savedGames.continue")}
            </Button>
            <Button
              component={RouterLink}
              to={to.analysis}
              size="small"
              variant="outlined"
              data-testid={`saved-games-analysis-${saved.id}`}
            >
              {t("savedGames.analyse")}
            </Button>
            <Button
              component={RouterLink}
              to={to.loadPgn}
              size="small"
              variant="outlined"
              data-testid={`saved-games-loadpgn-${saved.id}`}
            >
              {t("savedGames.openInLoadPgn")}
            </Button>
          </>
        )}
        <RemoveButton id={saved.id} />
      </Box>
    </ListItem>
  );
}

function SavedGameCard({ saved, item, opening }: CardProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption({ saved, item });
  const to = destinationsOf(saved, item);

  return (
    <Card variant="outlined" data-testid={`saved-games-item-${saved.id}`}>
      {/* The board *is* the continue button — the primary action, and the one
          thing on the card big enough to be worth clicking. A record with no
          readable game has no position to draw, so it gets the message in the
          same square instead. */}
      {to === undefined || item === undefined ? (
        <Box
          sx={{
            m: 1,
            aspectRatio: "1 / 1",
            display: "grid",
            placeItems: "center",
            p: 1,
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", textAlign: "center" }}
          >
            {t("savedGames.unreadable")}
          </Typography>
        </Box>
      ) : (
        <CardActionArea
          component={RouterLink}
          to={to.resume}
          data-testid={`saved-games-continue-${saved.id}`}
          aria-label={t("savedGames.continue")}
        >
          <Box sx={{ p: 1 }}>
            <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
              <Chessboard options={previewOptions(saved.id, item.game)} />
            </Box>
          </Box>
        </CardActionArea>
      )}

      {/* Outside the action area on purpose: a button inside a button is
          neither valid HTML nor reliably clickable. */}
      <Box sx={{ px: 1, pb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            fontWeight: 600,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {primary}
        </Typography>
        <Typography
          variant="caption"
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
        {/* The opening gets its own line, as it does on a User PGNs card: the
            line above is already four facts wide, and this is the one a reader
            recognises a game by. Absent until the book has loaded, and for a
            line it does not name — an unrecognised position is a fact about
            chess, not an empty row to render. */}
        {opening !== undefined && (
          <Typography
            variant="caption"
            dir="ltr"
            data-testid={`saved-games-opening-${saved.id}`}
            sx={{
              display: "block",
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`${opening.name} · ${opening.eco}`}
          </Typography>
        )}

        <Box sx={{ display: "flex", alignItems: "center", mt: 0.5, ml: -0.5 }}>
          {to !== undefined && (
            <>
              <Tooltip title={t("savedGames.analyse")}>
                <IconButton
                  component={RouterLink}
                  to={to.analysis}
                  size="small"
                  aria-label={t("savedGames.analyse")}
                  data-testid={`saved-games-analysis-${saved.id}`}
                >
                  <AccountTreeRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("savedGames.openInLoadPgn")}>
                <IconButton
                  component={RouterLink}
                  to={to.loadPgn}
                  size="small"
                  aria-label={t("savedGames.openInLoadPgn")}
                  data-testid={`saved-games-loadpgn-${saved.id}`}
                >
                  <ArticleRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Box sx={{ marginInlineStart: "auto" }}>
            <RemoveButton id={saved.id} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

function SavedGames() {
  const { t } = useTranslation();

  const [view, setView] = useState<SavedGamesView>(DEFAULT_VIEW);

  const games = useSavedGames();
  /*
    Read after the subscription above, and memoised on the same snapshot the
    hook returned — so the parsed games are rebuilt when a game is saved or
    removed and at no other time. The list itself is the *store's* order, which
    is newest first.
  */
  const catalog = savedGamesCatalog();
  const itemById = new Map(
    catalog.items
      .filter((item): item is LibraryGame => item.kind === "game")
      .map((item) => [item.id, item]),
  );

  const entries = games.map((saved) => ({
    saved,
    item: itemById.get(saved.id),
  }));

  /*
    The opening book, for the line under each card. Loaded lazily and shared:
    `loadOpeningBook` caches its promise, so a reader who has already opened a
    game screen pays nothing here, and one who never opens this screen never
    downloads it. Until it resolves the cards simply carry no opening line —
    where `CurrentOpening` says "loading", because there it is the whole point
    of the line and here it is a fourth fact on a card.
  */
  const [book, setBook] = useState<{
    book: OpeningBook;
    positions: PositionBook;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOpeningBook().then((loaded) => {
      if (!cancelled) setBook({ book: loaded, positions: getPositionBook(loaded) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
    One walk per game, memoised on the snapshot and the book — both stable
    between changes, so fifty games are looked up once rather than on every
    render, every toggle of the view and every keystroke anywhere in the shell.
  */
  const openings = useMemo(() => {
    const found = new Map<string, OpeningEntry>();
    if (book === null) return found;

    for (const { saved, item } of entries) {
      if (item === undefined) continue;
      const opening = openingOfLine(
        book.book,
        book.positions,
        item.game.moves.map((move) => move.fen),
      );
      if (opening !== undefined) found.set(saved.id, opening);
    }
    return found;
    // `entries` is derived from `games`, which is the store's stable snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, catalog, book]);

  return (
    <>
      <Box
        data-testid="saved-games-screen"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          data-testid="saved-games-top-bar"
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ minWidth: 0, marginInlineEnd: "auto" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {t("savedGames.title")}
            </Typography>
            <Typography
              data-testid="saved-games-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("savedGames.count", { count: games.length })}
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            // `null` when the pressed button is the one already selected: the
            // screen has to be showing *something*, so that is a no-op.
            onChange={(_event, next: SavedGamesView | null) =>
              next !== null && setView(next)
            }
            aria-label={t("savedGames.view.label")}
            sx={{ flexShrink: 0 }}
          >
            <ToggleButton
              value="list"
              data-testid="saved-games-view-list"
              aria-label={t("savedGames.view.list")}
            >
              <Tooltip title={t("savedGames.view.list")}>
                <ViewListRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton
              value="compact"
              data-testid="saved-games-view-compact"
              aria-label={t("savedGames.view.compact")}
            >
              <Tooltip title={t("savedGames.view.compact")}>
                <ViewComfyRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton
              value="comfortable"
              data-testid="saved-games-view-comfortable"
              aria-label={t("savedGames.view.comfortable")}
            >
              <Tooltip title={t("savedGames.view.comfortable")}>
                <ViewModuleRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/*
          The one region that scrolls. The shell hands this screen a fixed-height
          box and scrolls nothing inside it, so whichever view is showing has to
          do it itself — the same flex column every screen filling the board
          square uses.
        */}
        {games.length === 0 ? (
          <Box
            data-testid="saved-games-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid="saved-games-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("savedGames.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-games-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {entries.map((entry) => (
                <SavedGameRow key={entry.saved.id} {...entry} />
              ))}
            </List>
          </Box>
        ) : (
          <Box
            data-testid="saved-games-grid"
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              display: "grid",
              gridTemplateColumns: cardSizeTrack(view),
              /*
                **This is the line that makes it scroll** — the same trap
                `LibraryList` documents: an `auto` row inside a grid whose own
                height is definite is stretched to share that height out, so the
                cards would be squashed and clipped and there would be no
                overflow to scroll. Sized by their content, the rows overflow.
              */
              gridAutoRows: "max-content",
              gap: 2,
              alignContent: "start",
              pt: 1.5,
            }}
          >
            {entries.map((entry) => (
              <SavedGameCard
                key={entry.saved.id}
                {...entry}
                opening={openings.get(entry.saved.id)}
              />
            ))}
          </Box>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("savedGames.hint")}
          </Typography>
          <Typography variant="body2" data-testid="saved-games-storage-note">
            {t("savedGames.storage")}
          </Typography>
        </Box>
      </RightPanel>
    </>
  );
}

export default SavedGames;
