import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import {
  allCategories,
  findLibraryCategory,
  localizedText,
  positionsInLibraryCategory,
  resolveLibraryPath,
} from "./libraryCatalog";
import { positionsCatalog } from "./positionsCatalog";

describe("the shipped endgame positions catalog", () => {
  it("loads with no problems", () => {
    expect(positionsCatalog.problems).toEqual([]);
  });

  it("declares the two categories the request named, with their names", () => {
    const queenVsRook = findLibraryCategory("queen-vs-rook", positionsCatalog);
    const rookAndPawn = findLibraryCategory(
      "rook-and-pawn-vs-rook",
      positionsCatalog,
    );

    expect(queenVsRook?.label?.en).toBe("Queen vs Rook");
    expect(rookAndPawn?.label?.en).toBe("Rook and pawn vs Rook");
  });

  it("nests Rosettes under Queen vs Rook, as structure with no positions yet", () => {
    /*
      Shipped deliberately empty: "Rosette" is not sourceable endgame
      terminology, so the sub-category exists and renders the empty-category
      message until rows are added to the JSON. It is also the one thing the
      Mates section could not express — a category inside a category.
    */
    const rosettes = findLibraryCategory("queen-vs-rook/rosettes", positionsCatalog);

    expect(rosettes?.label?.en).toBe("Rosettes");
    expect(positionsInLibraryCategory(rosettes?.path, positionsCatalog)).toEqual([]);
  });

  it("names every category in both shipped languages, from the data", () => {
    // The point of the section: not one of these is a `src/locales` key.
    for (const category of allCategories(positionsCatalog)) {
      expect(category.labelKey, `${category.path} uses a catalog key`).toBeUndefined();
      expect(localizedText(category.label, "en")).not.toBe("");
      expect(
        localizedText(category.label, "he"),
        `${category.path} has no Hebrew name`,
      ).not.toBe(localizedText(category.label, "en"));
    }
  });

  it("gives every position a unique id and names it in both languages", () => {
    const ids = positionsCatalog.positions.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const position of positionsCatalog.positions) {
      expect(localizedText(position.name, "en")).not.toBe("");
      expect(
        localizedText(position.name, "he"),
        `${position.id} has no Hebrew name`,
      ).not.toBe(localizedText(position.name, "en"));
    }
  });

  it("ships positions that are still playable — no mate or stalemate on arrival", () => {
    for (const position of positionsCatalog.positions) {
      const game = new Chess(position.fen);
      expect(game.isGameOver(), `${position.id} is already over`).toBe(false);
      expect(game.inCheck(), `${position.id} opens in check`).toBe(false);
    }
  });

  /*
    The Mates catalog asserts that the *mating* side is to move in every entry,
    and that rule stops at its own section. A drawing defense or a mutual
    zugzwang is the defender's to play, and asserting an attacker-to-move rule
    here would be wrong chess — this is the assertion that says so out loud, so
    nobody promotes the mates rule into the shared layer later.
  */
  it("lets a position be the defender's to move", () => {
    const sides = positionsCatalog.positions.map((p) => p.fen.split(" ")[1]);

    expect(sides).toContain("b");
    expect(sides).toContain("w");
  });

  it("resolves every shipped position from its own URL segments", () => {
    for (const position of positionsCatalog.positions) {
      const segments = `${position.category}/${position.id}`.split("/");

      expect(resolveLibraryPath(segments, positionsCatalog)).toMatchObject({
        kind: "item",
        item: { kind: "position", id: position.id },
      });
    }
  });
});
