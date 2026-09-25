import { findNode, type GameTree } from "./gameTree";
import { reflowComment } from "./pgnComments";
import { formatPercent, playChanceInText, withoutPlayChance } from "./playChance";

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
 * - **A play chance**, lichess-tools' `prc:40` (or `[%prc 40]`) — as `prc`,
 *   `"40%"` (`lib/playChance.ts`, where what it does is written down).
 *
 * Pure: the tree is the model, this is only a reading of it. What the tree
 * stores is never changed — a written PGN keeps the comment as it came.
 */

/** One `key: value` read out of a comment. */
type AnnotationAttribute = { key: string; value: string };

/** One comment, read: its prose in paragraphs, and its attributes. */
export type ReadComment = {
  /** The comment as stored — what an edit starts from. */
  raw: string;
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

  const chance = playChanceInText(raw);
  if (chance !== undefined) attributes.push({ key: "prc", value: `${formatPercent(chance)}%` });

  let text = withoutPlayChance(raw).replace(COMMAND, (_, key: string, value: string) => {
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

  return { raw, paragraphs: reflowComment(text), attributes };
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
 * **The annotation glyphs a reader sets** (CTA-97) — the PGN standard's NAGs,
 * in the three sections the move menu's *Add annotation…* dialog shows, each
 * choice with its glyph and the locale id of its meaning
 * (`nagDialog.meaning.<id>`).
 *
 * A choice may stand for **two codes** (`$7`/`$8` only move, `$10`/`$11`
 * equal): one choice in the dialog, which writes the first and shows either
 * as active. Everything else a PGN may carry is outside the table — kept,
 * written back, and printed by {@link nagGlyph}.
 */
export type NagSection = "move" | "position" | "features";

export type NagChoice = {
  /** The codes this choice stands for; the first is the one written. */
  codes: readonly number[];
  glyph: string;
  /** Its meaning's locale id, under `nagDialog.meaning`. */
  id: string;
};

const choice = (codes: readonly number[], glyph: string, id: string): NagChoice => ({
  codes,
  glyph,
  id,
});

/** The three sections, in the dialog's order — which is also the order glyphs print in. */
export const NAG_SECTIONS: readonly { section: NagSection; choices: readonly NagChoice[] }[] = [
  {
    section: "move",
    choices: [
      choice([1], "!", "good"),
      choice([2], "?", "mistake"),
      choice([3], "!!", "brilliant"),
      choice([4], "??", "blunder"),
      choice([5], "!?", "interesting"),
      choice([6], "?!", "dubious"),
      choice([7, 8], "□", "forced"),
      choice([9], "⊗", "worst"),
    ],
  },
  {
    section: "position",
    choices: [
      choice([10, 11], "=", "equal"),
      choice([13], "∞", "unclear"),
      choice([14], "⩲", "whiteSlight"),
      choice([15], "⩱", "blackSlight"),
      choice([16], "±", "whiteModerate"),
      choice([17], "∓", "blackModerate"),
      choice([18], "+−", "whiteDecisive"),
      choice([19], "−+", "blackDecisive"),
    ],
  },
  {
    section: "features",
    choices: [
      choice([22], "⨀", "zugzwangWhite"),
      choice([23], "⨀", "zugzwangBlack"),
      choice([36], "↑", "initiativeWhite"),
      choice([37], "↑", "initiativeBlack"),
      choice([40], "→", "attackWhite"),
      choice([41], "→", "attackBlack"),
      choice([44], "…", "compensation"),
      choice([132], "⇆", "counterplay"),
      choice([138], "⊕", "zeitnot"),
      choice([140], "Δ", "withIdea"),
      choice([146], "N", "novelty"),
    ],
  },
];

/** Each code in the table, with its section and glyph. */
const NAG_TABLE: ReadonlyMap<number, { section: NagSection; glyph: string }> = new Map(
  NAG_SECTIONS.flatMap(({ section, choices }) =>
    choices.flatMap(({ codes, glyph }) => codes.map((code) => [code, { section, glyph }] as const)),
  ),
);

/**
 * Glyphs for codes outside the table that a PGN commonly carries — printed
 * as they always were, never offered in the dialog.
 */
const EXTRA_GLYPHS: Readonly<Record<number, string>> = {
  32: "⟳",
  33: "⟳",
  133: "⇆",
  139: "⊕",
};

/** The glyph a NAG is printed as; `$N` for one with no common glyph. */
export const nagGlyph = (nag: number): string =>
  NAG_TABLE.get(nag)?.glyph ?? EXTRA_GLYPHS[nag] ?? `$${nag}`;

/** The section a NAG is set from, or `undefined` for one outside the table. */
export const nagSection = (nag: number): NagSection | undefined => NAG_TABLE.get(nag)?.section;

/** Whether a NAG marks the move itself (`!`, `?`, `□`, …) rather than the position. */
export const isMoveMark = (nag: number): boolean => nagSection(nag) === "move";

const PRINT_RANK: Readonly<Record<NagSection, number>> = { move: 0, position: 1, features: 2 };

const printRank = (nag: number): number => {
  const section = nagSection(nag);
  return section === undefined ? 3 : PRINT_RANK[section];
};

/**
 * A move's NAGs in the order they print: the move marks right after the SAN,
 * then the evaluation, the features, and last anything outside the table —
 * each group in the order the move carries it.
 */
export const nagsInPrintOrder = (nags: readonly number[]): number[] =>
  nags
    .map((nag, index) => ({ nag, index, rank: printRank(nag) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ nag }) => nag);

/** Whether a choice is active on a move carrying `nags` — either of its codes. */
export const isNagChoiceActive = (nags: readonly number[], picked: NagChoice): boolean =>
  picked.codes.some((code) => nags.includes(code));

/**
 * **The selection rule** (lichess's): what a move's NAGs become when the
 * reader picks `picked` in `section`.
 *
 * - Move Assessment and Position Evaluation are **single-choice**: picking a
 *   glyph replaces that section's glyph, and picking the active one removes it.
 * - Positional Features are **multi-select**: each glyph toggles on its own.
 * - Codes outside the table are never touched.
 *
 * Pure; a new array every time (compare with `setNags`'s no-op rule, which
 * hands the tree back when the list comes out the same).
 */
export const toggleNag = (
  nags: readonly number[],
  section: NagSection,
  picked: NagChoice,
): number[] => {
  const active = isNagChoiceActive(nags, picked);
  if (section === "features") {
    return active
      ? nags.filter((nag) => !picked.codes.includes(nag))
      : [...nags, picked.codes[0]];
  }
  const rest = nags.filter((nag) => nagSection(nag) !== section);
  return active ? rest : [...rest, picked.codes[0]];
};

/**
 * The lichess colour family a move mark is drawn in — `!`/`!!` good, `?`/`??`
 * bad, `!?` and `?!` their own; `undefined` for a glyph drawn plain.
 */
export type NagTone = "good" | "brilliant" | "mistake" | "blunder" | "interesting" | "dubious";

const NAG_TONES: Readonly<Record<number, NagTone>> = {
  1: "good",
  2: "mistake",
  3: "brilliant",
  4: "blunder",
  5: "interesting",
  6: "dubious",
};

export const nagTone = (nag: number): NagTone | undefined => NAG_TONES[nag];
