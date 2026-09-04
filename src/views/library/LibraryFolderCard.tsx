import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  itemCountUnder,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import type { LibrarySection } from "./section";

/**
 * A **sub-folder** of the category on screen, as a card in the same grid its
 * items are in — the one thing the list screen needed to serve a library that
 * nests, and the reason a multi-study `.pgn` did not need a screen of its own.
 *
 * A category has always been allowed sub-categories (`positions.json` nests, the
 * User PGNs manifest groups files under one folder, and a lichess export of
 * every study its author wrote is one file holding twenty-eight of them), but
 * only the sidebar could reach them: the list screen showed that folder's own
 * items and, for a folder with none, the word "empty". So the folders are cards
 * too, ahead of the items, and the shared screen stays one grid of one kind of
 * thing to click.
 *
 * It is deliberately **not** the item card with a folder glyph where the board
 * is. There is no position to preview — a folder is a name and a promise about
 * what is behind it — and a column of empty squares would cost the reader the
 * scroll it takes to get past twenty-eight of them. So the card is one line of
 * icon and two of text, which also makes the two kinds of card tell themselves
 * apart at a glance.
 *
 * The count is everything **under** the folder, sub-folders included
 * (`itemCountUnder`), because that is what the click leads to. The category's
 * own list screen goes on counting only its own items, which is the opposite
 * rule for the opposite reason — see `libraryCatalog.ts`.
 */

type Props = {
  section: LibrarySection;
  category: LibraryCategory;
};

function LibraryFolderCard({ section, category }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const name = categoryLabel(category, (key) => t(key), language);
  const count = itemCountUnder(category, section.catalog);

  return (
    <Card variant="outlined">
      <CardActionArea
        component={RouterLink}
        to={`${section.routeBase}/${category.path}`}
        data-testid={`${section.listTestId}-folder-${category.id}`}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5 }}
      >
        <FolderRoundedIcon sx={{ color: "primary.main", flexShrink: 0 }} />
        {/* `minWidth: 0` or the flex item refuses to shrink and the clamp below
            never clips — the name would push the card wider than its track. */}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              lineHeight: 1.25,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {name}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: "block", color: "text.secondary" }}
          >
            {t(`${section.chromeKey}.list.count`, { count })}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export default LibraryFolderCard;
