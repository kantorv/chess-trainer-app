import type { VariationNode } from "../../lib/gameTree";
import {
  CHANCE_ARROW_FILL_COLOR,
  chanceArrowPath,
  chanceArrowSpec,
} from "./chanceArrows";

/**
 * **The play-chance arrows, drawn over the board** (CTA-71) — lichess's white
 * arrows with a magenta border, the wider the likelier the move, which the
 * library's `options.arrows` cannot express: colour is the only thing it
 * varies per arrow, and `arrowOptions` sizes every arrow at once
 * (`chanceArrows.ts` holds the geometry and the why).
 *
 * Rendered inside the board's relative box — the `overlay` slot
 * `EngineBoardSquare` hands a screen, the promotion picker's precedent — so
 * `position: absolute; inset: 0` covers the board exactly. The `viewBox` is
 * `0 0 8 8`, one unit per square: the overlay scales with the responsive board
 * and nothing measures a pixel. `pointer-events: none`, so the board beneath
 * keeps every drag and click.
 *
 * Each arrow is a **single** closed path rather than a shaft plus a head: a
 * stroked head polygon would outline its own base edge and draw a magenta bar
 * across the shaft's join, so the whole silhouette is outlined at once.
 */

type ChanceArrowsProps = {
  testId: string;
  /** The continuations of the position on screen — `chances` in their order. */
  nodes: readonly VariationNode[];
  /**
   * Each continuation's play chance, 0–1. `playChances` numbers every move at
   * a marked branch, so an `undefined` entry only draws nothing — the
   * defensive branch for a caller that hands less than the whole branch.
   */
  chances: readonly (number | undefined)[];
  /** The hovered continuation's id, or none — hover answers in red. */
  hoveredId: string | null;
  orientation: "white" | "black";
};

function ChanceArrows({
  testId,
  nodes,
  chances,
  hoveredId,
  orientation,
}: ChanceArrowsProps) {
  return (
    <svg
      data-testid={testId}
      viewBox="0 0 8 8"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        pointerEvents: "none",
      }}
    >
      {nodes.map((node, index) => {
        const chance = chances[index];
        if (chance === undefined) return null;
        const spec = chanceArrowSpec(
          node.from,
          node.to,
          orientation,
          chance,
          node.id === hoveredId,
        );
        return (
          <path
            key={node.id}
            data-from={node.from}
            data-to={node.to}
            d={chanceArrowPath(spec.points)}
            fill={CHANCE_ARROW_FILL_COLOR}
            stroke={spec.borderColor}
            strokeWidth={spec.borderWidth * 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={spec.opacity}
          />
        );
      })}
    </svg>
  );
}

export default ChanceArrows;
