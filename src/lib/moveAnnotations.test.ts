import { describe, expect, it } from "vitest";
import {
  NAG_SECTIONS,
  annotationsAt,
  isMoveMark,
  isNagChoiceActive,
  nagGlyph,
  nagSection,
  nagsInPrintOrder,
  nagTone,
  readComment,
  toggleNag,
} from "./moveAnnotations";
import { parsePgnTree } from "./pgn";
import { nodeAtSanPath } from "./gameTree";

/**
 * Reading a stored comment for the comment block (CTA-69): the prose, and the
 * attributes inside it — `[%key value]` commands and an engine's trailing
 * evaluation, in the shapes the annotated example exports carry.
 */

describe("readComment", () => {
  it("keeps plain prose as paragraphs, hard wraps rejoined", () => {
    expect(readComment("15.Bf4 was played in A\nMoiseenko vs A Colovic, 2008 (1-0)")).toMatchObject({
      paragraphs: ["15.Bf4 was played in A Moiseenko vs A Colovic, 2008 (1-0)"],
      attributes: [],
    });
  });

  it("reads [%key value] commands as attributes and takes them out of the prose", () => {
    expect(readComment("Sharp. [%eval 0.25] [%clk 0:05:00] [%cal Ge2e4,Rd1d8]")).toMatchObject({
      paragraphs: ["Sharp."],
      attributes: [
        { key: "eval", value: "0.25" },
        { key: "clk", value: "0:05:00" },
        { key: "cal", value: "Ge2e4,Rd1d8" },
      ],
    });
  });

  it("reads a games count as an attribute, never as prose (CTA-98)", () => {
    expect(readComment("Most played. games:120")).toMatchObject({
      paragraphs: ["Most played."],
      attributes: [{ key: "games", value: "120" }],
    });
    expect(readComment("[%games 7] Rare.")).toMatchObject({
      paragraphs: ["Rare."],
      attributes: [{ key: "games", value: "7" }],
    });
  });

  it("reads an engine's trailing evaluation — a comment of nothing else", () => {
    expect(readComment("+/= +1.31 (21 ply)")).toMatchObject({
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
    ).toMatchObject({
      paragraphs: ["? 32.Rd3 Qc5+ 33.Rc3 Qd5 34.f3 Bf5+ 35.Bd3 Qa2 36.Bxf5"],
      attributes: [
        { key: "assessment", value: "=" },
        { key: "eval", value: "-0.38" },
        { key: "depth", value: "31" },
      ],
    });
  });

  it("reads a forced mate and leaves the line after it", () => {
    expect(readComment("-+\nmate-in-12 after 33...Bxd3+ 34.Rxd3 Qc4+")).toMatchObject({
      paragraphs: ["after 33...Bxd3+ 34.Rxd3 Qc4+"],
      attributes: [
        { key: "assessment", value: "-+" },
        { key: "mate", value: "12" },
      ],
    });
  });

  it("keeps the stored text, for an edit to start from", () => {
    expect(readComment("Sharp. [%eval 0.25]").raw).toBe("Sharp. [%eval 0.25]");
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
    expect(at("d4")).toMatchObject({
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

/** The choice written as `code`, and the section it is set from. */
const choiceOf = (code: number) => {
  for (const { section, choices } of NAG_SECTIONS) {
    const found = choices.find((entry) => entry.codes[0] === code);
    if (found !== undefined) return { section, choice: found };
  }
  throw new Error(`no choice ${code}`);
};

/** What `nags` become when the reader picks the choice written as `code`. */
const pick = (nags: readonly number[], code: number) => {
  const { section, choice } = choiceOf(code);
  return toggleNag(nags, section, choice);
};

describe("the NAG table (CTA-97)", () => {
  it("has the three sections, in order, each code in one place", () => {
    expect(NAG_SECTIONS.map(({ section }) => section)).toEqual(["move", "position", "features"]);
    const codes = NAG_SECTIONS.flatMap(({ choices }) => choices.flatMap((entry) => entry.codes));
    expect(new Set(codes).size).toBe(codes.length);
    expect(NAG_SECTIONS.map(({ choices }) => choices.length)).toEqual([8, 8, 11]);
  });

  it("draws initiative as ↑ and attack as →, per the PGN standard", () => {
    expect([36, 37, 40, 41].map(nagGlyph)).toEqual(["↑", "↑", "→", "→"]);
  });

  it("gives the codes it was missing their glyphs", () => {
    expect([8, 9, 11, 44, 140].map(nagGlyph)).toEqual(["□", "⊗", "=", "…", "Δ"]);
  });

  it("keeps printing the common codes outside the table, and $N for the rest", () => {
    expect([32, 133, 139, 12, 250].map(nagGlyph)).toEqual(["⟳", "⇆", "⊕", "$12", "$250"]);
    expect([32, 12].map(nagSection)).toEqual([undefined, undefined]);
  });

  it("says which section a code is set from, and which codes mark the move", () => {
    expect([1, 8, 9, 11, 19, 22, 146].map(nagSection)).toEqual([
      "move", "move", "move", "position", "position", "features", "features",
    ]);
    expect([1, 6, 7, 9].every(isMoveMark)).toBe(true);
    expect([10, 14, 36, 250].some(isMoveMark)).toBe(false);
  });

  it("colours the move marks the lichess way, and nothing else", () => {
    expect([1, 3, 2, 4, 5, 6].map(nagTone)).toEqual([
      "good", "brilliant", "mistake", "blunder", "interesting", "dubious",
    ]);
    expect([7, 9, 14, 146].map(nagTone)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("nagsInPrintOrder", () => {
  it("puts the move marks first, then the evaluation, the features, and the unknown last", () => {
    expect(nagsInPrintOrder([146, 250, 14, 1, 40, 36])).toEqual([1, 14, 146, 40, 36, 250]);
    expect(nagsInPrintOrder([])).toEqual([]);
  });
});

describe("toggleNag — the selection rule", () => {
  it("replaces the move assessment, and removes it when picked again", () => {
    expect(pick([], 1)).toEqual([1]);
    expect(pick([1], 4)).toEqual([4]);
    expect(pick([4], 4)).toEqual([]);
  });

  it("replaces the evaluation independently of the move assessment", () => {
    expect(pick([1, 14], 19)).toEqual([1, 19]);
    expect(pick([1, 19], 3)).toEqual([19, 3]);
  });

  it("treats a two-code choice as one: either code is active, the first is written", () => {
    const [forced] = NAG_SECTIONS[0].choices.filter((entry) => entry.id === "forced");
    expect(isNagChoiceActive([8], forced)).toBe(true);
    expect(pick([8], 7)).toEqual([]);
    expect(pick([], 7)).toEqual([7]);
    expect(pick([11], 10)).toEqual([]);
    expect(pick([11], 13)).toEqual([13]);
  });

  it("toggles each positional feature on its own", () => {
    expect(pick([36], 40)).toEqual([36, 40]);
    expect(pick([36, 40], 36)).toEqual([40]);
    expect(pick([1, 14], 146)).toEqual([1, 14, 146]);
  });

  it("never touches a code outside the table", () => {
    expect(pick([250, 1], 2)).toEqual([250, 2]);
    expect(pick([12, 14], 15)).toEqual([12, 15]);
    expect(pick([32], 36)).toEqual([32, 36]);
  });
});
