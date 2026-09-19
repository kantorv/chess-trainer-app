import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { OpeningFolder } from "../../../../lib/savedOpeningFolders";

/**
 * The Saved openings browser's breadcrumb — the chain back up, rendered only
 * once the reader has drilled in (the top level has no chain to show). The
 * last crumb is where they are standing — text, not a button — and every
 * earlier one navigates; the root button always returns to the top level.
 */
export function SavedFolderBreadcrumb({
  crumbs,
  onOpen,
}: {
  /** The chain from the top level down to the folder being looked at. */
  crumbs: readonly OpeningFolder[];
  /** Navigate to a crumb's folder, or to the top level with `null`. */
  onOpen: (id: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <Box
      data-testid="saved-openings-breadcrumb"
      sx={{
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0.5,
        py: 0.5,
      }}
    >
      <Button
        size="small"
        data-testid="saved-openings-breadcrumb-root"
        onClick={() => onOpen(null)}
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
          <Typography
            key={crumb.id}
            variant="body2"
            sx={{ color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5 }}
          >
            /
            <Button
              size="small"
              data-testid={`saved-openings-breadcrumb-${crumb.id}`}
              onClick={() => onOpen(crumb.id)}
              sx={{ minWidth: 0, px: 1, textTransform: "none" }}
            >
              {crumb.name}
            </Button>
          </Typography>
        ),
      )}
    </Box>
  );
}
