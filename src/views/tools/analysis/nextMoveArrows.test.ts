import { describe, expect, it } from "vitest";

import { parsePgnTree } from "../../../lib/pgn";
import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  NEXT_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
  nextMoveArrowsOf,
} from "./nextMoveArrows";

// Three first moves: 1. e4 the mainline, 1. d4 and 1. c4 side lines.
const tree = parsePgnTree("1. e4 (1. d4) (1. c4) *");

describe("nextMoveArrowsOf", () => {
  it("draws the mainline in its own colour and every side line in another", () => {
    expect(nextMoveArrowsOf(tree.moves)).toEqual([
      { startSquare: "e2", endSquare: "e4", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "d2", endSquare: "d4", color: SIDELINE_NEXT_MOVE_ARROW_COLOR },
      { startSquare: "c2", endSquare: "c4", color: SIDELINE_NEXT_MOVE_ARROW_COLOR },
    ]);
    expect(NEXT_MOVE_ARROW_COLOR).not.toBe(SIDELINE_NEXT_MOVE_ARROW_COLOR);
  });

  it("paints the hovered continuation, mainline or not", () => {
    const [e4, d4] = tree.moves;
    expect(nextMoveArrowsOf(tree.moves, d4.id).map((arrow) => arrow.color)).toEqual([
      NEXT_MOVE_ARROW_COLOR,
      HOVERED_NEXT_MOVE_ARROW_COLOR,
      SIDELINE_NEXT_MOVE_ARROW_COLOR,
    ]);
    expect(nextMoveArrowsOf(tree.moves, e4.id)[0].color).toBe(HOVERED_NEXT_MOVE_ARROW_COLOR);
  });

  it("draws nothing where there is nothing to play", () => {
    expect(nextMoveArrowsOf([])).toEqual([]);
  });
});
