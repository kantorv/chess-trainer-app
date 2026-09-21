import { describe, expect, it } from "vitest";

import {
  CHANCE_ARROW_BORDER_COLOR,
  CHANCE_ARROW_MAX_WIDTH,
  CHANCE_ARROW_MIN_WIDTH,
  chanceArrowPath,
  chanceArrowSpec,
  chanceArrowWidth,
  squareCenterOf,
} from "./chanceArrows";
import { HOVERED_NEXT_MOVE_ARROW_COLOR } from "./nextMoveArrows";

// The width of an arrow's shaft, read straight off its tail's two flank points.
const tailWidthOf = (points: readonly { x: number; y: number }[]) =>
  Math.hypot(
    points[6].x - points[0].x,
    points[6].y - points[0].y,
  );

describe("chanceArrowWidth", () => {
  it("maps the chance to an arrow width, clamped to the range", () => {
    expect(chanceArrowWidth(0)).toBe(CHANCE_ARROW_MIN_WIDTH);
    expect(chanceArrowWidth(1)).toBe(CHANCE_ARROW_MAX_WIDTH);
    expect(chanceArrowWidth(0.5)).toBeCloseTo(
      (CHANCE_ARROW_MIN_WIDTH + CHANCE_ARROW_MAX_WIDTH) / 2,
    );
    // A malformed chance can only draw inside the range, never outside it.
    expect(chanceArrowWidth(1.5)).toBe(CHANCE_ARROW_MAX_WIDTH);
    expect(chanceArrowWidth(-1)).toBe(CHANCE_ARROW_MIN_WIDTH);
  });
});

describe("squareCenterOf", () => {
  it("places a square by file and rank facing White", () => {
    expect(squareCenterOf("e2", "white")).toEqual({ x: 4.5, y: 6.5 });
    expect(squareCenterOf("a1", "white")).toEqual({ x: 0.5, y: 7.5 });
    expect(squareCenterOf("h8", "white")).toEqual({ x: 7.5, y: 0.5 });
  });

  it("mirrors both axes facing Black", () => {
    expect(squareCenterOf("e2", "black")).toEqual({ x: 3.5, y: 1.5 });
    expect(squareCenterOf("a1", "black")).toEqual({ x: 7.5, y: 0.5 });
  });
});

describe("chanceArrowSpec", () => {
  it("lands its tip on the target square's centre", () => {
    expect(chanceArrowSpec("g1", "f3", "white", 0.978).points[3]).toEqual(
      squareCenterOf("f3", "white"),
    );
    expect(chanceArrowSpec("e2", "e4", "black", 0.5).points[3]).toEqual(
      squareCenterOf("e4", "black"),
    );
  });

  it("sizes the shaft by the chance", () => {
    const fat = chanceArrowSpec("e2", "e4", "white", 1);
    const thin = chanceArrowSpec("e2", "e4", "white", 0);
    expect(tailWidthOf(fat.points)).toBeCloseTo(CHANCE_ARROW_MAX_WIDTH);
    expect(tailWidthOf(thin.points)).toBeCloseTo(CHANCE_ARROW_MIN_WIDTH);
  });

  it("widens and sharpens the likelier move, at every chance", () => {
    // The border and the opacity grow with the chance the way the width does —
    // "the bigger the probability, the wider and sharper the arrow".
    const fat = chanceArrowSpec("e2", "e4", "white", 1);
    const mid = chanceArrowSpec("e2", "e4", "white", 0.5);
    const thin = chanceArrowSpec("e2", "e4", "white", 0);
    expect(fat.borderWidth).toBeGreaterThan(mid.borderWidth);
    expect(mid.borderWidth).toBeGreaterThan(thin.borderWidth);
    expect(fat.opacity).toBeGreaterThan(mid.opacity);
    expect(mid.opacity).toBeGreaterThan(thin.opacity);
    expect(tailWidthOf(fat.points)).toBeGreaterThan(tailWidthOf(mid.points));
  });

  it("answers the hovered continuation in the hovered colour, at full sharpness", () => {
    expect(chanceArrowSpec("e2", "e4", "white", 0.2, true)).toMatchObject({
      borderColor: HOVERED_NEXT_MOVE_ARROW_COLOR,
      opacity: 1,
    });
    // `0.6 + 0.4 × 0.2` is not exactly `0.68` in floating point.
    const unhovered = chanceArrowSpec("e2", "e4", "white", 0.2);
    expect(unhovered.borderColor).toBe(CHANCE_ARROW_BORDER_COLOR);
    expect(unhovered.opacity).toBeCloseTo(0.68);
  });

  it("keeps even a one-square move an arrow", () => {
    // The guards: the tail never starts past 30% of the move and the head
    // never eats more than 45% of it, so the shaft keeps length of its own.
    const spec = chanceArrowSpec("e1", "e2", "white", 1);
    const shaft = Math.hypot(
      spec.points[1].x - spec.points[0].x,
      spec.points[1].y - spec.points[0].y,
    );
    expect(shaft).toBeGreaterThan(0.1);
    expect(chanceArrowPath(spec.points)).not.toMatch(/NaN/);
  });

  it("flares the head past the shaft on both sides", () => {
    const spec = chanceArrowSpec("g1", "f3", "white", 0.978);
    const leftFlare = Math.hypot(
      spec.points[2].x - spec.points[1].x,
      spec.points[2].y - spec.points[1].y,
    );
    const rightFlare = Math.hypot(
      spec.points[5].x - spec.points[4].x,
      spec.points[5].y - spec.points[4].y,
    );
    expect(leftFlare).toBeGreaterThan(0);
    expect(rightFlare).toBeCloseTo(leftFlare);
  });
});

describe("chanceArrowPath", () => {
  it("closes the silhouette as one path", () => {
    expect(
      chanceArrowPath([
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
        { x: 2, y: 1 },
      ]),
    ).toBe("M0,0 L1,0.5 L2,1 Z");
  });

  it("rounds to the millesimal, so the paths stay short", () => {
    expect(chanceArrowPath([{ x: 0.12345, y: 2 }])).toBe("M0.123,2 Z");
  });
});
