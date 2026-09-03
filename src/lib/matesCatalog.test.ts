import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import {
  findMateCategory,
  findMatePosition,
  loadMatesCatalog,
  localizedText,
  matesCatalog,
  positionsInCategory,
  sideToMoveOf,
  type MatePosition,
} from "./matesCatalog";

/** A valid position with White (the mating side) to move — the shape of an entry. */
const KQ_VS_K = "7k/8/8/8/8/8/4Q3/4K3 w - - 0 1";

const catalogOf = (positions: unknown[], categories: unknown[] = [
  { id: "basic", labelKey: "mates.categories.basic" },
]) => loadMatesCatalog({ categories, positions });

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: "kq-vs-k",
  category: "basic",
  fen: KQ_VS_K,
  name: { en: "Queen and king vs king" },
  ...overrides,
});

describe("loadMatesCatalog", () => {
  it("reads a well-formed catalog", () => {
    const catalog = catalogOf([entry()]);

    expect(catalog.problems).toEqual([]);
    expect(catalog.categories).toEqual([
      { id: "basic", labelKey: "mates.categories.basic" },
    ]);
    expect(catalog.positions).toHaveLength(1);
    expect(catalog.positions[0].fen).toBe(KQ_VS_K);
  });

  it("normalises the FEN through parseFen rather than trusting the data", () => {
    // Wrapped out of a text box, which is how a hand-authored entry arrives.
    const catalog = catalogOf([entry({ fen: `  7k/8/8/8/8/8/4Q3/4K3   w - - 0 1 ` })]);

    expect(catalog.problems).toEqual([]);
    expect(catalog.positions[0].fen).toBe(KQ_VS_K);
  });

  it.each([
    ["a malformed FEN", entry({ fen: "not a fen" })],
    ["an unknown category", entry({ category: "impossible" })],
    ["no English name", entry({ name: { he: "מלכה" } })],
    ["no id", entry({ id: "" })],
  ])("drops an entry with %s and reports it", (_label, broken) => {
    const catalog = catalogOf([broken, entry({ id: "kr-vs-k" })]);

    // The good entry still loads — one bad row must not empty the library.
    expect(catalog.positions.map((p) => p.id)).toEqual(["kr-vs-k"]);
    expect(catalog.problems).toHaveLength(1);
  });

  it("drops a duplicate id and keeps the first", () => {
    const catalog = catalogOf([
      entry({ name: { en: "First" } }),
      entry({ name: { en: "Second" } }),
    ]);

    expect(catalog.positions).toHaveLength(1);
    expect(catalog.positions[0].name.en).toBe("First");
    expect(catalog.problems).toEqual(['Position "kq-vs-k": duplicate id.']);
  });

  it("never throws on rubbish", () => {
    expect(() => loadMatesCatalog(null)).not.toThrow();
    expect(() => loadMatesCatalog("nope")).not.toThrow();
    expect(() => loadMatesCatalog({})).not.toThrow();

    expect(loadMatesCatalog(null).positions).toEqual([]);
    expect(loadMatesCatalog({}).problems).toHaveLength(2);
  });

  it("keeps a translation only when it is a non-empty string", () => {
    const catalog = catalogOf([
      entry({ name: { en: "Queen", he: "" }, description: { en: "d", he: "ד" } }),
    ]);

    expect(catalog.positions[0].name).toEqual({ en: "Queen" });
    expect(catalog.positions[0].description).toEqual({ en: "d", he: "ד" });
  });
});

describe("localizedText", () => {
  const name = { en: "Queen and king vs king", he: "מלכה ומלך מול מלך" };

  it("picks the active language", () => {
    expect(localizedText(name, "he")).toBe("מלכה ומלך מול מלך");
  });

  it("falls back to English when a language is missing", () => {
    expect(localizedText({ en: "Queen vs rook" }, "he")).toBe("Queen vs rook");
  });

  it("is empty for an absent optional field", () => {
    expect(localizedText(undefined, "en")).toBe("");
  });
});

describe("catalog lookups", () => {
  const catalog = catalogOf(
    [entry(), entry({ id: "two-bishops", category: "advanced" })],
    [
      { id: "basic", labelKey: "mates.categories.basic" },
      { id: "advanced", labelKey: "mates.categories.advanced" },
    ],
  );

  it("finds a category, and misses an unknown one", () => {
    expect(findMateCategory("basic", catalog)?.labelKey).toBe(
      "mates.categories.basic",
    );
    expect(findMateCategory("impossible", catalog)).toBeUndefined();
    expect(findMateCategory(undefined, catalog)).toBeUndefined();
  });

  it("lists a category's positions and nothing else", () => {
    expect(positionsInCategory("basic", catalog).map((p) => p.id)).toEqual([
      "kq-vs-k",
    ]);
    expect(positionsInCategory("impossible", catalog)).toEqual([]);
  });

  it("addresses a position the way the URL does — category and id both", () => {
    expect(findMatePosition("basic", "kq-vs-k", catalog)?.id).toBe("kq-vs-k");
    // A real id under the wrong category is a miss, not a redirect.
    expect(findMatePosition("advanced", "kq-vs-k", catalog)).toBeUndefined();
    expect(findMatePosition("basic", "nope", catalog)).toBeUndefined();
  });
});

/**
 * Material on the board, ignoring kings — enough to say which side is the one
 * doing the mating. Sharper than counting pieces: K+Q vs K+R is the attacker
 * with *fewer* men in one of the shipped Complex entries' cousins.
 */
const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const materialOf = (fen: string, colour: "w" | "b"): number =>
  new Chess(fen)
    .board()
    .flat()
    .filter((square) => square !== null && square.color === colour)
    .reduce((total, square) => total + (VALUES[square!.type] ?? 0), 0);

describe("the shipped catalog", () => {
  it("loads with no problems", () => {
    expect(matesCatalog.problems).toEqual([]);
  });

  it("declares the three categories", () => {
    expect(matesCatalog.categories.map((c) => c.id)).toEqual([
      "basic",
      "advanced",
      "complex",
    ]);
  });

  it("gives every position a unique id and a known category", () => {
    const ids = matesCatalog.positions.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    const known = new Set(matesCatalog.categories.map((c) => c.id));
    for (const position of matesCatalog.positions) {
      expect(known, `${position.id} names an unknown category`).toContain(
        position.category,
      );
    }
  });

  it("seeds every category", () => {
    for (const category of matesCatalog.categories) {
      expect(
        positionsInCategory(category.id).length,
        `${category.id} has no positions`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  /*
    Load-bearing rather than cosmetic. `/engine/play` derives `playAs` and the
    board orientation from the incoming FEN's side to move, so an entry with the
    defending side to move would open the board backwards and have the engine
    move the instant the screen loaded — from the position the reader had just
    picked to solve.
  */
  it("has the mating side to move in every position", () => {
    for (const position of matesCatalog.positions as MatePosition[]) {
      const attacker = sideToMoveOf(position);
      const defender = attacker === "w" ? "b" : "w";

      expect(
        materialOf(position.fen, attacker),
        `${position.id}: the side to move is not the side with the material`,
      ).toBeGreaterThan(materialOf(position.fen, defender));
    }
  });

  it("ships positions that are still playable — no mate or stalemate on arrival", () => {
    for (const position of matesCatalog.positions) {
      const game = new Chess(position.fen);
      expect(game.isGameOver(), `${position.id} is already over`).toBe(false);
      expect(game.inCheck(), `${position.id} opens in check`).toBe(false);
    }
  });

  it("names every position in both shipped languages", () => {
    for (const position of matesCatalog.positions) {
      expect(localizedText(position.name, "en")).not.toBe("");
      expect(
        localizedText(position.name, "he"),
        `${position.id} has no Hebrew name`,
      ).not.toBe(localizedText(position.name, "en"));
    }
  });
});
