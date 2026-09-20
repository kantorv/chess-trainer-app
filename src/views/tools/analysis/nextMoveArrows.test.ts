import { describe, expect, it } from "vitest";

import { parsePgnTree } from "../../../lib/pgn";
import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  NEXT_MOVE_ARROW_COLOR,
  RARE_NEXT_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
  SOMETIMES_NEXT_MOVE_ARROW_COLOR,
  chanceArrowColors,
  nextMoveArrowsOf,
} from "./nextMoveArrows";

// Three first moves: 1. e4 the mainline, 1. d4 and 1. c4 side lines.
const tree = parsePgnTree("1. e4 (1. d4) (1. c4) *");

describe("chanceArrowColors", () => {
  it("tiers by rank: green for the most likely, gray for almost never", () => {
    // The reader's own verdict on the first cut, a green→yellow gradient:
    // the eye cannot rank near-identical hues. Tiers answer the question a
    // fork actually asks — *which* move gets played.
    expect(chanceArrowColors([0.978, 0.022])).toEqual([
      NEXT_MOVE_ARROW_COLOR,
      RARE_NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("gives a real alternative amber and a rare one gray", () => {
    expect(chanceArrowColors([0.639, 0.361])).toEqual([
      NEXT_MOVE_ARROW_COLOR,
      SOMETIMES_NEXT_MOVE_ARROW_COLOR,
    ]);
    expect(chanceArrowColors([0.5, 0.18, 0.02])).toEqual([
      NEXT_MOVE_ARROW_COLOR,
      SOMETIMES_NEXT_MOVE_ARROW_COLOR,
      RARE_NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("gives a tie both green — either of these gets played", () => {
    expect(chanceArrowColors([0.5, 0.5])).toEqual([
      NEXT_MOVE_ARROW_COLOR,
      NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("keeps an undefined chance undefined, so the structural colour stands", () => {
    expect(chanceArrowColors([undefined, 0.6])).toEqual([
      undefined,
      NEXT_MOVE_ARROW_COLOR,
    ]);
    expect(chanceArrowColors([])).toEqual([]);
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

  it("tiers every arrow by its chance where the chances are given", () => {
    // The highest chance is the side line c4, so *it* takes green — the
    // tiers follow rank, not array order.
    expect(nextMoveArrowsOf(tree.moves, null, [0.7, 0.3, 1]).map((arrow) => arrow.color)).toEqual([
      SOMETIMES_NEXT_MOVE_ARROW_COLOR,
      SOMETIMES_NEXT_MOVE_ARROW_COLOR,
      NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("keeps the hovered colour over the tier one", () => {
    // Hovered is still the answer to "which move does a click play".
    expect(nextMoveArrowsOf(tree.moves, tree.moves[1].id, [1, 0, 0.5])[1].color).toBe(
      HOVERED_NEXT_MOVE_ARROW_COLOR,
    );
  });

  it("keeps the green and blue where a continuation has no chance to read", () => {
    // A caller may hand chances for only the moves it could read marks off;
    // the rest keep today's colours, mainline green and side lines blue —
    // and a side line whose chance is the highest takes green.
    expect(
      nextMoveArrowsOf(tree.moves, null, [undefined, undefined, 0.7]).map(
        (arrow) => arrow.color,
      ),
    ).toEqual([
      NEXT_MOVE_ARROW_COLOR,
      SIDELINE_NEXT_MOVE_ARROW_COLOR,
      NEXT_MOVE_ARROW_COLOR,
    ]);
  });

  it("draws nothing where there is nothing to play", () => {
    expect(nextMoveArrowsOf([])).toEqual([]);
  });
});
