import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  localizedText,
  sideToMoveOf,
  type LibraryItem,
} from "../../lib/libraryCatalog";
import { gameSummaryOf } from "./gameSummary";
import type { LibrarySection } from "./section";

/**
 * The strip under a card's preview board: what this item *is*, in the two or
 * three lines a 160px card can hold.
 *
 * **This is the list screen's one branch on the item kind**, extracted so that
 * `LibraryList` stays a grid of cards and the branch has somewhere to be
 * explained. The two kinds want different things said about them:
 *
 * | Kind | Footer |
 * | --- | --- |
 * | a position | its name, then whose move it is — the question the position asks |
 * | a game | its name, then how it ended and how long it ran, then where and when it was played and what was opened |
 *
 * "White to play" would be a strange caption for a game you are about to
 * replay from move one, which is why this is a branch rather than one caption
 * with a different value in it.
 *
 * Everything below the name is **conditional on the data having it**
 * (`gameSummaryOf`), so an annotated master game fills all four lines and a
 * study chapter that is a position and a comment shows its name and its length
 * and stops. Nothing renders a placeholder or an empty row.
 */

/** One muted line, clipped rather than wrapped — a card is narrow. */
function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        color: "text.secondary",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </Typography>
  );
}

/** The separator between two facts on one line. */
const DOT = " · ";

type Props = {
  section: LibrarySection;
  item: LibraryItem;
};

function LibraryCardFooter({ section, item }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const name = localizedText(item.name, language);

  /*
    The name wraps — it is what the reader is scanning for — but only so far:
    a chapter titled with two full player names would otherwise push the cards
    in its grid row to twice the height of the rest.
  */
  const title = (
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
  );

  if (item.kind === "position") {
    return (
      <Box sx={{ px: 1.5, pb: 1.5 }}>
        {title}
        <MetaLine>{t(`${section.chromeKey}.sideToMove.${sideToMoveOf(item)}`)}</MetaLine>
      </Box>
    );
  }

  const summary = gameSummaryOf(item.game, name);
  const length = t(`${section.chromeKey}.list.moves`, { count: summary.moves });
  const opening = [summary.opening, summary.eco]
    .filter((part) => part !== undefined)
    .join(DOT);

  return (
    <Box
      data-testid={`${section.itemTestId}-footer-${item.id}`}
      sx={{
        px: 1.5,
        pb: 1.5,
        pt: 1,
        // What makes it read as a footer rather than as text that happens to
        // sit below a board: its own tint, and a rule against the board's edge.
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "action.hover",
      }}
    >
      {title}
      <MetaLine>
        {summary.result === undefined
          ? length
          : `${summary.result}${DOT}${length}`}
      </MetaLine>
      {summary.occasion !== undefined && <MetaLine>{summary.occasion}</MetaLine>}
      {opening !== "" && <MetaLine>{opening}</MetaLine>}
    </Box>
  );
}

export default LibraryCardFooter;
