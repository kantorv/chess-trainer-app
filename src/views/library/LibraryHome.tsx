import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { removeCollection } from "../../lib/libraryCollectionStore";
import type { CollectionSummary } from "../../lib/libraryCollections";
import { downloadPgn } from "../../lib/pgnExport";
import { slugify } from "../../lib/pgnText";
import { shippedCollections } from "../../lib/shippedCollections";
import { RightPanel } from "../main/rightPanel";
import { loadCollectionGames, useUploadedCollections } from "./useLibraryCollections";

/**
 * **The Library** (`/library`, CTA-75) — its collections, one level: the
 * shipped ones (wired by `scripts/wirepgn.js`, by name) and then the reader's
 * uploads (newest first). Each row opens the collection's table, and its
 * download icon saves **the whole collection** as one `.pgn` (a table's own
 * download is its picked games); an upload's row also **deletes** it, asked
 * first (a table deletes only its picked games).
 *
 * **Listing fetches nothing.** A shipped collection's name and game count are
 * its manifest entry (`src/data/library/manifest.json`); an upload's are its
 * small IndexedDB summary — no index and no game is read to draw this page.
 * The games are read only when a download asks for them.
 */
function CollectionRow({
  summary,
  onDelete,
}: {
  summary: CollectionSummary;
  /** An upload's delete — asked first by the list. */
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const { id, name, source, count } = summary;
  const download = async () => {
    const games = await loadCollectionGames(summary);
    if (games !== null) downloadPgn(slugify(name) || "collection", games);
  };
  return (
    <ListItem
      disablePadding
      sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      // Beside the row's link, not inside it: a button in a link is not valid HTML.
      secondaryAction={
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title={t("library.download")}>
            <IconButton
              edge={onDelete === undefined ? "end" : false}
              size="small"
              aria-label={t("library.download")}
              data-testid={`library-collection-download-${id}`}
              onClick={() => void download()}
            >
              <DownloadRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {onDelete !== undefined && (
            <Tooltip title={t("library.delete")}>
              <IconButton
                edge="end"
                size="small"
                aria-label={t("library.delete")}
                data-testid={`library-collection-delete-${id}`}
                onClick={onDelete}
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      }
    >
      <ListItemButton
        component={RouterLink}
        // Room for the second icon an upload's row carries.
        sx={{ gap: 1, ...(onDelete === undefined ? {} : { paddingInlineEnd: 11 }) }}
        to={`/library/${encodeURIComponent(id)}`}
        data-testid={`library-collection-${id}`}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <FolderRoundedIcon color={source === "shipped" ? "primary" : "success"} />
        </ListItemIcon>
        <ListItemText
          primary={name}
          slotProps={{ primary: { dir: "auto", sx: { fontWeight: 600 } } }}
          secondary={t("library.games", { count })}
        />
        <Chip
          size="small"
          variant="outlined"
          label={t(source === "shipped" ? "library.shipped" : "library.uploaded")}
        />
      </ListItemButton>
    </ListItem>
  );
}

function LibraryHome() {
  const { t } = useTranslation();
  const uploaded = useUploadedCollections() ?? [];
  const total = shippedCollections.length + uploaded.length;
  const [deleting, setDeleting] = useState<CollectionSummary | null>(null);

  return (
    <>
      <Box
        data-testid="library-screen"
        sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {t("library.title")}
            </Typography>
            <Typography
              data-testid="library-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("library.count", { count: total })}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileRoundedIcon />}
            component={RouterLink}
            to="/library/new"
            data-testid="library-add"
          >
            {t("library.add")}
          </Button>
        </Box>
        {/* The one region that scrolls: the shell scrolls nothing in the square. */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <List disablePadding data-testid="library-collections">
            {shippedCollections.map((entry) => (
              <CollectionRow key={entry.id} summary={entry} />
            ))}
            {uploaded.map((collection) => (
              <CollectionRow
                key={collection.id}
                summary={collection}
                onDelete={() => setDeleting(collection)}
              />
            ))}
          </List>
        </Box>
      </Box>
      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("library.hint")}
        </Typography>
      </RightPanel>
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        data-testid="library-delete-dialog"
      >
        {deleting !== null && (
          <>
            <DialogTitle>{t("library.confirmDelete.title", { name: deleting.name })}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                {t("library.confirmDelete.body", { count: deleting.count })}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleting(null)}>{t("library.confirmDelete.cancel")}</Button>
              <Button
                color="error"
                data-testid="library-delete-confirm"
                onClick={async () => {
                  await removeCollection(deleting.id);
                  setDeleting(null);
                }}
              >
                {t("library.confirmDelete.confirm")}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

export default LibraryHome;
