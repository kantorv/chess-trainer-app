import { useCallback, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { parseFen } from "../../../lib/fen";
import {
  addMove,
  emptyTree,
  findNode,
  mainline,
  pathTo,
  treeToPgn,
  type GameTree,
} from "../../../lib/gameTree";
import type { Turn } from "../../../lib/engineAnalysis";
import { useTreeNavigation } from "../../tools/analysis/useTreeNavigation";

/**
 * **The base of every v2 board** — §1 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * Everything every board has, and nothing any single board has: the game as a
 * {@link GameTree}, node-based navigation over it, the `chess.js` rules oracle,
 * the promotion picker, the orientation, and the FEN of the position on screen.
 * The engine, the opening book and persistence are **capability modules** the
 * screen composes beside this hook (`useEngineModule`, `useOpeningBookModule`,
 * `useAutosave`) — never flags inside it.
 *
 * ## Why a tree, on a screen that cannot branch too
 *
 * The Analysis Board is the reference: a tree is the general case and a linear
 * game is the degenerate one. `mainlineGame` / `treeFromGame` already bridge
 * both directions and are tested both ways, so a linear screen loses nothing by
 * holding a tree — and gains the one thing the shipped linear screens never
 * got, which is every improvement written against the tree (CTA-53/54/55).
 *
 * A linear board stays linear through **one predicate**, not a mode:
 * {@link BoardCoreStart.canMoveAt}. Play v2 passes `(_, { isLive }) => isLive`,
 * so a drag anywhere but the end of the mainline is refused and no branch can
 * ever form. This hook has no branch on "am I a play board"; it asks a question
 * the screen answers.
 *
 * ## The node is the state; the ply is derived
 *
 * Through the shipped `useTreeNavigation`: clicking a move inside a side line
 * does not move along the current line, it changes *which line is current*, and
 * no ply can say that. Everything ply-shaped still comes out, so the shared
 * `BoardControls` drive a tree unmodified.
 *
 * ## Every arrival is initial state
 *
 * `fen`, `tree`, `ply`, `nodeId`, `orientation` and `dirty` are read on the
 * **first render only**: arriving at a URL is what mounts the screen, so there
 * is no later change to follow, and reading one in an effect would mean writing
 * state from one. A parameter that will not parse is the caller's to reject; it
 * arrives here as `undefined`.
 *
 * And the project's rule about which of them turns the board: **a position
 * turns the board, a game does not.** An arriving `fen` faces the side to move;
 * an arriving `tree` opens at ply 0 facing White, because a PGN's side to move
 * at ply 0 says nothing about which side is being studied. A reopened record is
 * neither — it brings its own `orientation`, because coming back to your own
 * board should not turn it around.
 */

/** A tree with nothing in it, taken once — plain data that nothing mutates. */
const NEW_TREE: GameTree = emptyTree();

/** The side to move in a FEN, without building a `Chess` to ask. */
export const turnOf = (fen: string): Turn =>
  fen.split(" ")[1] === "b" ? "b" : "w";

/** Whether a position is finished, so the engine should not be asked about it. */
export const isTerminal = (fen: string): boolean => {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return false;
  }
};

/** What the promotion picker is asking about. */
export type PendingPromotion = { from: Square; to: Square };

/** What a board opens with. Every field but `canMoveAt` is read once. */
export type BoardCoreStart = {
  /** A position to open on — the `?fen=` hand-off. Turns the board. */
  fen?: string;
  /** A whole game to open on — a `?game=` arrival. Does *not* turn the board. */
  tree?: GameTree;
  /** The mainline ply an arriving game opens at — the `?move=` beside it. */
  ply?: number;
  /** A place inside the tree — a reopened record's own node. Beats `ply`. */
  nodeId?: string | null;
  /** A reopened record's own viewpoint. Beats what `fen` would have chosen. */
  orientation?: "white" | "black";
  /** A reopened record is already the reader's work, so it starts dirty. */
  dirty?: boolean;
  /**
   * Whether a move may be made from the position on screen — the one seam a
   * **linear** board needs. Play v2 passes `(_, { isLive }) => isLive`; the
   * branching boards pass nothing and both colours move from any node.
   */
  canMoveAt?: (fen: string, core: { isLive: boolean }) => boolean;
};

export const useBoardCore = ({
  fen: initialFen,
  tree: initialTree,
  ply: initialPly,
  nodeId: initialNodeId,
  orientation: initialOrientation,
  dirty: initialDirty = false,
  canMoveAt,
}: BoardCoreStart = {}) => {
  /*
    One `chess.js` instance, in a ref, moved to whichever position is being
    asked about. The board's position comes from the tree rather than from this
    instance — a tree has no single "current game" for an instance to be — so
    it is a *rules oracle* here rather than the game itself: it answers "what
    are the legal moves from this FEN" and "what does this drag mean".
    Reloading it only when the FEN actually differs keeps a drag from paying
    for a parse it does not need.
  */
  const chessRef = useRef(new Chess());
  const chessAt = useCallback((fen: string) => {
    const chess = chessRef.current;
    if (chess.fen() !== fen) chess.load(fen);
    return chess;
  }, []);

  const [tree, setTree] = useState<GameTree>(() => {
    if (initialTree !== undefined) return initialTree;
    return initialFen === undefined ? NEW_TREE : emptyTree(initialFen);
  });

  /*
    The position this board was opened on — what `reset` returns to, exactly as
    "New game" does on the shipped play screen. Resetting to the standard start
    instead would throw away a position the reader came here to work on, with
    no way back to it.
  */
  const startFenRef = useRef<string | undefined>(
    initialTree?.startFen ?? initialFen,
  );

  const [orientation, setOrientation] = useState<"white" | "black">(() => {
    if (initialOrientation !== undefined) return initialOrientation;
    // A position turns the board; a game does not.
    return initialTree === undefined &&
      initialFen !== undefined &&
      turnOf(initialFen) === "b"
      ? "black"
      : "white";
  });

  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  /*
    Whether the reader has actually done something with this board. Arriving and
    looking is not work: the persistence capability gates on this, so merely
    opening a library game here writes nothing.
  */
  const [dirty, setDirty] = useState(initialDirty);
  const markDirty = useCallback(() => setDirty(true), []);

  const navigation = useTreeNavigation(tree, initialPly, initialNodeId);
  const { fen, nodeId, goToNode } = navigation;

  /*
    The live position: the end of the mainline. On a branching board it is
    nothing special; on a linear one it is the only position that can be played
    on from, and `canMoveAt` is what turns that into a rule.
  */
  const mainlineNodes = useMemo(() => mainline(tree), [tree]);
  const liveNode = mainlineNodes[mainlineNodes.length - 1];
  const liveFen = liveNode?.fen ?? tree.startFen;
  const isLive = (liveNode?.id ?? null) === nodeId;

  /** Add an already-played move under `parentId` and select it. */
  const commit = useCallback(
    (move: Move, parentId: string | null) => {
      const added = addMove(tree, parentId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
        captured: move.captured,
      });
      setTree(added.tree);
      goToNode(added.nodeId);
      /*
        Only a move that actually added something is the reader's own work:
        `addMove` returns the *same tree by reference* when the move was
        already there, so stepping back and replaying a line goes on being the
        game that arrived rather than becoming an analysis of it.
      */
      if (added.tree !== tree) setDirty(true);
      return true;
    },
    [goToNode, tree],
  );

  /** Apply a move that has already been checked for legality, under the node on screen. */
  const applyMove = useCallback(
    (from: Square, to: Square, promotionPiece?: string) => {
      let move: Move;
      try {
        move = chessAt(fen).move({ from, to, promotion: promotionPiece });
      } catch {
        return false;
      }
      return commit(move, nodeId);
    },
    [chessAt, commit, fen, nodeId],
  );

  /**
   * Add a move at the **end of the mainline**, wherever the reader is standing
   * — the engine's reply, which answers the live position and not the one being
   * looked at. Takes a UCI move string (`"e2e4"`, `"e7e8q"`) or a SAN.
   */
  const appendMove = useCallback(
    (uciOrSan: string) => {
      const chess = chessAt(liveFen);
      let move: Move;
      try {
        move =
          /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uciOrSan)
            ? chess.move({
                from: uciOrSan.slice(0, 2),
                to: uciOrSan.slice(2, 4),
                promotion: uciOrSan.slice(4) || undefined,
              })
            : chess.move(uciOrSan);
      } catch {
        // A malformed or stale move: leave the game exactly as it was.
        return false;
      }
      return commit(move, liveNode?.id ?? null);
    },
    [chessAt, commit, liveFen, liveNode],
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
      if (canMoveAt !== undefined && !canMoveAt(fen, { isLive })) return false;

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
    [applyMove, canMoveAt, chessAt, fen, isLive],
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

  /**
   * Play a SAN prefix from the position on screen (CTA-55) — what a click in
   * the pinned variations block hands over, replayed one move at a time under
   * the node the reader is standing on: lichess analysis behaviour, where
   * clicking the third move of a line plays all three.
   *
   * Its own loop rather than one `applyMove` per move, because a replay cannot
   * go through state: `applyMove` reads the position and the node out of the
   * closure, and neither moves until a re-render this synchronous run must not
   * wait for. A SAN that will not play stops the replay silently, keeping what
   * played — a line only describes the position on screen while that position
   * is on screen, so a stale one is not an error worth showing.
   */
  const playVariation = useCallback(
    (sans: readonly string[]) => {
      const chess = chessAt(fen);

      let currentTree = tree;
      let currentNodeId = nodeId;

      for (const san of sans) {
        let move: Move;
        try {
          move = chess.move(san);
        } catch {
          break;
        }
        const added = addMove(currentTree, currentNodeId, {
          san: move.san,
          from: move.from,
          to: move.to,
          fen: move.after,
          captured: move.captured,
        });
        currentTree = added.tree;
        currentNodeId = added.nodeId;
      }

      if (currentTree !== tree) {
        setTree(currentTree);
        setDirty(true);
      }
      goToNode(currentNodeId);
    },
    [chessAt, fen, goToNode, nodeId, tree],
  );

  /** Replace the whole game — what loading a PGN or a FEN does. */
  const loadTree = useCallback(
    (next: GameTree) => {
      setTree(next);
      setPromotion(null);
      startFenRef.current = next.startFen;
      // The start position, in the same batch as the tree it belongs to.
      goToNode(null);
      // Deliberately loading something is the reader's own doing.
      setDirty(true);
    },
    [goToNode],
  );

  /**
   * Replace the tree with an **edit of itself** (CTA-64 — promote, make main
   * line, delete from here), staying where the reader is: the node on screen
   * when the edit kept it, else the nearest ancestor that survived, else the
   * start. Not `loadTree`, whose step to the start is right for a new game and
   * wrong for a line just promoted under the reader's feet. An edit is the
   * reader's own work, so it marks the board dirty.
   */
  const replaceTree = useCallback(
    (next: GameTree) => {
      const path = pathTo(tree, nodeId);
      let keep: string | null = null;
      for (let depth = path.length - 1; depth >= 0; depth -= 1) {
        if (findNode(next, path[depth].id) !== null) {
          keep = path[depth].id;
          break;
        }
      }
      setTree(next);
      setPromotion(null);
      goToNode(keep);
      setDirty(true);
    },
    [goToNode, nodeId, tree],
  );

  /**
   * Set a position up from a pasted FEN. Throws `FenParseError` on bad input.
   *
   * It also turns the board to the side to move: a position arriving as a FEN
   * is one you are about to answer, so the side that has to move is the side
   * you look from. Loading a *game* deliberately does not.
   */
  const loadFen = useCallback(
    (text: string) => {
      const parsed = parseFen(text);
      loadTree(emptyTree(parsed));
      setOrientation(turnOf(parsed) === "b" ? "black" : "white");
    },
    [loadTree],
  );

  /**
   * Back to the position this board was opened on — the handed-over one when
   * there was one. It does **not** turn the board: rearranging a position is
   * not being handed one, and a viewpoint the reader chose is theirs.
   */
  const reset = useCallback(() => {
    const startFen = startFenRef.current;
    setTree(startFen === undefined ? NEW_TREE : emptyTree(startFen));
    setPromotion(null);
    goToNode(null);
  }, [goToNode]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  const pgn = useMemo(() => treeToPgn(tree), [tree]);

  return {
    tree,
    ...navigation,
    /** The mainline, walked once — what a linear move list renders. */
    mainlineNodes,
    /** The position at the end of the mainline: what a linear board plays on. */
    liveFen,
    /** Whether the selection *is* that end. */
    isLive,
    /**
     * The whole game as PGN, side lines included. Memoised on the tree: it was
     * written out on every render, which on a ~9,000-node repertoire was a
     * whole-tree serialisation per step and per engine message (CTA-61).
     */
    pgn,
    /** Whose move it is in the position on screen — the picker's colour. */
    turn: turnOf(fen),
    orientation,
    flipBoard,
    setOrientation,
    promotion,
    resolvePromotion,
    onPieceDrop,
    applyMove,
    appendMove,
    playVariation,
    loadTree,
    replaceTree,
    loadFen,
    reset,
    dirty,
    markDirty,
  };
};

export type BoardCore = ReturnType<typeof useBoardCore>;
