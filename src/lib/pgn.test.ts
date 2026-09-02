import { describe, expect, it } from "vitest";
import {
  EmptyPgnError,
  PgnParseError,
  parsePgnGame,
  parsePgnGames,
  splitPgnGames,
} from "./pgn";
import { finalFenOf, gameTag, initialFenOf } from "./gameModel";

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
