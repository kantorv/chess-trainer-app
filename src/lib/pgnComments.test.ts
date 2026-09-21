import { describe, expect, it } from "vitest";

import { reflowComment } from "./pgnComments";

/** Re-flowing a comment: PGN's hard wraps collapsed, real breaks kept. */

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
