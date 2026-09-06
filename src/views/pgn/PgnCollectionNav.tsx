import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import { LeftPanel } from "../main/leftPanel";
import type { LibrarySection } from "../library/section";
import { studyChapterCount } from "./collectionSummary";
import PgnIndexRow from "./PgnIndexRow";

/**
 * A collection's own left-hand nav — its studies, in the shell's sidebar slot,
 * while the reader is inside one of them.
 *
 * The counterpart of `LibrarySiblingNav`, one level up: that panel lists a
 * study's **chapters** while a chapter is open, this one lists a collection's
 * **studies** while a study is open. Together they make a `.pgn` of
 * twenty-eight studies read like a book — the table of contents stays beside
 * the page you are on, at whichever level you are on it.
 *
 * ### Where it does and does not appear
 *
 * Only on a study *inside* a collection. Not on the collection's own index
 * screen, where the body is already the list of studies and the app's sidebar
 * is what a reader there wants; and not on a chapter, where
 * `LibrarySiblingNav` claims the slot with that study's chapters — one panel at
 * a time, and the innermost list is the useful one.
 *
 * That is also why the header carries a **close**: claiming the slot hides the
 * app sidebar, so a panel has to offer the way back out. It goes to the
 * collection's index, exactly as a chapter's close goes to its study's list.
 */

type Props = {
  section: LibrarySection;
  /** The collection — its `children` are the studies listed here. */
  collection: LibraryCategory;
  /** Path of the study the reader is in, marked active in the list. */
  activePath: string;
};

function PgnCollectionNav({ section, collection, activePath }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const label = categoryLabel(collection, (key) => t(key), language);

  return (
    <LeftPanel>
      <Box
        data-testid="user-pgns-collection-nav"
        sx={{
          // The rail hands out a fixed width and the full height; the list
          // below is what takes the height and scrolls.
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
            component={RouterLink}
            to={`${section.routeBase}/${collection.path}`}
            variant="subtitle2"
            data-testid="user-pgns-collection-nav-home"
            sx={{
              fontWeight: 700,
              lineHeight: 1.3,
              minWidth: 0,
              color: "text.primary",
              textDecoration: "none",
              "&:hover": { color: "primary.main" },
            }}
          >
            {label}
          </Typography>
          <IconButton
            size="small"
            component={RouterLink}
            to={`${section.routeBase}/${collection.path}`}
            aria-label={t(`${section.chromeKey}.leftPanel.close`)}
            data-testid="user-pgns-collection-nav-close"
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
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 0.5, px: 0.5 }}
        >
          {collection.children.map((study) => (
            <PgnIndexRow
              key={study.path}
              dense
              to={`${section.routeBase}/${study.path}`}
              icon={<MenuBookRoundedIcon fontSize="small" />}
              primary={categoryLabel(study, (key) => t(key), language)}
              secondary={t(`${section.chromeKey}.collection.chapters`, {
                count: studyChapterCount(study, section.catalog),
              })}
              active={study.path === activePath}
              testId={`user-pgns-collection-nav-study-${study.id}`}
            />
          ))}
        </List>
      </Box>
    </LeftPanel>
  );
}

export default PgnCollectionNav;
