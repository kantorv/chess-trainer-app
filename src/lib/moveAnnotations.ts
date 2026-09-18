import { findNode, type GameTree } from "./gameTree";
import { reflowComment } from "./pgnComments";

/**
 * **What a move's annotations say, ready to read** (CTA-69) — the comments
 * the tree carries (`lib/gameTree.ts`), split into the prose and the
 * **attributes** written inside it, for the repertoire player's comment block.
 *
 * Two kinds of attribute are recognised, both read out of the comment text
 * and taken out of the prose so nothing is said twice:
 *
 * - **PGN embedded commands**, `[%key value]` — lichess' and ChessBase's
 *   `[%eval 0.25]`, `[%clk 0:05:00]`, `[%cal Ge2e4]`, and any other: the key
 *   is the command's name, the value its text, unread.
 * - **An engine's evaluation**, the shape analysis exports end a comment
 *   with — `+/= +1.31 (21 ply)`, `= 0.00 (27 ply)` — as `assessment`,
 *   `eval` and `depth`; and `-+ mate-in-12` as `assessment` and `mate`.
 *
 * Pure: the tree is the model, this is only a reading of it. What the tree
 * stores is never changed — a written PGN keeps the comment as it came.
 */

/** One `key: value` read out of a comment. */
export type AnnotationAttribute = { key: string; value: string };

/** One comment, read: its prose in paragraphs, and its attributes. */
export type ReadComment = {
  paragraphs: string[];
  attributes: AnnotationAttribute[];
};

/** Everything annotated at one position — the move that reached it, or the start. */
export type PositionAnnotations = {
  /** The comments before the move — the text opening its variation. */
  before: ReadComment[];
  /** The comments after it; at the start position, the game's own. */
  after: ReadComment[];
  nags: number[];
};

const COMMAND = /\[%([A-Za-z][\w-]*)\s*([^\]]*)\]/g;

/** The assessment glyphs an analysis export writes before its number. */
const ASSESSMENT = String.raw`(\+-|-\+|\+\/-|-\/\+|\+\/=|=\/\+|=|∞)`;

/** `+/= +1.31 (21 ply)` — the evaluation ending a comment. */
const TRAILING_EVAL = new RegExp(
  String.raw`(?:^|\s)(?:${ASSESSMENT}\s+)?([+-]?\d+(?:\.\d+)?)\s+\((\d+)\s+ply\)\s*$`,
);

/** `-+ mate-in-12` — a forced mate, wherever the comment says it. */
const MATE_IN = new RegExp(String.raw`(?:^|\s)(?:${ASSESSMENT}\s+)?mate-in-(\d+)\b`);

/** Read one stored comment. */
export const readComment = (raw: string): ReadComment => {
  const attributes: AnnotationAttribute[] = [];

  let text = raw.replace(COMMAND, (_, key: string, value: string) => {
    attributes.push({ key, value: value.trim() });
    return " ";
  });

  const evaluation = TRAILING_EVAL.exec(text);
  if (evaluation !== null) {
    const [whole, assessment, score, depth] = evaluation;
    if (assessment !== undefined) attributes.push({ key: "assessment", value: assessment });
    attributes.push({ key: "eval", value: score }, { key: "depth", value: depth });
    text = text.slice(0, text.length - whole.length);
  }

  const mate = MATE_IN.exec(text);
  if (mate !== null) {
    const [whole, assessment, moves] = mate;
    if (assessment !== undefined) attributes.push({ key: "assessment", value: assessment });
    attributes.push({ key: "mate", value: moves });
    text = text.slice(0, mate.index) + " " + text.slice(mate.index + whole.length);
  }

  return { paragraphs: reflowComment(text), attributes };
};

/**
 * The annotations at a position — `null` for the start, where the game's own
 * comment is — or `null` when there are none, which is when the block is not
 * shown at all.
 */
export const annotationsAt = (
  tree: GameTree,
  nodeId: string | null,
): PositionAnnotations | null => {
  const node = findNode(tree, nodeId);
  const before = (node?.preComments ?? []).map(readComment);
  const after = ((node === null ? tree.comments : node.comments) ?? []).map(readComment);
  const nags = node?.nags ?? [];
  const empty = (comment: ReadComment) =>
    comment.paragraphs.length === 0 && comment.attributes.length === 0;
  if ([...before, ...after].every(empty) && nags.length === 0) return null;
  return { before, after, nags };
};

/**
 * The glyph a NAG is printed as (the PGN standard's numbering): the move
 * marks, the position assessments and the commonest commentary symbols.
 * `undefined` for one with no common glyph, which a reader prints as `$N`.
 */
const NAG_GLYPHS: Readonly<Record<number, string>> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "??",
  5: "!?",
  6: "?!",
  7: "□",
  10: "=",
  13: "∞",
  14: "⩲",
  15: "⩱",
  16: "±",
  17: "∓",
  18: "+−",
  19: "−+",
  22: "⨀",
  23: "⨀",
  32: "⟳",
  33: "⟳",
  36: "→",
  37: "→",
  40: "↑",
  41: "↑",
  132: "⇆",
  133: "⇆",
  138: "⊕",
  139: "⊕",
  146: "N",
};

export const nagGlyph = (nag: number): string => NAG_GLYPHS[nag] ?? `$${nag}`;

/** Whether a NAG marks the move itself (`!`, `?`, …) rather than the position. */
export const isMoveMark = (nag: number): boolean => nag >= 1 && nag <= 6;
