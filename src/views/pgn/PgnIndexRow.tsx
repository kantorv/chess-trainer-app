import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { Link as RouterLink } from "react-router";
import type { ReactNode } from "react";

/**
 * One row of a collection: an icon, what the thing is called, and one line
 * saying how much is in it.
 *
 * The shape the collection screens are built out of — the index in the board
 * area and the left-hand nav beside it both list the same studies, so they list
 * them the same way and the row is written once. It is a **row, not a card**:
 * a collection is twenty-eight studies deep, and twenty-eight preview boards
 * would be a screenful of scrolling before the reader has read a single name.
 * (A study's own chapters *are* cards — there the position is the point. That
 * is `LibraryList`, unchanged.)
 *
 * `dense` is the only difference between the two uses: the nav lives in the
 * shell's 280px rail and the index has the board square to itself.
 */

type Props = {
  to: string;
  icon: ReactNode;
  /** The name — wraps to two lines, then clips. */
  primary: string;
  /** One line under it: how many chapters, how long a game is. */
  secondary: string;
  /** The row the reader is standing on, if this list has one. */
  active?: boolean;
  testId: string;
  dense?: boolean;
};

function PgnIndexRow({
  to,
  icon,
  primary,
  secondary,
  active = false,
  testId,
  dense = false,
}: Props) {
  return (
    <ListItemButton
      component={RouterLink}
      to={to}
      selected={active}
      aria-current={active ? "true" : undefined}
      data-testid={testId}
      sx={{
        px: 1.5,
        py: dense ? 0.75 : 1,
        // The icon sits against the top of a name that wrapped, rather than
        // floating in the middle of two lines of different lengths.
        alignItems: "flex-start",
        borderRadius: 1,
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 0,
          marginInlineEnd: 1.5,
          mt: 0.25,
          color: active ? "primary.main" : "text.secondary",
        }}
      >
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={primary}
        secondary={secondary}
        slotProps={{
          primary: {
            sx: {
              fontWeight: active ? 700 : 600,
              lineHeight: 1.3,
              // Two lines of a long study name, then an ellipsis — a rail row
              // must not grow without bound.
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            },
          },
          secondary: {
            sx: {
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          },
        }}
      />
    </ListItemButton>
  );
}

export default PgnIndexRow;
