import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import {
  ENGINE_REFERENCE_KEY,
  gameReferenceOf,
} from "../../../lib/gameReference";
import type { LibraryGame } from "../../../lib/libraryCatalog";
import { savedGameSummary, type SavedGame } from "../../../lib/savedGames";
import {
  removeSavedGame,
  savedGamesCatalog,
} from "../../../lib/savedGameStore";
import { RightPanel } from "../../main/rightPanel";
import { useSavedGames } from "./useSavedGames";

/**
 * **Saved games** — every game the reader has played against the engine, newest
 * first, each with somewhere to take it.
 *
 * It sits in the Engine folder beside Play with Engine, because these are that
 * screen's games: nothing was uploaded, imported or shipped, and there is no
 * catalog to browse. Play with Engine writes a row on every move
 * (`usePlayWithEngine`), so this screen has nothing to save and no form — it is
 * a list and three destinations.
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
 * ### A row the store has and the catalog does not
 *
 * The list is built from the **store**, not from the catalog: a record whose PGN
 * will not parse is absent from the catalog, and building the list from that
 * would leave the reader with a row they can neither open nor delete because it
 * is not rendered at all. So such a row is listed, says so, and offers the one
 * action that still means something.
 */

/** How a game stands, as a locale key under `savedGames.result`. */
const resultKey = (result: string | undefined): string => {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  if (result === "1/2-1/2") return "draw";
  return "inProgress";
};

type RowProps = {
  saved: SavedGame;
  /** The catalog's parse of it, or `undefined` for a record that will not read. */
  item: LibraryGame | undefined;
};

function SavedGameRow({ saved, item }: RowProps) {
  const { t, i18n } = useTranslation();

  const summary = savedGameSummary(saved, item?.game);
  const reference = item && gameReferenceOf(ENGINE_REFERENCE_KEY, item);

  /*
    The reader's own clock and their own language: `updatedAt` is stored as ISO
    so the record stays plain JSON, and it is a date rather than notation, so it
    is the one thing on the row that is formatted for the reader rather than
    written the way PGN writes it.
  */
  const played = new Date(saved.updatedAt);
  const when = Number.isNaN(played.valueOf())
    ? ""
    : played.toLocaleDateString(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  const secondary =
    item === undefined
      ? t("savedGames.unreadable")
      : [
          t("savedGames.moves", { count: summary.moves }),
          t(`savedGames.result.${resultKey(summary.result)}`),
          t("savedGames.level", { level: summary.skillLevel }),
          when,
        ]
          .filter((part) => part !== "")
          .join(" · ");

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
          {t(`savedGames.playingAs.${summary.playAs}`)}
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
        {reference !== undefined && (
          <>
            <Button
              component={RouterLink}
              to={`/engine/play?saved=${encodeURIComponent(saved.id)}`}
              size="small"
              variant="contained"
              data-testid={`saved-games-continue-${saved.id}`}
            >
              {t("savedGames.continue")}
            </Button>
            <Button
              component={RouterLink}
              to={`/tools/analysis?game=${encodeURIComponent(reference)}`}
              size="small"
              variant="outlined"
              data-testid={`saved-games-analysis-${saved.id}`}
            >
              {t("savedGames.analyse")}
            </Button>
            <Button
              component={RouterLink}
              to={`/games/load-pgn?game=${encodeURIComponent(reference)}`}
              size="small"
              variant="outlined"
              data-testid={`saved-games-loadpgn-${saved.id}`}
            >
              {t("savedGames.openInLoadPgn")}
            </Button>
          </>
        )}
        <IconButton
          size="small"
          aria-label={t("savedGames.remove")}
          data-testid={`saved-games-remove-${saved.id}`}
          onClick={() => removeSavedGame(saved.id)}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Box>
    </ListItem>
  );
}

function SavedGames() {
  const { t } = useTranslation();

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
          sx={{
            flexShrink: 0,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
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

        {/*
          The one region that scrolls. The shell hands this screen a fixed-height
          box and scrolls nothing inside it, so the list has to do it itself —
          the same flex column every screen that fills the board square uses.
        */}
        <Box
          data-testid="saved-games-body"
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          {games.length === 0 ? (
            <Typography
              data-testid="saved-games-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("savedGames.empty")}
            </Typography>
          ) : (
            <List disablePadding>
              {games.map((saved) => (
                <SavedGameRow
                  key={saved.id}
                  saved={saved}
                  item={itemById.get(saved.id)}
                />
              ))}
            </List>
          )}
        </Box>
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
