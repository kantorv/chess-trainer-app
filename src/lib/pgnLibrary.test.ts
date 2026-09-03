import { describe, expect, it } from "vitest";

import { findLibraryCategory, itemsInLibraryCategory } from "./libraryCatalog";
import { gameDisplayName, loadPgnLibrary, slugify } from "./pgnLibrary";
import { parsePgnGame, splitPgnGames } from "./pgn";

/**
 * The PGN library loader — the producer that turns the project's `.pgn` files
 * into the same {@link LibraryCatalog} a JSON file produces.
 *
 * Everything here feeds it text rather than reaching for the shipped files:
 * `loadPgnLibrary` takes its files as a parameter precisely so the awkward cases
 * — a file with no games, a manifest naming a file that is not there — can be
 * written down instead of waited for.
 */

/** A two-game chess.com-shaped export. */
const CHESS_COM = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.08.28"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.08.29"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. d4 d5 0-1
`;

/** A lichess-study-shaped file: a StudyName, chapter names, a set-up position. */
const STUDY = `[Event "My Study: Chapter 1"]
[Result "*"]
[StudyName "My Study"]
[ChapterName "Chapter 1"]
[FEN "8/8/3Q4/5r2/2K5/4k3/8/8 b - - 0 1"]
[SetUp "1"]

{ a comment } 1... Rf4+ *

[Event "My Study: Chapter 2"]
[Result "*"]
[StudyName "My Study"]
[ChapterName "Chapter 2"]
[FEN "8/8/3r4/5Q2/2K5/4k3/8/8 w - - 0 1"]
[SetUp "1"]

1. Qb1 *
`;

describe("slugify", () => {
  it("makes a URL segment out of a human name", () => {
    expect(slugify("Chapter 1")).toBe("chapter-1");
    expect(slugify("Alice – Bob (1-0)")).toBe("alice-bob-1-0");
  });

  it("comes back empty rather than wrong for a name with no ASCII in it", () => {
    // The callers answer this with a numbered fallback — an unaddressable item
    // would be worse than an ugly id.
    expect(slugify("מטים")).toBe("");
  });
});

describe("gameDisplayName", () => {
  const nameOf = (pgn: string, n = 1) => gameDisplayName(parsePgnGame(pgn), n);

  it("uses a study chapter's own name", () => {
    expect(nameOf(splitPgnGames(STUDY)[0])).toBe("Chapter 1");
  });

  it("names a played game by its players and its result", () => {
    expect(nameOf(splitPgnGames(CHESS_COM)[0])).toBe("Alice – Bob (1-0)");
  });

  it("falls back past the placeholders chess.js fills the roster with", () => {
    // No ChapterName, no real players — `gameTag` reports "?" as absent, so the
    // Event tag is what is left.
    expect(nameOf('[Event "A puzzle"]\n\n1. e4 *')).toBe("A puzzle");
    expect(nameOf("1. e4 *", 7)).toBe("Game 7");
  });
});

describe("loadPgnLibrary groups a file into a folder of games", () => {
  const catalog = loadPgnLibrary({ "../data/pgn/my_study.pgn": STUDY });

  it("makes one folder per file, named from its StudyName tag", () => {
    expect(catalog.categories).toHaveLength(1);
    expect(catalog.categories[0].path).toBe("my-study");
    expect(catalog.categories[0].label).toEqual({ en: "My Study" });
  });

  it("makes one game item per game in the file", () => {
    const items = itemsInLibraryCategory("my-study", catalog);

    expect(items.map((item) => item.id)).toEqual(["chapter-1", "chapter-2"]);
    expect(items.every((item) => item.kind === "game")).toBe(true);
    expect(items[0].name).toEqual({ en: "Chapter 1" });
  });

  it("carries both the PGN text and the parsed mainline", () => {
    const [first] = itemsInLibraryCategory("my-study", catalog);
    if (first.kind !== "game") throw new Error("expected a game");

    // The text, so a destination can re-parse it with its side lines...
    expect(first.pgn).toContain('[ChapterName "Chapter 1"]');
    // ...and the parse that validated it, so no screen repeats the work.
    expect(first.game.moves.map((move) => move.san)).toEqual(["Rf4+"]);
    expect(first.game.headers.FEN).toBe("8/8/3Q4/5r2/2K5/4k3/8/8 b - - 0 1");
  });

  it("keeps `positions` empty — a game is not a position", () => {
    expect(catalog.positions).toEqual([]);
    expect(catalog.items).toHaveLength(2);
    expect(catalog.problems).toEqual([]);
  });

  it("names a folder from the file when the file has no StudyName", () => {
    const plain = loadPgnLibrary({ "chess_com_games_2026-08-30.pgn": CHESS_COM });

    expect(plain.categories[0].path).toBe("chess-com-games-2026-08-30");
    expect(plain.categories[0].label).toEqual({
      en: "Chess com games 2026-08-30",
    });
  });

  it("tells two games between the same players apart", () => {
    const played = loadPgnLibrary({ "games.pgn": CHESS_COM });

    expect(itemsInLibraryCategory("games", played).map((item) => item.id)).toEqual([
      "alice-bob-1-0",
      "alice-bob-0-1",
    ]);
  });
});

describe("loadPgnLibrary reads the manifest", () => {
  const files = {
    "study.pgn": STUDY,
    "games.pgn": CHESS_COM,
  };

  it("renames, translates and nests a folder", () => {
    const catalog = loadPgnLibrary(files, {
      folders: { studies: { en: "Studies", he: "מחקרים" } },
      files: {
        "study.pgn": { under: "studies", label: { en: "Rosettes", he: "רוזטות" } },
      },
    });

    const studies = findLibraryCategory("studies", catalog);
    expect(studies?.label).toEqual({ en: "Studies", he: "מחקרים" });

    const nested = findLibraryCategory("studies/study", catalog);
    expect(nested?.label).toEqual({ en: "Rosettes", he: "רוזטות" });
    expect(itemsInLibraryCategory("studies/study", catalog)).toHaveLength(2);
  });

  it("still shows a file it says nothing about", () => {
    // The promise the section makes: dropping a `.pgn` in is enough. A manifest
    // adds to that and can never take it away.
    const catalog = loadPgnLibrary(files, {
      files: { "study.pgn": { under: "studies" } },
    });

    expect(findLibraryCategory("games", catalog)).toBeDefined();
    expect(itemsInLibraryCategory("games", catalog)).toHaveLength(2);
  });

  it("orders the folders, putting an unordered file last", () => {
    const catalog = loadPgnLibrary(files, {
      files: { "study.pgn": { order: 1 } },
    });

    expect(catalog.categories.map((category) => category.path)).toEqual([
      "study",
      "games",
    ]);
  });

  it("names an intermediate folder nobody labelled from its own segment", () => {
    const catalog = loadPgnLibrary(files, {
      files: { "study.pgn": { under: "my-shelf" } },
    });

    expect(findLibraryCategory("my-shelf", catalog)?.label).toEqual({
      en: "My shelf",
    });
  });
});

describe("loadPgnLibrary reports rather than throws", () => {
  it("reports a game that will not parse and keeps the rest of the file", () => {
    const catalog = loadPgnLibrary({
      "mixed.pgn": `${CHESS_COM}
[Event "Broken"]
[White "Alice"]
[Black "Bob"]

1. e4 Qxh8 *
`,
    });

    expect(itemsInLibraryCategory("mixed", catalog)).toHaveLength(2);
    expect(catalog.problems).toHaveLength(1);
    expect(catalog.problems[0]).toContain('File "mixed.pgn" game 3');
  });

  it("reports a file with no games in it, and loads the others", () => {
    const catalog = loadPgnLibrary({
      "empty.pgn": "\n\n   \n",
      "study.pgn": STUDY,
    });

    expect(catalog.problems).toEqual(['File "empty.pgn": holds no games.']);
    // A folder's *path* is its file name; only its label comes from StudyName.
    expect(catalog.categories.map((category) => category.path)).toEqual(["study"]);
  });

  it("gives no folder at all to a file whose every game is broken", () => {
    const catalog = loadPgnLibrary({ "bad.pgn": '[Event "x"]\n\n1. e4 Qxh8 *\n' });

    expect(catalog.categories).toEqual([]);
    expect(catalog.problems).toContain(
      'File "bad.pgn": no game in it could be read.',
    );
  });

  it("reports a manifest entry naming a file that is not there", () => {
    const catalog = loadPgnLibrary(
      { "study.pgn": STUDY },
      { files: { "gone.pgn": { order: 1 } } },
    );

    expect(catalog.problems).toEqual([
      'Manifest file "gone.pgn": no such file in the library.',
    ]);
    // ...and the library still loads.
    expect(catalog.categories).toHaveLength(1);
  });

  it("reports a manifest that is not an object and carries on without one", () => {
    const catalog = loadPgnLibrary({ "study.pgn": STUDY }, "nonsense");

    expect(catalog.problems).toEqual(["Manifest is not an object."]);
    expect(catalog.categories).toHaveLength(1);
  });

  it("loads with no manifest at all", () => {
    expect(loadPgnLibrary({ "study.pgn": STUDY }).problems).toEqual([]);
  });

  it("reports two files claiming one folder path instead of losing one", () => {
    const catalog = loadPgnLibrary({
      "a/study.pgn": STUDY,
      "b/study.pgn": STUDY,
    });

    expect(catalog.categories).toHaveLength(1);
    expect(catalog.problems).toHaveLength(1);
    expect(catalog.problems[0]).toContain("already taken");
  });
});
