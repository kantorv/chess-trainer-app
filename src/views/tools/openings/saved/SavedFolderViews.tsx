import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { useTranslation } from "react-i18next";

import type { OpeningFolder } from "../../../../lib/savedOpeningFolders";

/**
 * The Saved openings screen's folder row and card — one folder in the two
 * views, split out of `SavedOpenings.tsx` beside the opening views for the
 * same reason. The folder is **not** an opening, which is why this is a second
 * file and not a prop on that one: a folder carries a name, a count and four
 * management controls, where an opening carries a position and a note.
 */

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
export function SavedFolderRow({
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
export function SavedFolderCard({
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
