import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { parseFen } from "../../../lib/fen";
import { MASK_PRESETS, maskedPieces, type PieceMask } from "../../../lib/pieceMask";
import { RightPanel } from "../../main/rightPanel";
import EngineBoardSquare from "../../shared/EngineBoardSquare";
import { usePlayWithEngine } from "../../engine/play/usePlayWithEngine";
import MaskedPanel from "./MaskedPanel";

/**
 * Masked Pieces — Play with Engine, with the identity of the pieces you choose
 * replaced by another piece's graphic. The exercise is specified in
 * `docs/chess_piece_masking_technique.docx.md`.
 *
 * **The game underneath is ordinary chess.** This screen runs
 * `usePlayWithEngine` unmodified — the same hook, with no mode flag and no fork
 * — so legality, captures, check, castling, en passant, promotion, the engine's
 * evaluation and the engine's moves are computed from the true position and are
 * identical to `/engine/play`. That is the specification's §7 (masking is a
 * presentation-layer transformation) turned into an arrangement of files:
 * everything the mask touches is between the state and the pixels, and the two
 * places it touches are named below.
 *
 * ### The two places the mask is applied
 *
 * - **The board** — `maskedPieces(mask)` is an `options.pieces` renderer handed
 *   to the shared board square as an extra board option. `react-chessboard`
 *   still reports the real source and target squares, so `onPieceDrop` never
 *   learns that anything was hidden.
 * - **The notation** — the move list and the Variations tab, which sit right
 *   beside the board and would otherwise spell out in SAN exactly what the
 *   board is hiding (§3.2, §13). That one is a *setting*, on by default, and it
 *   is `MaskedPanel` that decides whether the mask reaches those two.
 *
 * Everything else — the eval bar, the promotion picker, the board square's
 * width discipline, the `?fen=` arrival — is `<EngineBoardSquare>` and the hook,
 * shared with `/engine/play`.
 *
 * The promotion picker is deliberately **not** masked: it is the player's own
 * choice of what to promote to, so drawing four identical pawns there would hide
 * a decision they are in the middle of making rather than one they are meant to
 * remember. The piece it produces is drawn masked from the next render on.
 */
function MaskedPlay() {
  const [searchParams] = useSearchParams();

  // The Board Editor's hand-off, exactly as `/engine/play` reads it: validated
  // here, ignored when it will not parse, and used only as initial state.
  const requested = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requested === null) return undefined;
    try {
      return parseFen(requested);
    } catch {
      return undefined;
    }
  }, [requested]);

  const state = usePlayWithEngine(initialFen);

  /*
    The screen opens on the doc's canonical exercise (§4): every queen, rook,
    bishop and knight drawn as a pawn, the kings left alone. Arriving on an
    unmasked board would make the screen indistinguishable from `/engine/play`
    until something was configured.
  */
  const [mask, setMask] = useState<PieceMask>(MASK_PRESETS.nonPawns);
  const [maskNotation, setMaskNotation] = useState(true);

  // A new renderer object is a new `options.pieces`, so this is memoised on the
  // mask rather than rebuilt on every ply change.
  const pieces = useMemo(() => maskedPieces(mask), [mask]);

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  return (
    <>
      <EngineBoardSquare
        id="masked-play"
        position={state.fen}
        orientation={state.orientation}
        arrows={state.arrows}
        allowDragging={
          state.isLive && !state.isEngineThinking && state.promotion === null
        }
        onPieceDrop={state.onPieceDrop}
        boardOptions={{ pieces }}
        showEvalBar={state.showEvalBar}
        score={topLine?.score ?? null}
        promotion={state.promotion}
        humanColor={state.humanColor}
        onResolvePromotion={state.resolvePromotion}
      />

      <RightPanel>
        <MaskedPanel
          state={state}
          mask={mask}
          onMaskChange={setMask}
          maskNotation={maskNotation}
          onMaskNotationChange={setMaskNotation}
        />
      </RightPanel>
    </>
  );
}

export default MaskedPlay;
