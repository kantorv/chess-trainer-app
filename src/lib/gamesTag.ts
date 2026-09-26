import type { VariationNode } from "./gameTree";

/**
 * **The `games` tag** (CTA-98) — how many games went through a move, written
 * in the move's own comment, `prc`'s shape (`lib/playChance.ts`):
 *
 * - `games:12`, a whole token (case-insensitive, `games: 12` too), or
 *   `[%games 12]`, the PGN command form. `N` a whole number; the first one on
 *   a move wins.
 * - On the move it counts — the candidate at a branch — never the move before.
 *
 * The Analysis Board's arrows can be sized by it: at a branch, each tagged
 * move's share of the tagged moves' games (`nextMoveWeights.ts`), the
 * Library's opening board's `child.count / node.count` carried in a PGN. The
 * comment block shows it as a *Games* chip, not as prose (`readComment`).
 * Written by `mergeTrees`' counting (CTA-101) and the Library's *Save tree
 * as PGN* (CTA-99) — `.claude/rules/pgn-annotations.md` §1 and §3.
 */

const GAMES_TEXT = /(^|\s)games:\s*(\d+)(?=\s|$)/i;
const GAMES_COMMAND = /\[%games\s+(\d+)\s*\]/i;
const GAMES_ANY = /(^|\s)games:\s*\d+(?=\s|$)|\[%games\s+\d+\s*\]/gi;

/** The `games` count a comment carries, or `undefined`. */
export const gamesInText = (text: string): number | undefined => {
  const plain = GAMES_TEXT.exec(text);
  if (plain !== null) return Number(plain[2]);
  const command = GAMES_COMMAND.exec(text);
  if (command !== null) return Number(command[1]);
  return undefined;
};

/** The comment with its `games` tags taken out — what the prose is. */
export const withoutGames = (text: string): string =>
  gamesInText(text) === undefined
    ? text
    : text
        .replace(GAMES_ANY, (_, space: string | undefined) => space ?? "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

/** The games a move is tagged with — its comments after, then before, it. */
export const gamesOf = (node: VariationNode): number | undefined => {
  for (const text of [...(node.comments ?? []), ...(node.preComments ?? [])]) {
    const value = gamesInText(text);
    if (value !== undefined) return value;
  }
  return undefined;
};
