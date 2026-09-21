import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import type { RepertoireFolder } from "../../lib/savedRepertoireFolders";

/**
 * **A folder, as the Repertoires list shows it** — a row in the list view, a
 * card in the two board views, both leading into the folder
 * (`/repertoires?folder=<id>`) and both carrying the folder's own three
 * controls: rename, delete, and a download of everything in it as one `.pgn`
 * (the list's export, over the folder's repertoires).
 *
 * Presentational, like the shared folder views it follows
 * (`views/shared/folders/SavedFolderViews.tsx`): the list screen owns the
 * dialogs and the store calls, and hands in the callbacks.
 */
type FolderViewProps = {
  folder: RepertoireFolder;
  /** How many repertoires are in it. */
  count: number;
  onRename: (folder: RepertoireFolder) => void;
  onDelete: (folder: RepertoireFolder) => void;
  onDownload: (folder: RepertoireFolder) => void;
};

const folderPath = (folder: RepertoireFolder) =>
  `/repertoires?folder=${encodeURIComponent(folder.id)}`;

/** Rename, delete and download — the same three in a row and on a card. */
function FolderActions({ folder, count, onRename, onDelete, onDownload }: FolderViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <Tooltip title={t("repertoires.folder.download")}>
        {/* A disabled button takes no pointer events, so the tooltip wraps a span. */}
        <Box component="span" sx={{ display: "inline-flex" }}>
          <IconButton
            size="small"
            disabled={count === 0}
            onClick={() => onDownload(folder)}
            aria-label={t("repertoires.folder.download")}
            data-testid={`repertoire-folder-download-${folder.id}`}
          >
            <DownloadRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Tooltip>
      <Tooltip title={t("repertoires.folder.rename")}>
        <IconButton
          size="small"
          onClick={() => onRename(folder)}
          aria-label={t("repertoires.folder.rename")}
          data-testid={`repertoire-folder-rename-${folder.id}`}
        >
          <DriveFileRenameOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("repertoires.folder.delete")}>
        <IconButton
          size="small"
          onClick={() => onDelete(folder)}
          aria-label={t("repertoires.folder.delete")}
          data-testid={`repertoire-folder-delete-${folder.id}`}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}

/** The folder's two caption lines: its name, and how many are in it. */
function FolderCaption({ folder, count }: { folder: RepertoireFolder; count: number }) {
  const { t } = useTranslation();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600, lineHeight: 1.3 }}>
        {folder.name || t("repertoires.untitled")}
      </Typography>
      <Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary" }}>
        {t("repertoires.folder.count", { count })}
      </Typography>
    </Box>
  );
}

export function RepertoireFolderRow(props: FolderViewProps) {
  const { folder, count } = props;
  return (
    <ListItem
      disableGutters
      disablePadding
      data-testid={`repertoire-folder-${folder.id}`}
      sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      secondaryAction={<FolderActions {...props} />}
    >
      <ListItemButton
        component={RouterLink}
        to={folderPath(folder)}
        data-testid={`repertoire-folder-open-${folder.id}`}
        sx={{ gap: 1.5, py: 1, paddingInlineEnd: "8.5rem" }}
      >
        <FolderRoundedIcon sx={{ color: "text.secondary" }} />
        <FolderCaption folder={folder} count={count} />
      </ListItemButton>
    </ListItem>
  );
}

export function RepertoireFolderCard(props: FolderViewProps) {
  const { folder, count } = props;
  return (
    <Card variant="outlined" data-testid={`repertoire-folder-${folder.id}`}>
      <CardActionArea
        component={RouterLink}
        to={folderPath(folder)}
        data-testid={`repertoire-folder-open-${folder.id}`}
      >
        {/* Square, so a folder sits in the grid the way a preview board does. */}
        <Box
          sx={{
            m: 1,
            aspectRatio: "1 / 1",
            display: "grid",
            placeItems: "center",
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <FolderRoundedIcon sx={{ fontSize: "3rem", color: "text.secondary" }} />
        </Box>
      </CardActionArea>
      <Box sx={{ px: 1, pb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <FolderCaption folder={folder} count={count} />
        </Box>
        <FolderActions {...props} />
      </Box>
    </Card>
  );
}
