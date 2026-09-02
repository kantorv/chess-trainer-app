import { useEffect, useRef, type Ref } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { moveRowsOf } from "../../../lib/gameNavigation";
import type { ParsedGame, ParsedMove } from "../../../lib/pgn";

/**
 * The lichess-style move list: numbered pairs, the current ply highlighted,
 * every move a jump target.
 *
 * Presentational on purpose — the selected ply comes in as a prop and goes out
 * through `onSelectPly`, so `useGameNavigation` owns the state and this renders
 * against a fixture game in tests. It sits in the shell's right-hand aside,
 * *outside* `ForceLTR`: the panel is chrome and mirrors under Hebrew. Only the
 * board is exempt (see the root `CLAUDE.md`).
 */

type MoveListProps = {
  game: ParsedGame;
  /** The selected half-move; 0 is the starting position. */
  currentPly: number;
  onSelectPly: (ply: number) => void;
};

/**
 * SAN is Latin text sitting in a container that may be RTL: without an explicit
 * direction and its own bidi isolate, "Nf3" and the move numbers get reordered
 * by the surrounding paragraph direction, and a token can bleed into its
 * neighbour across the two columns.
 *
 * The direction is carried by a `dir="ltr"` **attribute** on each token, not by
 * CSS. Under Hebrew these styles go through the RTL emotion cache, whose stylis
 * plugin flips `direction: ltr` into `direction: rtl` exactly as it flips the
 * paddings — a CSS declaration here would be reversed into the bug it exists to
 * prevent. The attribute is out of that plugin's reach. (`unicode-bidi` is not
 * flipped, and pairs with the attribute the way the HTML default sheet does.)
 */
const sanTokenSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

/** Shared box model for every clickable row of the list. */
const cellSx = {
  justifyContent: "flex-start",
  // Indentation follows the reading direction — never `paddingLeft`, which
  // would sit on the wrong side under Hebrew.
  paddingInlineStart: 0.75,
  paddingInlineEnd: 0.75,
  paddingBlock: 0.25,
  borderRadius: 0.5,
  minWidth: 0,
  width: "100%",
} as const;

const selectedCellSx = {
  bgcolor: "primary.main",
  color: "primary.contrastText",
  fontWeight: 700,
} as const;

/** One clickable SAN cell, or an empty slot when that half of the pair is absent. */
function MoveCell({
  move,
  isCurrent,
  onSelect,
  activeRef,
}: {
  move: ParsedMove | null;
  isCurrent: boolean;
  onSelect: (ply: number) => void;
  activeRef: Ref<HTMLButtonElement>;
}) {
  if (move === null) {
    // A game that starts with Black to move opens with an empty White slot.
    return <Box aria-hidden sx={{ ...cellSx, visibility: "hidden" }} />;
  }

  return (
    <ButtonBase
      ref={isCurrent ? activeRef : undefined}
      dir="ltr"
      data-testid={`move-ply-${move.ply}`}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => onSelect(move.ply)}
      sx={{ ...cellSx, ...sanTokenSx, ...(isCurrent ? selectedCellSx : {}) }}
    >
      {move.san}
    </ButtonBase>
  );
}

function MoveList({ game, currentPly, onSelectPly }: MoveListProps) {
  const { t } = useTranslation();
  const rows = moveRowsOf(game);

  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    /*
      The aside around this list is the scroll container (`Layout.tsx` sets
      `overflow: auto` on it), so `block: "nearest"` scrolls that and nothing
      else. Optional call: jsdom implements no scrolling at all and leaves
      `scrollIntoView` undefined.
    */
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentPly]);

  return (
    <Box data-testid="move-list">
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {t("moveList.title")}
      </Typography>

      <ButtonBase
        ref={currentPly === 0 ? activeRef : undefined}
        data-testid="move-ply-0"
        aria-current={currentPly === 0 ? "true" : undefined}
        onClick={() => onSelectPly(0)}
        sx={{
          ...cellSx,
          my: 0.5,
          fontSize: "0.8125rem",
          ...(currentPly === 0 ? selectedCellSx : {}),
        }}
      >
        {t("moveList.startPosition")}
      </ButtonBase>

      {rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("moveList.noMoves")}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            // Number, White, Black — the pair wraps into two columns rather
            // than giving every half-move its own row.
            gridTemplateColumns: "auto 1fr 1fr",
            alignItems: "center",
            columnGap: 0.5,
          }}
        >
          {rows.map((row) => (
            <Box key={row.number} sx={{ display: "contents" }}>
              <Typography
                component="span"
                dir="ltr"
                data-testid={`move-number-${row.number}`}
                sx={{
                  ...sanTokenSx,
                  color: "text.secondary",
                  paddingInlineEnd: 0.5,
                  textAlign: "end",
                }}
              >
                {row.number}.
              </Typography>
              <MoveCell
                move={row.white}
                isCurrent={row.white?.ply === currentPly}
                onSelect={onSelectPly}
                activeRef={activeRef}
              />
              <MoveCell
                move={row.black}
                isCurrent={row.black?.ply === currentPly}
                onSelect={onSelectPly}
                activeRef={activeRef}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default MoveList;
