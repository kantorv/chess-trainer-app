import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import ArticleRounded from "@mui/icons-material/ArticleRounded";
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import {
  ENGINE_REFERENCE_KEY,
  gameReferenceOf,
} from "../../../lib/gameReference";
import { finalFenOf, type Game } from "../../../lib/gameModel";
import type { LibraryGame } from "../../../lib/libraryCatalog";
import type { OpeningEntry } from "../../../lib/openings";
import { removeSavedGame } from "../../../lib/savedGameStore";
import { savedGameSummary, type SavedGame } from "../../../lib/savedGames";
import SavedListRemoveButton from "../../shared/SavedListRemoveButton";
import { savedListDate, savedListLine } from "../../shared/savedList";

/**
 * The Saved games screen's game row and card — one game in the two views,
 * split out of `SavedGames.tsx` beside the folder views for the same reason
 * the openings' [`SavedOpeningViews.tsx`](../../../tools/openings/saved/SavedOpeningViews.tsx)
 * is split out of theirs: the wiring file is the state and the CRUD, and the
 * pixels are these.
 */

/**
 * A card's preview board. Read-only, and showing the position the game was left
 * at — see `SavedGames.tsx` on why that is not `libraryItemFen`. Each board
 * takes the game's own id, since `options.id` has to be unique across the page
 * and this screen shows many at once.
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

export type EntryProps = {
  saved: SavedGame;
  /** The catalog's parse of it, or `undefined` for a record that will not read. */
  item: LibraryGame | undefined;
};

export type CardProps = EntryProps & {
  /** What the game opened with, once the book has loaded and if it names one. */
  opening: OpeningEntry | undefined;
};

/**
 * The two lines that identify a game in either view: which side the reader had,
 * and then how long it is, how it stands, at what strength and when.
 *
 * A hook rather than a pure helper because every part of it is translated, and
 * not exported beyond this file because both callers are here — the `when`
 * formatting and the join are the shared `savedList.ts` helpers rather than a
 * second copy of them.
 */
const useCaption = ({ saved, item }: EntryProps) => {
  const { t, i18n } = useTranslation();
  const summary = savedGameSummary(saved, item?.game);

  const when = savedListDate(saved.updatedAt, i18n.language);

  return {
    primary: t(`savedGames.playingAs.${summary.playAs}`),
    secondary:
      item === undefined
        ? t("savedGames.unreadable")
        : savedListLine([
            t("savedGames.moves", { count: summary.moves }),
            t(`savedGames.result.${resultKey(summary.result)}`),
            t("savedGames.level", { level: summary.skillLevel }),
            when,
          ]),
  };
};

/** How a game stands, as a locale key under `savedGames.result`. */
const resultKey = (result: string | undefined): string => {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  if (result === "1/2-1/2") return "draw";
  return "inProgress";
};

/**
 * The move control — filing one game into a folder (CTA-46). An IconButton,
 * because it sits beside the two other icon controls a card carries, and it is
 * **not** gated on the game being readable: filing is organisation, and a
 * record whose PGN no longer parses is still the reader's to file.
 */
function MoveButton({ saved, onMove }: { saved: SavedGame; onMove: (saved: SavedGame) => void }) {
  const { t } = useTranslation();

  return (
    <Tooltip title={t("savedGames.folder.moveGame")}>
      <IconButton
        size="small"
        aria-label={t("savedGames.folder.moveGame")}
        data-testid={`saved-games-move-${saved.id}`}
        onClick={() => onMove(saved)}
      >
        <DriveFileMoveRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

type RowProps = EntryProps & {
  /** Whether this row is picked for export. */
  checked: boolean;
  onToggle: () => void;
  onMove: (saved: SavedGame) => void;
};

export function SavedGameRow({ saved, item, checked, onToggle, onMove }: RowProps) {
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
        <MoveButton saved={saved} onMove={onMove} />
        <SavedListRemoveButton
          id={saved.id}
          onRemove={removeSavedGame}
          labelKey="savedGames"
          testIdPrefix="saved-games"
        />
        {/* Last in the row, as it is on the sites a reader will have exported
            a game from — and selectable even for a record that will not parse,
            since the export copies the stored PGN rather than re-writing it. */}
        <Checkbox
          size="small"
          checked={checked}
          onChange={onToggle}
          slotProps={{ input: { "aria-label": t("savedGames.select") } }}
          data-testid={`saved-games-select-${saved.id}`}
        />
      </Box>
    </ListItem>
  );
}

export function SavedGameCard({ saved, item, opening, onMove }: CardProps & { onMove: (saved: SavedGame) => void }) {
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
          {/* Filing (CTA-46), not gated on the game being readable — see
              MoveButton. Beside the two other icons, before the delete. */}
          <MoveButton saved={saved} onMove={onMove} />
          <Box sx={{ marginInlineStart: "auto" }}>
            <SavedListRemoveButton
              id={saved.id}
              onRemove={removeSavedGame}
              labelKey="savedGames"
              testIdPrefix="saved-games"
            />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
