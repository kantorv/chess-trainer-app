import { describe, expect, it } from "vitest";
import {
  EmptyPgnError,
  PgnParseError,
  parsePgnGame,
  parsePgnGames,
  parsePgnTree,
  parsePgnTrees,
  splitPgnGames,
} from "./pgn";
import { finalFenOf, gameTag, initialFenOf } from "./gameModel";
import { mainline, treeToPgn } from "./gameTree";

const game = (white: string, black: string, moves: string, result = "1-0") =>
  [
    `[Event "Club night"]`,
    `[Site "Berlin"]`,
    `[Date "2024.01.05"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
    "",
    `${moves} ${result}`,
  ].join("\n");

const twoGames = `${game("Alice", "Bob", "1. e4 e5 2. Nf3")}\n\n${game(
  "Carol",
  "Dan",
  "1. d4 d5",
  "0-1",
)}\n`;

describe("splitPgnGames", () => {
  it("cuts a multi-game file into one chunk per game", () => {
    const chunks = splitPgnGames(twoGames);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain(`[White "Alice"]`);
    expect(chunks[1]).toContain(`[White "Carol"]`);
    // The split point belongs to neither chunk.
    expect(chunks[0]).not.toContain("Carol");
    expect(chunks[1]).not.toContain("Alice");
  });

  it("leaves a single game whole", () => {
    // The blank line between the tag pairs and the movetext is *inside* a game
    // — only a blank line before the next [Event ...] starts a new one.
    expect(splitPgnGames(game("Alice", "Bob", "1. e4 e5"))).toHaveLength(1);
  });

  it("splits a file saved with Windows line endings", () => {
    expect(splitPgnGames(twoGames.replace(/\n/g, "\r\n"))).toHaveLength(2);
  });

  it("reports no games for blank input", () => {
    expect(splitPgnGames("")).toEqual([]);
    expect(splitPgnGames("  \n\n\t\n")).toEqual([]);
  });

  it("keeps movetext with no tag pairs at all as one game", () => {
    expect(splitPgnGames("1. e4 e5 2. Nf3 Nc6")).toEqual(["1. e4 e5 2. Nf3 Nc6"]);
  });
});

describe("parsePgnGame", () => {
  it("carries the tag pairs through as a string record", () => {
    const parsed = parsePgnGame(game("Alice", "Bob", "1. e4 e5"));

    expect(parsed.headers.White).toBe("Alice");
    expect(parsed.headers.Black).toBe("Bob");
    expect(parsed.headers.Result).toBe("1-0");
  });

  it("gives every move its san, squares, resulting fen and 1-based ply", () => {
    const parsed = parsePgnGame(game("Alice", "Bob", "1. e4 e5 2. Nf3"));

    expect(parsed.moves).toHaveLength(3);
    expect(parsed.moves[0]).toMatchObject({
      san: "e4",
      from: "e2",
      to: "e4",
      ply: 1,
    });
    expect(parsed.moves[0].fen).toContain("4P3");
    expect(parsed.moves.map((move) => move.ply)).toEqual([1, 2, 3]);
    expect(parsed.moves[2]).toMatchObject({ san: "Nf3", from: "g1", to: "f3" });
  });

  it("raises a PgnParseError rather than letting chess.js throw", () => {
    expect(() => parsePgnGame("this is not a pgn")).toThrow(PgnParseError);
    // The underlying message is kept so the UI can say what went wrong.
    try {
      parsePgnGame(`[Event "x"]\n\n1. e4 Nf7`);
      expect.unreachable("a move that is not legal should not parse");
    } catch (cause) {
      expect(cause).toBeInstanceOf(PgnParseError);
      expect((cause as PgnParseError).detail).toContain("Nf7");
      expect((cause as PgnParseError).gameNumber).toBeUndefined();
    }
  });
});

describe("parsePgnGames", () => {
  it("parses every game in a multi-game file", () => {
    const parsed = parsePgnGames(twoGames);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].headers.White).toBe("Alice");
    expect(parsed[0].moves).toHaveLength(3);
    expect(parsed[1].headers.White).toBe("Carol");
    expect(parsed[1].moves).toHaveLength(2);
  });

  it("names which game of a file failed", () => {
    const broken = `${game("Alice", "Bob", "1. e4 e5")}\n\n${game(
      "Carol",
      "Dan",
      "1. d4 Nf7",
    )}`;

    try {
      parsePgnGames(broken);
      expect.unreachable("the second game is malformed");
    } catch (cause) {
      expect(cause).toBeInstanceOf(PgnParseError);
      expect((cause as PgnParseError).gameNumber).toBe(2);
    }
  });

  it("raises EmptyPgnError when there is nothing to parse", () => {
    expect(() => parsePgnGames("   \n\n ")).toThrow(EmptyPgnError);
    // Still a PgnParseError, so one catch covers both.
    expect(() => parsePgnGames("")).toThrow(PgnParseError);
  });
});

describe("gameTag", () => {
  it("reads a real value", () => {
    expect(gameTag({ White: "Alice" }, "White")).toBe("Alice");
  });

  it("treats the spec's placeholders and missing tags alike", () => {
    // chess.js fills the seven-tag roster with these even for a tagless PGN.
    expect(gameTag({ White: "?" }, "White")).toBeUndefined();
    expect(gameTag({ Date: "????.??.??" }, "Date")).toBeUndefined();
    expect(gameTag({ Result: "*" }, "Result")).toBeUndefined();
    expect(gameTag({}, "Event")).toBeUndefined();
  });
});

describe("the positions of a parsed game", () => {
  it("starts from the standard opening position", () => {
    const parsed = parsePgnGame(game("Alice", "Bob", "1. e4 e5"));

    expect(initialFenOf(parsed)).toContain(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
    );
  });

  it("honours a set-up position from the FEN tag", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const parsed = parsePgnGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n*`);

    expect(initialFenOf(parsed)).toBe(fen);
    // No moves — the final position is the one it started from.
    expect(finalFenOf(parsed)).toBe(fen);
  });

  it("ends on the position after the last move", () => {
    const parsed = parsePgnGame(game("Alice", "Bob", "1. e4 e5 2. Nf3"));

    expect(finalFenOf(parsed)).toBe(parsed.moves.at(-1)?.fen);
  });
});

describe("parsePgnTree — the variation-aware parser", () => {
  it("reads a plain game as a single line", () => {
    const tree = parsePgnTree(game("Alice", "Bob", "1. e4 e5 2. Nf3"));

    expect(mainline(tree).map((node) => node.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(tree.headers.White).toBe("Alice");
  });

  it("keeps a side line that chess.js's own parser discards", () => {
    const pgn = "1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6";

    // The linear parser is mainline-only — that is what it is for.
    expect(parsePgnGames(pgn)[0].moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);

    const tree = parsePgnTree(pgn);
    const afterE4 = mainline(tree)[0];
    expect(afterE4.children.map((node) => node.san)).toEqual(["e5", "c5"]);

    // And the side line carries its own continuation.
    const sicilian = afterE4.children[1];
    expect(mainline({ ...tree, moves: [sicilian] }).map((n) => n.san)).toEqual([
      "c5",
      "Nf3",
      "d6",
    ]);
  });

  it("reads two variations of the same move as siblings, not as nesting", () => {
    const tree = parsePgnTree("1. e4 e5 (1... c5) (1... e6) 2. Nf3");
    const afterE4 = mainline(tree)[0];

    expect(afterE4.children.map((node) => node.san)).toEqual([
      "e5",
      "c5",
      "e6",
    ]);
  });

  it("reads a variation inside a variation", () => {
    const tree = parsePgnTree("1. e4 e5 (1... c5 2. Nf3 (2. Nc3) d6)");
    const sicilian = mainline(tree)[0].children[1];
    const [nf3, nc3] = sicilian.children;

    expect([nf3.san, nc3.san]).toEqual(["Nf3", "Nc3"]);
    expect(nf3.children.map((node) => node.san)).toEqual(["d6"]);
    // The inner variation is an alternative to Nf3, so it has no continuation.
    expect(nc3.children).toEqual([]);
  });

  it("ignores comments, NAGs and move-quality suffixes", () => {
    const tree = parsePgnTree(
      "1. e4! {the king's pawn} $1 e5 ; a trailing comment\n2. Nf3?! Nc6 *",
    );

    expect(mainline(tree).map((node) => node.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });

  it("starts from the FEN tag when there is one", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12";
    const tree = parsePgnTree(`[SetUp "1"]\n[FEN "${fen}"]\n\n12... Nf6 13. Nf3 *`);

    expect(tree.startFen).toBe(fen);
    expect(mainline(tree).map((node) => node.san)).toEqual(["Nf6", "Nf3"]);
    // Ply counts from the set-up position, not from move 1.
    expect(mainline(tree).map((node) => node.ply)).toEqual([1, 2]);
  });

  it("round-trips a game with variations through the PGN writer", () => {
    const pgn = "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *";
    const once = parsePgnTree(pgn);
    const again = parsePgnTree(treeToPgn(once));

    expect(treeToPgn(again)).toBe(treeToPgn(once));
    expect(treeToPgn(once)).toContain("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6");
  });

  it("names the illegal move rather than failing silently", () => {
    expect(() => parsePgnTree("1. e4 e5 2. Nf3 (2. Kf3) Nc6")).toThrow(
      /Illegal move "Kf3"/,
    );
  });

  it("reports unbalanced parentheses", () => {
    expect(() => parsePgnTree("1. e4 e5 (1... c5")).toThrow(/Unclosed/);
    expect(() => parsePgnTree("1. e4 e5) 2. Nf3")).toThrow(/Unbalanced/);
    expect(() => parsePgnTree("(1. e4)")).toThrow(/before any move/);
  });
});

describe("parsePgnTrees", () => {
  it("parses every game in a multi-game file", () => {
    const trees = parsePgnTrees(twoGames);

    expect(trees).toHaveLength(2);
    expect(trees[0].headers.White).toBe("Alice");
    expect(mainline(trees[1]).map((node) => node.san)).toEqual(["d4", "d5"]);
  });

  it("names which game failed", () => {
    const broken = `${game("Alice", "Bob", "1. e4 e5")}\n\n${game(
      "Carol",
      "Dan",
      "1. d4 Ke7",
      "0-1",
    )}`;

    expect(() => parsePgnTrees(broken)).toThrow(PgnParseError);
    expect(() => parsePgnTrees(broken)).toThrow(/Game 2/);
  });

  it("refuses input with no game in it", () => {
    expect(() => parsePgnTrees("   \n\n  ")).toThrow(EmptyPgnError);
  });
});
