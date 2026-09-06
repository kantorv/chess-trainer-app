import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  findLibraryCategory,
  findLibraryItem,
} from "../../lib/libraryCatalog";
import LibraryGameDetail from "./LibraryGameDetail";
import LibraryPositionDetail from "./LibraryPositionDetail";
import { sectionHome, type LibrarySection } from "./section";

/**
 * One item from a library — **the detail screen of every library section**.
 *
 * This component does the three things that are the same whatever the item is:
 * it resolves the URL's category and id against the section's catalog, it
 * renders the miss when either does not resolve, and it dispatches on the item's
 * kind. The bodies are separate components rather than a branch inside one:
 *
 * | Kind | Body | What it is |
 * | --- | --- | --- |
 * | `position` | `LibraryPositionDetail` | one FEN on a read-only board, with the three `?fen=` hand-offs |
 * | `game` | `LibraryGameDetail` | the game replayed, over the shared `MoveList` / `BoardControls` / `useGameNavigation` |
 *
 * Separate because the game body runs hooks the position body does not, and a
 * hook cannot live behind a condition. Splitting on the kind *before* the hooks
 * run is what keeps both bodies honest — and it means the two shipped sections
 * reach exactly the code they always did, through a component whose props never
 * changed.
 */

type Props = {
  section: LibrarySection;
  /** The category's full path under the section's route base. */
  categoryPath: string | undefined;
  positionId: string | undefined;
};

function LibraryDetail({ section, categoryPath, positionId }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const found = findLibraryCategory(categoryPath, section.catalog);
  const item = findLibraryItem(categoryPath, positionId, section.catalog);

  // An unknown category or id — and equally a real id asked for under the wrong
  // category — renders a message rather than a broken board.
  if (found === undefined || item === undefined) {
    return (
      <Box
        data-testid={`${section.itemTestId}-detail-not-found`}
        sx={{ height: "100%", display: "grid", placeItems: "center", p: 2 }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            {t(
              found === undefined
                ? `${section.chromeKey}.notFound.category`
                : `${section.chromeKey}.notFound.position`,
            )}
          </Typography>
          <Typography
            component={RouterLink}
            to={
              found === undefined
                ? sectionHome(section)
                : `${section.routeBase}/${found.path}`
            }
            variant="body2"
            sx={{ color: "primary.main" }}
          >
            {found === undefined
              ? t(`${section.chromeKey}.notFound.back`)
              : t(`${section.chromeKey}.detail.back`, {
                  category: categoryLabel(found, (key) => t(key), language),
                })}
          </Typography>
        </Box>
      </Box>
    );
  }

  return item.kind === "game" ? (
    <LibraryGameDetail section={section} category={found} item={item} />
  ) : (
    <LibraryPositionDetail section={section} category={found} position={item} />
  );
}

export default LibraryDetail;
