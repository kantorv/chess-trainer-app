import { describe, expect, it } from "vitest";
import { parsePgnTree } from "../../../lib/pgn";
import { nodeAtSanPath } from "../../../lib/gameTree";
import { siblingOf } from "./useTreeNavigation";

/** ↑ / ↓ (CTA-69): the sibling moves of the move on screen, wrapping around. */
describe("siblingOf", () => {
  const tree = parsePgnTree("1. e4 (1. d4) (1. c4) e5 (1... c5) 2. Nf3 *");
  const id = (...sans: string[]) => nodeAtSanPath(tree, sans);

  it("steps through the continuations of the same position, in order, wrapping", () => {
    expect(siblingOf(tree, id("e4"), 1)).toBe(id("d4"));
    expect(siblingOf(tree, id("d4"), 1)).toBe(id("c4"));
    expect(siblingOf(tree, id("c4"), 1)).toBe(id("e4"));
    expect(siblingOf(tree, id("e4"), -1)).toBe(id("c4"));
    expect(siblingOf(tree, id("e4", "c5"), -1)).toBe(id("e4", "e5"));
  });

  it("is nothing for a move with no alternatives, and for the start", () => {
    expect(siblingOf(tree, id("e4", "e5", "Nf3"), 1)).toBeNull();
    expect(siblingOf(tree, null, 1)).toBeNull();
  });
});
