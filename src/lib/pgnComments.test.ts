import { describe, expect, it } from "vitest";

import {
  extractPgnComments,
  hasPgnComments,
  reflowComment,
} from "./pgnComments";

/**
 * The comment-extraction module. Covers the five shapes the shipped `.pgn`
 * files actually carry — preamble only, move comments only, both, neither, and
 * a hard-wrapped multi-paragraph comment — plus the walk's edge cases
 * (variations skipped, a Black-to-move set-up, a wrapped tag).
 */

describe("reflowComment", () => {
  it("collapses PGN's column-80 hard wraps into one paragraph", () => {
    const raw =
      "White can no longer win because Black plays a move\nwhich leads to a draw.";
    expect(reflowComment(raw)).toEqual([
      "White can no longer win because Black plays a move which leads to a draw.",
    ]);
  });

  it("keeps a blank line as a paragraph break", () => {
    expect(reflowComment("First paragraph.\n\nSecond paragraph.")).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ]);
  });

  it("starts a new paragraph at each numbered list item", () => {
    const raw =
      "There are three rosette types.\n" +
      "1. The defender creates a rosette when it can.\n" +
      "2. More space for Black means the attacker wants a rosette less.\n" +
      "3. The defense moves pieces towards the centre.";
    expect(reflowComment(raw)).toEqual([
      "There are three rosette types.",
      "1. The defender creates a rosette when it can.",
      "2. More space for Black means the attacker wants a rosette less.",
      "3. The defense moves pieces towards the centre.",
    ]);
  });

  it("is empty for whitespace-only text", () => {
    expect(reflowComment("   \n  \n")).toEqual([]);
  });
});

describe("extractPgnComments", () => {
  it("reads a preamble only, attached to the starting position", () => {
    const pgn = `[Event "T"]

{ A note before the game. } 1. e4 e5 2. Nf3 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual(["A note before the game."]);
    expect(comments.moves).toEqual([]);
    expect(hasPgnComments(comments)).toBe(true);
  });

  it("reads move comments only, keyed by the ply they follow", () => {
    const pgn = `[Event "T"]

1. e4 { King's pawn. } e5 2. Nf3 { Develops and attacks. } Nc6 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual([]);
    expect(comments.moves).toEqual([
      { ply: 1, paragraphs: ["King's pawn."] },
      { ply: 3, paragraphs: ["Develops and attacks."] },
    ]);
  });

  it("reads a preamble and move comments together", () => {
    const pgn = `[Event "T"]

{ Opening notes. } 1. e4 { Best by test. } e5 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual(["Opening notes."]);
    expect(comments.moves).toEqual([{ ply: 1, paragraphs: ["Best by test."] }]);
  });

  it("reports nothing for a game with no comments", () => {
    const pgn = `[Event "T"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual([]);
    expect(comments.moves).toEqual([]);
    expect(hasPgnComments(comments)).toBe(false);
  });

  it("re-flows a hard-wrapped multi-paragraph comment", () => {
    const pgn = `[Event "T"]

{ There are three rosette types, with two reflections for each.
1. The defender creates a rosette at any opportunity.
2. The more space Black has, the less the attacker wants one. If the
king is on the edge, a rosette is sometimes the only way to prevail.

A closing remark. } 1. e4 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual([
      "There are three rosette types, with two reflections for each.",
      "1. The defender creates a rosette at any opportunity.",
      "2. The more space Black has, the less the attacker wants one. If the king is on the edge, a rosette is sometimes the only way to prevail.",
      "A closing remark.",
    ]);
  });

  it("skips comments inside ( ) variations and keeps the mainline ply count", () => {
    const pgn = `[Event "T"]

1. e4 e5 2. Nf3 { Mainline note. } (2. Bc4 { A variation note. } Nf6) 2... Nc6 { Second mainline note. } *`;
    const comments = extractPgnComments(pgn);
    expect(comments.moves).toEqual([
      { ply: 3, paragraphs: ["Mainline note."] },
      { ply: 4, paragraphs: ["Second mainline note."] },
    ]);
  });

  it("counts plies from a Black-to-move set-up position", () => {
    const pgn = `[Event "T"]
[FEN "8/8/3Q4/5r2/2K5/4k3/8/8 b - - 0 1"]
[SetUp "1"]

{ Black to defend. } 1... Rf4+ { The only move. } *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual(["Black to defend."]);
    expect(comments.moves).toEqual([
      { ply: 1, paragraphs: ["The only move."] },
    ]);
  });

  it("ignores a tag pair wrapped across two lines", () => {
    const pgn = `[Event "A very long study title that the exporter
wrapped across two physical lines"]
[Result "*"]

{ Preamble survives the wrapped tag. } 1. d4 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.preamble).toEqual(["Preamble survives the wrapped tag."]);
    expect(comments.moves).toEqual([]);
  });

  it("merges two comments left on the same ply", () => {
    const pgn = `[Event "T"]

1. e4 { First half. } { Second half. } e5 *`;
    const comments = extractPgnComments(pgn);
    expect(comments.moves).toEqual([
      { ply: 1, paragraphs: ["First half.", "Second half."] },
    ]);
  });
});
