import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { PLAY_REFERENCE_KEY } from "../../../lib/gameReference";
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
import { usePlayedGames } from "./usePlayedGames";

/**
 * **Saved games** (`/engine/games`, CTA-74) — the games of Play with Engine
 * v2, as the store keeps them: **flat and newest first** (the game last
 * played on at the top), no folders. Each row says which side the reader
 * had, the engine's level, the mainline's length, its side lines, how it
 * stands and when it was begun, and offers **Continue** (`?saved=<id>` on
 * `/engine/play` — at the node and on the side it was left), **Analysis**
 * (`?game=play/games/<id>` on the Analysis Board, side lines and all) and a
 * delete that asks first.
 *
 * The old list (`/engine/saved`, "Saved games (old)") keeps the games played
 * before CTA-74; they are not migrated. Colour and opening filters are for a
 * later issue.
 */

/** How a game stands, as a locale key under `playedGames.result`. */
const resultKey = (result: string | undefined): string => {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  if (result === "1/2-1/2") return "draw";
  return "inProgress";
};

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
        t(`playedGames.result.${resultKey(summary.result)}`),
        t("playedGames.level", { level: summary.skillLevel }),
        savedListDate(saved.savedAt, i18n.language),
      ])
    : t("playedGames.unreadable");

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
        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {t(`playedGames.playingAs.${summary.playAs}`)}
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
              to={`/engine/play?saved=${encodeURIComponent(saved.id)}`}
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

  // Each record read once per change of the store: whether it parses, and its caption.
  const rows = useMemo(
    () =>
      games.map((saved) => {
        const tree = playedGameToTree(saved);
        return { saved, readable: tree !== undefined, summary: playedGameSummary(saved, tree) };
      }),
    [games],
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
            {t("playedGames.count", { count: games.length })}
          </Typography>
        </Box>
        {/* The one region that scrolls: the shell scrolls nothing in the square. */}
        <Box
          data-testid="played-games-body"
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          {games.length === 0 ? (
            <Typography
              data-testid="played-games-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("playedGames.empty")}
            </Typography>
          ) : (
            <List disablePadding>
              {rows.map((row) => (
                <PlayedGameRow key={row.saved.id} {...row} onDelete={setDeleting} />
              ))}
            </List>
          )}
        </Box>
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary", display: "grid", gap: 1 }}>
          <Typography variant="body2">{t("playedGames.hint")}</Typography>
          <Typography variant="body2" data-testid="played-games-storage-note">
            {t("playedGames.storage")}
          </Typography>
          <Typography variant="body2">
            <RouterLink to="/engine/saved" data-testid="played-games-old-link">
              {t("playedGames.old")}
            </RouterLink>
          </Typography>
        </Box>
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
              if (deleting !== null) removePlayedGame(deleting);
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
