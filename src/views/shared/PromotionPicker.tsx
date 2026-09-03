import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { useTranslation } from "react-i18next";
import {
  chessColumnToColumnIndex,
  defaultPieces,
  type PieceRenderObject,
} from "react-chessboard";

/**
 * The promotion picker: the four choices, stacked over the file the pawn is
 * promoting on, with a scrim behind them.
 *
 * `react-chessboard` v5 removed every built-in promotion prop, so this is ours
 * to draw (`.claude/rules/chessboard.md` §3.5). Hardcoding `promotion: 'q'` is a
 * demo shortcut the two demo boards are allowed and this screen is not — a game
 * you actually play has to be able to underpromote.
 *
 * The pieces are `defaultPieces` from the library, so the choices are drawn in
 * exactly the set the board itself is using.
 *
 * Positioned over the board rather than beside it: the picker overlays the board
 * square, so it is placed in percentages of the board's own box and needs no
 * measurement of the DOM. Column comes from `chessColumnToColumnIndex`, which
 * already accounts for the board being turned around; the stack grows down from
 * the promoting edge, which is the top of the board for the side moving up it.
 */

const CHOICES = ["q", "r", "n", "b"] as const;
export type PromotionChoice = (typeof CHOICES)[number];

type PromotionPickerProps = {
  /** The square being promoted onto, e.g. `"e8"` — its file places the stack. */
  targetSquare: string;
  orientation: "white" | "black";
  /** `"w"` or `"b"`: which colour's pieces to offer. */
  color: "w" | "b";
  /** A choice, or `null` when the picker is dismissed without one. */
  onSelect: (piece: PromotionChoice | null) => void;
};

function PromotionPicker({
  targetSquare,
  orientation,
  color,
  onSelect,
}: PromotionPickerProps) {
  const { t } = useTranslation();

  const file = targetSquare.match(/^[a-z]+/)?.[0] ?? "a";
  const column = chessColumnToColumnIndex(file, 8, orientation);

  /*
    Which edge the stack hangs from: the promotion square is at the top of the
    board for the side playing up it, and at the bottom for the side playing
    down it. Turning the board over swaps both.
  */
  const promotingUpwards = color === "w";
  const fromTop = promotingUpwards === (orientation === "white");

  return (
    <>
      {/* Clicking anywhere off the choices cancels — including a right-click,
          which would otherwise open the browser's menu over the board. */}
      <Box
        data-testid="promotion-scrim"
        onClick={() => onSelect(null)}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect(null);
        }}
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: "rgba(0, 0, 0, 0.35)",
          zIndex: 10,
        }}
      />

      <Box
        data-testid="promotion-picker"
        role="group"
        aria-label={t("promotion.title")}
        sx={{
          position: "absolute",
          // One square is an eighth of the board, in both directions.
          insetInlineStart: `${column * 12.5}%`,
          [fromTop ? "top" : "bottom"]: 0,
          width: "12.5%",
          display: "flex",
          flexDirection: fromTop ? "column" : "column-reverse",
          zIndex: 11,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "background.paper",
          boxShadow: 6,
        }}
      >
        {CHOICES.map((piece) => {
          const key =
            `${color}${piece.toUpperCase()}` as keyof PieceRenderObject;
          const render = defaultPieces[key];

          return (
            <ButtonBase
              key={piece}
              data-testid={`promotion-choice-${piece}`}
              aria-label={t(`promotion.pieces.${piece}`)}
              onClick={() => onSelect(piece)}
              sx={{
                width: "100%",
                aspectRatio: "1 / 1",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {render ? render() : piece.toUpperCase()}
            </ButtonBase>
          );
        })}
      </Box>
    </>
  );
}

export default PromotionPicker;
