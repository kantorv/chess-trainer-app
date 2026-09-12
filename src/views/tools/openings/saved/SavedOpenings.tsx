import { Fragment, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
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
import { downloadPgn } from "../../../../lib/pgnExport";
import { slugify } from "../../../../lib/pgnLibrary";
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
import {
  openInFolder,
  openingFolderChildren,
  openingFolderPath,
  openingFolderSubtree,
  openingsUnderFolder,
  type OpeningFolder,
} from "../../../../lib/savedOpeningFolders";
import {
  createOpeningFolder,
  moveOpeningFolder,
  removeOpeningFolder,
  renameOpeningFolder,
} from "../../../../lib/savedOpeningFolderStore";
import { RightPanel } from "../../../main/rightPanel";
import { cardSizeTrack, type CardSize } from "../../../library/cardSize";
import NoteDialog from "../NoteDialog";
import FolderNameDialog from "./FolderNameDialog";
import FolderMoveDialog from "./FolderMoveDialog";
import FolderDeleteDialog from "./FolderDeleteDialog";
import { useSavedOpenings } from "./useSavedOpenings";
import { useOpeningFolders } from "./useOpeningFolders";

/**
 * **Saved openings** — every position the reader has saved on the Openings
 * screen, newest first, filed into a tree of folders (CTA-40) and each with
 * somewhere to take it.
 *
 * It is [`views/tools/analysis/saved/SavedAnalyses.tsx`](../../analysis/saved/SavedAnalyses.tsx)
 * again, in the Tools folder beside the screen whose output it lists: the same
 * three-way view toggle over the same two card sizes
 * ([`cardSize.ts`](../../../library/cardSize.ts)), the same delete control, the
 * same rule that a record the store has and the PGN cannot parse is still listed
 * so it can still be removed. What that screen's header comment says about all
 * of it holds here and is not repeated; only the places an opening is **not**
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
 * ### 2. Taking openings out again
 *
 * The list view carries a checkbox per row and, in the top bar, a select-all
 * and a download — pick some openings, get one `.pgn` holding them
 * (`lib/pgnExport.ts`), the same join of the stored PGN the saved-games and
 * saved-analyses screens make: nothing re-parsed, so a record whose PGN will
 * not parse still exports byte for byte, which is why it stays selectable.
 * It is list-view only for the same reason it is there: a checkbox has no
 * place in a 160px card's footer, and a selection nothing on screen shows is
 * a trap — so switching view drops it.
 *
 * Where it parts company with those two screens is the folder tree (CTA-40).
 * A pick is not scoped to what is on screen: it **persists across folder
 * navigation** — drilling in keeps it, select-all in a folder *adds* that
 * folder's openings to the picks (unchecking removes just these), and the
 * count chip counts the whole picked set wherever the reader is standing. The
 * selection clears only through the chip's clear, a view switch, or the
 * opening's own delete — which reads out of the picks through the snapshot,
 * so the deleted record falls out of the count rather than leaving a phantom.
 * Each folder row and folder card also carries a download of its own — one
 * `.pgn` of everything under that folder, the same set its count stands for
 * ({@link openInFolder}), named from the folder's own name, slugified.
 *
 * ### 3. The browser is folders first
 *
 * The flat list this screen shipped with grew a tree (CTA-40): the top level
 * shows the reader's root folders and the **Unfiled** openings, drilling in
 * shows that folder's sub-folders and its openings, and a breadcrumb row takes
 * the reader back up. The join is {@link SavedOpening.folderId} — a plain id,
 * resolved against the folder list in [`lib/savedOpeningFolders.ts`](../../../../lib/savedOpeningFolders.ts) —
 * and an opening whose folder is gone reads as Unfiled, so a half-deleted store
 * still renders every record. A folder card counts everything **under** it (the
 * whole subtree), because that is what the click opens onto.
 *
 * The folder CRUD lives here too, as the manager: create (under the folder the
 * reader is standing in), rename, move (anywhere but the folder's own subtree —
 * the store refuses that move), and delete. Deleting an **empty** folder runs
 * at once; deleting one with contents asks first, and keeps them — its
 * openings become Unfiled and its sub-folders re-parent to the deleted
 * folder's own parent, so the tree closes up rather than leaving a hole.
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
 * The selective export's file stem — the fixed one the saved-games screen uses
 * ("chess-trainer-games"), because a download of picks is not about any one
 * folder and the dated suffix is what keeps repeated downloads apart.
 */
const SELECTED_STEM = "chess-trainer-openings";

/** The folder export's fallback stem — for a name that slugs to nothing. */
const FOLDER_STEM_FALLBACK = "saved-openings";

/**
 * The folder export's file stem: the reader's own name for the folder,
 * slugified. A name that slugs to nothing — an empty one, or one written in a
 * non-Latin script (`slugify` keeps `[a-z0-9]` only) — falls back to the fixed
 * stem rather than producing `-2026-09-12.pgn`.
 */
const folderStem = (folder: OpeningFolder): string =>
  slugify(folder.name) || FOLDER_STEM_FALLBACK;

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
  /** Whether this row is picked for export. */
  checked: boolean;
  onToggle: () => void;
};

function SavedOpeningRow({ saved, tree, onEdit, checked, onToggle }: RowProps) {
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

function SavedOpeningCard({
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
            <RemoveButton id={saved.id} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

/**
 * One folder's four controls — download, rename, move, delete — the same in
 * the row and the card view. Deleting runs through the caller's `onDelete`,
 * which decides whether a confirmation is needed; the other two open dialogs.
 * The download is the caller's handler too (the caller has the snapshots the
 * subtree read needs); `downloadDisabled` is the caller's count, because an
 * empty folder has nothing to export.
 */
function FolderActions({
  folder,
  downloadDisabled,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  folder: OpeningFolder;
  downloadDisabled: boolean;
  onDownload: (folder: OpeningFolder) => void;
  onRename: (folder: OpeningFolder) => void;
  onMove: (folder: OpeningFolder) => void;
  onDelete: (folder: OpeningFolder) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Tooltip title={t("savedOpenings.folder.download")}>
        {/* A disabled button takes no pointer events, so the tooltip needs a
            wrapper that still does — the same wrapper the board controls use. */}
        <Box component="span" sx={{ display: "inline-flex" }}>
          <IconButton
            size="small"
            disabled={downloadDisabled}
            aria-label={t("savedOpenings.folder.download")}
            data-testid={`saved-openings-folder-download-${folder.id}`}
            onClick={() => onDownload(folder)}
          >
            <DownloadRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Tooltip>
      <Tooltip title={t("savedOpenings.folder.renameFolder")}>
        <IconButton
          size="small"
          aria-label={t("savedOpenings.folder.renameFolder")}
          data-testid={`saved-openings-folder-rename-${folder.id}`}
          onClick={() => onRename(folder)}
        >
          <EditRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("savedOpenings.folder.moveFolder")}>
        <IconButton
          size="small"
          aria-label={t("savedOpenings.folder.moveFolder")}
          data-testid={`saved-openings-folder-move-${folder.id}`}
          onClick={() => onMove(folder)}
        >
          <DriveFileMoveRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("savedOpenings.folder.deleteFolder")}>
        <IconButton
          size="small"
          aria-label={t("savedOpenings.folder.deleteFolder")}
          data-testid={`saved-openings-folder-delete-${folder.id}`}
          onClick={() => onDelete(folder)}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}

/**
 * One folder in the list view: a clickable drill-in half and the management
 * controls beside it. The caption counts everything **under** the folder —
 * openings across its whole subtree — because that is what the click opens
 * onto, the same rule `LibraryFolderCard` applies.
 */
function SavedFolderRow({
  folder,
  count,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  folder: OpeningFolder;
  /** Openings under this folder, across its whole subtree. */
  count: number;
  onOpen: (id: string) => void;
  onDownload: (folder: OpeningFolder) => void;
  onRename: (folder: OpeningFolder) => void;
  onMove: (folder: OpeningFolder) => void;
  onDelete: (folder: OpeningFolder) => void;
}) {
  const { t } = useTranslation();

  return (
    <ListItem
      disableGutters
      data-testid={`saved-openings-folder-${folder.id}`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <ListItemButton
        onClick={() => onOpen(folder.id)}
        data-testid={`saved-openings-folder-open-${folder.id}`}
        sx={{ minWidth: 0, flex: 1, borderRadius: 1, px: 1 }}
      >
        <FolderRoundedIcon
          fontSize="small"
          sx={{ marginInlineEnd: 1.5, color: "text.secondary", flexShrink: 0 }}
        />
        <ListItemText
          primary={folder.name === "" ? t("savedOpenings.untitled") : folder.name}
          secondary={t("savedOpenings.folder.count", { count })}
          slotProps={{ primary: { noWrap: true } }}
        />
      </ListItemButton>
      <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <FolderActions
          folder={folder}
          downloadDisabled={count === 0}
          onDownload={onDownload}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      </Box>
    </ListItem>
  );
}

/** The same folder as a card, for the two board views. */
function SavedFolderCard({
  folder,
  count,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: {
  folder: OpeningFolder;
  /** Openings under this folder, across its whole subtree. */
  count: number;
  onOpen: (id: string) => void;
  onDownload: (folder: OpeningFolder) => void;
  onRename: (folder: OpeningFolder) => void;
  onMove: (folder: OpeningFolder) => void;
  onDelete: (folder: OpeningFolder) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card variant="outlined" data-testid={`saved-openings-folder-${folder.id}`}>
      <CardActionArea
        onClick={() => onOpen(folder.id)}
        data-testid={`saved-openings-folder-open-${folder.id}`}
        aria-label={folder.name}
      >
        <Box sx={{ p: 2, minHeight: 140, display: "grid", placeItems: "center" }}>
          <Box sx={{ textAlign: "center" }}>
            <FolderRoundedIcon sx={{ fontSize: 44, color: "text.secondary" }} />
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, lineHeight: 1.3, mt: 1 }}
            >
              {folder.name === "" ? t("savedOpenings.untitled") : folder.name}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("savedOpenings.folder.count", { count })}
            </Typography>
          </Box>
        </Box>
      </CardActionArea>
      <Box sx={{ px: 1, pb: 1, display: "flex", alignItems: "center" }}>
        <Box sx={{ marginInlineStart: "auto" }}>
          <FolderActions
            folder={folder}
            downloadDisabled={count === 0}
            onDownload={onDownload}
            onRename={onRename}
            onMove={onMove}
            onDelete={onDelete}
          />
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

  /*
    Where the browser is standing: `null` is the top level, everything else is
    a folder id. Browse state, not URL state — the criterion is breadcrumbs and
    a back path, not deep links, and nothing else in this screen travels.
  */
  const [folderId, setFolderId] = useState<string | null>(null);

  /** What the name dialog is open for: creating under a parent, or renaming. */
  const [nameDialog, setNameDialog] = useState<
    | { mode: "create"; parentId: string | null }
    | { mode: "rename"; folder: OpeningFolder }
    | null
  >(null);
  const [moving, setMoving] = useState<OpeningFolder | null>(null);
  const [deleting, setDeleting] = useState<OpeningFolder | null>(null);

  const openings = useSavedOpenings();
  const folders = useOpeningFolders();

  /*
    The folder the reader is standing in, resolved — a folder deleted out from
    under this screen (its own delete below, or another tab's) reads as the top
    level rather than as a hole in the tree. Adjusted during render rather than
    in an effect, the sanctioned derived-state pattern, and every read below
    goes through `browseId` so even the discarded pass is consistent.
  */
  const currentFolder =
    folderId === null
      ? undefined
      : folders.find((folder) => folder.id === folderId);
  if (folderId !== null && currentFolder === undefined) setFolderId(null);
  const browseId = currentFolder?.id ?? null;

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

  /*
    What the current view holds: this folder's direct sub-folders (name-sorted,
    dangling parents already resolved by the helper) and the openings filed
    here. An opening whose folderId names a folder that is gone reads as
    Unfiled — it shows at the top level, and nowhere else.

    Not memoised, deliberately: `browseId` derives from the render-time adjust
    above, so the compiler cannot preserve a memo that reads it (the lint says
    so) — and a filter over the capped folder and opening lists is cheaper than
    the memo it would skip.
  */
  const foldersHere = openingFolderChildren(folders, browseId);

  const openingsHere = openings.filter((opening) => {
    const parent =
      opening.folderId !== null &&
      folders.some((folder) => folder.id === opening.folderId)
        ? opening.folderId
        : null;
    return parent === browseId;
  });

  const entriesHere = openingsHere.map((saved) => ({
    saved,
    tree: treeById.get(saved.id),
  }));

  /*
    Which openings are picked for export. Held as a set of ids rather than a
    flag per row, so a deleted opening — here or in another tab — falls out of
    the list without leaving a phantom in the count: everything below reads the
    selection *through* `openings`, never on its own.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = openings.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /*
    Select-all over the rows on screen. The picks persist across folder
    navigation — the one place this screen parts company with the saved-games
    one, whose selection is scoped to a flat list — so this is an **add** of
    this folder's openings rather than a replace: checking adds what is on
    screen, unchecking removes just these, and picks made elsewhere stay.
  */
  const selectedHere = openingsHere.filter((saved) => picked.has(saved.id));
  const toggleAllHere = () =>
    setPicked((current) => {
      const next = new Set(current);
      const allPicked =
        openingsHere.length > 0 && selectedHere.length === openingsHere.length;
      for (const saved of openingsHere) {
        if (allPicked) next.delete(saved.id);
        else next.add(saved.id);
      }
      return next;
    });

  const downloadSelected = () =>
    downloadPgn(
      SELECTED_STEM,
      selected.map((saved) => saved.pgn),
    );

  /** One `.pgn` of everything under the folder — the set its count stands for. */
  const downloadFolder = (folder: OpeningFolder) =>
    downloadPgn(
      folderStem(folder),
      openInFolder(openings, folders, folder.id).map((row) => row.pgn),
    );

  const startEdit = (id: string) => {
    const found = openings.find((saved) => saved.id === id);
    if (found !== undefined) setEditing({ id, note: found.note });
  };

  /*
    Delete one folder, keeping its contents — the store's `removeOpeningFolder`
    is the operation; this only decides the wording. An **empty** folder (no
    openings across its subtree, no direct sub-folders) deletes at once, the
    same way deleting nothing asks for nothing; anything else opens the
    confirmation, which states the rule before it runs.
  */
  const confirmDelete = (folder: OpeningFolder) => {
    /*
      Stand where the contents went: its sub-folders re-parent to this folder's
      own parent, so landing there keeps the reader beside what they kept — and
      it is also the only move that keeps the browser off a folder that no
      longer exists.
    */
    if (
      folderId !== null &&
      openingFolderSubtree(folders, folder.id).has(folderId)
    ) {
      setFolderId(folder.parentId);
    }
    removeOpeningFolder(folder.id);
  };

  const startDelete = (folder: OpeningFolder) => {
    const isEmpty =
      openingsUnderFolder(openings, folders, folder.id) === 0 &&
      openingFolderChildren(folders, folder.id).length === 0;
    if (isEmpty) confirmDelete(folder);
    else setDeleting(folder);
  };

  const crumbs =
    currentFolder === undefined
      ? []
      : openingFolderPath(folders, currentFolder.id);

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

          {/*
            The board this screen's sidebar entry hides (CTA-42): the Openings
            folder is a single entry to *this* screen, so the plain
            new-opening view is reached from here. No query params — the
            arrival is a fresh board.
          */}
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to="/openings"
            startIcon={<AddRoundedIcon fontSize="small" />}
            data-testid="saved-openings-new"
          >
            {t("savedOpenings.new")}
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<CreateNewFolderRoundedIcon fontSize="small" />}
            data-testid="saved-openings-new-folder"
            onClick={() => setNameDialog({ mode: "create", parentId: browseId })}
          >
            {t("savedOpenings.folder.newFolder")}
          </Button>

          {/*
            The export controls, and only beside the view that has the
            checkboxes they drive — see the header comment. The chip counts the
            whole picked set, not this folder's share of it, so it stays visible
            while the reader drills around; the select-all works on the rows on
            screen and adds to the set.
          */}
          {view === "list" && openings.length > 0 && (
            <Box
              data-testid="saved-openings-export"
              sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}
            >
              <Tooltip title={t("savedOpenings.selectAll")}>
                <Checkbox
                  size="small"
                  checked={
                    openingsHere.length > 0 &&
                    selectedHere.length === openingsHere.length
                  }
                  indeterminate={
                    selectedHere.length > 0 &&
                    selectedHere.length < openingsHere.length
                  }
                  onChange={toggleAllHere}
                  slotProps={{ input: { "aria-label": t("savedOpenings.selectAll") } }}
                  data-testid="saved-openings-select-all"
                />
              </Tooltip>
              {selected.length > 0 && (
                <Chip
                  size="small"
                  label={t("savedOpenings.selected", { count: selected.length })}
                  onDelete={() => setPicked(new Set())}
                  data-testid="saved-openings-selected-count"
                />
              )}
              <Tooltip title={t("savedOpenings.download")}>
                {/* A disabled button takes no pointer events, so the tooltip
                    needs a wrapper that still does — the same wrapper the board
                    controls use. */}
                <Box component="span" sx={{ display: "inline-flex" }}>
                  <IconButton
                    size="small"
                    disabled={selected.length === 0}
                    onClick={downloadSelected}
                    aria-label={t("savedOpenings.download")}
                    data-testid="saved-openings-download"
                  >
                    <DownloadRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Tooltip>
            </Box>
          )}

          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            /*
              `null` when the pressed button is the one already selected: the
              screen has to be showing *something*, so that is a no-op.

              A real change drops the selection, because the checkboxes only
              exist in the list view — a count for rows nobody can see is a
              trap. Folder navigation keeps it; only this clears it.
            */
            onChange={(_event, next: SavedOpeningsView | null) => {
              if (next === null) return;
              setView(next);
              setPicked(new Set());
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
          The breadcrumb, only once the reader has drilled in: the top level has
          no chain to show. The last crumb is where they are standing — text,
          not a button — and every earlier one navigates.
        */}
        {currentFolder !== undefined && (
          <Box
            data-testid="saved-openings-breadcrumb"
            sx={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 0.5,
              py: 0.5,
            }}
          >
            <Button
              size="small"
              data-testid="saved-openings-breadcrumb-root"
              onClick={() => setFolderId(null)}
              sx={{ minWidth: 0, px: 1, textTransform: "none" }}
            >
              {t("savedOpenings.folder.root")}
            </Button>
            {crumbs.map((crumb, index) =>
              index === crumbs.length - 1 ? (
                <Typography
                  key={crumb.id}
                  variant="body2"
                  data-testid={`saved-openings-breadcrumb-${crumb.id}`}
                  sx={{ color: "text.secondary" }}
                >
                  {crumb.name}
                </Typography>
              ) : (
                <Fragment key={crumb.id}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    /
                  </Typography>
                  <Button
                    size="small"
                    data-testid={`saved-openings-breadcrumb-${crumb.id}`}
                    onClick={() => setFolderId(crumb.id)}
                    sx={{ minWidth: 0, px: 1, textTransform: "none" }}
                  >
                    {crumb.name}
                  </Button>
                </Fragment>
              ),
            )}
          </Box>
        )}

        {/*
          The one region that scrolls. The shell hands this screen a fixed-height
          box and scrolls nothing inside it, so whichever view is showing has to
          do it itself — the same flex column every screen filling the board
          square uses. Folders come first in both views, then this folder's
          openings: the reader drills into a folder, they do not scroll past it.
        */}
        {foldersHere.length === 0 && openingsHere.length === 0 ? (
          <Box
            data-testid="saved-openings-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid={
                browseId === null
                  ? "saved-openings-empty"
                  : "saved-openings-folder-empty"
              }
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {browseId === null
                ? t("savedOpenings.empty")
                : t("savedOpenings.folder.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-openings-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {foldersHere.map((folder) => (
                <SavedFolderRow
                  key={folder.id}
                  folder={folder}
                  count={openingsUnderFolder(openings, folders, folder.id)}
                  onOpen={setFolderId}
                  onDownload={downloadFolder}
                  onRename={(renamed) =>
                    setNameDialog({ mode: "rename", folder: renamed })
                  }
                  onMove={setMoving}
                  onDelete={startDelete}
                />
              ))}
              {entriesHere.map((entry) => (
                <SavedOpeningRow
                  key={entry.saved.id}
                  {...entry}
                  checked={picked.has(entry.saved.id)}
                  onToggle={() => togglePicked(entry.saved.id)}
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
            {foldersHere.map((folder) => (
              <SavedFolderCard
                key={folder.id}
                folder={folder}
                count={openingsUnderFolder(openings, folders, folder.id)}
                onOpen={setFolderId}
                onDownload={downloadFolder}
                onRename={(renamed) =>
                  setNameDialog({ mode: "rename", folder: renamed })
                }
                onMove={setMoving}
                onDelete={startDelete}
              />
            ))}
            {entriesHere.map((entry) => (
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

      <FolderNameDialog
        open={nameDialog !== null}
        title={
          nameDialog === null
            ? ""
            : nameDialog.mode === "create"
              ? t("savedOpenings.folder.newFolder")
              : t("savedOpenings.folder.renameFolder")
        }
        initial={
          nameDialog !== null && nameDialog.mode === "rename"
            ? nameDialog.folder.name
            : ""
        }
        onSave={(name) => {
          if (nameDialog === null) return;
          if (nameDialog.mode === "create") {
            createOpeningFolder(name, nameDialog.parentId);
          } else {
            renameOpeningFolder(nameDialog.folder.id, name);
          }
        }}
        onClose={() => setNameDialog(null)}
      />

      <FolderMoveDialog
        open={moving !== null}
        folders={folders}
        folder={moving}
        currentParentName={t("savedOpenings.folder.topLevel")}
        onMove={(newParentId) => {
          if (moving !== null) moveOpeningFolder(moving.id, newParentId);
          setMoving(null);
        }}
        onClose={() => setMoving(null)}
      />

      <FolderDeleteDialog
        open={deleting !== null}
        folder={deleting}
        openings={
          deleting === null ? 0 : openingsUnderFolder(openings, folders, deleting.id)
        }
        subFolders={
          deleting === null ? 0 : openingFolderChildren(folders, deleting.id).length
        }
        onConfirm={() => {
          if (deleting !== null) confirmDelete(deleting);
        }}
        onClose={() => setDeleting(null)}
      />

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
