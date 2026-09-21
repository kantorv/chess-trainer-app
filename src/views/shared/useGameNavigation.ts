import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { DEFAULT_POSITION } from "chess.js";
import {
  clampPly,
  fenAtPly,
  lastPlyOf,
  squareStylesAtPly,
} from "../../lib/gameNavigation";
import type { Game } from "../../lib/gameModel";

/**
 * Ply state for one screen: which half-move is selected, the position and the
 * last-move highlight that follow from it, and the keyboard stepping that
 * moves it.
 *
 * The hook is the whole navigation surface — `MoveList` is presentational and
 * takes `currentPly` / `onSelectPly` as props, so both can be tested against a
 * fixture game with none of the ingestion UI mounted.
 */

/**
 * True for anything the reader is typing into. Arrow keys belong to the caret
 * there, not to the move list, so the handler stays out of the way — the Load
 * PGN screen's paste box is the case that matters.
 *
 * Exported for the analysis board's own navigation hook
 * (`views/tools/analysis/useTreeNavigation.ts`), which walks a tree rather than
 * a ply but owes the reader's caret exactly the same courtesy.
 */
export const isTextEntry = (target: EventTarget | null): boolean => {
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
  /** The last-move highlight for this ply, to hand `options.squareStyles`. */
  squareStyles: Record<string, CSSProperties>;
  /** Jump to a ply. Out-of-range values are clamped, not rejected. */
  goToPly: (ply: number) => void;
};

export const useGameNavigation = (
  game: Game | undefined,
  initialPly = 0,
): GameNavigation => {
  /*
    `initialPly` is read once, as the state's seed: it comes from a `?move=`
    arrival, and arriving at the URL is what mounts the screen, so there is no
    later change to follow. It is not clamped here on purpose — clamping on
    *read* below covers it, along with every other source of a ply.
  */
  const [requestedPly, setRequestedPly] = useState(initialPly);

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
      Bound on `document` but tied to this hook's mount. The screens that use
      it are routes, so only one is ever mounted: there is no second listener to collide with, and navigating away
      unmounts the hook and takes its listener with it.

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
    // Recomputed for every ply — see `squareStylesAtPly` on why this is a
    // whole set rather than an addition.
    squareStyles: game === undefined ? {} : squareStylesAtPly(game, ply),
    goToPly,
  };
};
