import { memo, type ReactNode } from "react";
import { styled } from "@mui/material/styles";
import { plyLabel, type VariationNode } from "../../lib/gameTree";
import {
  useEvalText,
  useIsCurrentNode,
  useScrollWhenCurrent,
} from "./moveSelection";

/**
 * The pieces a side line is drawn with: one clickable move token, and the
 * indented block a side line sits in under the move it answers.
 *
 * Two screens render these, and that is why the file exists (CTA-53): the
 * flowing variation tree (`VariationTree.tsx` — the Openings explorer and the
 * Library repertoire viewer) and the shared move list (`MoveList.tsx`), which
 * prints each side line as an indented run directly under the row holding the
 * move it branches from. Same tokens, same clicks, same numbering, one
 * implementation — so the two cannot drift apart the way a copy of this would.
 *
 * Presentational, like everything around it: the selected node comes in as a
 * prop and goes out through `onSelectNode`, and the numbering is read off the
 * tree's start position (`plyLabel`, `lib/gameTree.ts`) rather than assumed to
 * be `1.`.
 *
 * SAN is Latin text sitting in a container that may be RTL: without an
 * explicit direction and its own bidi isolate, "Nf3" and the move numbers get
 * reordered by the surrounding paragraph direction, and a token can bleed into
 * its neighbour. The direction is carried by a `dir="ltr"` **attribute** on
 * each token, not by CSS — under Hebrew these styles go through the RTL
 * emotion cache, whose stylis plugin flips `direction: ltr` into
 * `direction: rtl` exactly as it flips the paddings, and a declaration here
 * would be reversed into the bug it exists to prevent. The attribute is out
 * of that plugin's reach. (`unicode-bidi` is not flipped, and pairs with the
 * attribute the way the HTML default sheet does.) The indentation is
 * `paddingInlineStart`, which follows the reading direction on its own.
 *
 * **What is current, and each move's eval, are not props.** Each token reads
 * them for itself from the list's selection store (`moveSelection.ts`), and
 * everything here is memoised on the tree's own nodes — so a list renders its
 * structure once per game, and a step re-renders the two tokens whose
 * highlight changed rather than every token in a 9,146-node tree (CTA-61).
 */

/*
  The token and the block are **two styled elements**, not a `ButtonBase` and a
  `Box` with an `sx` each. A repertoire can carry nine thousand of them, and a
  per-instance `sx` is a style object resolved per instance on mount, while a
  styled element's class is computed once and shared. The look is
  `moveTokenSx.ts`'s — the same spacing, monospace SAN and highlight the other
  token renderers use — and the highlight hangs off `aria-current`, the
  attribute the token already carries for assistive technology, so being
  current is one attribute on one element rather than a different style.
*/
const Token = styled("button")(({ theme }) => ({
  // What `ButtonBase` resets, since this is a bare button.
  border: 0,
  margin: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(0.25),
  // `moveSx` and `sanTokenSx`.
  paddingInline: theme.spacing(0.5),
  paddingBlock: theme.spacing(0.125),
  borderRadius: Number(theme.shape.borderRadius) * 0.5,
  minWidth: 0,
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
  "&:hover": { backgroundColor: (theme.vars ?? theme).palette.action.hover },
  "&:focus-visible": {
    outline: `2px solid ${(theme.vars ?? theme).palette.primary.main}`,
    outlineOffset: 1,
  },
  // `selectedTokenSx`.
  '&[aria-current="true"]': {
    backgroundColor: (theme.vars ?? theme).palette.primary.main,
    color: (theme.vars ?? theme).palette.primary.contrastText,
    fontWeight: 700,
  },
}));

/**
 * The eval printed beside a side-line move: small and dimmed, so the SAN stays
 * the thing the eye reads first. The move list's own eval style without its
 * far-edge auto margin — that one belongs to a full-width grid cell, and a
 * token here is content-width and has no far edge to push to.
 */
const EvalText = styled("span")({ fontSize: "0.6875rem", opacity: 0.75 });

/**
 * A side line's block: its own row, indented from the line it branches off.
 * Inside the move list it is a grid item among the numbered pairs instead, so
 * it spans all three columns; the flex container the flowing tree wraps it in
 * simply ignores the property. Logical properties, so the indent and the rule
 * follow the reading direction.
 */
const Block = styled("div")(({ theme }) => ({
  gridColumn: "1 / -1",
  width: "100%",
  paddingInlineStart: theme.spacing(1.5),
  marginBlock: theme.spacing(0.25),
  borderInlineStart: `2px solid ${(theme.vars ?? theme).palette.divider}`,
  color: (theme.vars ?? theme).palette.text.secondary,
}));

/** One clickable move, with its number when the numbering has to be restated. */
const MoveToken = memo(function MoveToken({
  node,
  startFen,
  forceNumber,
  onSelect,
}: {
  node: VariationNode;
  startFen: string;
  forceNumber: boolean;
  onSelect?: (id: string) => void;
}) {
  const isCurrent = useIsCurrentNode(node.id);
  const evalText = useEvalText(node.fen);
  const ref = useScrollWhenCurrent<HTMLButtonElement>(isCurrent);

  const { number, isWhiteMove } = plyLabel(startFen, node.ply);
  // White's move always carries its number; Black's carries one only at the
  // head of a line, or where a side line has just interrupted the reader's place.
  const prefix = isWhiteMove
    ? `${number}. `
    : forceNumber
      ? `${number}… `
      : "";

  return (
    <Token
      ref={ref}
      type="button"
      dir="ltr"
      data-testid={`tree-move-${node.id}`}
      data-san={node.san}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => onSelect?.(node.id)}
    >
      {`${prefix}${node.san}`}
      {evalText !== undefined && (
        <EvalText data-testid={`tree-eval-${node.id}`}>{evalText}</EvalText>
      )}
    </Token>
  );
});

type LineProps = {
  startFen: string;
  onSelectNode?: (id: string) => void;
  /**
   * A side line's accessible name (`moveList.variation`), translated once by
   * the list rather than by each of what can be thousands of blocks — the
   * list's memo already follows the language, so a switch still reaches it.
   */
  groupLabel: string;
};

/**
 * One side line: an indented, bordered group under the move it answers, with
 * the line's own moves restating their number inside.
 */
export const VariationBlock = memo(function VariationBlock({
  node,
  startFen,
  onSelectNode,
  groupLabel,
}: LineProps & {
  /** The side line's first move; its children continue it, and branch in turn. */
  node: VariationNode;
}) {
  return (
    <Block
      data-testid={`tree-variation-${node.id}`}
      role="group"
      aria-label={groupLabel}
    >
      {/* A side line is a line of its own, so it restates its number. */}
      <VariationLine
        nodes={[node]}
        startFen={startFen}
        forceNumber
        onSelectNode={onSelectNode}
        groupLabel={groupLabel}
      />
    </Block>
  );
});

/**
 * One run of alternatives: the first is the line, the rest are side lines
 * drawn under it. The same shape `treeToPgn` writes, and for the same reason —
 * it is how a branch reads.
 *
 * The continuation is walked **iteratively** down the line rather than by one
 * nested component per move: a 300-move line is one flat run of tokens, not a
 * component 300 deep (which is also what kept React's own recursion shallow).
 */
export const VariationLine = memo(function VariationLine({
  nodes,
  startFen,
  forceNumber,
  onSelectNode,
  groupLabel,
}: LineProps & {
  /** The alternatives at this point; `nodes[0]` is the line, the rest side lines. */
  nodes: readonly VariationNode[];
  /** Whether the first move restates its number — the head of a side line. */
  forceNumber: boolean;
}) {
  const parts: ReactNode[] = [];
  let alternatives: readonly VariationNode[] = nodes;
  let restate = forceNumber;

  for (;;) {
    const [main, ...sides] = alternatives;
    if (main === undefined) break;
    parts.push(
      <MoveToken
        key={main.id}
        node={main}
        startFen={startFen}
        forceNumber={restate}
        onSelect={onSelectNode}
      />,
    );
    for (const side of sides) {
      parts.push(
        <VariationBlock
          key={`v-${side.id}`}
          node={side}
          startFen={startFen}
          onSelectNode={onSelectNode}
          groupLabel={groupLabel}
        />,
      );
    }
    // A side line between two moves breaks the reader's place, so the move
    // after it restates its number.
    restate = sides.length > 0;
    alternatives = main.children;
  }

  return <>{parts}</>;
});
