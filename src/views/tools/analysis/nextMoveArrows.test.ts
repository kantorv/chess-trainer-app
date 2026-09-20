import { describe, expect, it } from "vitest";

import { parsePgnTree } from "../../../lib/pgn";
import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  NEXT_MOVE_ARROW_COLOR,
  RARE_NEXT_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
  chanceArrowColor,
  nextMoveArrowsOf,
} from "./nextMoveArrows";

// Three first moves: 1. e4 the mainline, 1. d4 and 1. c4 side lines.
const tree = parsePgnTree("1. e4 (1. d4) (1. c4) *");

describe("chanceArrowColor", () => {
  it("runs green at almost-always to yellow at almost-never", () => {
    expect(chanceArrowColor(1)).toBe(NEXT_MOVE_ARROW_COLOR);
    expect(chanceArrowColor(0)).toBe(RARE_NEXT_MOVE_ARROW_COLOR);
    // Straight per-channel interpolation — halfway is the halfway colour.
    expect(chanceArrowColor(0.5)).toBe("#a6cd46");
    expect(chanceArrowColor(0.7)).toBe("#82c14a");
    expect(chanceArrowColor(0.3)).toBe("#c9d941");
  });

  it("clamps a chance outside 0–1 rather than trusting it", () => {
    expect(chanceArrowColor(-0.5)).toBe(RARE_NEXT_MOVE_ARROW_COLOR);
    expect(chanceArrowColor(1.5)).toBe(NEXT_MOVE_ARROW_COLOR);
  });
});

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

  it("colours every arrow by its chance where the chances are given", () => {
    expect(nextMoveArrowsOf(tree.moves, null, [0.7, 0.3, 1]).map((arrow) => arrow.color)).toEqual([
      "#82c14a",
      "#c9d941",
      NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("keeps the hovered colour over the chance one", () => {
    // Hovered is still the answer to "which move does a click play".
    expect(nextMoveArrowsOf(tree.moves, tree.moves[1].id, [1, 0, 0.5])[1].color).toBe(
      HOVERED_NEXT_MOVE_ARROW_COLOR,
    );
  });

  it("keeps the green and blue where a continuation has no chance to read", () => {
    // A caller may hand chances for only the moves it could read marks off;
    // the rest keep today's colours, mainline green and side lines blue.
    expect(nextMoveArrowsOf(tree.moves, null, [0.7]).map((arrow) => arrow.color)).toEqual([
      "#82c14a",
      SIDELINE_NEXT_MOVE_ARROW_COLOR,
      SIDELINE_NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("draws nothing where there is nothing to play", () => {
    expect(nextMoveArrowsOf([])).toEqual([]);
  });
});
