import { findNode, setComments, type GameTree, type VariationNode } from "./gameTree";

/**
 * **Play chances** (CTA-69) — how likely the trainer is to play each of the
 * repertoire's moves at a branch, the rules of the lichess-tools browser
 * extension (its "play all variations" / random-next-move feature), so a
 * study prepared for one behaves the same in the other.
 *
 * ## Where a chance is written: `prc:N` in the move's own comment
 *
 * `prc:40` inside a comment **of the move it is about** — the candidate move
 * at the branch, the first move of its variation, *not* the move before the
 * branch (the classic mistake: lichess-tools ignores it there, and so does
 * this). `N` is a percentage, 0–100; a decimal is read, a value above 100 is
 * read as 100. `[%prc 40]`, the PGN command form, is read too. The first one
 * on a move wins. It is stored as comment text because that is what a PGN,
 * and a lichess study, can carry — the file keeps working in both tools —
 * and the comment block shows it as a **Play chance** chip, not as prose.
 *
 * ## How the chances are worked out, at one branch
 *
 * 1. **No move marked** — lichess-tools' default: each move weighs **the
 *    number of lines within the next 8 plies** from the branch (the move
 *    itself is the first; a line is a path that ends, or reaches the eighth
 *    ply). `1. e4 (1. d4 d5 2. Nc3 (2. Nf3)) 1... e5 2. Nf3`: d4 has two
 *    lines, e4 one, so d4 is played 2/3 of the time. More prepared material
 *    under a move, more drilling of it.
 * 2. **Every move marked** — the marks, **scaled** to 100%: `prc:5` on eight
 *    moves and `prc:50` on a ninth gives the ninth 50/90 ≈ 44%, the figure
 *    the lichess-tools forum verified.
 * 3. **Some marked** (lichess-tools does not document this; this is ours):
 *    the marked moves take their percentages, and the unmarked ones share
 *    what is left of 100 **in proportion to their line counts** (rule 1
 *    within the remainder). If the marks already reach 100 or more, the
 *    unmarked moves get nothing and the marks are scaled as in rule 2.
 * 4. **`prc:0`** — never played. If every move comes to 0, rule 1 applies
 *    to all of them, so the trainer can always move.
 *
 * Pure. The trainer's policy is {@link playChancePolicy} in
 * `lib/repertoireTrainer.ts`; the dialog that sets the marks is
 * `views/explorer/PlayChanceDialog.tsx`.
 */

/** How deep lichess-tools looks when it weighs a move by its lines. */
export const LINE_COUNT_PLIES = 8;

/** `prc:40`, a whole token; and `[%prc 40]`, the command form. */
const PRC_TEXT = /(^|\s)prc:\s*(\d+(?:\.\d+)?)(?=\s|$)/i;
const PRC_COMMAND = /\[%prc\s+(\d+(?:\.\d+)?)\s*\]/i;
const PRC_ANY = /(^|\s)prc:\s*\d+(?:\.\d+)?(?=\s|$)|\[%prc\s+\d+(?:\.\d+)?\s*\]/gi;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/** The `prc` a comment carries, or `undefined`. */
export const playChanceInText = (text: string): number | undefined => {
  const plain = PRC_TEXT.exec(text);
  if (plain !== null) return clampPercent(Number(plain[2]));
  const command = PRC_COMMAND.exec(text);
  if (command !== null) return clampPercent(Number(command[1]));
  return undefined;
};

/** The comment with its `prc` marks taken out — what the prose is. */
export const withoutPlayChance = (text: string): string =>
  // A comment with no mark comes back exactly as it was.
  playChanceInText(text) === undefined
    ? text
    : text
        .replace(PRC_ANY, (_, space: string | undefined) => space ?? "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

/** The chance a move is marked with — its comments after, then before, it. */
export const playChanceOf = (node: VariationNode): number | undefined => {
  for (const text of [...(node.comments ?? []), ...(node.preComments ?? [])]) {
    const value = playChanceInText(text);
    if (value !== undefined) return value;
  }
  return undefined;
};

/**
 * A move's comments with its mark set to `value`, or removed (`null`): every
 * existing mark goes (a comment left empty by that goes too), and the new
 * one is appended to the **last** comment — one `{ … prc:40 }`, the way a
 * lichess move carries it — or is a comment of its own when there is none.
 */
export const commentsWithPlayChance = (
  comments: readonly string[] | undefined,
  value: number | null,
): string[] => {
  const kept = (comments ?? []).map(withoutPlayChance).filter((text) => text !== "");
  if (value === null) return kept;
  const mark = `prc:${formatPercent(clampPercent(value))}`;
  const last = kept.at(-1);
  return last === undefined ? [mark] : [...kept.slice(0, -1), `${last} ${mark}`];
};

/** A percentage as it is written: `40`, `12.5` — no trailing zeros. */
export const formatPercent = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

/**
 * The lines under `node` within {@link LINE_COUNT_PLIES} plies, the node
 * itself the first: a path that ends, or that reaches the last ply, is one.
 */
export const linesWithin = (node: VariationNode, plies: number = LINE_COUNT_PLIES): number => {
  if (plies <= 1 || node.children.length === 0) return 1;
  let lines = 0;
  for (const child of node.children) lines += linesWithin(child, plies - 1);
  return lines;
};

/**
 * Each move's chance at one branch, in `moves`' order, summing to 1 (or all
 * 0 for no moves) — the four rules of the module note. `markOf` reads a
 * move's mark; the trainer passes one that reads the session's tree.
 */
export const playChances = (
  moves: readonly VariationNode[],
  markOf: (node: VariationNode) => number | undefined = playChanceOf,
): number[] => {
  if (moves.length === 0) return [];
  const lines = moves.map((node) => linesWithin(node));
  const byLines = () => {
    const total = lines.reduce((sum, count) => sum + count, 0);
    return lines.map((count) => count / total);
  };

  const marks = moves.map(markOf);
  if (marks.every((mark) => mark === undefined)) return byLines();

  const markedTotal = marks.reduce<number>((sum, mark) => sum + (mark ?? 0), 0);
  const remainder = Math.max(0, 100 - markedTotal);
  const unmarkedLines = lines.reduce(
    (sum, count, index) => sum + (marks[index] === undefined ? count : 0),
    0,
  );
  const weights = marks.map((mark, index) =>
    mark !== undefined ? mark : unmarkedLines === 0 ? 0 : (remainder * lines[index]) / unmarkedLines,
  );

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return byLines();
  return weights.map((weight) => weight / total);
};

/** One of `moves`, by `chances` (as {@link playChances} returns them). */
export const pickByChance = (
  moves: readonly VariationNode[],
  chances: readonly number[],
  random: () => number = Math.random,
): VariationNode | undefined => {
  if (moves.length === 0) return undefined;
  let at = random();
  for (let index = 0; index < moves.length; index += 1) {
    at -= chances[index] ?? 0;
    if (at < 0) return moves[index];
  }
  // Rounding left a sliver past the last move: the last one with a chance.
  for (let index = moves.length - 1; index >= 0; index -= 1) {
    if ((chances[index] ?? 0) > 0) return moves[index];
  }
  return moves[moves.length - 1];
};

/**
 * A mark reader over **another tree** — the session's, where the reader may
 * have just changed a mark — for moves that come from the repertoire as it
 * was saved. Node ids survive every edit (`lib/gameTree.ts`), so the same id
 * is the same move; a move the other tree no longer holds reads its own mark.
 */
export const marksFrom =
  (tree: GameTree) =>
  (node: VariationNode): number | undefined =>
    playChanceOf(findNode(tree, node.id) ?? node);

/**
 * **Set the chances at one branch** — each move named in `values` gets its
 * mark (`null` removes it), written into its comments by
 * {@link commentsWithPlayChance}; a mark sitting in a comment before the move
 * is taken out too, so the move carries one. A tree edit like any other
 * (`setComments`: pure, ids kept, the same tree back when nothing changes),
 * so the screen hands it to the core's `replaceTree` and it is a session
 * change the Save strip keeps or Discard drops.
 */
export const setPlayChances = (
  tree: GameTree,
  values: ReadonlyMap<string, number | null>,
): GameTree => {
  let next = tree;
  for (const [id, value] of values) {
    const node = findNode(next, id);
    if (node === null) continue;
    next = setComments(next, id, "preComments", commentsWithPlayChance(node.preComments, null));
    next = setComments(next, id, "comments", commentsWithPlayChance(node.comments, value));
  }
  return next;
};
