import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { parseFen } from "../../../lib/fen";
import { findSavedGame } from "../../../lib/savedGameStore";
import { RightPanel } from "../../main/rightPanel";
import EngineBoardSquare from "../../shared/EngineBoardSquare";
import EnginePanel from "./EnginePanel";
import { usePlayWithEngine } from "./usePlayWithEngine";

/**
 * Play with Engine — a full game against Stockfish, with the game and the
 * engine's thinking in the shell's right-hand panel.
 *
 * The screen fills two of the shell's regions and draws no columns of its own:
 *
 * - the **board square** holds the evaluation bar, the board and the promotion
 *   picker — all three of which are `<EngineBoardSquare>` (`views/shared/`),
 *   shared with the Masked Pieces screen so the width discipline that squares
 *   the board exists in one place;
 * - the **right-hand panel** (`<RightPanel>`) holds `EnginePanel` — the Game /
 *   Engine / Variations tabs over the board controls.
 *
 * ### Arriving from the Board Editor
 *
 * `/engine/play?fen=<position>` starts the game from that position, the same way
 * `/tools/analysis` does — the FEN travels in the URL so the link survives being
 * bookmarked, shared or reloaded. It is validated here with `parseFen`, and a
 * parameter that will not pass is ignored rather than allowed to throw on
 * someone else's mistyped link. The hook takes it as its *initial* state, so
 * nothing is written from an effect.
 *
 * ### Resuming a saved game
 *
 * `/engine/play?saved=<id>` picks a game the reader was playing back up: the
 * moves, the side they were on and the engine settings all come out of the
 * store (`lib/savedGameStore.ts`) and are handed to the hook as initial state,
 * exactly as the `?fen=` arrival is. An id that names nothing opens an ordinary
 * new game, the way an unreadable `?fen=` does.
 *
 * This is also **the screen that saves**. `persist` is passed here and nowhere
 * else: Masked Pieces runs the same hook verbatim, and a masked game resumed
 * here would come back with its costume gone — see the hook.
 *
 * All the behaviour lives in `usePlayWithEngine`; this component is the layout.
 * `<RightPanel>` portals the panel out of this tree, so it still shares this
 * screen's state by closure and nothing is threaded through the shell.
 */
function PlayWithEngine() {
  const [searchParams] = useSearchParams();

  /*
    The position handed over by the Board Editor, if this is that arrival. Only
    the first render's value is ever used (see `usePlayWithEngine`), but parsing
    it on every render would build a `chess.js` instance for nothing.
  */
  const requested = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requested === null) return undefined;
    try {
      return parseFen(requested);
    } catch {
      // A link nobody can read starts an ordinary game, as if the parameter had
      // not been there at all.
      return undefined;
    }
  }, [requested]);

  /*
    The saved game being resumed, if this is that arrival. Looked up once: the
    hook reads it on the first render only, and walking the store on every
    render would parse every stored PGN for nothing.
  */
  const requestedSaved = searchParams.get("saved");
  const resume = useMemo(
    () => findSavedGame(requestedSaved),
    [requestedSaved],
  );

  const state = usePlayWithEngine({ fen: initialFen, resume, persist: true });

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  return (
    <>
      <EngineBoardSquare
        id="play-with-engine"
        position={state.fen}
        orientation={state.orientation}
        /*
          The move that produced the position on screen. External arrows are
          never cleared by the board itself (`.claude/rules/chessboard.md` §3.4),
          so this is the whole set for the current ply, recomputed on every
          change.
        */
        arrows={state.arrows}
        /*
          Draggable only on the live position, on the human's turn, with no
          promotion picker open. Off the live position the board is a review of
          an earlier ply and a drag would apply to a position nobody is looking
          at.
        */
        allowDragging={
          state.isLive && !state.isEngineThinking && state.promotion === null
        }
        onPieceDrop={state.onPieceDrop}
        showEvalBar={state.showEvalBar}
        score={topLine?.score ?? null}
        promotion={state.promotion}
        humanColor={state.humanColor}
        onResolvePromotion={state.resolvePromotion}
      />

      <RightPanel>
        <EnginePanel state={state} />
      </RightPanel>
    </>
  );
}

export default PlayWithEngine;
