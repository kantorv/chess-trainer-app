import type { ArrowWidthSource } from "./arrowSettings";
import { gamesOf } from "./gamesTag";
import type { GameTree, VariationNode } from "./gameTree";
import { readComment } from "./moveAnnotations";
import { linesWithin, playChanceOf } from "./playChance";
import { TreeManager } from "./treeManager";

/**
 * **What sizes a continuation's arrow** (CTA-98) — each next move's weight at
 * one branch, by the Analysis Board's chosen width source
 * (`lib/arrowSettings.ts`), as a 0–1 fraction on the play-chance arrows'
 * absolute scale (`views/explorer/chanceArrows.ts`'s `chanceArrowWidth`: 0 a
 * hairline, 1 the fat arrow).
 *
 * | Source | Read from | Weight |
 * | --- | --- | --- |
 * | `eval` | `[%eval X]` in the move's own comment, or the trailing `+1.31 (21 ply)` shape (`readComment`'s `eval`) — White's view, pawns or `#N` | **loss vs best**: the best tagged move is 1, each narrows linearly with the centipawns it gives up, to 0 at {@link EVAL_HAIRLINE_CP} or worse; a mate for the mover is the best, a mate against it 0 |
 * | `games` | `games:N` / `[%games N]` (`lib/gamesTag.ts`) | `N / Σ N` over the tagged moves |
 * | `prc` | `prc:N` / `[%prc N]` (`playChanceOf`) | the marks scaled to 100% over the tagged moves (lichess-tools' rule 2) |
 * | `lines` | nothing — lichess-tools' default | each move's share of the lines within 8 plies (`linesWithin`) |
 *
 * **Partly tagged**: a move without the tag weighs `null` — drawn gray, of a
 * fixed modest width — while the tagged ones are sized. **Not tagged at all**
 * at this branch: `undefined`, and the board draws its ordinary arrows, so it
 * stays readable past the tagged part of a game. `lines` always weighs.
 *
 * Pure.
 */

/** A continuation's weight, 0–1; `null` for a move that carries no tag. */
export type NextMoveWeight = number | null;

/** How many centipawns a move may give up before its arrow is a hairline. */
export const EVAL_HAIRLINE_CP = 300;

/** A mate's score in centipawns — past any real evaluation, a shorter mate the better. */
const MATE_CP = 100_000;

/** An evaluation, White's view: centipawns, or a mate in `moves` (positive: White mates). */
export type MoveEval = { cp: number } | { mate: number };

/** `0.25`, `+1.31`, `-0.5`, `#3`, `#-3` (a `,depth` suffix is ignored) — or `undefined`. */
export const parseEval = (value: string): MoveEval | undefined => {
  const match = /^\s*(#)?\s*([+-]?\d+(?:\.\d+)?)/.exec(value);
  if (match === null) return undefined;
  const number = Number(match[2]);
  if (!Number.isFinite(number)) return undefined;
  return match[1] === "#" ? { mate: Math.trunc(number) } : { cp: Math.round(number * 100) };
};

/** The evaluation written in a move's comments after it, or `undefined`. */
export const evalOf = (node: VariationNode): MoveEval | undefined => {
  for (const text of node.comments ?? []) {
    // Most comments hold neither shape; skip them before reading them whole.
    if (!text.includes("eval") && !text.includes("ply)")) continue;
    const value = readComment(text).attributes.find((attribute) => attribute.key === "eval")?.value;
    const parsed = value === undefined ? undefined : parseEval(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

/** Whether the side that played `node` is White — the FEN after it has Black to move. */
const playedByWhite = (node: VariationNode): boolean => node.fen.split(" ")[1] === "b";

/**
 * An evaluation as the mover sees it, in centipawns — a mate for the mover
 * past every number (a shorter one higher), a mate against it below every
 * number. `#0` is a mate just delivered, which only the mover can have done.
 */
const moverScore = (value: MoveEval, whiteMoved: boolean): number => {
  const sign = whiteMoved ? 1 : -1;
  if ("cp" in value) return value.cp * sign;
  if (value.mate === 0) return MATE_CP;
  const forMover = value.mate * sign > 0;
  return forMover ? MATE_CP - Math.abs(value.mate) : -MATE_CP + Math.abs(value.mate);
};

/** Each tagged value's share of the tagged values' total; `null` where untagged. */
const shares = (values: readonly (number | undefined)[]): NextMoveWeight[] | undefined => {
  if (values.every((value) => value === undefined)) return undefined;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return values.map((value) => (value === undefined ? null : total > 0 ? value / total : 0));
};

/**
 * The weights of `nodes` — the continuations at one branch, in order — by
 * `source`; `undefined` for `none`, and for a tag no move here carries. See
 * the module note for each source's rule.
 */
export const nextMoveWeights = (
  nodes: readonly VariationNode[],
  source: ArrowWidthSource,
): NextMoveWeight[] | undefined => {
  if (nodes.length === 0) return undefined;
  switch (source) {
    case "none":
      return undefined;
    case "lines": {
      const lines = nodes.map((node) => linesWithin(node));
      const total = lines.reduce((sum, count) => sum + count, 0);
      return lines.map((count) => count / total);
    }
    case "games":
      return shares(nodes.map(gamesOf));
    case "prc":
      return shares(nodes.map(playChanceOf));
    case "eval": {
      const scores = nodes.map((node) => {
        const value = evalOf(node);
        return value === undefined ? undefined : moverScore(value, playedByWhite(node));
      });
      if (scores.every((score) => score === undefined)) return undefined;
      const best = Math.max(...scores.filter((score) => score !== undefined));
      return scores.map((score) => {
        if (score === undefined) return null;
        if (score <= -MATE_CP / 2) return 0;
        return Math.max(0, 1 - (best - score) / EVAL_HAIRLINE_CP);
      });
    }
  }
};

/**
 * Every width source a tree can be drawn by: `none` and `lines` always, and
 * each tag some move anywhere in it carries. One walk; recompute it when the
 * tree changes (a load, a comment edited).
 */
export const arrowWidthSourcesIn = (tree: GameTree): ReadonlySet<ArrowWidthSource> => {
  const found = new Set<ArrowWidthSource>(["none", "lines"]);
  new TreeManager<VariationNode>(tree.moves).traverse((node) => {
    if (node.comments === undefined && node.preComments === undefined) return;
    if (!found.has("prc") && playChanceOf(node) !== undefined) found.add("prc");
    if (!found.has("games") && gamesOf(node) !== undefined) found.add("games");
    if (!found.has("eval") && evalOf(node) !== undefined) found.add("eval");
  });
  return found;
};
