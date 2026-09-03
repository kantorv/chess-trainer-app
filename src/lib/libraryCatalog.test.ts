import { describe, expect, it } from "vitest";

import {
  allCategories,
  categoryLabel,
  findLibraryCategory,
  findLibraryItem,
  findLibraryPosition,
  itemsInLibraryCategory,
  libraryCatalogOf,
  libraryItemFen,
  loadLibraryCatalog,
  positionsInLibraryCategory,
  resolveLibraryPath,
  sideToMoveOf,
  type LibraryGame,
  type LibraryPosition,
} from "./libraryCatalog";
import { parsePgnGame } from "./pgn";

/** A valid position — the shape of an entry, and legal from either side. */
const KQ_VS_K = "7k/8/8/8/8/8/4Q3/4K3 w - - 0 1";
const BLACK_TO_MOVE = "8/4k3/8/4K3/4P3/8/8/8 b - - 0 1";

/**
 * A library nested two deep, with positions at both levels and a sub-category
 * holding none — the shape the Positions section actually ships, and deeper
 * than the Mates section can express.
 */
const nested = () =>
  loadLibraryCatalog({
    categories: [
      {
        id: "queen-vs-rook",
        label: { en: "Queen vs Rook", he: "מלכה מול צריח" },
        children: [
          { id: "rosettes", label: { en: "Rosettes" } },
          {
            id: "deeper",
            label: { en: "Deeper" },
            children: [{ id: "deepest", label: { en: "Deepest" } }],
          },
        ],
      },
      { id: "pawn-endgames", labelKey: "positions.categories.pawn" },
    ],
    positions: [
      {
        id: "philidor",
        category: "queen-vs-rook",
        fen: KQ_VS_K,
        name: { en: "Philidor" },
      },
      {
        id: "buried",
        category: "queen-vs-rook/deeper/deepest",
        fen: BLACK_TO_MOVE,
        name: { en: "Buried" },
      },
      {
        id: "opposition",
        category: "pawn-endgames",
        fen: BLACK_TO_MOVE,
        name: { en: "Opposition" },
      },
    ],
  });

describe("loadLibraryCatalog reads a nested library", () => {
  it("gives every category its full path, at every depth", () => {
    const catalog = nested();

    expect(catalog.problems).toEqual([]);
    expect(allCategories(catalog).map((c) => c.path)).toEqual([
      "queen-vs-rook",
      "queen-vs-rook/rosettes",
      "queen-vs-rook/deeper",
      "queen-vs-rook/deeper/deepest",
      "pawn-endgames",
    ]);
  });

  it("takes a name from the data or from a catalog key, whichever the entry has", () => {
    const catalog = nested();
    const t = (key: string) => `translated:${key}`;

    expect(categoryLabel(findLibraryCategory("queen-vs-rook", catalog), t, "he")).toBe(
      "מלכה מול צריח",
    );
    // No Hebrew on this one — English is the fallback, not a blank.
    expect(categoryLabel(findLibraryCategory("queen-vs-rook/rosettes", catalog), t, "he")).toBe(
      "Rosettes",
    );
    expect(categoryLabel(findLibraryCategory("pawn-endgames", catalog), t, "en")).toBe(
      "translated:positions.categories.pawn",
    );
  });

  it("files a position under the exact path it names, and nowhere else", () => {
    const catalog = nested();

    expect(
      positionsInLibraryCategory("queen-vs-rook/deeper/deepest", catalog).map(
        (p) => p.id,
      ),
    ).toEqual(["buried"]);
    // A parent does not absorb its children's positions, or a top category
    // would list everything beneath it a second time.
    expect(
      positionsInLibraryCategory("queen-vs-rook", catalog).map((p) => p.id),
    ).toEqual(["philidor"]);
    expect(positionsInLibraryCategory("queen-vs-rook/rosettes", catalog)).toEqual([]);
  });

  it("addresses a position by category path and id together", () => {
    const catalog = nested();

    expect(findLibraryPosition("queen-vs-rook", "philidor", catalog)?.id).toBe(
      "philidor",
    );
    // A real id under the wrong category is a miss, not a redirect.
    expect(findLibraryPosition("pawn-endgames", "philidor", catalog)).toBeUndefined();
    expect(findLibraryPosition("queen-vs-rook", undefined, catalog)).toBeUndefined();
  });

  it("reads the side to move off the FEN", () => {
    const catalog = nested();

    expect(sideToMoveOf(catalog.positions[0])).toBe("w");
    expect(sideToMoveOf(catalog.positions[1])).toBe("b");
  });
});

describe("resolveLibraryPath matches the longest category prefix", () => {
  const catalog = nested();
  const at = (path: string) =>
    resolveLibraryPath(path.split("/").filter(Boolean), catalog);

  it("resolves a category at any depth", () => {
    expect(at("pawn-endgames")).toMatchObject({ kind: "category" });
    expect(at("queen-vs-rook/deeper/deepest")).toMatchObject({
      kind: "category",
      category: { path: "queen-vs-rook/deeper/deepest" },
    });
  });

  it("reads the leftover segment as an item id", () => {
    const found = at("queen-vs-rook/deeper/deepest/buried");

    expect(found).toMatchObject({
      kind: "item",
      category: { path: "queen-vs-rook/deeper/deepest" },
      item: { kind: "position", id: "buried" },
    });
  });

  it("prefers the deepest category over a shallower one plus a segment", () => {
    /*
      The whole reason a splat route can serve this: `.../rosettes` is not
      guessed at, it is looked up — a sub-category of that name wins over a
      position of that name, and one route serves both shapes.
    */
    expect(at("queen-vs-rook/rosettes")).toMatchObject({
      kind: "category",
      category: { path: "queen-vs-rook/rosettes" },
    });
  });

  it("names the category when only the position id is unknown", () => {
    // Enough for the detail screen to say "not in this category" and point back.
    expect(at("queen-vs-rook/nope")).toMatchObject({
      kind: "unknown-position",
      category: { path: "queen-vs-rook" },
    });
    // Two segments too many cannot be an id either, and resolve the same way.
    expect(at("queen-vs-rook/nope/deeper")).toMatchObject({
      kind: "unknown-position",
      category: { path: "queen-vs-rook" },
    });
  });

  it("misses cleanly on a path no category starts", () => {
    expect(at("nope")).toEqual({ kind: "unknown-category" });
    expect(at("nope/at/all")).toEqual({ kind: "unknown-category" });
    expect(at("")).toEqual({ kind: "unknown-category" });
  });
});

describe("loadLibraryCatalog reports rather than throws", () => {
  const withCategories = (categories: unknown[], positions: unknown[] = []) =>
    loadLibraryCatalog({ categories, positions });

  it("never throws on rubbish", () => {
    expect(() => loadLibraryCatalog(null)).not.toThrow();
    expect(() => loadLibraryCatalog("nope")).not.toThrow();
    expect(() => loadLibraryCatalog({ categories: 7, positions: 7 })).not.toThrow();

    expect(loadLibraryCatalog({}).problems).toHaveLength(2);
    expect(loadLibraryCatalog(null).categories).toEqual([]);
  });

  it("drops a nested category with no name and keeps its siblings", () => {
    const catalog = withCategories([
      {
        id: "outer",
        label: { en: "Outer" },
        children: [{ id: "nameless" }, { id: "fine", label: { en: "Fine" } }],
      },
    ]);

    expect(allCategories(catalog).map((c) => c.path)).toEqual(["outer", "outer/fine"]);
    expect(catalog.problems).toEqual([
      'Category "outer/nameless": missing a labelKey or an English label.',
    ]);
  });

  it("reports a duplicate path rather than shadowing the first", () => {
    const catalog = withCategories([
      { id: "a", label: { en: "A" }, children: [{ id: "b", label: { en: "B" } }] },
      { id: "a", label: { en: "Again" } },
    ]);

    expect(allCategories(catalog).map((c) => c.path)).toEqual(["a", "a/b"]);
    expect(catalog.problems).toEqual(['Category "a": duplicate id.']);
  });

  it("rejects a position whose category path does not exist, however plausible", () => {
    const catalog = withCategories(
      [{ id: "outer", label: { en: "Outer" }, children: [{ id: "in", label: { en: "In" } }] }],
      [
        // The parent is real and the child is real; this path is neither.
        { id: "wrong", category: "outer/nope", fen: KQ_VS_K, name: { en: "Wrong" } },
        { id: "right", category: "outer/in", fen: KQ_VS_K, name: { en: "Right" } },
      ],
    );

    expect(catalog.positions.map((p) => p.id)).toEqual(["right"]);
    expect(catalog.problems).toEqual(['Position "wrong": unknown category.']);
  });

  it("validates a nested entry's FEN through parseFen like any other", () => {
    const catalog = withCategories(
      [{ id: "outer", label: { en: "Outer" }, children: [{ id: "in", label: { en: "In" } }] }],
      [
        { id: "bad", category: "outer/in", fen: "not a fen", name: { en: "Bad" } },
        // Wrapped out of a text box, which is how a hand-authored entry arrives.
        {
          id: "wrapped",
          category: "outer/in",
          fen: `  7k/8/8/8/8/8/4Q3/4K3   w - - 0 1 `,
          name: { en: "Wrapped" },
        },
      ],
    );

    expect(catalog.positions.map((p) => p.id)).toEqual(["wrapped"]);
    expect(catalog.positions[0].fen).toBe(KQ_VS_K);
    expect(catalog.problems).toHaveLength(1);
    expect(catalog.problems[0]).toMatch(/^Position "bad": invalid FEN/);
  });

  it("reports children that are not an array without losing the category", () => {
    const catalog = withCategories([
      { id: "outer", label: { en: "Outer" }, children: "nope" },
    ]);

    expect(allCategories(catalog).map((c) => c.path)).toEqual(["outer"]);
    expect(catalog.problems).toEqual(['Category "outer": `children` is not an array.']);
  });
});

/*
  The item union, and the one invariant it rests on: `positions` is a projection
  of `items`, built by `libraryCatalogOf` so that a producer cannot fill one and
  forget the other. The Mates and Positions sections read the projection; the two
  shared screens read `items`, which is what lets a section of games render
  through them unchanged.
*/
describe("a catalog holds positions and games as one list of items", () => {
  const position: LibraryPosition = {
    kind: "position",
    id: "mate-in-one",
    category: "shelf",
    fen: KQ_VS_K,
    name: { en: "Mate in one" },
  };

  const pgn = '[Event "Test"]\n[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 *';
  const game: LibraryGame = {
    kind: "game",
    id: "alice-bob",
    category: "shelf",
    pgn,
    game: parsePgnGame(pgn),
    name: { en: "Alice – Bob" },
  };

  const catalog = libraryCatalogOf(
    [{ id: "shelf", path: "shelf", label: { en: "Shelf" }, children: [] }],
    [position, game],
    [],
  );

  it("projects the positions out of the items, and only the positions", () => {
    expect(catalog.items).toEqual([position, game]);
    expect(catalog.positions).toEqual([position]);
  });

  it("lists both kinds in a category, in data order", () => {
    expect(itemsInLibraryCategory("shelf", catalog)).toEqual([position, game]);
    // The narrowed reader the Mates binding speaks in sees only its own kind.
    expect(positionsInLibraryCategory("shelf", catalog)).toEqual([position]);
  });

  it("finds either kind by id, and the narrowed finder only a position", () => {
    expect(findLibraryItem("shelf", "alice-bob", catalog)).toBe(game);
    expect(findLibraryItem("shelf", "mate-in-one", catalog)).toBe(position);
    expect(findLibraryPosition("shelf", "alice-bob", catalog)).toBeUndefined();
  });

  it("resolves a game from a URL the same way it resolves a position", () => {
    expect(resolveLibraryPath(["shelf", "alice-bob"], catalog)).toMatchObject({
      kind: "item",
      item: { kind: "game", id: "alice-bob" },
    });
  });

  it("reads a starting position off either kind", () => {
    expect(libraryItemFen(position)).toBe(KQ_VS_K);
    // A game with no FEN tag starts where every game starts.
    expect(libraryItemFen(game)).toContain("rnbqkbnr/pppppppp");
    expect(sideToMoveOf(game)).toBe("w");
  });
});
