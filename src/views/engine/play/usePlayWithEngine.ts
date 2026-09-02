import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import Engine, { type EngineOption } from "../../../lib/engine";
import {
  pvToSan,
  scoreFromUci,
  type Score,
  type Turn,
} from "../../../lib/engineAnalysis";
import { gameFromChess, type Game } from "../../../lib/gameModel";
import { useGameNavigation } from "../../shared/useGameNavigation";

/**
 * Everything the Play with Engine screen knows, in one hook.
 *
 * The screen renders a board and a three-tab panel that are portalled into
 * different parts of the shell, so they cannot share state through a common
 * parent element — they share it through this hook's return value instead, which
 * is also what lets the whole behaviour be tested without mounting a board.
 *
 * ## The two things that are easy to get wrong
 *
 * **1. The position on screen is not always the live position.** The player can
 * step back through the move list at any time, including while the engine is
 * thinking. Everything the panel shows — the evaluation, the variations, the
 * depth — describes *the ply on screen*, so that is the position that gets
 * searched. The engine's move is only ever played when the search that produced
 * it was for the live position (`fen === chessGameRef.current.fen()`), which is
 * the guarantee that stepping back cannot make a move happen behind the player's
 * back. Dragging is disabled off the live position for the same reason: a drag
 * there would apply to a position that is not the one being looked at.
 *
 * **2. Engine lifecycle.** Lazy ref resolved at call time, subscribe in an effect
 * with the returned unsubscribe, terminate on unmount — `.claude/rules/chessboard.md`
 * §4. The subscribe effect is declared first so a StrictMode remount rebuilds the
 * worker before anything asks it to search.
 */

/** The engine knobs the settings tab drives. */
export type EngineSettings = {
  /** UCI `Skill Level`, 0–20. The only strength control this build has. */
  skillLevel: number;
  /** Plies per search. */
  depth: number;
  /** UCI `MultiPV` — how many lines the Variations tab shows. */
  multiPv: number;
  /** Milliseconds per search; `0` means "depth alone decides". */
  moveTimeMs: number;
  /** UCI `Threads`. */
  threads: number;
  /** UCI `Hash`, in MB. */
  hashMb: number;
  /** The colour the human plays; the engine takes the other one. */
  playAs: "white" | "black";
};

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  skillLevel: 10,
  depth: 14,
  multiPv: 3,
  moveTimeMs: 1000,
  threads: 1,
  hashMb: 16,
  playAs: "white",
};

/**
 * Which UCI option each numeric setting drives. The names are the engine's, and
 * whether the running build *has* them is answered by `Engine.options` rather
 * than by this table — see `engineOptions` below.
 */
export const SETTING_UCI_OPTION = {
  skillLevel: "Skill Level",
  multiPv: "MultiPV",
  threads: "Threads",
  hashMb: "Hash",
} as const satisfies Partial<Record<keyof EngineSettings, string>>;

/**
 * A rough Elo for a `Skill Level`, for the label beside the strength slider.
 *
 * Stockfish's skill-level scale runs from about 1350 at 0 to full strength at 20;
 * this is the linear reading of that range. An **estimate**: this build declares
 * no `UCI_Elo`, so no Elo is ever sent to the engine and the figure must never be
 * presented as a setting.
 */
export const approximateElo = (skillLevel: number): number =>
  Math.round(1350 + (skillLevel / 20) * (2850 - 1350));

/** One line of the engine's current thinking. */
export type EngineLine = {
  /** 1-based rank among the `MultiPV` lines; 1 is the engine's choice. */
  multipv: number;
  score: Score | null;
  depth: number;
  /** The principal variation in SAN, replayed from the analysed position. */
  san: string[];
};

/** What the engine is currently saying about the position on screen. */
export type Analysis = {
  /** The position these lines describe. Empty before the first result. */
  fen: string;
  /** The deepest ply reached so far in this search. */
  depth: number;
  lines: EngineLine[];
};

const EMPTY_ANALYSIS: Analysis = { fen: "", depth: 0, lines: [] };

/**
 * A snapshot of an untouched game, taken once.
 *
 * Shared rather than rebuilt because a {@link Game} is plain data that nothing
 * mutates — and taking it from a `new Chess()` here rather than from the hook's
 * own ref keeps the ref out of render, which `react-hooks/refs` rejects.
 */
const NEW_GAME: Game = gameFromChess(new Chess());

/** The side to move in a FEN, without building a `Chess` to ask. */
const turnOf = (fen: string): Turn => (fen.split(" ")[1] === "b" ? "b" : "w");

/** Whether a position is finished, so the engine should not be asked about it. */
const isTerminal = (fen: string): boolean => {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return false;
  }
};

export const usePlayWithEngine = () => {
  const engineRef = useRef<Engine | null>(null);
  // Resolved at call time, never during render: StrictMode's mount → unmount →
  // remount terminates the worker and re-runs the effects with no render in
  // between, so an engine captured during render would be dead from then on.
  const getEngine = useCallback(() => (engineRef.current ??= new Engine()), []);

  const chessGameRef = useRef(new Chess());

  const [game, setGame] = useState<Game>(NEW_GAME);
  const [settings, setSettings] = useState<EngineSettings>(
    DEFAULT_ENGINE_SETTINGS,
  );
  const [analysis, setAnalysis] = useState<Analysis>(EMPTY_ANALYSIS);
  const [showEvalBar, setShowEvalBar] = useState(true);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  /**
   * What the *running worker* declared it supports. Empty until the `uci`
   * handshake lands; the settings tab reads it to grey out the knobs this build
   * does not have rather than showing controls that do nothing.
   */
  const [engineOptions, setEngineOptions] = useState<
    ReadonlyMap<string, EngineOption>
  >(() => new Map());

  const { ply, lastPly, fen, arrows, goToPly } = useGameNavigation(game);

  const humanColor: Turn = settings.playAs === "white" ? "w" : "b";

  /*
    The live position is the one at the end of the move list. Everything that
    may change the game is gated on being there — see the header comment.
  */
  const isLive = ply === lastPly;

  // Subscribe once per Engine instance. Declared first: on a StrictMode remount
  // this is the effect that rebuilds the worker, before the search effect below
  // asks it for anything.
  useEffect(() => {
    const unsubscribe = getEngine().onMessage((message) => {
      const { fen: searchedFen, pv, depth, multipv, bestMove } = message;
      if (!searchedFen) return;

      if (pv && depth) {
        const score = scoreFromUci(message, turnOf(searchedFen));
        const rank = multipv ?? 1;

        setAnalysis((previous) => {
          // A result for a different position replaces the whole set rather
          // than merging into it — the lines of two positions are not
          // comparable, and half of each would be nonsense.
          const isSamePosition = previous.fen === searchedFen;
          const lines = isSamePosition ? [...previous.lines] : [];
          lines[rank - 1] = {
            multipv: rank,
            score,
            depth,
            san: pvToSan(searchedFen, pv),
          };

          return {
            fen: searchedFen,
            depth: isSamePosition ? Math.max(previous.depth, depth) : depth,
            lines,
          };
        });
      }

      if (!bestMove) return;

      /*
        Play it only if this search was for the position the game is actually
        at. A result for any other position — one the player stepped back to,
        or one already superseded — is analysis and nothing more.
      */
      const chessGame = chessGameRef.current;
      if (
        searchedFen !== chessGame.fen() ||
        chessGame.turn() === humanColor ||
        chessGame.isGameOver()
      ) {
        return;
      }

      try {
        chessGame.move({
          from: bestMove.slice(0, 2),
          to: bestMove.slice(2, 4),
          // The engine encodes promotion in the move string, e.g. "e7e8q".
          promotion: bestMove.slice(4) || undefined,
        });
      } catch {
        // A malformed or stale bestmove: leave the game exactly as it was.
        return;
      }

      setGame(gameFromChess(chessGame));
      // Follow the engine's move — the player was at the end of the list, which
      // is the only way this branch is reached.
      goToPly(chessGame.history().length);
    });

    return unsubscribe;
    /*
      `humanColor` is a dependency rather than a ref read: re-subscribing costs
      one Set entry — no worker is rebuilt — and the alternative is writing a ref
      during render, which `react-hooks/refs` rejects.
    */
  }, [getEngine, goToPly, humanColor]);

  // Tear the worker down on unmount (and on StrictMode remount).
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  /*
    Publish what the worker says it supports, once the handshake completes — and
    pull the settings into the bounds it declared.

    The clamp is not defensive tidying: the build shipped here answers `uci` with
    `Hash type spin default 16 min 16 max 16` and `Threads ... min 1 max 1`, so a
    stored 64MB / 4 threads would be a number the UI shows and the engine never
    accepts. Clamping makes the panel state and the engine agree, whatever binary
    is behind the worker.
  */
  useEffect(() => {
    const engine = getEngine();
    return engine.whenOptionsReady(() => {
      const options = new Map(engine.options);
      setEngineOptions(options);

      setSettings((current) => {
        const clamped = (name: string, value: number) => {
          const option = options.get(name);
          if (option?.min === undefined || option.max === undefined) return value;
          return Math.min(Math.max(value, option.min), option.max);
        };

        const next: EngineSettings = {
          ...current,
          skillLevel: clamped(SETTING_UCI_OPTION.skillLevel, current.skillLevel),
          multiPv: clamped(SETTING_UCI_OPTION.multiPv, current.multiPv),
          threads: clamped(SETTING_UCI_OPTION.threads, current.threads),
          hashMb: clamped(SETTING_UCI_OPTION.hashMb, current.hashMb),
        };

        // A new object here would re-run the search effect for nothing.
        return (
          next.skillLevel === current.skillLevel &&
          next.multiPv === current.multiPv &&
          next.threads === current.threads &&
          next.hashMb === current.hashMb
        )
          ? current
          : next;
      });
    });
  }, [getEngine]);

  /*
    Push the option-backed settings. Declared *before* the search effect so that
    on any render where both run, the options are posted ahead of the `go` that
    should honour them — which is what "changing a setting takes effect on the
    next search" means in practice. `Engine.setOption` drops a name this build
    does not have rather than posting it.
  */
  useEffect(() => {
    const engine = getEngine();
    engine.setOption(SETTING_UCI_OPTION.skillLevel, settings.skillLevel);
    engine.setOption(SETTING_UCI_OPTION.multiPv, settings.multiPv);
    engine.setOption(SETTING_UCI_OPTION.threads, settings.threads);
    engine.setOption(SETTING_UCI_OPTION.hashMb, settings.hashMb);
  }, [
    getEngine,
    settings.skillLevel,
    settings.multiPv,
    settings.threads,
    settings.hashMb,
  ]);

  /*
    Search the position *on screen*, not the live one. Every settings change is a
    dependency, so a new setting restarts the search and is reflected in the
    lines immediately instead of waiting for the next move.
  */
  useEffect(() => {
    /*
      Nothing to think about in a finished position, so it is not searched. No
      state has to be cleared for that: `currentAnalysis` below only hands the
      screen lines whose FEN matches the position on screen, so a set belonging
      to the previous position falls away by itself.
    */
    if (isTerminal(fen)) return;

    getEngine().search(fen, {
      depth: settings.depth,
      movetime: settings.moveTimeMs,
    });
  }, [
    getEngine,
    fen,
    settings.depth,
    settings.moveTimeMs,
    settings.skillLevel,
    settings.multiPv,
    settings.threads,
    settings.hashMb,
    settings.playAs,
  ]);

  /** Apply a human move that has already been checked for legality. */
  const applyHumanMove = useCallback(
    (from: Square, to: Square, promotionPiece?: string) => {
      const chessGame = chessGameRef.current;

      try {
        chessGame.move({ from, to, promotion: promotionPiece });
      } catch {
        return false;
      }

      setGame(gameFromChess(chessGame));
      goToPly(chessGame.history().length);
      return true;
    },
    [goToPly],
  );

  /**
   * The drop handler. Returns `true` for every move actually applied — and also
   * for a promotion, which is applied a moment later once the picker is
   * answered; returning `false` there would snap the pawn back and then jump it
   * forward again when the choice lands.
   */
  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;

      const chessGame = chessGameRef.current;
      if (
        !isLive ||
        chessGame.turn() !== humanColor ||
        chessGame.isGameOver()
      ) {
        return false;
      }

      // Ask `chess.js` which of this square's legal moves land on the target;
      // a promotion is the one that comes back carrying a `promotion` field.
      const candidates = chessGame
        .moves({ square: sourceSquare as Square, verbose: true })
        .filter((move) => move.to === targetSquare);

      if (candidates.length === 0) return false;

      if (candidates.some((move) => move.promotion)) {
        setPromotion({
          from: sourceSquare as Square,
          to: targetSquare as Square,
        });
        return true;
      }

      return applyHumanMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyHumanMove, humanColor, isLive],
  );

  /** Answer the promotion picker with a piece, or dismiss it with `null`. */
  const resolvePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n" | null) => {
      const pending = promotion;
      setPromotion(null);
      if (pending && piece) applyHumanMove(pending.from, pending.to, piece);
    },
    [applyHumanMove, promotion],
  );

  const newGame = useCallback(() => {
    chessGameRef.current = new Chess();
    setGame(NEW_GAME);
    setPromotion(null);
    setAnalysis(EMPTY_ANALYSIS);
    goToPly(0);
  }, [goToPly]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  const updateSettings = useCallback(
    (patch: Partial<EngineSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  /*
    The lines only describe the position on screen once a result for it has come
    back. Until then the previous position's lines are still in state, and
    showing them under a new board would be a lie — so the screen sees an empty
    analysis rather than a stale one.
  */
  const currentAnalysis: Analysis =
    analysis.fen === fen ? analysis : { fen, depth: 0, lines: [] };

  return {
    game,
    ply,
    lastPly,
    fen,
    arrows,
    goToPly,
    isLive,
    humanColor,
    orientation,
    flipBoard,
    settings,
    updateSettings,
    engineOptions,
    analysis: currentAnalysis,
    showEvalBar,
    setShowEvalBar,
    promotion,
    resolvePromotion,
    onPieceDrop,
    newGame,
    /** True while it is the engine's turn at the live position and the game is on. */
    isEngineThinking: isLive && !isTerminal(fen) && turnOf(fen) !== humanColor,
  };
};

export type PlayWithEngineState = ReturnType<typeof usePlayWithEngine>;
