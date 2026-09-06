import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import { categoryLabel, type LibraryCategory } from "../../lib/libraryCatalog";
import type { LibrarySection } from "./section";

/**
 * "Back to <category>", at the top of every detail panel.
 *
 * Its own component because both detail bodies — a position's and a game's —
 * open with it, and because of the one thing about it that is easy to get
 * wrong: the glyph is mirrored from `theme.direction` rather than by a CSS
 * declaration. "Back" points at the start of the line, which is the right edge
 * under Hebrew, and the RTL emotion cache's stylis plugin flips paddings and
 * `direction` but has nothing to say about a `transform` — so a declaration
 * here would be a one-way flip that stayed wrong in the other language.
 */
function BackToCategory({
  section,
  category,
}: {
  section: LibrarySection;
  category: LibraryCategory;
}) {
  const { t, i18n } = useTranslation();
  const { direction } = useTheme();
  const language = asAppLanguage(i18n.language);

  return (
    <Box
      component={RouterLink}
      to={`${section.routeBase}/${category.path}`}
      data-testid={`${section.itemTestId}-detail-back`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        mb: 1.5,
        color: "text.secondary",
        textDecoration: "none",
        fontSize: 13,
      }}
    >
      <ArrowBackRoundedIcon
        fontSize="small"
        sx={{ transform: direction === "rtl" ? "scaleX(-1)" : "none" }}
      />
      {t(`${section.chromeKey}.detail.back`, {
        category: categoryLabel(category, (key) => t(key), language),
      })}
    </Box>
  );
}

export default BackToCategory;
