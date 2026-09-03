import { useCallback, useMemo, useRef, useState } from "react";
import {
  Chess,
  SQUARES,
  type Color,
  type PieceSymbol,
  type Square,
} from "chess.js";
import { parseFen } from "../../../lib/fen";
import {
  EMPTY_POSITION,
  START_POSITION,
  fenFields,
  fenFromFields,
  positionProblems,
  type CastlingFlag,
  type PositionFields,
  type PositionProblem,
} from "../../../lib/positionEditor";

/**
 * Everything the Board Editor knows, in one hook — the shape the two other real
 * screens use, with `BoardEditor.tsx` left as layout and board options.
 *
 * ## The board is not a game
 *
 * `useAnalysisBoard` and `usePlayWithEngine` both own a *game*: legal moves,
 * played in order, and a `chess.js` instance that is the rules authority. An
 * editor owns neither. Its board is built with `{ skipValidation: true }` and is
 * only ever `put` to and `remove`d from, so it will hold a board with no kings,
 * three queens, or a pawn on the eighth rank — which is the point: you have to
 * be able to take a king off in order to put a different one down. Nothing here
 * asks whether a *move* is legal, because nothing here makes a move.
 *
 * What legality there is gets **reported**, never enforced: `positionProblems`
 * (`lib/positionEditor.ts`) names what is wrong, and only the two controls that
 * hand the position onwards — the copy button and the Analysis Board — are
 * switched off while it is.
 *
 * ## The FEN is split, and only field 1 comes off the board
 *
 * The side to move, the castling rights and the en passant target are panel
 * controls, so they are held here as `PositionFields` and joined back into a FEN
 * on every render. The `chess.js` instance contributes the piece placement and
 * nothing else — it keeps its own idea of the other fields as pieces move
 * around, and that idea is exactly what the reader is overriding. Reading only
 * field 1 off it is what makes those controls round-trip.
 */

export const useBoardEditor = () => {
  /*
    The pieces. In a ref, not state: the drop handler must see the latest board
    without a stale closure, and mutating it is not by itself a render — the
    placement it produces is.
  */
  const boardRef = useRef(
    new Chess(START_POSITION, { skipValidation: true }),
  );

  const [fields, setFields] = useState<PositionFields>(() =>
    fenFields(START_POSITION),
  );
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  const fen = fenFromFields(fields);
  // Cheap, but it builds a `chess.js` instance for the check test — once per
  // position rather than once per render.
  const problems = useMemo<PositionProblem[]>(
    () => positionProblems(fen),
    [fen],
  );

  /** Take the placement off the board after an edit; leave the other fields. */
  const syncPlacement = useCallback(() => {
    const placement = boardRef.current.fen().split(" ")[0];
    setFields((current) =>
      current.placement === placement ? current : { ...current, placement },
    );
  }, []);

  /** Replace the whole position — every reset and every load ends up here. */
  const applyFen = useCallback((next: string) => {
    boardRef.current.load(next, { skipValidation: true });
    setFields(fenFields(next));
  }, []);

  /**
   * The drop handler, and the whole of the editing mechanism.
   *
   * Three gestures share it, told apart by where the piece came from and where
   * it landed (`.claude/rules/chessboard.md` §3.1, and the vendored
   * `stories/basic-examples/SparePieces.stories.tsx`):
   *
   * - a **spare** onto a square — place it;
   * - a **square** onto another square — move it, which is a remove and a put;
   * - anything onto **nowhere** (`targetSquare === null`, which is the palettes
   *   and the trash as much as the empty page) — remove it.
   */
  const onPieceDrop = useCallback(
    ({
      pieceType,
      isSparePiece,
      sourceSquare,
      targetSquare,
    }: {
      pieceType: string;
      isSparePiece: boolean;
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      const board = boardRef.current;

      if (targetSquare === null) {
        // A spare dragged into space never left the palette; there is nothing
        // to take off the board, and reporting success would be a lie.
        if (isSparePiece) return false;
        board.remove(sourceSquare as Square);
        syncPlacement();
        return true;
      }

      if (!isSparePiece && sourceSquare === targetSquare) return false;

      const color = pieceType[0] as Color;
      const type = pieceType[1]?.toLowerCase() as PieceSymbol;

      // Moved rather than placed: it has to leave the square it came from, and
      // it has to do so *before* the put, or a move onto an adjacent square
      // would remove the piece that had just arrived.
      if (!isSparePiece) board.remove(sourceSquare as Square);

      if (!board.put({ color, type }, targetSquare as Square)) {
        // `chess.js` refuses a second king of one colour. Put back what was
        // lifted, so a refused drop leaves the board exactly as it was.
        if (!isSparePiece) board.put({ color, type }, sourceSquare as Square);
        return false;
      }

      syncPlacement();
      return true;
    },
    [syncPlacement],
  );

  /** The trash in one palette: take that colour off the board. */
  const clearColor = useCallback(
    (color: Color) => {
      const board = boardRef.current;
      for (const square of SQUARES) {
        if (board.get(square)?.color === color) board.remove(square);
      }
      syncPlacement();
    },
    [syncPlacement],
  );

  const setTurn = useCallback(
    (turn: "w" | "b") =>
      setFields((current) =>
        current.turn === turn
          ? current
          : {
              ...current,
              turn,
              /*
                An en passant target names the square a pawn was double-pushed
                over, so it can only ever sit on the rank behind the side that
                just moved. Changing whose move it is makes the old target
                impossible rather than merely stale, so it goes.
              */
              enPassant: "-",
            },
      ),
    [],
  );

  const setCastlingRight = useCallback(
    (flag: CastlingFlag, allowed: boolean) =>
      setFields((current) => ({
        ...current,
        castling: { ...current.castling, [flag]: allowed },
      })),
    [],
  );

  const setEnPassant = useCallback(
    (square: string) =>
      setFields((current) => ({ ...current, enPassant: square })),
    [],
  );

  const setStartingPosition = useCallback(
    () => applyFen(START_POSITION),
    [applyFen],
  );

  const clearBoard = useCallback(() => applyFen(EMPTY_POSITION), [applyFen]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  /**
   * Set the board up from pasted text. Throws `FenParseError` on bad input —
   * `parseFen` is the gate on the way *in*, where the text is a claim about a
   * position rather than a position the reader is halfway through building.
   */
  const loadFen = useCallback(
    (text: string) => applyFen(parseFen(text)),
    [applyFen],
  );

  /** Load a position that is already known good — a game's final position. */
  const loadPosition = useCallback(
    (position: string) => applyFen(position),
    [applyFen],
  );

  return {
    fen,
    fields,
    problems,
    /** Whether the position could be played from — the two hand-offs' gate. */
    isValid: problems.length === 0,
    orientation,
    flipBoard,
    onPieceDrop,
    clearColor,
    setTurn,
    setCastlingRight,
    setEnPassant,
    setStartingPosition,
    clearBoard,
    loadFen,
    loadPosition,
  };
};

export type BoardEditorState = ReturnType<typeof useBoardEditor>;
