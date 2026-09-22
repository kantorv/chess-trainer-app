import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { KnownMoveOpening } from "../../lib/openings";

/**
 * **The book's continuations from the position on screen** — the Openings
 * explorer's Book tab (CTA-78): every move eco.json names from here, with the
 * opening it leads to. Presentational: the moves come from
 * `useOpeningBookModule`, a click plays one and the pointer tells the screen
 * which row it is over (its arrow is recoloured).
 *
 * Only the moves the book can name are listed — an off-book move is still
 * playable on the board; it simply is not a book continuation.
 */
function OpeningBookList({
  moves,
  onPlay,
  onHover,
}: {
  moves: readonly KnownMoveOpening[];
  onPlay: (san: string) => void;
  onHover: (move: KnownMoveOpening | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <Box data-testid="openings-book" sx={{ display: "grid", gap: 0.5 }}>
      {moves.length === 0 ? (
        <Typography
          variant="body2"
          data-testid="openings-book-empty"
          sx={{ color: "text.secondary", px: 1 }}
        >
          {t("openings.book.empty")}
        </Typography>
      ) : (
        <>
          <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
            {t("openings.book.help")}
          </Typography>
          <List dense disablePadding data-testid="openings-book-list">
            {moves.map((move) => (
              <ListItemButton
                key={move.san}
                onClick={() => onPlay(move.san)}
                onMouseEnter={() => onHover(move)}
                onMouseLeave={() => onHover(null)}
                data-testid={`openings-book-move-${move.san}`}
                sx={{ borderRadius: 0.5 }}
              >
                <ListItemText
                  primary={<span dir="ltr">{move.san}</span>}
                  secondary={<span dir="ltr">{move.opening.name}</span>}
                />
                <Chip size="small" dir="ltr" label={move.opening.eco} />
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </Box>
  );
}

export default OpeningBookList;
