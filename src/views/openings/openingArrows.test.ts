import { describe, expect, it } from "vitest";

import { HOVERED_MOVE_ARROW_COLOR, KNOWN_MOVE_ARROW_COLOR } from "../../lib/openings";
import { NEXT_MOVE_ARROW_COLOR } from "../tools/analysis/nextMoveArrows";
import { openingArrowsOf } from "./openingArrows";

const e4 = { san: "e4", from: "e2", to: "e4" } as const;
const d4 = { san: "d4", from: "d2", to: "d4" } as const;
const treeE4 = { startSquare: "e2", endSquare: "e4", color: NEXT_MOVE_ARROW_COLOR };

describe("openingArrowsOf", () => {
  it("draws every book move in the book's colour when the tree has none", () => {
    expect(openingArrowsOf([], [e4, d4], null)).toEqual([
      { startSquare: "e2", endSquare: "e4", color: KNOWN_MOVE_ARROW_COLOR },
      { startSquare: "d2", endSquare: "d4", color: KNOWN_MOVE_ARROW_COLOR },
    ]);
  });

  it("keeps the tree's arrow for a move both have, and draws it once", () => {
    expect(openingArrowsOf([treeE4], [e4, d4], null)).toEqual([
      treeE4,
      { startSquare: "d2", endSquare: "d4", color: KNOWN_MOVE_ARROW_COLOR },
    ]);
  });

  it("recolours the hovered book move, whichever set drew it", () => {
    const arrows = openingArrowsOf([treeE4], [e4, d4], "e4");
    expect(arrows[0].color).toBe(HOVERED_MOVE_ARROW_COLOR);
    expect(arrows[1].color).toBe(KNOWN_MOVE_ARROW_COLOR);
    expect(openingArrowsOf([treeE4], [e4, d4], "d4")[1].color).toBe(HOVERED_MOVE_ARROW_COLOR);
  });
});
