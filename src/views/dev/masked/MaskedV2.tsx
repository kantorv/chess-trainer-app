import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { parseFen } from "../../../lib/fen";
import { MASK_PRESETS, maskedPieces, type PieceMask } from "../../../lib/pieceMask";
import MaskEditor from "../../masked/play/MaskEditor";
import PlayBoardScreen from "../play/PlayBoardScreen";
import { usePlayBoard } from "../play/usePlayBoard";

/**
 * **Masked Pieces v2** (`/dev/masked`) — Play with Engine v2 with the pieces in
 * disguise, and that is the *whole* difference
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md) §4).
 *
 * It runs `usePlayBoard` — the same composition Play v2 runs, with no mode flag
 * and no fork — and renders the same `PlayBoardScreen`. What it adds is three
 * props and one tab:
 *
 * - `mask` / `pieces`, which reach `options.pieces` on the board and the
 *   captured strips' icons, so a masked rook is *pixel-identical* to a real
 *   pawn rather than merely similar (the renderers come out of the library's
 *   own `defaultPieces`);
 * - `maskNotation`, which is what lets the move list and the variations block
 *   print coordinates for a move whose piece is hidden — `Nf3` beside a masked
 *   board hands back the identity the board is busy hiding;
 * - the mask editor, as an extra tab.
 *
 * Everything the mask does is between the state and the pixels. The board goes
 * on reporting the real source and target squares, so legality, captures,
 * check, castling, en passant, promotion, the evaluation and the engine's own
 * moves are computed from the true position and are identical to `/dev/play`.
 * That is §7 of `docs/chess_piece_masking_technique.docx.md` — masking is a
 * presentation concern — held by construction rather than by care.
 *
 * ## And it does not persist
 *
 * `persist` is not passed. A saved game is resumed on the *play* screen, where
 * the mask does not exist, so it would come back with its costume gone — which
 * is why `persist` is a start field one screen passes and this one does not,
 * rather than the store learning what a mask is.
 *
 * The promotion picker is deliberately **not** masked: it is the player's own
 * choice of a real piece, and disguising the choices would make it a guess.
 */
function MaskedV2() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const requestedFen = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requestedFen === null) return undefined;
    try {
      return parseFen(requestedFen);
    } catch {
      return undefined;
    }
  }, [requestedFen]);

  // Play v2's composition, verbatim — and no `persist`, for the reason above.
  const state = usePlayBoard({ fen: initialFen });

  /*
    Opening on a real mask rather than the identity one: an unmasked board
    would make this screen indistinguishable from `/dev/play`. The notation
    follows the board by default, so nothing names what the pieces are hiding.
  */
  const [mask, setMask] = useState<PieceMask>(MASK_PRESETS.nonPawns);
  const [maskNotation, setMaskNotation] = useState(true);

  // Memoised on the mask rather than rebuilt on every ply change.
  const pieces = useMemo(() => maskedPieces(mask), [mask]);

  return (
    <PlayBoardScreen
      id="dev-masked"
      state={state}
      mask={mask}
      maskNotation={maskNotation}
      pieces={pieces}
      extraTabs={[
        {
          id: "mask",
          label: t("dev.tabs.mask"),
          content: (
            <MaskEditor
              mask={mask}
              onMaskChange={setMask}
              maskNotation={maskNotation}
              onMaskNotationChange={setMaskNotation}
            />
          ),
        },
      ]}
    />
  );
}

export default MaskedV2;
