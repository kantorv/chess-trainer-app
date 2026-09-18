import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { parseFen } from "../../../lib/fen";
import { findDevSavedGame } from "../core/devStores";
import PlayBoardScreen from "./PlayBoardScreen";
import { usePlayBoard } from "./usePlayBoard";

/**
 * **Play with Engine v2** (`/dev/play`) — the linear board of the unified core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md) §4).
 *
 * The whole screen is the two arrivals and one call each to the composition
 * hook and the shared screen. There is nothing else: the board square, the
 * panel skeleton, the pinned variations, the merged move list and the
 * next-moves bar are all the core's, and Masked Pieces v2 renders the same
 * `PlayBoardScreen` with a mask.
 *
 * `?fen=` is the position hand-off every board screen takes — and on this one
 * it also decides which colour the reader plays and which way the board faces,
 * because a position set up with Black to move is one they mean to play as
 * Black. `?saved=` resumes a **dev** saved game (`core/devStores.ts`): moves,
 * side and settings, opened at the last ply, because that is the live position
 * it can be played on from.
 */
function PlayV2() {
  const [searchParams] = useSearchParams();

  const requestedFen = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requestedFen === null) return undefined;
    try {
      return parseFen(requestedFen);
    } catch {
      // A link nobody can read opens a normal new game.
      return undefined;
    }
  }, [requestedFen]);

  const resume = useMemo(
    () => findDevSavedGame(searchParams.get("saved")),
    [searchParams],
  );

  const state = usePlayBoard({
    fen: initialFen,
    resume,
    // The screen that writes — and to the dev key, never the shipped one.
    persist: true,
  });

  return <PlayBoardScreen id="dev-play" state={state} />;
}

export default PlayV2;
