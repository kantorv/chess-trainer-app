import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import Engine, { type EngineOption } from "../../../lib/engine";
import {
  EMPTY_ANALYSIS,
  pvToSan,
  scoreFromUci,
  withEngineLine,
  type Analysis,
  type Turn,
} from "../../../lib/engineAnalysis";
import { parseFen } from "../../../lib/fen";
import {
  addMove,
  emptyTree,
  treeToPgn,
  type GameTree,
} from "../../../lib/gameTree";
import { useTreeNavigation } from "./useTreeNavigation";

/**
 * Everything the Analysis Board knows, in one hook.
 *
 * ## Why this is not `usePlayWithEngine` with a flag
 *
 * That hook plays the engine's `bestmove` whenever the search that produced it
 * was for the live position, restricts dragging to one colour, and searches
 * unconditionally. An analysis board is the opposite on all three counts: it
 * must **never** move a piece by itself, it accepts moves for both sides, and it
 * stops searching when the engine is switched off. Those are not modes of one
 * behaviour — the `bestmove` branch simply does not exist here — so the genuinely
 * common parts were extracted (`lib/engineAnalysis.ts`'s `Analysis` and
 * `withEngineLine`, `views/shared/`'s panel pieces) and the two hooks stayed
 * separate. Play with Engine is shipped and must not regress on a flag.
 *
 * ## The three things worth knowing
 *
 * **1. The game is a tree, and the position is a node.** Playing a move from an
 * earlier ply opens a variation and keeps both lines (`lib/gameTree.ts`). So the
 * board's position is not "the game so far" — it is `fenAtNode(tree, nodeId)`,
 * and every move is added *under the node on screen*.
 *
 * **2. The engine is optional.** With it off nothing is searched and no lines are
 * shown; switching it back on searches the position on screen. What reaches the
 * screen is only ever an analysis whose FEN matches that position, so a set left
 * over from the previous one is never rendered under a new board.
 *
 * **3. An initial position can come from outside.** The Board Editor hands a
 * position over as a query parameter on this screen's route, so the optional
 * `initialFen` is read *once*, as this hook's initial state — arriving at
 * `/tools/analysis?fen=…` mounts the screen, so there is no later change to
 * follow, and reading it in an effect instead would mean writing state from one.
 * A position that will not parse is the caller's to reject; whatever arrives
 * here is used as-is.
 *
 * **4. Engine lifecycle.** Lazy ref resolved at call time, subscribe in an effect
 * with the returned unsubscribe, terminate on unmount —
 * `.claude/rules/chessboard.md` §4. The subscribe effect is declared first so a
 * StrictMode remount rebuilds the worker before anything asks it to search.
 */

/** The knobs the Engine tab drives. */
export type AnalysisSettings = {
  /** Plies per search. */
  depth: number;
  /** UCI `MultiPV` — how many lines the Variations tab shows. */
  multiPv: number;
  /** Milliseconds per search; `0` means "depth alone decides". */
  moveTimeMs: number;
};

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  depth: 16,
  multiPv: 3,
  moveTimeMs: 1000,
};

/**
 * Which UCI option each setting drives. The names are the engine's; whether the
 * running build *has* them is answered by `Engine.options`, never by this table.
 *
 * `Skill Level` is deliberately absent. An analysis board wants the engine's
 * best answer, so it never weakens it — and the build's own default is full
 * strength, so there is nothing to post.
 */
export const ANALYSIS_UCI_OPTION = {
  multiPv: "MultiPV",
} as const;

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

/** A tree with nothing in it, taken once — plain data that nothing mutates. */
const NEW_TREE: GameTree = emptyTree();

export const useAnalysisBoard = (initialFen?: string) => {
  const engineRef = useRef<Engine | null>(null);
  // Resolved at call time, never during render: StrictMode's mount → unmount →
  // remount terminates the worker and re-runs the effects with no render in
  // between, so an engine captured during render would be dead from then on.
  const getEngine = useCallback(() => (engineRef.current ??= new Engine()), []);

  /*
    One `chess.js` instance, in a ref, moved to whichever position is being asked
    about. The board's position comes from the tree rather than from this
    instance — a tree has no single "current game" for an instance to be — so it
    is a *rules oracle* here rather than the game itself: it answers "what are
    the legal moves from this FEN" and "what does this drag mean". Reloading it
    only when the FEN actually differs keeps a drag from paying for a parse it
    does not need.
  */
  const chessRef = useRef(new Chess());
  const chessAt = useCallback((fen: string) => {
    const chess = chessRef.current;
    if (chess.fen() !== fen) chess.load(fen);
    return chess;
  }, []);

  // Lazily, and only on the first render: see note 3 above.
  const [tree, setTree] = useState<GameTree>(() =>
    initialFen === undefined ? NEW_TREE : emptyTree(initialFen),
  );
  const [settings, setSettings] = useState<AnalysisSettings>(
    DEFAULT_ANALYSIS_SETTINGS,
  );
  const [analysis, setAnalysis] = useState<Analysis>(EMPTY_ANALYSIS);
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);
  // Facing the side to move in the position this screen opened on — see
  // `loadFen` for why a position you are handed turns the board and a game you
  // load does not.
  const [orientation, setOrientation] = useState<"white" | "black">(() =>
    initialFen !== undefined && turnOf(initialFen) === "b" ? "black" : "white",
  );
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  /**
   * What the *running worker* declared it supports. Empty until the `uci`
   * handshake lands; the settings tab reads it to say which knobs this build
   * does not have rather than showing controls that do nothing.
   */
  const [engineOptions, setEngineOptions] = useState<
    ReadonlyMap<string, EngineOption>
  >(() => new Map());

  const navigation = useTreeNavigation(tree);
  const { fen, nodeId, goToNode } = navigation;

  // Subscribe once per Engine instance. Declared first: on a StrictMode remount
  // this is the effect that rebuilds the worker, before the search effect below
  // asks it for anything.
  useEffect(() => {
    const unsubscribe = getEngine().onMessage((message) => {
      const { fen: searchedFen, pv, depth, multipv } = message;
      // `bestMove` is read by the *other* engine screen. Here it is deliberately
      // ignored: an analysis board never plays a move of its own.
      if (!searchedFen || !pv || !depth) return;

      setAnalysis((previous) =>
        withEngineLine(previous, searchedFen, {
          multipv: multipv ?? 1,
          score: scoreFromUci(message, turnOf(searchedFen)),
          depth,
          san: pvToSan(searchedFen, pv),
        }),
      );
    });

    return unsubscribe;
  }, [getEngine]);

  // Tear the worker down on unmount (and on StrictMode remount).
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  /*
    Publish what the worker says it supports, once the handshake completes, and
    pull the settings into the bounds it declared — the build shipped here pins
    several options to a single value, and a stored number the engine will not
    accept would be a control that shows one thing and does another.
  */
  useEffect(() => {
    const engine = getEngine();
    return engine.whenOptionsReady(() => {
      const options = new Map(engine.options);
      setEngineOptions(options);

      setSettings((current) => {
        const option = options.get(ANALYSIS_UCI_OPTION.multiPv);
        if (option?.min === undefined || option.max === undefined) return current;

        const multiPv = Math.min(
          Math.max(current.multiPv, option.min),
          option.max,
        );
        // A new object here would re-run the search effect for nothing.
        return multiPv === current.multiPv ? current : { ...current, multiPv };
      });
    });
  }, [getEngine]);

  /*
    Push the option-backed settings. Declared *before* the search effect so that
    on any render where both run, the options go out ahead of the `go` that
    should honour them. `Engine.setOption` drops a name this build does not have,
    and holds everything until the engine can safely take it — see
    `.claude/rules/chessboard.md` §4.1.
  */
  useEffect(() => {
    getEngine().setOption(ANALYSIS_UCI_OPTION.multiPv, settings.multiPv);
  }, [getEngine, settings.multiPv]);

  /*
    Search the position on screen — and only while the engine is switched on.

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

    // Nothing to think about in a finished position. No state is cleared for
    // that: `currentAnalysis` below only hands the screen lines whose FEN
    // matches the position on screen, so the previous set falls away by itself.
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
    settings.multiPv,
  ]);

  /** Apply a move that has already been checked for legality, under the current node. */
  const applyMove = useCallback(
    (from: Square, to: Square, promotionPiece?: string) => {
      const chess = chessAt(fen);

      let move;
      try {
        move = chess.move({ from, to, promotion: promotionPiece });
      } catch {
        return false;
      }

      /*
        Added *under the node on screen*, which is what makes this a variation
        when the reader has stepped back — and, when the move is one the tree
        already holds, simply follows the line that exists (`addMove`).
      */
      const added = addMove(tree, nodeId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
      });

      setTree(added.tree);
      goToNode(added.nodeId);
      return true;
    },
    [chessAt, fen, goToNode, nodeId, tree],
  );

  /**
   * The drop handler. Returns `true` for every move actually applied — and also
   * for a promotion, which is applied a moment later once the picker is
   * answered; returning `false` there would snap the pawn back and then jump it
   * forward again when the choice lands.
   *
   * Both colours are movable. That is the difference from Play with Engine, and
   * it is the whole point: an analysis board plays out both sides of a line.
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

      const chess = chessAt(fen);
      if (chess.isGameOver()) return false;

      // Ask `chess.js` which of this square's legal moves land on the target;
      // a promotion is the one that comes back carrying a `promotion` field.
      const candidates = chess
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

      return applyMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyMove, chessAt, fen],
  );

  /** Answer the promotion picker with a piece, or dismiss it with `null`. */
  const resolvePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n" | null) => {
      const pending = promotion;
      setPromotion(null);
      if (pending && piece) applyMove(pending.from, pending.to, piece);
    },
    [applyMove, promotion],
  );

  /** Replace the whole game — what loading a PGN or a FEN does. */
  const loadTree = useCallback(
    (next: GameTree) => {
      setTree(next);
      setPromotion(null);
      setAnalysis(EMPTY_ANALYSIS);
      // The start position, in the same batch as the tree it belongs to.
      goToNode(null);
    },
    [goToNode],
  );

  /**
   * Set a position up from a pasted FEN. Throws `FenParseError` on bad input.
   *
   * It also turns the board to the side to move. A position arriving as a FEN is
   * one you are about to answer — a study, a puzzle, a game handed over from the
   * Board Editor — so the side that has to move is the side you are looking
   * from. Loading a *game* (`loadTree`) deliberately does not: a PGN opens at
   * ply 0, where the side to move says nothing about which side you are studying,
   * and turning the board there would overrule a viewpoint the reader chose.
   */
  const loadFen = useCallback(
    (text: string) => {
      const fen = parseFen(text);
      loadTree(emptyTree(fen));
      setOrientation(turnOf(fen) === "b" ? "black" : "white");
    },
    [loadTree],
  );

  const clearBoard = useCallback(() => loadTree(NEW_TREE), [loadTree]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  const updateSettings = useCallback(
    (patch: Partial<AnalysisSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  /*
    The lines only describe the position on screen once a result for it has come
    back, and only while the engine is on. Until then the previous position's
    lines are still in state, and showing them under a new board would be a lie.
  */
  const currentAnalysis: Analysis =
    engineOn && analysis.fen === fen ? analysis : { fen, depth: 0, lines: [] };

  return {
    tree,
    ...navigation,
    /** The whole game as PGN, side lines included — what the Position tab copies. */
    pgn: treeToPgn(tree),
    orientation,
    flipBoard,
    settings,
    updateSettings,
    engineOptions,
    engineOn,
    setEngineOn,
    analysis: currentAnalysis,
    showEvalBar,
    setShowEvalBar,
    promotion,
    resolvePromotion,
    onPieceDrop,
    loadTree,
    loadFen,
    clearBoard,
    /** Whose move it is in the position on screen — the promotion picker's colour. */
    turn: turnOf(fen),
  };
};

export type AnalysisBoardState = ReturnType<typeof useAnalysisBoard>;
