import { useState } from "react";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  localizedText,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import { RightPanel } from "../main/rightPanel";
import LibraryNotes from "../library/LibraryNotes";
import { filterLibraryCategories } from "../library/librarySearch";
import type { LibrarySection } from "../library/section";
import {
  collectionSummaryOf,
  looseChaptersOf,
  studyChapterCount,
} from "./collectionSummary";
import PgnIndexRow from "./PgnIndexRow";

/**
 * **A collection's index screen** — the front page of a `.pgn` file that holds
 * several studies (`lib/pgnKind.ts`, kind `collection`).
 *
 * The shared `LibraryList` is the right screen for a folder of *chapters*: a
 * card each, previewing the position, because a position is what a chapter is.
 * It is the wrong screen for a folder of *studies*. Twenty-eight cards, each
 * previewing the first position of a study that is about a technique rather
 * than about that position, is a screenful of near-identical boards to scroll
 * before reading a single name. So a collection gets a screen of its own:
 *
 * - **A header that says what the whole file is** — how many studies, how many
 *   chapters, and who wrote them, all derived from the games themselves
 *   (`collectionSummary.ts`) and each part printed only when the data has it.
 * - **Its authored notes, in the body.** The one place a reader of an index
 *   wants prose is on the index, so a collection's sibling `.mdx`
 *   (`<file>.mdx`, the section's existing one-file convention) renders above
 *   the list rather than in the narrow right-hand panel. `LibraryNotes` styles
 *   it either way — `inline` is only about which box owns the scrolling.
 * - **A row per study, not a card**: name, chapter count, and the search box
 *   filtering by name.
 *
 * The screens *below* it are untouched: a study inside a collection is an
 * ordinary study, and `LibraryList` lists its chapters exactly as it lists the
 * chapters of a study that came in a file of its own. What changes there is
 * only the sidebar — `PgnCollectionNav` puts the collection's other studies
 * where the app's nav tree was.
 *
 * ### Its one region scrolls, and the header does not
 *
 * The shell hands the screen a fixed square (see `LibraryList` for the whole
 * rule): a flex column, a `flexShrink: 0` header, and one `flex: 1;
 * minHeight: 0; overflowY: auto` region below it. The notes and the study list
 * share that region — a note is part of the index, so it scrolls with it
 * rather than in a box of its own.
 */

type Props = {
  section: LibrarySection;
  /** The collection. Its `children` are its studies. */
  category: LibraryCategory;
};

function PgnCollection({ section, category }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const [query, setQuery] = useState("");

  const label = categoryLabel(category, (key) => t(key), language);
  const summary = collectionSummaryOf(category, section.catalog);
  const notes = section.folderNotes?.[category.path];

  const studies = filterLibraryCategories(category.children, query, (child) =>
    categoryLabel(child, (key) => t(key), language),
  );
  // A chapter of the file that named no study of its own — rare, and it would
  // be unreachable if the index did not list it.
  const loose = looseChaptersOf(category, section.catalog);

  const facts = [
    t(`${section.chromeKey}.collection.studies`, { count: summary.studies }),
    t(`${section.chromeKey}.collection.chapters`, { count: summary.chapters }),
  ];

  return (
    <>
      <Box
        data-testid="user-pgns-collection"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          data-testid="user-pgns-collection-header"
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {label}
            </Typography>
            <Typography
              data-testid="user-pgns-collection-facts"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {facts.join(" · ")}
              {summary.author !== undefined && (
                <>
                  {" · "}
                  {summary.author.url === undefined ? (
                    t(`${section.chromeKey}.collection.by`, {
                      author: summary.author.name,
                    })
                  ) : (
                    <Link
                      href={summary.author.url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="user-pgns-collection-author"
                    >
                      {t(`${section.chromeKey}.collection.by`, {
                        author: summary.author.name,
                      })}
                    </Link>
                  )}
                </>
              )}
            </Typography>
          </Box>

          <TextField
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(`${section.chromeKey}.collection.search`)}
            slotProps={{
              htmlInput: {
                "data-testid": "user-pgns-collection-search",
                "aria-label": t(`${section.chromeKey}.collection.search`),
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
        </Box>

        <Box
          data-testid="user-pgns-collection-body"
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          {notes !== undefined && (
            <Box sx={{ mb: 2 }}>
              <LibraryNotes
                inline
                notes={notes}
                testId="user-pgns-collection-notes"
              />
            </Box>
          )}

          {studies.length === 0 && loose.length === 0 ? (
            <Typography
              data-testid="user-pgns-collection-no-matches"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t(`${section.chromeKey}.collection.noMatches`)}
            </Typography>
          ) : (
            <List disablePadding>
              {studies.map((study) => (
                <PgnIndexRow
                  key={study.path}
                  to={`${section.routeBase}/${study.path}`}
                  icon={<MenuBookRoundedIcon fontSize="small" />}
                  primary={categoryLabel(study, (key) => t(key), language)}
                  secondary={t(`${section.chromeKey}.collection.chapters`, {
                    count: studyChapterCount(study, section.catalog),
                  })}
                  testId={`user-pgns-collection-study-${study.id}`}
                />
              ))}
              {loose.map((item) => (
                <PgnIndexRow
                  key={item.id}
                  to={`${section.routeBase}/${item.category}/${item.id}`}
                  icon={<ArticleRoundedIcon fontSize="small" />}
                  primary={localizedText(item.name, language)}
                  secondary={t(`${section.chromeKey}.list.moves`, {
                    count: item.kind === "game" ? item.game.moves.length : 0,
                  })}
                  testId={`user-pgns-collection-chapter-${item.id}`}
                />
              ))}
            </List>
          )}
        </Box>
      </Box>

      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t(`${section.chromeKey}.collection.hint`)}
        </Typography>
      </RightPanel>
    </>
  );
}

export default PgnCollection;
