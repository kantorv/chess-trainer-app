import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { FenParseError, parseFen } from "./fen";

describe("parseFen", () => {
  it("takes a valid FEN and hands it back", () => {
    expect(parseFen(DEFAULT_POSITION)).toBe(DEFAULT_POSITION);
  });

  it("normalises the whitespace a copied FEN arrives with", () => {
    const wrapped = `\n  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR   w\tKQkq - 0 1  \n`;
    expect(parseFen(wrapped)).toBe(DEFAULT_POSITION);
  });

  it("rejects an empty paste with its own message", () => {
    expect(() => parseFen("   ")).toThrow(FenParseError);
    expect(() => parseFen("")).toThrow(/No FEN text found/);
  });

  it("rejects malformed notation and says why", () => {
    let detail = "";
    try {
      parseFen("not a fen");
    } catch (cause) {
      detail = (cause as FenParseError).detail;
    }

    // The underlying reason is carried through, not swallowed into "invalid".
    expect(detail).toMatch(/six space-delimited fields/i);
  });

  it("rejects a well-formed FEN that is not a playable position", () => {
    // Well-formed notation, but a board with no kings on it.
    expect(() => parseFen("8/8/8/8/8/8/8/8 w - - 0 1")).toThrow(FenParseError);
  });
});
