import { Chess, DEFAULT_POSITION } from "chess.js";

/**
 * A position *being edited*, as data.
 *
 * `lib/fen.ts` answers "is this pasted text a position I can play from" and
 * throws when it is not. A board editor needs the other two questions, and
 * neither of them can throw:
 *
 * - **What are a FEN's fields, separately?** Side to move, castling rights and
 *   the en passant target are three of the six fields, and the editor puts a
 *   control on each. Splitting and rejoining here is what makes those controls
 *   round-trip: the FEN shown is `fenFromFields(fenFields(fen))`.
 * - **What is wrong with this position?** Half-edited boards are illegal by
 *   definition — you have to be able to take a king off in order to put a
 *   different one down — so the editor reports rather than refuses.
 *   `positionProblems` names what is wrong and never throws.
 *
 * Pure, and it holds no `chess.js` instance of its own: the one built for the
 * check test is thrown away with the call. The screen's board instance lives in
 * `views/tools/editor/useBoardEditor.ts`.
 */

/** The two positions the editor's reset controls jump to. */
export const START_POSITION = DEFAULT_POSITION;
export const EMPTY_POSITION = "8/8/8/8/8/8/8/8 w - - 0 1";

/** FEN field 3, one flag per castle, in the order the field writes them. */
export const CASTLING_FLAGS = ["K", "Q", "k", "q"] as const;
export type CastlingFlag = (typeof CASTLING_FLAGS)[number];
export type CastlingRights = Record<CastlingFlag, boolean>;

export type PositionFields = {
  /** Field 1 — the pieces. Edited by dragging, never typed. */
  placement: string;
  /** Field 2. */
  turn: "w" | "b";
  /** Field 3, as four booleans rather than the string they join into. */
  castling: CastlingRights;
  /** Field 4 — a square like `"e3"`, or `"-"` for none. */
  enPassant: string;
  /** Field 5. No control of its own; carried so a pasted FEN round-trips. */
  halfmoveClock: number;
  /** Field 6, likewise. */
  fullmoveNumber: number;
};

const EMPTY_PLACEMENT = "8/8/8/8/8/8/8/8";

/** `"-"`, or a square on the only rank an en passant target can stand on. */
const isEnPassantSquare = (value: string) => /^[a-h][36]$/.test(value);

const wholeNumber = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Split a FEN into its six fields. Tolerant on purpose — this reads whatever is
 * on the board right now, including strings a validator would reject, and a
 * missing or unreadable tail field falls back to its neutral value rather than
 * throwing.
 */
export const fenFields = (fen: string): PositionFields => {
  const [
    placement = EMPTY_PLACEMENT,
    turn = "w",
    castling = "-",
    enPassant = "-",
    halfmove = "0",
    fullmove = "1",
  ] = fen.trim().split(/\s+/);

  return {
    placement,
    turn: turn === "b" ? "b" : "w",
    castling: Object.fromEntries(
      CASTLING_FLAGS.map((flag) => [flag, castling.includes(flag)]),
    ) as CastlingRights,
    enPassant: isEnPassantSquare(enPassant) ? enPassant : "-",
    halfmoveClock: wholeNumber(halfmove, 0),
    fullmoveNumber: Math.max(1, wholeNumber(fullmove, 1)),
  };
};

/** Field 3 from the four flags — `"-"` when none of them is set. */
export const castlingField = (rights: CastlingRights): string =>
  CASTLING_FLAGS.filter((flag) => rights[flag]).join("") || "-";

/** The other direction. `fenFields` ∘ `fenFromFields` is the identity. */
export const fenFromFields = (fields: PositionFields): string =>
  [
    fields.placement,
    fields.turn,
    castlingField(fields.castling),
    fields.enPassant,
    fields.halfmoveClock,
    fields.fullmoveNumber,
  ].join(" ");

/**
 * The en passant targets that can legally be named with this side to move, plus
 * `"-"`. A target is the square a pawn was double-pushed *over*, so it is always
 * on the rank behind the pawn that just moved: rank 6 when White is to move,
 * rank 3 when Black is. Offering only these is what keeps field 4 valid without
 * a text box that has to be validated.
 */
export const enPassantOptions = (turn: "w" | "b"): readonly string[] => {
  const rank = turn === "w" ? "6" : "3";
  return ["-", ..."abcdefgh".split("").map((file) => `${file}${rank}`)];
};

/** What is wrong with a position. Every one of these is allowed while editing. */
export type PositionProblem =
  | "noWhiteKing"
  | "noBlackKing"
  | "extraKing"
  | "pawnOnBackRank"
  | "opponentInCheck";

/**
 * Everything wrong with this position, in a stable order — empty for a position
 * a game could start from.
 *
 * Never throws and never refuses: the caller is a board mid-edit, where a
 * missing king is a step on the way to a different king rather than a mistake.
 * The last check is the one that needs a rules engine — a position where the
 * side *not* to move is already in check is one where their king could be
 * captured, so no game reaches it — and the instance built for it is discarded
 * with the call.
 */
export const positionProblems = (fen: string): PositionProblem[] => {
  const { placement, turn } = fenFields(fen);
  const problems: PositionProblem[] = [];

  const whiteKings = (placement.match(/K/g) ?? []).length;
  const blackKings = (placement.match(/k/g) ?? []).length;
  if (whiteKings === 0) problems.push("noWhiteKing");
  if (blackKings === 0) problems.push("noBlackKing");
  if (whiteKings > 1 || blackKings > 1) problems.push("extraKing");

  // Ranks are written 8 down to 1, so the two a pawn may never stand on are the
  // first and the last.
  const ranks = placement.split("/");
  if (/[pP]/.test(ranks[0] ?? "") || /[pP]/.test(ranks[7] ?? "")) {
    problems.push("pawnOnBackRank");
  }

  if (whiteKings === 1 && blackKings === 1) {
    const waiting = turn === "w" ? "b" : "w";
    try {
      // Castling and en passant are blanked: neither can put a king in check,
      // and both may be inconsistent on a board that is still being set up.
      const probe = new Chess(`${placement} ${waiting} - - 0 1`, {
        skipValidation: true,
      });
      if (probe.isCheck()) problems.push("opponentInCheck");
    } catch {
      // A placement `chess.js` cannot read at all is already described by the
      // king counts above; there is no further answer to give here.
    }
  }

  return problems;
};
