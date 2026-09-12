import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import type { Arrow } from "react-chessboard";
import {
  HOVERED_MOVE_ARROW_COLOR,
  KNOWN_MOVE_ARROW_COLOR,
  findOpening,
  getPositionBook,
  knownMoveOpenings,
  loadOpeningBook,
  openingVariationName,
  topLevelOpeningName,
  type KnownMoveOpening,
  type OpeningBook,
  type PositionBook,
} from "../../../lib/openings";
import { addMove, emptyTree, mainline, type GameTree } from "../../../lib/gameTree";
import {
  newSavedOpeningId,
  savedOpeningOf,
  savedOpeningToTree,
  type SavedOpening,
} from "../../../lib/savedOpenings";
import { ensureOpeningFolder } from "../../../lib/savedOpeningFolderStore";
import { saveOpening as persistOpening } from "../../../lib/savedOpeningStore";
import { useTreeNavigation } from "../analysis/useTreeNavigation";

/**
 * Everything the Openings screen knows, in one hook — the `useAnalysisBoard`
 * pattern minus the engine: a `chess.js` instance in a ref as the *rules
 * oracle* for the position on screen, the game itself held as a
 * {@link GameTree}, and a promotion picker for the one move `onPieceDrop`
 * cannot finish by itself.
 *
 * ## The game is a tree
 *
 * Exploring an opening *is* branching: stepping back to move 4 and trying the
 * other book reply has to keep both continuations, or the explorer cannot
 * compare them. So this screen holds a tree and navigates it by node id
 * (`useTreeNavigation`), exactly like the Analysis Board — a drop from an
 * earlier ply is a variation, not an error, and dragging is on at every
 * position (both colours; the reader is exploring, not playing a side). The
 * shared `BoardControls` still speak ply, which the navigation derives.
 *
 * The opening book loads lazily (`lib/openings.ts`) and is looked up for *the
 * position on screen*, live or not — stepping back through a line already
 * played is exactly when a reader wants to see what it was called, and what
 * else eco.json knows from there.
 *
 * ## Saving and reopening
 *
 * A position worth coming back to is saved by a **button** — nothing here
 * writes on its own, because an opening is explored and discarded far more
 * often than it is kept, and a reader who has to delete an autosave is a
 * reader who gives up on saving anything. {@link OpeningsStart.resume} reopens
 * one saved earlier: the tree (side lines and all), the orientation it was
 * viewed from, its note, which is shown read-only — editing a note happens
 * on the Saved openings screen, not here — and it opens at the **end of its
 * mainline**, the position the reader goes on playing from. The save also
 * names the folder the opening is filed under — a choice from the save dialog,
 * or the default rule (a position the book names into a folder named after its
 * top-level name, and an empty note by the variation, or the top level) when
 * the reader leaves it unchosen.
 */

/** A tree with nothing in it, taken once — plain data that nothing mutates. */
const NEW_TREE: GameTree = emptyTree();

/**
 * What the screen opens with. Every field is read on the **first render only**:
 * arriving at `/openings?fen=…` or `/openings?openings=…` is what mounts the
 * screen, so there is no later change to follow. A parameter that will not
 * parse is the caller's to reject; it simply arrives here as `undefined`.
 */
export type OpeningsStart = {
  /** The position to open on — the same `?fen=` hand-off every other screen takes. */
  fen?: string;
  /** An opening to go on exploring — the Saved openings `?openings=` hand-off. */
  resume?: SavedOpening;
};

export const useOpenings = ({ fen: initialFen, resume }: OpeningsStart = {}) => {
  /*
    One `chess.js` instance, in a ref, moved to whichever position is being
    asked about — the board's position comes from the tree, so this is a rules
    oracle rather than the game itself: it answers "what are the legal moves
    from this FEN" and "what does this drop mean". Reloading only when the FEN
    actually differs keeps a drag from paying for a parse it does not need.
  */
  const chessRef = useRef(new Chess(initialFen));
  const chessAt = useCallback((fen: string) => {
    const chess = chessRef.current;
    if (chess.fen() !== fen) chess.load(fen);
    return chess;
  }, []);

  /*
    A reopened opening, parsed once. `parsePgnTree` rather than a mainline parse,
    because the side lines are the one thing an opening explorer keeps. A record
    that will not parse reopens as nothing at all — the same answer an unreadable
    `?fen=` gets. Memoised on the record: only the first render's value is ever
    kept, but parsing a PGN on every render would be a real cost for nothing.
  */
  const reopened = useMemo(() => {
    if (resume === undefined) return undefined;
    const tree = savedOpeningToTree(resume);
    return tree === undefined ? undefined : { tree, note: resume.note };
  }, [resume]);

  /*
    The position the screen was opened on — what "New game" returns to, exactly
    as a `?fen=` hand-off does. A reopened opening navigates to the end of its
    mainline rather than staying here, but its start position is still what the
    tree was grown from, so this is the reset either way.
  */
  const startFen = reopened?.tree.startFen ?? initialFen;

  // Read once, as initial state: arriving at `?fen=` or `?openings=` is what
  // mounts the screen.
  const [tree, setTree] = useState<GameTree>(() => {
    if (reopened !== undefined) return reopened.tree;
    return initialFen === undefined ? NEW_TREE : emptyTree(initialFen);
  });
  const [orientation, setOrientation] = useState<"white" | "black">(() => {
    if (resume !== undefined) return resume.orientation;
    return initialFen !== undefined && initialFen.split(" ")[1] === "b"
      ? "black"
      : "white";
  });
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [hoveredMove, setHoveredMove] = useState<KnownMoveOpening | null>(null);

  const [book, setBook] = useState<OpeningBook | null>(null);
  const [positionBook, setPositionBook] = useState<PositionBook | undefined>(undefined);

  const navigation = useTreeNavigation(
    tree,
    /*
      A reopened opening starts at the **end of its mainline** — the position
      the reader goes on playing from — rather than at ply 0. The seed is a
      mainline ply (the hook walks it to its node, and clamps to the last move
      of a record saved with side lines), and 0 on an empty mainline — a record
      saved with no moves — reads as ply 0, the root.
    */
    reopened !== undefined ? mainline(reopened.tree).length : undefined,
  );
  const { fen, nodeId, goToNode } = navigation;

  // Loaded once per mount; `loadOpeningBook` itself caches across mounts, so a
  // second visit to this screen resolves immediately rather than re-fetching.
  useEffect(() => {
    let cancelled = false;
    loadOpeningBook().then((loaded) => {
      if (cancelled) return;
      setBook(loaded);
      setPositionBook(getPositionBook(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The known continuations from the position on screen — only the moves that
   * resolve to an opening. Off-book moves stay playable (drag one and the tree
   * keeps it); they simply are not book continuations, so the explorer does not
   * list them.
   */
  const nextMoves: KnownMoveOpening[] = useMemo(
    () => (book === null ? [] : knownMoveOpenings(fen, book, positionBook)),
    [book, fen, positionBook],
  );

  /*
    The whole arrow set for the position on screen: the last-move arrow the
    navigation already computes, plus one arrow per known next move. Arrows
    passed through `options.arrows` are external — the board never clears or
    adds to them itself (`.claude/rules/chessboard.md` §3.4) — so this is the
    complete set, recomputed whenever the position or the book changes.
  */
  const arrows: Arrow[] = useMemo(
    () => [
      ...navigation.arrows,
      ...nextMoves.map((move) => ({
        startSquare: move.from,
        endSquare: move.to,
        color:
          hoveredMove && hoveredMove.san === move.san
            ? HOVERED_MOVE_ARROW_COLOR
            : KNOWN_MOVE_ARROW_COLOR,
      })),
    ],
    [navigation.arrows, nextMoves, hoveredMove],
  );

  /**
   * Add an already-played move under the node on screen and select it. Replaying
   * a move the tree already holds follows that line rather than duplicating it;
   * anything else branches — both cases are `addMove`'s own rules.
   */
  const commitMove = useCallback(
    (move: Move) => {
      const added = addMove(tree, nodeId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
      });
      setTree(added.tree);
      goToNode(added.nodeId);
    },
    [goToNode, nodeId, tree],
  );

  const applyMove = useCallback(
    (from: Square, to: Square, promotionPiece?: string) => {
      let move: Move;
      try {
        move = chessAt(fen).move({ from, to, promotion: promotionPiece });
      } catch {
        return false;
      }
      commitMove(move);
      return true;
    },
    [chessAt, commitMove, fen],
  );

  /**
   * The drop handler. Both colours, at any ply: a drop from an earlier position
   * is how a variation starts. Returns `true` for every move actually applied —
   * and also for a promotion, which is applied a moment later once the picker is
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

      const chess = chessAt(fen);
      if (chess.isGameOver()) return false;

      const candidates = chess
        .moves({ square: sourceSquare as Square, verbose: true })
        .filter((move) => move.to === targetSquare);

      if (candidates.length === 0) return false;

      if (candidates.some((move) => move.promotion)) {
        setPromotion({ from: sourceSquare as Square, to: targetSquare as Square });
        return true;
      }

      return applyMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyMove, chessAt, fen],
  );

  const resolvePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n" | null) => {
      const pending = promotion;
      setPromotion(null);
      if (pending && piece) applyMove(pending.from, pending.to, piece);
    },
    [applyMove, promotion],
  );

  /**
   * Play a specific move out of {@link nextMoves} — the explorer list's own
   * click handler. Like a drop, it works at any ply: clicking a book move from
   * an earlier position branches the tree there.
   */
  const playMove = useCallback(
    (san: string) => {
      let move: Move;
      try {
        move = chessAt(fen).move(san);
      } catch {
        return;
      }
      commitMove(move);
    },
    [chessAt, commitMove, fen],
  );

  /**
   * Back to the position this screen opened on — the handed-over one when
   * there was one, exactly as Play with Engine's "New game" works and for the
   * same reason: resetting to the standard start would throw away a position
   * the reader came here to explore, with no way back to it.
   */
  const newGame = useCallback(() => {
    chessRef.current = new Chess(startFen);
    setTree(startFen === undefined ? NEW_TREE : emptyTree(startFen));
    setPromotion(null);
    goToNode(null);
  }, [goToNode, startFen]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  /*
    Save the position on screen, with the note the reader just wrote and the
    folder it is filed under, as a brand new record — each save is a new
    position, not an update to the last one, so a fresh id every time. The
    store's idempotency is the guard against a double click stacking a
    duplicate; nothing here needs to remember a session id.

    The defaults: an explicit folder choice (a folder id, or `null` for
    Unfiled) and a typed note are taken as they are. What the reader did not
    provide is what this is the home of — and both defaults read the one book
    lookup of *the position on screen* (the same one `CurrentOpening` names,
    because the reader is filing what they are looking at, not the line it came
    from); a book that has not loaded yet, or a position it does not know, is
    an off-book position, which is the honest answer either way.

    The folder: `undefined` — the dialog opens with no choice — is the
    **default rule's** cue. A position the ECO book names saves into a folder
    named after that opening's **top-level name** — the part of eco.json's
    `"Opening: Variation, SubVariation"` convention before its first `":"`, so
    a deep line like `"Petrov's Defense: Classical Attack"` files under
    `"Petrov's Defense"` rather than a folder per variant (created at the top
    level if no such folder exists yet), and an off-book position saves to
    Unfiled.

    The note: one left empty defaults to the **variation** the book names the
    position with — the part after that first `":"` — or, when the name has no
    variation, to the **top-level name** itself, so the record carries a real
    name instead of the Saved openings screen's generic.
  */
  const saveOpening = useCallback(
    (note: string, folderChoice?: string | null) => {
      const named = book !== null ? findOpening(book, fen, positionBook) : undefined;

      let folderId: string | null = folderChoice ?? null;
      if (folderChoice === undefined) {
        folderId =
          named === undefined
            ? null
            : (ensureOpeningFolder(topLevelOpeningName(named.name), null)?.id ?? null);
      }

      const savedNote =
        note === "" && named !== undefined
          ? openingVariationName(named.name) || topLevelOpeningName(named.name)
          : note;

      persistOpening(
        savedOpeningOf(newSavedOpeningId(), tree, orientation, savedNote, folderId),
      );
    },
    [book, fen, positionBook, tree, orientation],
  );

  return {
    tree,
    ...navigation,
    arrows,
    orientation,
    flipBoard,
    promotion,
    resolvePromotion,
    onPieceDrop,
    newGame,
    nextMoves,
    playMove,
    setHoveredMove,
    /** The note of a reopened opening, or `undefined` when this is not one. */
    note: reopened?.note,
    /** Save the position on screen under a note. Button-triggered only. */
    saveOpening,
  };
};

export type OpeningsState = ReturnType<typeof useOpenings>;