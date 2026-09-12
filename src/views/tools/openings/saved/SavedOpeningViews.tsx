import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SportsEsportsRounded from "@mui/icons-material/SportsEsportsRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import type { GameTree } from "../../../../lib/gameTree";
import type { OpeningEntry } from "../../../../lib/openings";
import {
  savedOpeningFen,
  savedOpeningSummary,
  type SavedOpening,
} from "../../../../lib/savedOpenings";
import { removeSavedOpening } from "../../../../lib/savedOpeningStore";
import SavedListRemoveButton from "../../../shared/SavedListRemoveButton";
import { savedListDate, savedListLine } from "../../../shared/savedList";

/**
 * The Saved openings screen's opening row and card — one record in the two
 * views, split out of `SavedOpenings.tsx` so the screen is the state and the
 * wiring and this file is the pixels. The caption hook, the preview board and
 * the destinations are private to it: both views of the one record read the
 * same ones, and no other screen does.
 *
 * The delete control is the shared `SavedListRemoveButton` — its label and id
 * pattern are this screen's, through the props that one takes.
 */

/**
 * A card's preview board. Read-only, and showing the end of the mainline — where
 * "play from here" would start. Each board takes the opening's own id, since
 * `options.id` has to be unique across the page and this screen shows many at
 * once.
 */
const previewOptions = (
  saved: SavedOpening,
  tree: GameTree,
): ChessboardOptions => ({
  id: `saved-openings-preview-${saved.id}`,
  position: savedOpeningFen(saved, tree),
  boardOrientation: saved.orientation,
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

/** The two links a readable opening offers, or `undefined` when it is not one. */
const destinationsOf = (saved: SavedOpening, tree: GameTree | undefined) => {
  if (tree === undefined) return undefined;
  return {
    resume: `/openings?openings=${encodeURIComponent(saved.id)}`,
    play: `/engine/play?fen=${encodeURIComponent(savedOpeningFen(saved, tree))}`,
  };
};

type EntryProps = {
  saved: SavedOpening;
  /** The record's PGN as a tree, or `undefined` for one that will not read. */
  tree: GameTree | undefined;
};

type CardProps = EntryProps & {
  /** What the mainline opened with, once the book has loaded and if it names one. */
  opening: OpeningEntry | undefined;
};

/**
 * The two lines that identify an opening in either view: the note, and then how
 * big it is and when it was last touched.
 *
 * A hook rather than a pure helper because every part of it is translated, and
 * not exported because both callers are in this file — a non-component export
 * from a `.tsx` costs fast refresh. The `when` formatting and the join are the
 * shared `savedList.ts` helpers rather than a second copy of them.
 */
const useCaption = ({ saved, tree }: EntryProps) => {
  const { t, i18n } = useTranslation();
  const summary = savedOpeningSummary(saved, tree);

  const when = savedListDate(saved.updatedAt, i18n.language);

  return {
    // The note is the name; an empty one falls back to the translated generic.
    primary: saved.note === "" ? t("savedOpenings.untitled") : saved.note,
    secondary:
      tree === undefined
        ? t("savedOpenings.unreadable")
        : savedListLine([
            t("savedOpenings.moves", { count: summary.moves }),
            // Every node past the mainline is a move the reader tried and kept.
            // Zero of them is not a fact worth a slot on a two-line card.
            summary.nodes > summary.moves
              ? t("savedOpenings.variations", {
                  count: summary.nodes - summary.moves,
                })
              : "",
            when,
          ]),
  };
};

/** The edit-note control, identical in both views — opens the shared dialog. */
function EditNoteButton({
  id,
  onEdit,
}: {
  id: string;
  onEdit: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip title={t("savedOpenings.note.edit")}>
      <IconButton
        size="small"
        aria-label={t("savedOpenings.note.edit")}
        data-testid={`saved-openings-edit-${id}`}
        onClick={() => onEdit(id)}
      >
        <EditRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

type RowProps = EntryProps & {
  onEdit: (id: string) => void;
  /** Whether this row is picked for export. */
  checked: boolean;
  onToggle: () => void;
};

export function SavedOpeningRow({
  saved,
  tree,
  onEdit,
  checked,
  onToggle,
}: RowProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption({ saved, tree });
  const to = destinationsOf(saved, tree);

  return (
    <ListItem
      disableGutters
      data-testid={`saved-openings-item-${saved.id}`}
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
              data-testid={`saved-openings-continue-${saved.id}`}
            >
              {t("savedOpenings.continue")}
            </Button>
            <Button
              component={RouterLink}
              to={to.play}
              size="small"
              variant="outlined"
              data-testid={`saved-openings-play-${saved.id}`}
            >
              {t("savedOpenings.play")}
            </Button>
          </>
        )}
        <EditNoteButton id={saved.id} onEdit={onEdit} />
        <SavedListRemoveButton
          id={saved.id}
          onRemove={removeSavedOpening}
          labelKey="savedOpenings"
          testIdPrefix="saved-openings"
        />
        {/* Last in the row, as it is on the sites a reader will have exported
            a game from — and selectable even for a record that will not parse,
            since the export copies the stored PGN rather than re-writing it. */}
        <Checkbox
          size="small"
          checked={checked}
          onChange={onToggle}
          slotProps={{ input: { "aria-label": t("savedOpenings.select") } }}
          data-testid={`saved-openings-select-${saved.id}`}
        />
      </Box>
    </ListItem>
  );
}

export function SavedOpeningCard({
  saved,
  tree,
  opening,
  onEdit,
}: CardProps & {
  onEdit: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption({ saved, tree });
  const to = destinationsOf(saved, tree);

  return (
    <Card variant="outlined" data-testid={`saved-openings-item-${saved.id}`}>
      {/* The board *is* the continue button — the primary action, and the one
          thing on the card big enough to be worth clicking. A record with no
          readable tree has no position to draw, so it gets the message in the
          same square instead. */}
      {to === undefined || tree === undefined ? (
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
            {t("savedOpenings.unreadable")}
          </Typography>
        </Box>
      ) : (
        <CardActionArea
          component={RouterLink}
          to={to.resume}
          data-testid={`saved-openings-continue-${saved.id}`}
          aria-label={t("savedOpenings.continue")}
        >
          <Box sx={{ p: 1 }}>
            <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
              <Chessboard options={previewOptions(saved, tree)} />
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
        {/* The opening gets its own line, as it does on a saved game's card:
            the line above is already three facts wide, and this is the one a
            reader recognises a line by. Absent until the book has loaded, and
            for a line it does not name. */}
        {opening !== undefined && (
          <Typography
            variant="caption"
            dir="ltr"
            data-testid={`saved-openings-opening-${saved.id}`}
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
            <Tooltip title={t("savedOpenings.play")}>
              <IconButton
                component={RouterLink}
                to={to.play}
                size="small"
                aria-label={t("savedOpenings.play")}
                data-testid={`saved-openings-play-${saved.id}`}
              >
                <SportsEsportsRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ marginInlineStart: "auto" }}>
            <EditNoteButton id={saved.id} onEdit={onEdit} />
            <SavedListRemoveButton
              id={saved.id}
              onRemove={removeSavedOpening}
              labelKey="savedOpenings"
              testIdPrefix="saved-openings"
            />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
