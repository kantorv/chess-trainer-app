import { Chess } from "chess.js";
import { defaultPieces, type PieceRenderObject } from "react-chessboard";

/**
 * Piece masking: which graphic is drawn for which real piece, and how a move
 * reads once the piece that made it is in disguise.
 *
 * The technique is specified in `docs/chess_piece_masking_technique.docx.md`.
 * Two of its clauses are what this module exists to honour:
 *
 * - **§7 — masking is a presentation-layer transformation, not a rules one.**
 *   Nothing here touches `chess.js`, `lib/engine.ts`, `lib/gameModel.ts` or the
 *   PGN path. A masked queen is still a queen to every one of them; the mask is
 *   read at render time and nowhere else.
 * - **§13 — keep the true game state authoritative and separate from the
 *   rendering layer**, and give away no identity through "piece silhouette,
 *   colour, animation, notation, move hints, or engine overlays". The silhouette
 *   is {@link maskedPieces}; the notation is {@link maskSan}.
 *
 * ## Why the mask is keyed on the *type*, not on the piece
 *
 * `chess.js` gives a piece no stable identity — it is a `{ type, color }` read
 * off a square, and the same object comes back after it has moved. Masking
 * *individual* pieces (the doc's "Selected pieces" variant) would therefore need
 * a square → identity map maintained across every move, capture, castle, en
 * passant and promotion: a second source of truth that can drift out of step
 * with the real position, which is exactly what §13 forbids.
 *
 * A type-level mask is a render-time lookup with no state at all. It also makes
 * promotion fall out for free — a pawn that becomes a queen is drawn as whatever
 * a queen is drawn as, because nothing recorded that it used to be a pawn.
 *
 * ## What a mask may not do
 *
 * Colour is *visible* information (doc §3.1); only the type is hidden (§3.2). So
 * a mask entry is expected to point at a piece of the **same colour** — the
 * editor only ever offers those six. The type does not forbid a cross-colour
 * entry, because a `Record` that could would be a twelve-case union nobody can
 * read; the invariant lives in the editor and in {@link MASK_PRESETS}.
 */

/** A piece as `react-chessboard` names it: colour then upper-case type. */
export type MaskPieceType =
  | "wK"
  | "wQ"
  | "wR"
  | "wB"
  | "wN"
  | "wP"
  | "bK"
  | "bQ"
  | "bR"
  | "bB"
  | "bN"
  | "bP";

/** Whose move it is, as `chess.js` writes it. */
type Color = "w" | "b";

/** The six types, in the order the editor lists them: strongest first. */
export const MASK_PIECE_LETTERS = ["K", "Q", "R", "B", "N", "P"] as const;

export type MaskPieceLetter = (typeof MASK_PIECE_LETTERS)[number];

/** All twelve piece types, White's then Black's. */
export const MASK_PIECE_TYPES: readonly MaskPieceType[] = (
  ["w", "b"] as const
).flatMap((color) =>
  MASK_PIECE_LETTERS.map((letter) => `${color}${letter}` as MaskPieceType),
);

/**
 * True type → the type drawn in its place. Keyed on all twelve, so each colour
 * is masked independently: masking only Black's pieces is an ordinary mask.
 */
export type PieceMask = Readonly<Record<MaskPieceType, MaskPieceType>>;

/** Build a mask from a per-colour rule over the six letters. */
const maskOf = (
  displayed: (letter: MaskPieceLetter) => MaskPieceLetter,
): PieceMask =>
  Object.fromEntries(
    MASK_PIECE_TYPES.map((type) => [
      type,
      `${type[0]}${displayed(type[1] as MaskPieceLetter)}` as MaskPieceType,
    ]),
  ) as PieceMask;

/** Nothing hidden — every piece drawn as itself. The doc's baseline (§2). */
export const IDENTITY_MASK: PieceMask = maskOf((letter) => letter);

/**
 * The three masking policies of the doc's variants table (§8) that this screen
 * ships, weakest first. The adaptive ones — progressive, temporary, random — and
 * the reveal modes (§9) build on this same {@link PieceMask} and are follow-up
 * work.
 */
export const MASK_PRESETS = {
  /** "Normal chess" — the baseline, and the way to switch masking off. */
  identity: IDENTITY_MASK,
  /**
   * "Non-pawns only" — every queen, rook, bishop and knight drawn as a pawn.
   * The kings stay themselves, which is the doc's *Medium* rung: the position
   * still has two landmarks in it.
   */
  nonPawns: maskOf((letter) => (letter === "K" ? "K" : "P")),
  /**
   * "All pieces identical" — the kings included, so every man on the board is
   * the same shape. The doc's *Hard* rung.
   */
  allIdentical: maskOf(() => "P"),
} as const satisfies Record<string, PieceMask>;

export type MaskPresetId = keyof typeof MASK_PRESETS;

/** The presets in the order the editor offers them, easiest first. */
export const MASK_PRESET_IDS = [
  "identity",
  "nonPawns",
  "allIdentical",
] as const satisfies readonly MaskPresetId[];

/**
 * Which preset a mask *is*, or `null` for an arrangement of its own — what the
 * editor's preset group shows as selected. Compared entry by entry rather than
 * by reference, so a mask edited back into a preset is recognised as one.
 */
export const maskPresetOf = (mask: PieceMask): MaskPresetId | null =>
  MASK_PRESET_IDS.find((id) =>
    MASK_PIECE_TYPES.every((type) => MASK_PRESETS[id][type] === mask[type]),
  ) ?? null;

/** Whether this type is drawn as something other than itself. */
const isDisguised = (mask: PieceMask, type: MaskPieceType): boolean =>
  mask[type] !== type;

/**
 * Whether the board leaves this type's identity unreadable — the question the
 * notation has to answer, and *not* the same as "is it drawn as something
 * else".
 *
 * Two ways a type can be hidden, and the second one is easy to miss:
 *
 * - it is **in disguise** — drawn as some other type;
 * - or something else is disguised **as it**, so its own graphic no longer
 *   means only itself. Under "all pieces identical" the pawn is still drawn as
 *   a pawn, and it is nonetheless the most thoroughly hidden piece on the
 *   board: every man there is a pawn to look at, so "e4" in the move list is
 *   the one thing that says which of them really was one.
 *
 * Only same-colour types count towards the second clause. Colour is visible
 * information (doc §3.1), so a white pawn and a black pawn wearing the same
 * shape are not confusable with each other.
 */
export const isMasked = (mask: PieceMask, type: MaskPieceType): boolean =>
  isDisguised(mask, type) ||
  MASK_PIECE_TYPES.some(
    (other) =>
      other !== type && other[0] === type[0] && mask[other] === mask[type],
  );

/** Whether the mask hides anything at all — false for {@link IDENTITY_MASK}. */
export const isAnyMasked = (mask: PieceMask): boolean =>
  MASK_PIECE_TYPES.some((type) => isMasked(mask, type));

/** The same mask with one entry replaced. */
export const withMaskEntry = (
  mask: PieceMask,
  type: MaskPieceType,
  displayed: MaskPieceType,
): PieceMask => ({ ...mask, [type]: displayed });

/**
 * The mask as `options.pieces` — a renderer per piece type, each one the
 * library's own drawing of the type it is *displayed* as.
 *
 * `defaultPieces` is what an unmasked board draws with, so a masked rook is
 * pixel-identical to a real pawn rather than merely similar to one. Anything
 * less and the silhouette gives the identity away (doc §13).
 *
 * The board still reports the real source and target squares, so `onPieceDrop`,
 * legality, check, castling, en passant and promotion never see this at all.
 */
export const maskedPieces = (mask: PieceMask): PieceRenderObject =>
  Object.fromEntries(
    MASK_PIECE_TYPES.map((type) => [type, defaultPieces[mask[type]]]),
  );

/** The letter SAN spells a piece with; a pawn move spells none. */
const SAN_LETTERS: Record<string, MaskPieceLetter> = {
  K: "K",
  Q: "Q",
  R: "R",
  B: "B",
  N: "N",
};

/** The type that made a SAN move — castling is the king, a bare file a pawn. */
const movedTypeOf = (san: string, color: Color): MaskPieceType => {
  if (san.startsWith("O-O") || san.startsWith("0-0")) return `${color}K`;
  return `${color}${SAN_LETTERS[san[0]] ?? "P"}`;
};

/** The type a promotion produced, or `undefined` for an ordinary move. */
const promotedTypeOf = (
  san: string,
  color: Color,
): MaskPieceType | undefined => {
  const letter = san.match(/=([QRBN])/)?.[1] as MaskPieceLetter | undefined;
  return letter === undefined ? undefined : `${color}${letter}`;
};

/** The minimum a move has to say for the mask to be able to rewrite it. */
export type MaskableMove = {
  /** Standard algebraic notation, as it would otherwise be printed. */
  san: string;
  from: string;
  to: string;
  /** The side that made it. */
  color: Color;
};

/**
 * One move as the masked screen prints it: its SAN when nothing about it is
 * hidden, and plain coordinates — `"g1f3"`, `"e7e8q"` — when something is.
 *
 * SAN names the piece, and the move list sits right beside the board, so
 * `"Nf3"` hands back the identity the board is busy hiding (doc §3.2, §13).
 * Coordinates say exactly what the player already watched happen and no more.
 *
 * Two kinds of leak are covered, and both have to be:
 *
 * - the **moving** piece — including the pawn, whose move is spelled with no
 *   letter at all: `"e4"` still says "a pawn moved", which is a giveaway as
 *   soon as pawns are the disguise everything else is wearing;
 * - the piece a pawn **promoted to**, since `"e8=Q"` names a queen whether or
 *   not the pawn that made it was masked.
 *
 * The check and mate marks are kept: every piece can give check, so `"+"` and
 * `"#"` identify nothing, and dropping them would cost the list the one thing
 * about a move that is not already on the board.
 */
export const maskSan = (mask: PieceMask, move: MaskableMove): string => {
  const moved = movedTypeOf(move.san, move.color);
  const promoted = promotedTypeOf(move.san, move.color);

  if (
    !isMasked(mask, moved) &&
    (promoted === undefined || !isMasked(mask, promoted))
  ) {
    return move.san;
  }

  const promotion = promoted === undefined ? "" : promoted[1].toLowerCase();
  const mark = /[+#]$/.exec(move.san)?.[0] ?? "";
  return `${move.from}${move.to}${promotion}${mark}`;
};

/**
 * A whole line of SAN — a game's moves, or one of the engine's variations —
 * with every move that would give something away rewritten as coordinates.
 *
 * The line is replayed from `fen` because SAN alone does not carry the squares a
 * move came from: `"Nf3"` needs a board to say `g1`. Both callers hand over a
 * line that is legal from the position they pair it with, so the replay is a
 * lookup rather than a validation.
 *
 * A move that will not play means the line and the position have come apart —
 * the same fault `pvToSan` stops at. The rest of the line is returned as it
 * came, which is the only thing left to do without squares to print instead;
 * replaying *past* the break is not, because a move that happens to be legal on
 * a board that has stopped following the line would print the wrong squares.
 */
export const maskSanLine = (
  mask: PieceMask,
  fen: string,
  san: readonly string[],
): string[] => {
  // Nothing hidden, nothing to rewrite — and no board to build.
  if (!isAnyMasked(mask)) return [...san];

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [...san];
  }

  let following = true;

  return san.map((text) => {
    if (!following) return text;

    try {
      const move = chess.move(text);
      return maskSan(mask, {
        san: move.san,
        from: move.from,
        to: move.to,
        color: move.color,
      });
    } catch {
      following = false;
      return text;
    }
  });
};
