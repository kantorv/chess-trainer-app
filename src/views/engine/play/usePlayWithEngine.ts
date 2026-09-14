import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import Engine, { type EngineOption } from "../../../lib/engine";
import {
  EMPTY_ANALYSIS,
  pvToSan,
  scoreFromUci,
  withEngineLine,
  type Analysis,
  type Score,
  type Turn,
} from "../../../lib/engineAnalysis";
import {
  DEFAULT_ENGINE_SETTINGS,
  SETTING_UCI_OPTION,
  type EngineSettings,
} from "../../../lib/engineSettings";
import { gameFromChess, initialFenOf, type Game } from "../../../lib/gameModel";
import {
  chessFromSavedGame,
  newSavedGameId,
  savedGameEvalsMap,
  savedGameOf,
  type SavedGame,
} from "../../../lib/savedGames";
import { saveGame } from "../../../lib/savedGameStore";
import { useGameNavigation } from "../../shared/useGameNavigation";

/**
 * Everything the Play with Engine screen knows, in one hook.
 *
 * The screen renders a board and a three-tab panel that are portalled into
 * different parts of the shell, so they cannot share state through a common
 * parent element — they share it through this hook's return value instead, which
 * is also what lets the whole behaviour be tested without mounting a board.
 *
 * ## The three things that are easy to get wrong
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
 * **2. The game can start from a position that is not the starting one.** The
 * Board Editor hands one over as a query parameter on this screen's route, so
 * the optional `initialFen` seeds the game, is what "New game" goes back to, and
 * — because a position set up with Black to move is one the reader means to play
 * as Black — decides which colour they start on and which way the board faces.
 * It is read *once*, as this hook's initial state: arriving at
 * `/engine/play?fen=…` mounts the screen, so there is no later change to follow,
 * and reading it in an effect instead would mean writing state from one. A FEN
 * that will not parse is the caller's to reject.
 *
 * **3. Engine lifecycle.** Lazy ref resolved at call time, subscribe in an effect
 * with the returned unsubscribe, terminate on unmount — `.claude/rules/chessboard.md`
 * §4. The subscribe effect is declared first so a StrictMode remount rebuilds the
 * worker before anything asks it to search.
 *
 * **4. Saving is the same arrival mechanism, in the other direction.** A game
 * against the engine is written to `localStorage` as it is played and can be
 * picked up again from the Saved games screen — {@link PlayWithEngineStart}'s
 * `resume` is that arrival, seeding the instance, the settings and the board's
 * orientation exactly as `fen` does, and once again *only* as initial state. The
 * writing is one effect, and it is `persist` that turns it on: Masked Pieces
 * runs this hook verbatim and must not fill the list with games whose costume
 * cannot be restored.
 *
 * **The engine is a switch, not a constant.** `engineOn` (CTA-50) gates both
 * things the engine does on this screen — searching the position on screen, and
 * playing its reply. Off, the reader plays both sides; the panel falls to its
 * empty states rather than showing a stale set. It defaults to on, which is what
 * keeps Masked Pieces — this hook run verbatim — unchanged. Beside it, the
 * scores the engine finishes searching accumulate per FEN (`evalsByFen`) and are
 * what the move list prints beside each move, lichess-style; a resumed game is
 * seeded from its record, and the record grows as each new position is
 * searched.
 */

/** The engine knobs the settings tab drives. Defined in `lib/engineSettings.ts` */
export {
  DEFAULT_ENGINE_SETTINGS,
  SETTING_UCI_OPTION,
  approximateElo,
} from "../../../lib/engineSettings";
export type { EngineSettings } from "../../../lib/engineSettings";

/**
 * How the screen opens: on a position, on a game being resumed, or on neither.
 *
 * All three fields are read **once**, as this hook's initial state — arriving at
 * `/engine/play?fen=…` or `?saved=…` is what mounts the screen, so there is no
 * later change to follow, and reading them in an effect would mean writing state
 * from one. A `fen` that will not parse and a `resume` that names nothing are
 * the caller's to reject; both simply arrive as `undefined`.
 */
export type PlayWithEngineStart = {
  /** The position the game starts from — the Board Editor's `?fen=` hand-off. */
  fen?: string;
  /** A saved game to play on from — the Saved games screen's `?saved=` hand-off. */
  resume?: SavedGame;
  /** Whether the game is written to the saved-games store as it is played. */
  persist?: boolean;
};

/**
 * What the engine is saying, and one line of it. Defined in
 * `lib/engineAnalysis.ts` — two screens collect these now — and re-exported here
 * so this hook stays the one import a reader of this screen needs.
 */
export type { Analysis, EngineLine } from "../../../lib/engineAnalysis";

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

export const usePlayWithEngine = ({
  fen: initialFen,
  resume,
  persist = false,
}: PlayWithEngineStart = {}) => {
  const engineRef = useRef<Engine | null>(null);
  // Resolved at call time, never during render: StrictMode's mount → unmount →
  // remount terminates the worker and re-runs the effects with no render in
  // between, so an engine captured during render would be dead from then on.
  const getEngine = useCallback(() => (engineRef.current ??= new Engine()), []);

  /*
    A game being resumed is replayed into a live instance once — the PGN is the
    only record there is, so playing on means loading it — and the position it
    *started* from becomes this screen's `initialFen`, so "New game" goes back to
    where that game began rather than to the standard start, exactly as it does
    for a position handed over by the Board Editor. A record that will not parse
    resumes as nothing at all, which is the same answer an unreadable `?fen=`
    gets.

    Memoised on the record: only the first render's value is ever kept, but
    parsing a PGN on every render would be a real cost for nothing. The `Game` is
    read off the same instance rather than parsed a second time — which is all
    `parsePgnGame` does with it either way.
  */
  const arrival = useMemo(() => {
    if (resume === undefined) return undefined;
    const chess = chessFromSavedGame(resume);
    return chess === undefined
      ? undefined
      : { chess, game: gameFromChess(chess, chess.getHeaders()) };
  }, [resume]);

  const startFen =
    arrival === undefined ? initialFen : initialFenOf(arrival.game);

  const chessGameRef = useRef(arrival?.chess ?? new Chess(initialFen));

  /*
    All of these are seeded on the first render and never again. The snapshot is
    taken from a *separate* `new Chess` rather than from the ref above: the ref
    must not be read during render (`react-hooks/refs`), and a `Game` is plain
    data, so building one twice costs nothing.
  */
  const [game, setGame] = useState<Game>(() => {
    if (arrival !== undefined) return arrival.game;
    return startFen === undefined ? NEW_GAME : gameFromChess(new Chess(startFen));
  });
  const [settings, setSettings] = useState<EngineSettings>(() => {
    // A resumed game brings its own: the engine has to go on playing at the
    // strength, and on the side, the game was played at.
    if (resume !== undefined) return resume.settings;
    return initialFen === undefined || turnOf(initialFen) === "w"
      ? DEFAULT_ENGINE_SETTINGS
      : { ...DEFAULT_ENGINE_SETTINGS, playAs: "black" };
  });
  const [analysis, setAnalysis] = useState<Analysis>(EMPTY_ANALYSIS);
  const [showEvalBar, setShowEvalBar] = useState(true);
  /*
    The engine's switch (CTA-50): off, it neither searches the position on
    screen nor plays its reply, and the reader plays both sides. On, both
    resume — the search effect below fires on the switch as well as on the fen.
    Defaults to on, which is what keeps Masked Pieces — this hook run verbatim —
    unchanged.
  */
  const [engineOn, setEngineOn] = useState(true);
  /*
    The scores the engine has finished searching, keyed by the FEN they describe
    (CTA-50) — what the move list prints beside each move, lichess-style. Each
    move already carries the FEN after it, so a ply's eval is a lookup, and a
    position reached twice reads the same score twice. A resumed game is seeded
    from its record's per-ply list; the map grows in the subscribe effect below,
    when each search's bestmove lands.
  */
  const [evals, setEvals] = useState<ReadonlyMap<string, Score>>(() => {
    if (arrival === undefined) return new Map();
    return savedGameEvalsMap(resume?.evals, arrival.game);
  });
  // Facing the side the human is playing — otherwise a game handed over with
  // Black to move opens from behind the opponent's pieces.
  const [orientation, setOrientation] = useState<"white" | "black">(() => {
    if (resume !== undefined) return resume.settings.playAs;
    return initialFen !== undefined && turnOf(initialFen) === "b"
      ? "black"
      : "white";
  });
  /*
    The row this game is written to. Minted at call time rather than during
    render — the same rule the engine ref follows — and seeded from the resumed
    game, so playing on updates that row instead of starting a second one beside
    it. "New game" mints a fresh one, which is what leaves the game just
    abandoned in the list rather than overwriting it.
  */
  const savedIdRef = useRef<string | null>(resume?.id ?? null);
  const getSavedId = useCallback(
    () => (savedIdRef.current ??= newSavedGameId()),
    [],
  );
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

  /*
    A resumed game opens at its **last** ply, not at ply 0. Every other arrival
    on this screen is a position, where ply 0 is all there is; a resumed game is
    one the reader is in the middle of, so the live position is the one they left
    — and it is the live position that this screen lets them move on from. Read
    once, as the navigation's seed.
  */
  const { ply, lastPly, fen, squareStyles, goToPly } = useGameNavigation(
    game,
    arrival?.game.moves.length ?? 0,
  );

  const humanColor: Turn = settings.playAs === "white" ? "w" : "b";

  /*
    The live position is the one at the end of the move list. Everything that
    may change the game is gated on being there — see the header comment.
  */
  const isLive = ply === lastPly;

  /*
    The final score of the search the engine is working on, remembered from the
    last top-line `info` and written down when that search's `bestmove` lands —
    a position's score is recorded when the search for it *completes*, not on
    every streamed line (each is shallower than the last).
  */
  const latestScoreRef = useRef<{ fen: string; score: Score } | null>(null);

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

        if (rank === 1 && score !== null) {
          latestScoreRef.current = { fen: searchedFen, score };
        }

        setAnalysis((previous) =>
          withEngineLine(previous, searchedFen, {
            multipv: rank,
            score,
            depth,
            san: pvToSan(searchedFen, pv),
          }),
        );
      }

      if (!bestMove) return;

      /*
        The search for this position is over: its final score is what the move
        list keeps, keyed by FEN — every ply whose position it is reads it. A
        search the switch interrupted still finished, so its score is recorded
        even with the engine off.
      */
      const final = latestScoreRef.current;
      latestScoreRef.current = null;
      if (final !== null && final.fen === searchedFen) {
        setEvals((previous) => {
          const existing = previous.get(searchedFen);
          if (
            existing !== undefined &&
            existing.kind === final.score.kind &&
            existing.value === final.score.value
          ) {
            return previous;
          }
          const next = new Map(previous);
          next.set(searchedFen, final.score);
          return next;
        });
      }

      /*
        Play it only if this search was for the position the game is actually
        at. A result for any other position — one the player stepped back to,
        or one already superseded — is analysis and nothing more. And only
        while the engine is switched on: off, the reader plays both sides and
        the reply is not played.
      */
      if (!engineOn) return;

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
      `humanColor` and `engineOn` are dependencies rather than ref reads:
      re-subscribing costs one Set entry — no worker is rebuilt — and the
      alternative is writing a ref during render, which `react-hooks/refs`
      rejects.
    */
  }, [getEngine, goToPly, humanColor, engineOn]);

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
    Search the position *on screen*, not the live one — and only while the
    engine is switched on. Every settings change is a dependency, so a new
    setting restarts the search and is reflected in the lines immediately
    instead of waiting for the next move.

    Switching it off stops the running search rather than letting it finish
    quietly in the background: the worker shares the tab with the UI, and a
    switch labelled "off" that leaves a search running is a lie. The engine is
    not *created* to be stopped, though, so an engine that was never built stays
    unbuilt.
  */
  useEffect(() => {
    if (!engineOn) {
      engineRef.current?.stop();
      return;
    }

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
    engineOn,
    fen,
    settings.depth,
    settings.moveTimeMs,
    settings.skillLevel,
    settings.multiPv,
    settings.threads,
    settings.hashMb,
    settings.playAs,
  ]);

  /*
    Write the game down, on every move and on every settings change.

    Nothing to click: a game against the engine is worth keeping by the fact of
    having been played, and a reader who has to remember to save is a reader who
    loses a game. It is an effect on the *game snapshot* rather than a call
    inside the two move handlers, because the engine's reply and the human's
    move both produce one and only one of them would otherwise be covered.

    Three things keep it cheap and unsurprising:

    - a game with no moves is not a game yet, so an untouched board writes
      nothing and the list is not filled with empty rows by merely visiting;
    - `saveGame` is a no-op when the record would be identical, so mounting a
      resumed game, or the clamp that pulls the settings into the running
      build's bounds, does not re-order a list sorted by when a game was last
      played;
    - `persist` is off unless the caller asks. Masked Pieces runs this hook
      verbatim (`views/masked/play/`), and a masked game resumed on
      `/engine/play` would come back with its costume gone — so that screen
      does not write, rather than the store learning what a mask is.
  */
  useEffect(() => {
    if (!persist || game.moves.length === 0) return;
    saveGame(
      // The evals ride beside the PGN as a per-ply list (`lib/savedGames.ts`):
      // the record grows as each position's search finishes, and the idempotent
      // compare reads them, so one write per evaluated position.
      savedGameOf(getSavedId(), game, settings, undefined, undefined, undefined, evals),
    );
  }, [persist, game, settings, evals, getSavedId]);

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
      // With the engine off the reader plays both sides, so only that screen
      // state refuses the engine's turn — never the drop handler on its own.
      if (!isLive || chessGame.isGameOver()) return false;
      if (engineOn && chessGame.turn() !== humanColor) return false;

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
    [applyHumanMove, engineOn, humanColor, isLive],
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

  /*
    Back to the position this screen opened on — which is the handed-over one
    when there was one. Resetting to the standard start instead would throw away
    the position the reader came here to play, and there is no way back to it.
  */
  const newGame = useCallback(() => {
    const fresh = new Chess(startFen);
    chessGameRef.current = fresh;
    setGame(gameFromChess(fresh));
    setPromotion(null);
    setAnalysis(EMPTY_ANALYSIS);
    goToPly(0);
    /*
      A new row for the new game. The one just abandoned keeps the id it was
      saved under, so it stays in the list rather than being overwritten by
      whatever is played next — which is the whole difference between a saved
      game and an autosave slot.
    */
    savedIdRef.current = null;
  }, [goToPly, startFen]);

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
    back, and only while the engine is switched on. Until then the previous
    position's lines are still in state, and showing them under a new board
    would be a lie — so the screen sees an empty analysis rather than a stale
    one, and with the engine off it sees no lines at all.
  */
  const currentAnalysis: Analysis =
    engineOn && analysis.fen === fen ? analysis : { fen, depth: 0, lines: [] };

  return {
    game,
    ply,
    lastPly,
    fen,
    squareStyles,
    goToPly,
    isLive,
    humanColor,
    orientation,
    flipBoard,
    settings,
    updateSettings,
    engineOptions,
    engineOn,
    setEngineOn,
    analysis: currentAnalysis,
    /** The scores the engine has finished searching, keyed by the FEN they describe. */
    evalsByFen: evals,
    showEvalBar,
    setShowEvalBar,
    promotion,
    resolvePromotion,
    onPieceDrop,
    newGame,
    /**
     * True while it is the engine's turn at the live position and the game is
     * on — the board locks on it. Off, the reader plays both sides, so the
     * engine is never "thinking".
     */
    isEngineThinking:
      engineOn && isLive && !isTerminal(fen) && turnOf(fen) !== humanColor,
  };
};

export type PlayWithEngineState = ReturnType<typeof usePlayWithEngine>;
