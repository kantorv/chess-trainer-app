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
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SportsEsportsRounded from "@mui/icons-material/SportsEsportsRounded";
import ViewComfyRounded from "@mui/icons-material/ViewComfyRounded";
import ViewListRounded from "@mui/icons-material/ViewListRounded";
import ViewModuleRounded from "@mui/icons-material/ViewModuleRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { mainlineGame, type GameTree } from "../../../../lib/gameTree";
import {
  getPositionBook,
  loadOpeningBook,
  openingOfLine,
  type OpeningBook,
  type OpeningEntry,
  type PositionBook,
} from "../../../../lib/openings";
import {
  savedOpeningFen,
  savedOpeningSummary,
  savedOpeningToTree,
  type SavedOpening,
} from "../../../../lib/savedOpenings";
import {
  removeSavedOpening,
  updateSavedOpeningNote,
} from "../../../../lib/savedOpeningStore";
import { RightPanel } from "../../../main/rightPanel";
import { cardSizeTrack, type CardSize } from "../../../library/cardSize";
import NoteDialog from "../NoteDialog";
import { useSavedOpenings } from "./useSavedOpenings";

/**
 * **Saved openings** — every position the reader has saved on the Openings
 * screen, newest first, each with somewhere to take it.
 *
 * It is [`views/tools/analysis/saved/SavedAnalyses.tsx`](../../analysis/saved/SavedAnalyses.tsx)
 * again, in the Tools folder beside the screen whose output it lists: the same
 * three-way view toggle over the same two card sizes
 * ([`cardSize.ts`](../../../library/cardSize.ts)), the same delete control, the
 * same rule that a record the store has and the PGN cannot parse is still listed
 * so it can still be removed. What that screen's header comment says about all
 * of it holds here and is not repeated; only the two places an opening is **not**
 * an analysis are written out below.
 *
 * ### 1. A row is named by its note, not by any players
 *
 * An analysis begun from a library game is named by that game's tag pairs. An
 * opening has no such thing — it is begun from a position or an empty board —
 * and this is exactly why the record carries a **note**. So the note is the
 * primary caption, and it is *editable here* (prompted at save time on the
 * Openings screen, changed in place on this one through the shared
 * {@link NoteDialog}), whereas an analysis' name is fixed.
 *
 * ### 2. There is nothing to export
 *
 * The saved-games and saved-analyses screens both offer a select-and-download,
 * because a game against the engine and an analysis live nowhere else. An
 * opening does too — but unlike those, an opening is a *position to come back
 * to*, not a piece of work worth taking out of the browser, so there is no
 * export machinery here. The two hand-offs below are the whole of it.
 *
 * ### Where a row can go, and why those two
 *
 * | Destination | Carries | Because |
 * | --- | --- | --- |
 * | Openings | `?openings=<id>` | it is the only screen that can go on *exploring* the tree, and the id is what restores the side lines, the orientation and the note |
 * | Play with Engine | `?fen=` at the end of the mainline | it replays nothing; what it wants is the position being looked at |
 */

/** The list, or one of the two board sizes. */
type SavedOpeningsView = "list" | CardSize;

/** What the screen opens on — the list, as its sibling screen does. */
const DEFAULT_VIEW: SavedOpeningsView = "list";

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
const destinationsOf = (
  saved: SavedOpening,
  tree: GameTree | undefined,
) => {
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
 * from a `.tsx` costs fast refresh.
 */
const useCaption = ({ saved, tree }: EntryProps) => {
  const { t, i18n } = useTranslation();
  const summary = savedOpeningSummary(saved, tree);

  /*
    The reader's own clock and their own language: `updatedAt` is stored as ISO
    so the record stays plain JSON, and it is a date rather than notation, so it
    is the one thing here formatted for the reader rather than written the way
    PGN writes it.
  */
  const worked = new Date(saved.updatedAt);
  const when = Number.isNaN(worked.valueOf())
    ? ""
    : worked.toLocaleDateString(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  return {
    // The note is the name; an empty one falls back to the translated generic.
    primary: saved.note === "" ? t("savedOpenings.untitled") : saved.note,
    secondary:
      tree === undefined
        ? t("savedOpenings.unreadable")
        : [
            t("savedOpenings.moves", { count: summary.moves }),
            // Every node past the mainline is a move the reader tried and kept.
            // Zero of them is not a fact worth a slot on a two-line card.
            summary.nodes > summary.moves
              ? t("savedOpenings.variations", {
                  count: summary.nodes - summary.moves,
                })
              : "",
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
      aria-label={t("savedOpenings.remove")}
      data-testid={`saved-openings-remove-${id}`}
      onClick={() => removeSavedOpening(id)}
    >
      <DeleteOutlineRoundedIcon fontSize="small" />
    </IconButton>
  );
}

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
};

function SavedOpeningRow({ saved, tree, onEdit }: RowProps) {
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
        <RemoveButton id={saved.id} />
      </Box>
    </ListItem>
  );
}

function SavedOpeningCard({ saved, tree, opening, onEdit }: CardProps & RowProps) {
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
            <RemoveButton id={saved.id} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

function SavedOpenings() {
  const { t } = useTranslation();

  const [view, setView] = useState<SavedOpeningsView>(DEFAULT_VIEW);
  const [editing, setEditing] = useState<{ id: string; note: string } | null>(
    null,
  );

  const openings = useSavedOpenings();

  /*
    The trees, parsed once per snapshot. An opening's PGN is re-read as a tree
    (side lines and all) rather than taken from a catalog, because the side lines
    are the one thing an opening explorer keeps — the card counts them, and the
    preview board draws the end of the mainline from the same tree.
  */
  const treeById = useMemo(() => {
    const found = new Map<string, GameTree>();
    for (const saved of openings) {
      const tree = savedOpeningToTree(saved);
      if (tree !== undefined) found.set(saved.id, tree);
    }
    return found;
  }, [openings]);

  const entries = openings.map((saved) => ({
    saved,
    tree: treeById.get(saved.id),
  }));

  const startEdit = (id: string) => {
    const found = openings.find((saved) => saved.id === id);
    if (found !== undefined) setEditing({ id, note: found.note });
  };

  /*
    The opening book, for the line under each card. Loaded lazily and shared:
    `loadOpeningBook` caches its promise, so a reader who has already opened a
    game screen pays nothing here, and one who never opens this screen never
    downloads it.
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
    One walk per opening, memoised on the trees and the book — both stable
    between changes, so thirty records are looked up once rather than on every
    render and every toggle of the view. The **mainline** is what is named: it
    is what the opening is of, where a side line is one thing tried inside it.
  */
  const openingNames = useMemo(() => {
    const found = new Map<string, OpeningEntry>();
    if (book === null) return found;

    for (const [id, tree] of treeById) {
      const opening = openingOfLine(
        book.book,
        book.positions,
        mainlineGame(tree).moves.map((move) => move.fen),
      );
      if (opening !== undefined) found.set(id, opening);
    }
    return found;
  }, [treeById, book]);

  return (
    <>
      <Box
        data-testid="saved-openings-screen"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          data-testid="saved-openings-top-bar"
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
              {t("savedOpenings.title")}
            </Typography>
            <Typography
              data-testid="saved-openings-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("savedOpenings.count", { count: openings.length })}
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            /*
              `null` when the pressed button is the one already selected: the
              screen has to be showing *something*, so that is a no-op.
            */
            onChange={(_event, next: SavedOpeningsView | null) => {
              if (next === null) return;
              setView(next);
            }}
            aria-label={t("savedOpenings.view.label")}
            sx={{ flexShrink: 0 }}
          >
            <ToggleButton
              value="list"
              data-testid="saved-openings-view-list"
              aria-label={t("savedOpenings.view.list")}
            >
              <Tooltip title={t("savedOpenings.view.list")}>
                <ViewListRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton
              value="compact"
              data-testid="saved-openings-view-compact"
              aria-label={t("savedOpenings.view.compact")}
            >
              <Tooltip title={t("savedOpenings.view.compact")}>
                <ViewComfyRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton
              value="comfortable"
              data-testid="saved-openings-view-comfortable"
              aria-label={t("savedOpenings.view.comfortable")}
            >
              <Tooltip title={t("savedOpenings.view.comfortable")}>
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
        {openings.length === 0 ? (
          <Box
            data-testid="saved-openings-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid="saved-openings-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("savedOpenings.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-openings-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {entries.map((entry) => (
                <SavedOpeningRow
                  key={entry.saved.id}
                  {...entry}
                  onEdit={startEdit}
                />
              ))}
            </List>
          </Box>
        ) : (
          <Box
            data-testid="saved-openings-grid"
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
              <SavedOpeningCard
                key={entry.saved.id}
                {...entry}
                opening={openingNames.get(entry.saved.id)}
                onEdit={startEdit}
              />
            ))}
          </Box>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("savedOpenings.hint")}
          </Typography>
          <Typography variant="body2" data-testid="saved-openings-storage-note">
            {t("savedOpenings.storage")}
          </Typography>
        </Box>
      </RightPanel>

      <NoteDialog
        open={editing !== null}
        title={t("savedOpenings.note.editTitle")}
        initial={editing?.note ?? ""}
        onSave={(note) => {
          if (editing !== null) updateSavedOpeningNote(editing.id, note);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

export default SavedOpenings;