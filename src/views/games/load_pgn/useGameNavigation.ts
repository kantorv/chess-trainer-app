import { useCallback, useEffect, useState } from "react";
import { DEFAULT_POSITION } from "chess.js";
import type { Arrow } from "react-chessboard";
import {
  arrowsAtPly,
  clampPly,
  fenAtPly,
  lastPlyOf,
} from "../../../lib/gameNavigation";
import type { ParsedGame } from "../../../lib/pgn";

/**
 * Ply state for one screen: which half-move is selected, the position and the
 * board arrow that follow from it, and the keyboard stepping that moves it.
 *
 * The hook is the whole navigation surface — `MoveList` is presentational and
 * takes `currentPly` / `onSelectPly` as props, so both can be tested against a
 * fixture game with none of the ingestion UI mounted.
 */

/**
 * True for anything the reader is typing into. Arrow keys belong to the caret
 * there, not to the move list, so the handler stays out of the way — the paste
 * box on this very screen is the case that matters.
 */
const isTextEntry = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

export type GameNavigation = {
  /** The selected half-move: 0 is the starting position. */
  ply: number;
  /** The position after the final move — what End jumps to. */
  lastPly: number;
  /** The FEN to hand `options.position`. */
  fen: string;
  /** The whole arrow set for this ply, to hand `options.arrows`. */
  arrows: Arrow[];
  /** Jump to a ply. Out-of-range values are clamped, not rejected. */
  goToPly: (ply: number) => void;
};

export const useGameNavigation = (
  game: ParsedGame | undefined,
): GameNavigation => {
  const [requestedPly, setRequestedPly] = useState(0);

  /*
    Clamped on read rather than on write. A load or a game switch sets the ply
    for the game it is switching *to*, in the same batch that sets the game —
    so a setter clamping against the game still on screen would truncate the
    jump. Reading through the clamp is late enough to see both.
  */
  const lastPly = game === undefined ? 0 : lastPlyOf(game);
  const ply = game === undefined ? 0 : clampPly(game, requestedPly);

  const goToPly = useCallback((next: number) => setRequestedPly(next), []);

  const hasGame = game !== undefined;

  useEffect(() => {
    /*
      Bound on `document` but tied to this hook's mount, and this hook is used
      by the Load PGN screen alone — navigating to any of the four board
      screens unmounts it and the listener goes with it.

      Nothing loaded means nothing to step through, so no listener at all: the
      arrow keys keep scrolling the screen's own column until there is a game.
    */
    if (!hasGame) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Leave the browser's own shortcuts (Ctrl+Home, Alt+Left, …) alone.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntry(event.target)) return;

      // Relative steps clamp inside the updater: holding Right must not run a
      // counter past the end that then needs as many Lefts to come back.
      const step = (delta: number) =>
        setRequestedPly((current) =>
          Math.min(Math.max(Math.min(Math.max(current, 0), lastPly) + delta, 0), lastPly),
        );

      switch (event.key) {
        case "ArrowLeft":
          step(-1);
          break;
        case "ArrowRight":
          step(1);
          break;
        case "Home":
        case "ArrowUp":
          setRequestedPly(0);
          break;
        case "End":
        case "ArrowDown":
          setRequestedPly(lastPly);
          break;
        default:
          // Not ours: no preventDefault, so the panel's own scrolling and every
          // browser shortcut survive.
          return;
      }

      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasGame, lastPly]);

  return {
    ply,
    lastPly,
    fen: game === undefined ? DEFAULT_POSITION : fenAtPly(game, ply),
    // Recomputed for every ply — see `arrowsAtPly` on why this is a whole set
    // rather than an addition.
    arrows: game === undefined ? [] : arrowsAtPly(game, ply),
    goToPly,
  };
};
