import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  itemsInLibraryCategory,
  localizedText,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import { LeftPanel } from "../main/leftPanel";
import type { LibrarySection } from "./section";

/**
 * The sidebar's replacement while a library item's detail screen is open — a
 * vertical list of the current item's siblings in the same category, the
 * current one marked active, with a close control back to the category's list.
 *
 * **Section-agnostic**, like the two detail bodies that render it: it reads
 * `itemsInLibraryCategory` off whichever `section.catalog` it is handed, so
 * Mates, Positions and User PGNs all get it for free, and it branches on
 * neither the section nor the item's `kind` — a position and a game are both
 * just an item with a name and an id here.
 *
 * Registered through `<LeftPanel>` for exactly as long as the detail screen
 * that renders it stays mounted (`leftPanel.tsx`), the same lifetime rule the
 * two detail bodies already follow for their `<RightPanel>`. Navigating from
 * one sibling to another does not remount this component — the route pattern
 * is unchanged, only the id param — so the panel never flashes back to the
 * plain sidebar and forward again between two items in the same category.
 */

type Props = {
  section: LibrarySection;
  category: LibraryCategory;
  /** The id of the item the detail screen is currently showing. */
  activeId: string;
};

function LibrarySiblingNav({ section, category, activeId }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const siblings = itemsInLibraryCategory(category.path, section.catalog);
  const label = categoryLabel(category, (key) => t(key), language);

  return (
    <LeftPanel>
      <Box
        data-testid={`${section.itemTestId}-sibling-nav`}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
            p: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, lineHeight: 1.3, minWidth: 0 }}
          >
            {label}
          </Typography>
          <IconButton
            size="small"
            component={RouterLink}
            to={`${section.routeBase}/${category.path}`}
            aria-label={t(`${section.chromeKey}.leftPanel.close`)}
            data-testid={`${section.itemTestId}-sibling-nav-close`}
            sx={{ mt: -0.5, mr: -0.5, flexShrink: 0 }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>

        <List
          dense
          component="nav"
          aria-label={t(`${section.chromeKey}.leftPanel.ariaLabel`, {
            category: label,
          })}
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 0.5 }}
        >
          {siblings.map((item) => {
            const active = item.id === activeId;
            return (
              <ListItemButton
                key={item.id}
                component={RouterLink}
                to={`${section.routeBase}/${item.category}/${item.id}`}
                selected={active}
                aria-current={active ? "true" : undefined}
                data-testid={`${section.itemTestId}-sibling-nav-item-${item.id}`}
                sx={{ px: 1.5, py: 0.75 }}
              >
                <ListItemText
                  primary={localizedText(item.name, language)}
                  slotProps={{
                    primary: {
                      sx: {
                        fontWeight: active ? 700 : 500,
                        color: active ? "text.primary" : "text.secondary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                    },
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </LeftPanel>
  );
}

export default LibrarySiblingNav;
