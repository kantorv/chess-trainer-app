import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ViewComfyRounded from "@mui/icons-material/ViewComfyRounded";
import ViewModuleRounded from "@mui/icons-material/ViewModuleRounded";
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
import { cardSizeTrack, DEFAULT_CARD_SIZE, type CardSize } from "./cardSize";
import LibraryCardFooter from "./LibraryCardFooter";
import LibraryFolderCard from "./LibraryFolderCard";
import LibraryNotes from "./LibraryNotes";
import { filterLibraryCategories, filterLibraryItems } from "./librarySearch";
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
 * `libraryItemFen` gives both kinds their starting position. The search is not
 * one either: `librarySearch.ts` folds both kinds into one string.
 *
 * ### A category's sub-folders are cards in the same grid
 *
 * A library nests — `positions.json` does, the User PGNs manifest groups files
 * under one folder, and a lichess export of every study its author wrote is one
 * file holding twenty-eight of them (`lib/pgnLibrary.ts`). Until the folders
 * were cards only the sidebar could reach them: this screen showed the
 * category's own items and, for a folder that groups and holds nothing itself,
 * the word "empty".
 *
 * So `found.children` renders ahead of the items, through
 * {@link LibraryFolderCard}, in the **same grid** — one scroll region, one
 * search, one card size, and no second kind of screen for a folder of folders.
 * The search filters both (`filterLibraryCategories`), which is what makes a
 * file of twenty-eight studies usable at all.
 *
 * A card deep-links to `<routeBase>/<category path>/<id>`. The sidebar's active
 * state is an exact path match by design (`"/"` is a prefix of every route), so
 * the category's entry does *not* stay lit while a detail page is open — the
 * detail screen carries its own way back rather than the shared renderer
 * changing its matching rule for these sections.
 *
 * ### Two regions, and only one of them scrolls
 *
 * The shell hands this screen a **fixed square** and scrolls nothing inside it,
 * so the screen has to divide that height up itself: a flex column, a top bar
 * that does not shrink, and a grid that takes the rest and is the only thing
 * with `overflowY`. `minHeight: 0` on the column *and* on the grid is what lets
 * the grid be shorter than its content; without it a flex item refuses to
 * shrink past it.
 *
 * Three declarations make the scroll actually happen, and the third is the one
 * that was missing before: `overflowY` is nothing without content taller than
 * the box, and a grid of `auto` rows inside a box of definite height has no
 * such content — the rows are stretched to share that height out, so the cards
 * shrink (and are clipped by `Card`'s own `overflow: hidden`) instead of the
 * grid overflowing. `gridAutoRows: "max-content"` on the grid below is what
 * makes a row as tall as the card in it.
 *
 * The top bar carries what the reader acts on before picking a card — the
 * category's name and how many are in it, the name search, and how big the
 * cards should be. A category with nothing in it has nothing to say about
 * picking a card, so it registers no panel at all and the shell's own
 * placeholder stands, exactly as the unknown-category miss below already does.
 *
 * ### The right-hand panel: a folder's notes, or the hint
 *
 * A folder may carry **authored notes** — what this study is, who wrote it, what
 * to look for — and the panel is where they go. The lookup arrives on the
 * section descriptor (`section.folderNotes`, keyed by category path), so this
 * screen renders whichever section's notes it was handed and knows nothing about
 * where they came from: the User PGNs section resolves them from `.mdx` files
 * sitting beside its `.pgn` files, and the other two sections carry none today
 * and would carry them tomorrow by filling that one field. A folder without
 * notes keeps the one-line hint, unchanged.
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

  const [cardSize, setCardSize] = useState<CardSize>(DEFAULT_CARD_SIZE);
  const [query, setQuery] = useState("");

  /*
    A filter belongs to the category it was typed into: carrying "rook" across
    to the next folder would show it as empty, which reads as missing data
    rather than as a search still running. The card size is the opposite — a
    reader who wants big cards wants them in every folder — so it is not reset.

    Adjusted during render against the previous path rather than in an effect,
    which `react-hooks/set-state-in-effect` rejects; React discards this pass
    and re-runs with the cleared query before anything is committed. The same
    idiom `Sidebar.tsx` uses to follow the route.
  */
  const [shownCategory, setShownCategory] = useState(categoryPath);
  if (shownCategory !== categoryPath) {
    setShownCategory(categoryPath);
    setQuery("");
  }

  const found = findLibraryCategory(categoryPath, section.catalog);
  const items = itemsInLibraryCategory(categoryPath, section.catalog);
  // This folder's authored notes, if its section has any for it. Keyed by the
  // same path the catalog is, so a folder either has notes or does not — there
  // is nothing to resolve, match or fall back through here.
  const notes =
    categoryPath === undefined
      ? undefined
      : section.folderNotes?.[categoryPath];

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

  const visible = filterLibraryItems(items, query, language);
  const visibleFolders = filterLibraryCategories(found.children, query, (child) =>
    categoryLabel(child, (key) => t(key), language),
  );
  const searching = query.trim() !== "";
  const nothingToShow = visible.length === 0 && visibleFolders.length === 0;

  return (
    <>
      <Box
        data-testid={section.listTestId}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          // A flex item will not shrink past its content unless told to, and
          // the grid below is taller than the square by design.
          minHeight: 0,
        }}
      >
        <Box
          data-testid={`${section.listTestId}-top-bar`}
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            pb: 1.5,
            mb: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ minWidth: 0, marginInlineEnd: "auto" }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, lineHeight: 1.3 }}
            >
              {categoryLabel(found, (key) => t(key), language)}
            </Typography>
            {/* What is on screen, counted the way this section counts it — and
                a folder of folders says how many folders, since "Games: 0" is
                not what a reader of one is looking at. Both when it holds
                both. */}
            <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1 }}>
              {found.children.length > 0 && (
                <Typography
                  data-testid={`${section.listTestId}-folder-count`}
                  component="span"
                  variant="caption"
                  sx={{ color: "text.secondary" }}
                >
                  {t(`${section.chromeKey}.list.folders`, {
                    count: visibleFolders.length,
                  })}
                </Typography>
              )}
              {items.length > 0 && (
                <Typography
                  data-testid={`${section.listTestId}-count`}
                  component="span"
                  variant="caption"
                  sx={{ color: "text.secondary" }}
                >
                  {t(`${section.chromeKey}.list.count`, { count: visible.length })}
                </Typography>
              )}
            </Box>
          </Box>

          <TextField
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(`${section.chromeKey}.list.search`)}
            slotProps={{
              htmlInput: {
                "data-testid": `${section.listTestId}-search`,
                "aria-label": t(`${section.chromeKey}.list.search`),
              },
              input: {
                startAdornment: (
                  <SearchRounded
                    fontSize="small"
                    sx={{ color: "text.secondary", mr: 0.75 }}
                  />
                ),
              },
            }}
            sx={{ flex: "1 1 12rem", minWidth: "9rem", maxWidth: "20rem" }}
          />

          <ToggleButtonGroup
            exclusive
            size="small"
            value={cardSize}
            // `null` when the pressed button is the one already selected: the
            // cards have to be *some* size, so that is a no-op.
            onChange={(_event, next: CardSize | null) =>
              next !== null && setCardSize(next)
            }
            aria-label={t(`${section.chromeKey}.list.cardSize.label`)}
            sx={{ flexShrink: 0 }}
          >
            <ToggleButton
              value="compact"
              data-testid={`${section.listTestId}-card-size-compact`}
              aria-label={t(`${section.chromeKey}.list.cardSize.compact`)}
            >
              <Tooltip title={t(`${section.chromeKey}.list.cardSize.compact`)}>
                <ViewComfyRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton
              value="comfortable"
              data-testid={`${section.listTestId}-card-size-comfortable`}
              aria-label={t(`${section.chromeKey}.list.cardSize.comfortable`)}
            >
              <Tooltip
                title={t(`${section.chromeKey}.list.cardSize.comfortable`)}
              >
                <ViewModuleRounded fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {nothingToShow ? (
          <Box
            data-testid={
              searching
                ? `${section.listTestId}-no-matches`
                : `${section.listTestId}-empty`
            }
            sx={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", p: 2 }}
          >
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center" }}
            >
              {searching
                ? t(`${section.chromeKey}.list.noMatches`)
                : t(`${section.chromeKey}.list.empty`)}
            </Typography>
          </Box>
        ) : (
          <Box
            data-testid={`${section.listTestId}-grid`}
            sx={{
              // The only scroller on the screen: the top bar above it stays
              // put, and a category with more cards than fit scrolls here.
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              display: "grid",
              gridTemplateColumns: cardSizeTrack(cardSize),
              /*
                **This is the line that makes it scroll.** An `auto` row inside
                a grid whose own height is definite — which this one's is, as a
                flex item filling the square — is stretched to share that
                height out, and `alignContent: "start"` does not stop it: the
                rows came out at exactly `(742 - gaps) / 5`, so nine cards fit
                in one screenful by being squashed to a quarter of their height
                and clipped by `Card`'s own `overflow: hidden`. Sized by their
                content instead, the rows overflow and the grid scrolls, which
                is the whole point of the region.
              */
              gridAutoRows: "max-content",
              gap: 2,
              alignContent: "start",
            }}
          >
            {/* Folders first: they are where the rest of this folder's content
                is, and a reader scanning for a study should not have to scroll
                past its neighbours' chapters to find it. */}
            {visibleFolders.map((child) => (
              <LibraryFolderCard
                key={child.path}
                section={section}
                category={child}
              />
            ))}
            {visible.map((item) => (
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
        )}
      </Box>

      {/* A folder with something to click has something to say about clicking
          it — its own notes, or the hint. A category with neither items nor
          sub-folders registers no panel at all, so the shell's placeholder
          stands, exactly as the unknown-category miss above leaves it. */}
      {(items.length > 0 || found.children.length > 0) && (
        <RightPanel>
          {notes === undefined ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {t(`${section.chromeKey}.list.hint`)}
            </Typography>
          ) : (
            <LibraryNotes
              notes={notes}
              testId={`${section.listTestId}-notes`}
            />
          )}
        </RightPanel>
      )}
    </>
  );
}

export default LibraryList;
