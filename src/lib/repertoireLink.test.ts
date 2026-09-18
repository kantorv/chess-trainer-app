import { describe, expect, it } from "vitest";

import { parsePgnTree } from "./pgn";
import { atParamOf, nodeAtParam } from "./repertoireLink";

const tree = parsePgnTree("1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *");
const [e4] = tree.moves;
const c5 = e4.children[0].children[0].children[0].children[0].children[1];

describe("a permanent link to a position", () => {
  it("names a position by its moves and finds it again", () => {
    expect(atParamOf(tree, null)).toBe("");
    expect(atParamOf(tree, c5.id)).toBe("e4,c6,d4,d5,e5,c5");
    expect(nodeAtParam(tree, "e4,c6,d4,d5,e5,c5")).toBe(c5.id);
    // Survives a round trip through the URL, SAN's `+` and `#` included.
    const query = new URLSearchParams({ at: "e4,c6,d4,d5,e5,c5" }).toString();
    expect(nodeAtParam(tree, new URLSearchParams(query).get("at"))).toBe(c5.id);
  });

  it("goes as far as it can, and treats nothing as the start", () => {
    expect(nodeAtParam(tree, "e4,c6,Nf3")).toBe(e4.children[0].id);
    expect(nodeAtParam(tree, "h4")).toBeNull();
    expect(nodeAtParam(tree, "")).toBeNull();
    expect(nodeAtParam(tree, null)).toBeNull();
    expect(nodeAtParam(tree, " e4 , c6 ")).toBe(e4.children[0].id);
  });
});
