import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { shippedCollections } from "../../lib/shippedCollections";
import { RightPanel } from "../main/rightPanel";
import { useUploadedCollections } from "./useLibraryCollections";

/**
 * **The Library** (`/library`, CTA-75) — its collections, one level: the
 * shipped ones (wired by `scripts/wirepgn.js`, by name) and then the reader's
 * uploads (newest first). Each row opens the collection's table.
 *
 * **Listing fetches nothing.** A shipped collection's name and game count are
 * its manifest entry (`src/data/library/manifest.json`); an upload's are its
 * small IndexedDB summary — no index and no game is read to draw this page.
 */
function CollectionRow({
  id,
  name,
  source,
  games,
}: {
  id: string;
  name: string;
  source: "shipped" | "uploaded";
  games: number;
}) {
  const { t } = useTranslation();
  return (
    <ListItemButton
      component={RouterLink}
      to={`/library/${encodeURIComponent(id)}`}
      data-testid={`library-collection-${id}`}
      sx={{ borderBottom: "1px solid", borderColor: "divider", gap: 1 }}
    >
      <ListItemIcon sx={{ minWidth: 36 }}>
        <FolderRoundedIcon color={source === "shipped" ? "primary" : "success"} />
      </ListItemIcon>
      <ListItemText
        primary={name}
        slotProps={{ primary: { dir: "auto", sx: { fontWeight: 600 } } }}
        secondary={t("library.games", { count: games })}
      />
      <Chip
        size="small"
        variant="outlined"
        label={t(source === "shipped" ? "library.shipped" : "library.uploaded")}
      />
    </ListItemButton>
  );
}

function LibraryHome() {
  const { t } = useTranslation();
  const uploaded = useUploadedCollections() ?? [];
  const total = shippedCollections.length + uploaded.length;

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
              <CollectionRow
                key={entry.id}
                id={entry.id}
                name={entry.name}
                source="shipped"
                games={entry.count}
              />
            ))}
            {uploaded.map((collection) => (
              <CollectionRow
                key={collection.id}
                id={collection.id}
                name={collection.name}
                source="uploaded"
                games={collection.count}
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
    </>
  );
}

export default LibraryHome;
