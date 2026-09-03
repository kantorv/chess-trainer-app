import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { useTranslation } from "react-i18next";
import { SparePiece } from "react-chessboard";

/**
 * One row of spare pieces — black above the board, white below it, as on
 * lichess — with the trash at its trailing end.
 *
 * `SparePiece` only works inside a `ChessboardProvider`, which is why the
 * screen wraps the palettes and the board together rather than rendering a
 * plain `<Chessboard>` (`.claude/rules/chessboard.md` §2). Dragging one onto a
 * square places it; the board reports that through the same `onPieceDrop` a
 * board-to-board drag uses, with `isSparePiece` telling the two apart.
 *
 * ### The trash does two things, and both are deletions
 *
 * Dropping a piece anywhere off the board removes it — the board reports a drop
 * outside itself as `targetSquare: null` — so the trash is first of all a place
 * to *aim* a discarded piece, and the palettes themselves work the same way.
 * Clicking it takes that whole colour off the board, which is the only way to
 * empty one side without dragging sixteen pieces into the margin.
 *
 * ### Why this file owns the height
 *
 * The palettes sit inside the board square the shell hands the screen, so they
 * take their height out of the board exactly as the eval bar takes its width
 * (`.claude/rules/chessboard.md` §5). `PALETTES_TOTAL_PX` is what the board's
 * side gives up, and it is defined here beside the two numbers it is the sum of
 * — the screen subtracts the constant rather than re-deriving it.
 *
 * It does not mirror under Hebrew: the whole board square is wrapped in
 * `ForceLTR` by `Layout.tsx`, and a palette that jumped to the other side while
 * the board stayed put would be reading as a different board's palette.
 */

/** The side of one palette square, and the gap above and below the board. */
export const PALETTE_SQUARE_PX = 44;
export const PALETTE_GAP_PX = 8;
/** What the two palettes and their two gaps take out of the board's side. */
export const PALETTES_TOTAL_PX = 2 * (PALETTE_SQUARE_PX + PALETTE_GAP_PX);

/** King first, pawn last — the order a piece box is read in. */
const PIECES = ["K", "Q", "R", "B", "N", "P"] as const;

type PiecePaletteProps = {
  color: "w" | "b";
  /** Empty this colour off the board — the trash's click. */
  onClear: () => void;
};

function PiecePalette({ color, onClear }: PiecePaletteProps) {
  const { t } = useTranslation();

  const colorName = t(
    color === "w" ? "editor.palette.colors.white" : "editor.palette.colors.black",
  );
  const clearLabel = t("editor.palette.clear", { color: colorName });

  return (
    <Box
      data-testid={`editor-palette-${color}`}
      role="group"
      aria-label={t(
        color === "w" ? "editor.palette.white" : "editor.palette.black",
      )}
      sx={{
        // The height is the contract with the board's side; never let flex
        // stretch or shrink it.
        height: `${PALETTE_SQUARE_PX}px`,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
      }}
    >
      {PIECES.map((piece) => {
        const pieceType = `${color}${piece}`;
        return (
          <Box
            key={pieceType}
            data-testid={`editor-spare-${pieceType}`}
            sx={{
              width: `${PALETTE_SQUARE_PX}px`,
              height: `${PALETTE_SQUARE_PX}px`,
            }}
          >
            <SparePiece pieceType={pieceType} />
          </Box>
        );
      })}

      <Tooltip title={clearLabel}>
        <IconButton
          size="small"
          aria-label={clearLabel}
          data-testid={`editor-trash-${color}`}
          onClick={onClear}
          // Set off from the pieces: everything to its left is something to
          // add, and it is the one thing that takes away.
          sx={{ marginInlineStart: 1 }}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default PiecePalette;
