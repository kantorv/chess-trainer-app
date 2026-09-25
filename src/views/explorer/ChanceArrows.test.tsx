import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { parsePgnTree } from "../../lib/pgn";
import { playChances } from "../../lib/playChance";
import ChanceArrows from "./ChanceArrows";
import {
  CHANCE_ARROW_BORDER_COLOR,
  CHANCE_ARROW_FILL_COLOR,
  type ChanceArrowColors,
} from "./chanceArrows";
import { HOVERED_NEXT_MOVE_ARROW_COLOR } from "../tools/analysis/nextMoveArrows";

/*
  The overlay itself, alone: the player's test asserts the screen wires it in,
  and this one asserts what the drawing says — one white, magenta-bordered
  arrow per chanced continuation, the likelier the wider.
*/

// A marked fork — `2. Nf3 {prc:97.8}` against `2. Bc4 {prc:2.2}` under
// `1. e4 e5`: the player test's MARKED fixture, and the branch the overlay
// draws, reached by walking to it.
const tree = parsePgnTree("1. e4 e5 2. Nf3 {prc:97.8} (2. Bc4 {prc:2.2}) *");
const fork = tree.moves[0].children[0].children;
const rare = fork[1];

const renderArrows = (
  props: {
    chances?: readonly (number | undefined)[];
    hoveredId?: string;
    orientation?: "white" | "black";
    colors?: readonly (ChanceArrowColors | undefined)[];
  } = {},
) =>
  render(
    <ChanceArrows
      testId="chance-arrows"
      nodes={fork}
      chances={playChances(fork)}
      hoveredId={null}
      orientation="white"
      {...props}
    />,
  );

describe("ChanceArrows", () => {
  it("draws one arrow per continuation, white with a magenta border", () => {
    renderArrows();
    const overlay = screen.getByTestId("chance-arrows");
    const arrows = overlay.querySelectorAll("path");
    expect(arrows).toHaveLength(2);

    const likelyArrow = overlay.querySelector('path[data-from="g1"]')!;
    expect(likelyArrow.getAttribute("data-to")).toBe("f3");
    expect(likelyArrow.getAttribute("fill")).toBe(CHANCE_ARROW_FILL_COLOR);
    expect(likelyArrow.getAttribute("stroke")).toBe(CHANCE_ARROW_BORDER_COLOR);

    const rareArrow = overlay.querySelector('path[data-from="f1"]')!;
    expect(rareArrow.getAttribute("data-to")).toBe("c4");
    expect(rareArrow.getAttribute("fill")).toBe(CHANCE_ARROW_FILL_COLOR);
    expect(rareArrow.getAttribute("stroke")).toBe(CHANCE_ARROW_BORDER_COLOR);
  });

  it("borders the likelier move's arrow wider — the bigger the probability, the sharper", () => {
    renderArrows();
    const overlay = screen.getByTestId("chance-arrows");
    const likelyArrow = overlay.querySelector('path[data-from="g1"]')!;
    const rareArrow = overlay.querySelector('path[data-from="f1"]')!;
    expect(
      Number(likelyArrow.getAttribute("stroke-width")),
    ).toBeGreaterThan(Number(rareArrow.getAttribute("stroke-width")));
  });

  it("answers the hovered continuation in the hovered colour, at full sharpness", () => {
    renderArrows({ hoveredId: rare.id });
    const overlay = screen.getByTestId("chance-arrows");
    const rareArrow = overlay.querySelector('path[data-from="f1"]')!;
    expect(rareArrow.getAttribute("stroke")).toBe(HOVERED_NEXT_MOVE_ARROW_COLOR);
    expect(rareArrow.getAttribute("opacity")).toBe("1");

    // The unhovered one keeps its magenta and its faded-by-chance opacity.
    const likelyArrow = overlay.querySelector('path[data-from="g1"]')!;
    expect(likelyArrow.getAttribute("stroke")).toBe(CHANCE_ARROW_BORDER_COLOR);
    expect(Number(likelyArrow.getAttribute("opacity"))).toBeLessThan(1);
  });

  it("draws nothing for a continuation with no chance to read", () => {
    // The defensive branch for a caller that hands less than the whole branch.
    renderArrows({ chances: [undefined, 0.6] });
    const overlay = screen.getByTestId("chance-arrows");
    expect(overlay.querySelectorAll("path")).toHaveLength(1);
    expect(overlay.querySelector('path[data-from="g1"]')).toBeNull();
  });

  it("takes each arrow's own colours when given them, and the defaults where not (CTA-98)", () => {
    renderArrows({ colors: [{ fill: "#0072B2", border: "#0072B2" }, undefined] });
    const overlay = screen.getByTestId("chance-arrows");
    const likelyArrow = overlay.querySelector('path[data-from="g1"]')!;
    expect(likelyArrow.getAttribute("fill")).toBe("#0072B2");
    expect(likelyArrow.getAttribute("stroke")).toBe("#0072B2");
    // No opacity of its own: still the sharper-the-likelier one.
    expect(Number(likelyArrow.getAttribute("opacity"))).toBeLessThan(1);
    const rareArrow = overlay.querySelector('path[data-from="f1"]')!;
    expect(rareArrow.getAttribute("fill")).toBe(CHANCE_ARROW_FILL_COLOR);
    expect(rareArrow.getAttribute("stroke")).toBe(CHANCE_ARROW_BORDER_COLOR);
  });

  it("draws facing the side the board faces", () => {
    const { unmount } = renderArrows();
    const white = screen
      .getByTestId("chance-arrows")
      .querySelector('path[data-from="g1"]')!
      .getAttribute("d");
    unmount();

    renderArrows({ orientation: "black" });
    const black = screen
      .getByTestId("chance-arrows")
      .querySelector('path[data-from="g1"]')!
      .getAttribute("d");
    expect(black).not.toBe(white);
  });
});
