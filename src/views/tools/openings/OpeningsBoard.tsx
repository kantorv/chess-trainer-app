import { useMemo } from "react";
import Box from "@mui/material/Box";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import { Chessboard, type ChessboardOptions, type PieceDropHandlerArgs } from "react-chessboard";
import { FenParseError, parseFen } from "../../../lib/fen";
import { RightPanel } from "../../main/rightPanel";
import PromotionPicker from "../../shared/PromotionPicker";
import OpeningsPanel from "./OpeningsPanel";
import { useOpenings } from "./useOpenings";

/**
 * Openings — a regular board the reader plays through, with the opening
 * eco.json recognises at the position on screen, an arrow and a list entry
 * for every *book* continuation from there, and a variation tree behind it
 * all: stepping back and playing a different move keeps both continuations,
 * exactly as the Analysis Board does.
 *
 * The screen fills two of the shell's regions and draws no columns of its own:
 *
 * - the **board square** holds the board and nothing else, exactly like Load
 *   PGN — there is no eval bar and no palette competing for the width;
 * - the **right-hand panel** (`<RightPanel>`) holds `OpeningsPanel` — the
 *   current opening, the explorer list, a tab over the move list, and the
 *   board controls.
 *
 * ### Arriving with a position
 *
 * `/tools/openings?fen=<position>` opens on that position — the same `?fen=`
 * hand-off the Board Editor, Play with Engine and the Analysis Board already
 * take (see the root `CLAUDE.md`, "An editor owns a position, not a game").
 * This screen does not replay anything, so unlike the two library hand-offs
 * that carry `?game=`, it only ever needs the position — which is exactly what
 * the four entry points that link here (Analysis Board, Load PGN, a library
 * game detail, the Board Editor) already have on screen at the ply the reader
 * is looking at.
 *
 * Validated with `parseFen` and taken as *initial* state, like every other
 * screen that reads this parameter: a link nobody can read opens on the
 * starting position instead of throwing.
 */
function OpeningsBoard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const requested = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requested === null) return undefined;
    try {
      return parseFen(requested);
    } catch (cause) {
      if (cause instanceof FenParseError) return undefined;
      throw cause;
    }
  }, [requested]);

  const state = useOpenings(initialFen);

  /**
   * "Play from here" — continue the position on screen against the engine. The
   * FEN travels to `/engine/play` as a query parameter, the same `?fen=` carrier
   * every other screen's hand-off uses: it survives a bookmark or a reload, and
   * Play with Engine takes it as its initial position, deriving orientation and
   * `playAs` from it. This screen never replays a line, so no `?move=` is sent.
   */
  const onPlayFromHere = () =>
    navigate({
      pathname: "/engine/play",
      search: createSearchParams({ fen: state.fen }).toString(),
    });

  const chessboardOptions: ChessboardOptions = {
    id: "openings-board",
    position: state.fen,
    boardOrientation: state.orientation,
    arrows: state.arrows,
    onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      state.onPieceDrop({ sourceSquare, targetSquare }),
    // Dragging stays on at every ply: a drop from an earlier position branches
    // the game tree (see `useOpenings`), which is what exploring an opening is.
    allowDragging: state.promotion === null,
  };

  return (
    <>
      <Box
        data-testid="openings-screen"
        sx={{ width: "100%", height: "100%", position: "relative", borderRadius: 1 }}
      >
        <Chessboard options={chessboardOptions} />

        {state.promotion && (
          <PromotionPicker
            targetSquare={state.promotion.to}
            orientation={state.orientation}
            // The side to move in the position on screen is the side pushing
            // the pawn — the move has not been applied yet, so `state.fen`
            // still describes the position it is being made from.
            color={state.fen.split(" ")[1] === "b" ? "b" : "w"}
            onSelect={state.resolvePromotion}
          />
        )}
      </Box>

      <RightPanel>
        <OpeningsPanel state={state} onPlayFromHere={onPlayFromHere} />
      </RightPanel>
    </>
  );
}

export default OpeningsBoard;
