import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  findLibraryCategory,
  itemsInLibraryCategory,
  libraryItemFen,
  type LibraryItem,
} from "../../lib/libraryCatalog";
import { RightPanel } from "../main/rightPanel";
import LibraryCardFooter from "./LibraryCardFooter";
import { sectionHome, type LibrarySection } from "./section";

/**
 * One category's items, as cards — **the list screen of every library
 * section**: Mates, Positions and User PGNs alike.
 *
 * The category arrives as a path (`"basic"`, `"queen-vs-rook/rosettes"`)
 * rather than being read off the router here, because the sections address it
 * differently: Mates has a `:category` route parameter, Positions and User PGNs
 * a splat resolved through the catalog. Everything below that is identical, and
 * this screen knows nothing about JSON or PGN — it reads through
 * `lib/libraryCatalog.ts`.
 *
 * **The item kind is one branch, and only one**: the card's footer, which lives
 * in `LibraryCardFooter`. A position is captioned by whose move it is, because
 * that is the question it asks; a game by how it ended, how long it ran and
 * where it was played, because "White to play" says nothing about a game you are
 * about to replay from move one. The preview board is not a branch at all —
 * `libraryItemFen` gives both kinds their starting position.
 *
 * A card deep-links to `<routeBase>/<category path>/<id>`. The sidebar's active
 * state is an exact path match by design (`"/"` is a prefix of every route), so
 * the category's entry does *not* stay lit while a detail page is open — the
 * detail screen carries its own way back rather than the shared renderer
 * changing its matching rule for these sections.
 */

/**
 * A card's preview board. Read-only: the position is a thing to look at here,
 * and it becomes a thing to play or replay on the screens the detail page hands
 * it to. Each board takes the item's own id, since `options.id` has to be unique
 * across the page and a category shows several at once.
 */
const previewOptions = (
  section: LibrarySection,
  item: LibraryItem,
): ChessboardOptions => ({
  id: `${section.itemTestId}-preview-${item.id}`,
  position: libraryItemFen(item),
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

type Props = {
  section: LibrarySection;
  /** The category's full path under the section's route base. */
  categoryPath: string | undefined;
};

function LibraryList({ section, categoryPath }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const found = findLibraryCategory(categoryPath, section.catalog);
  const items = itemsInLibraryCategory(categoryPath, section.catalog);

  // An unknown category in the URL is a miss, not a crash: no board is
  // rendered, and the reader is pointed back at a category that exists.
  if (found === undefined) {
    return (
      <Box
        data-testid={`${section.listTestId}-unknown-category`}
        sx={{ height: "100%", display: "grid", placeItems: "center", p: 2 }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            {t(`${section.chromeKey}.notFound.category`)}
          </Typography>
          <Typography
            component={RouterLink}
            to={sectionHome(section)}
            variant="body2"
            sx={{ color: "primary.main" }}
          >
            {t(`${section.chromeKey}.notFound.back`)}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <>
      <Box
        data-testid={section.listTestId}
        sx={{
          height: "100%",
          // The shell hands this screen a square and nothing scrolls it, so the
          // grid scrolls itself — a category can hold more cards than fit.
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 2,
          alignContent: "start",
        }}
      >
        {items.map((item) => (
          <Card key={item.id} variant="outlined">
            <CardActionArea
              component={RouterLink}
              to={`${section.routeBase}/${item.category}/${item.id}`}
              data-testid={`${section.itemTestId}-card-${item.id}`}
            >
              <Box sx={{ p: 1 }}>
                <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
                  <Chessboard options={previewOptions(section, item)} />
                </Box>
              </Box>
              <LibraryCardFooter section={section} item={item} />
            </CardActionArea>
          </Card>
        ))}
      </Box>

      <RightPanel>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {categoryLabel(found, (key) => t(key), language)}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          {items.length === 0
            ? t(`${section.chromeKey}.list.empty`)
            : t(`${section.chromeKey}.list.count`, { count: items.length })}
        </Typography>
        {items.length > 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 2 }}>
            {t(`${section.chromeKey}.list.hint`)}
          </Typography>
        )}
      </RightPanel>
    </>
  );
}

export default LibraryList;
