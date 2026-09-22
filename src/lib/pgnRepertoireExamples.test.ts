import { describe, expect, it } from "vitest";

import { countVariations } from "./gameTree";
import { parsePgnTree, splitPgnGames } from "./pgn";

/**
 * The three repertoire **fixtures** (`src/test/fixtures/pgn/`), and the shape
 * each one has to come out as when read as trees — the side lines are the
 * whole of a repertoire, and `chess.js` `loadPgn` would drop every one of
 * them. They were shipped Library files until CTA-75 replaced the Library's
 * data; the Repertoires tests (`savedRepertoires.test.ts`,
 * `RepertoireBoard.test.tsx`) read them from here too.
 */

const files = import.meta.glob<string>("../test/fixtures/pgn/*.pgn", {
  query: "?raw",
  import: "default",
  eager: true,
});
const fixture = (name: string): string => {
  const text = files[`../test/fixtures/pgn/${name}`];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  return text;
};

const branchesIn = (text: string): number =>
  splitPgnGames(text).reduce(
    (total, game) => total + countVariations(parsePgnTree(game)),
    0,
  );

describe("the repertoire fixtures", () => {
  it("cut into the games each one holds", () => {
    expect(splitPgnGames(fixture("sicilian-2c3-sampler.pgn"))).toHaveLength(14);
    expect(splitPgnGames(fixture("live-chess-2026-09-18.pgn"))).toHaveLength(1);
    expect(splitPgnGames(fixture("d2d4Variations.pgn"))).toHaveLength(13);
  });

  /*
    Given its own timeout: the one-tree example is a single 7,859-node tree,
    and `parsePgnTree` over 49KB of deeply nested `( … )` is seconds of work.
  */
  it("keep their side lines when read as trees", () => {
    expect(branchesIn(fixture("live-chess-2026-09-18.pgn"))).toBe(141);
    expect(branchesIn(fixture("d2d4Variations.pgn"))).toBeGreaterThan(20);
  }, 60000);
});
