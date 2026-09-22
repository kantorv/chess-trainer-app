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
 * editor wraps the palettes and the board together rather than rendering a
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
 * ### Sized by the width it is given
 *
 * The editor lives in whatever column its host gives it — the Lobby's
 * right-hand panel is 320px at its narrowest — so a piece square shares the
 * row's width, up to `PALETTE_SQUARE_MAX_PX`, and is squared by its aspect
 * ratio. The editor is a natural-height column, so nothing has to add the
 * palettes' height up against the board's.
 *
 * It does not mirror under Hebrew: the editor pins the board and the palettes
 * LTR (`ForceLTR`), and a palette that jumped to the other side while the
 * board stayed put would be reading as a different board's palette.
 */

/** The largest a palette square grows — the size it had beside the old full-size board. */
const PALETTE_SQUARE_MAX_PX = 44;

/** King first, pawn last — the order a piece box is read in. */
const PIECES = ["K", "Q", "R", "B", "N", "P"] as const;

type PiecePaletteProps = {
  /** The editor's test-id prefix. */
  testId: string;
  color: "w" | "b";
  /** Empty this colour off the board — the trash's click. */
  onClear: () => void;
};

function PiecePalette({ testId, color, onClear }: PiecePaletteProps) {
  const { t } = useTranslation();

  const colorName = t(
    color === "w"
      ? "positionEditor.palette.colors.white"
      : "positionEditor.palette.colors.black",
  );
  const clearLabel = t("positionEditor.palette.clear", { color: colorName });

  return (
    <Box
      data-testid={`${testId}-palette-${color}`}
      role="group"
      aria-label={t(
        color === "w"
          ? "positionEditor.palette.white"
          : "positionEditor.palette.black",
      )}
      sx={{
        width: "100%",
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
            data-testid={`${testId}-spare-${pieceType}`}
            sx={{
              flex: "1 1 0",
              minWidth: 0,
              maxWidth: `${PALETTE_SQUARE_MAX_PX}px`,
              aspectRatio: "1 / 1",
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
          data-testid={`${testId}-trash-${color}`}
          onClick={onClear}
          // Set off from the pieces: everything to its left is something to
          // add, and it is the one thing that takes away.
          sx={{ marginInlineStart: 1, flexShrink: 0 }}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default PiecePalette;
