import { describe, expect, it } from "vitest";
import { annotationsAt, nagGlyph, readComment } from "./moveAnnotations";
import { parsePgnTree } from "./pgn";
import { nodeAtSanPath } from "./gameTree";

/**
 * Reading a stored comment for the comment block (CTA-69): the prose, and the
 * attributes inside it — `[%key value]` commands and an engine's trailing
 * evaluation, in the shapes the annotated example exports carry.
 */

describe("readComment", () => {
  it("keeps plain prose as paragraphs, hard wraps rejoined", () => {
    expect(readComment("15.Bf4 was played in A\nMoiseenko vs A Colovic, 2008 (1-0)")).toEqual({
      paragraphs: ["15.Bf4 was played in A Moiseenko vs A Colovic, 2008 (1-0)"],
      attributes: [],
    });
  });

  it("reads [%key value] commands as attributes and takes them out of the prose", () => {
    expect(readComment("Sharp. [%eval 0.25] [%clk 0:05:00] [%cal Ge2e4,Rd1d8]")).toEqual({
      paragraphs: ["Sharp."],
      attributes: [
        { key: "eval", value: "0.25" },
        { key: "clk", value: "0:05:00" },
        { key: "cal", value: "Ge2e4,Rd1d8" },
      ],
    });
  });

  it("reads an engine's trailing evaluation — a comment of nothing else", () => {
    expect(readComment("+/= +1.31 (21 ply)")).toEqual({
      paragraphs: [],
      attributes: [
        { key: "assessment", value: "+/=" },
        { key: "eval", value: "+1.31" },
        { key: "depth", value: "21" },
      ],
    });
  });

  it("…and one ending a suggested line, even across a wrap", () => {
    expect(
      readComment("? 32.Rd3 Qc5+ 33.Rc3 Qd5 34.f3 Bf5+ 35.Bd3 Qa2 36.Bxf5 =\n-0.38 (31 ply)"),
    ).toEqual({
      paragraphs: ["? 32.Rd3 Qc5+ 33.Rc3 Qd5 34.f3 Bf5+ 35.Bd3 Qa2 36.Bxf5"],
      attributes: [
        { key: "assessment", value: "=" },
        { key: "eval", value: "-0.38" },
        { key: "depth", value: "31" },
      ],
    });
  });

  it("reads a forced mate and leaves the line after it", () => {
    expect(readComment("-+\nmate-in-12 after 33...Bxd3+ 34.Rxd3 Qc4+")).toEqual({
      paragraphs: ["after 33...Bxd3+ 34.Rxd3 Qc4+"],
      attributes: [
        { key: "assessment", value: "-+" },
        { key: "mate", value: "12" },
      ],
    });
  });

  it("does not mistake a result in the prose for an evaluation", () => {
    expect(readComment("Kramnik vs Anand, 2008 (0-1)").attributes).toEqual([]);
  });
});

describe("annotationsAt", () => {
  const tree = parsePgnTree(
    "{Notes by an engine.} 1. d4 $1 {Main. [%eval 0.3]} d5 ({Or:} 1... Nf6) 2. c4 *",
  );
  const at = (...sans: string[]) => annotationsAt(tree, nodeAtSanPath(tree, sans));

  it("is the game's comment at the start position", () => {
    expect(annotationsAt(tree, null)?.after[0].paragraphs).toEqual(["Notes by an engine."]);
  });

  it("is a move's comments, before and after, and its NAGs", () => {
    expect(at("d4")).toEqual({
      before: [],
      after: [{ paragraphs: ["Main."], attributes: [{ key: "eval", value: "0.3" }] }],
      nags: [1],
    });
    expect(at("d4", "Nf6")?.before[0].paragraphs).toEqual(["Or:"]);
  });

  it("is null where nothing is annotated", () => {
    expect(at("d4", "d5")).toBeNull();
    expect(annotationsAt(parsePgnTree("1. e4 *"), null)).toBeNull();
  });
});

describe("nagGlyph", () => {
  it("prints the common glyphs and $N for the rest", () => {
    expect([1, 2, 5, 14, 19, 146, 250].map(nagGlyph)).toEqual(["!", "?", "!?", "⩲", "−+", "N", "$250"]);
  });
});
