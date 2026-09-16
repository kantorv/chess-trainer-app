import { type Ref } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { plyLabel, type VariationNode } from "../../lib/gameTree";
import { moveSx, sanTokenSx, selectedTokenSx } from "./moveTokenSx";

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
 */

/**
 * The eval printed beside a side-line move: small and dimmed, so the SAN stays
 * the thing the eye reads first. The move list's own eval style without its
 * far-edge auto margin — that one belongs to a full-width grid cell, and a
 * token here is content-width and has no far edge to push to.
 */
const evalTokenSx = {
  fontSize: "0.6875rem",
  opacity: 0.75,
} as const;

/** One clickable move, with its number when the numbering has to be restated. */
function MoveToken({
  node,
  startFen,
  forceNumber,
  isCurrent,
  onSelect,
  activeRef,
  evalText,
}: {
  node: VariationNode;
  startFen: string;
  forceNumber: boolean;
  isCurrent: boolean;
  onSelect?: (id: string) => void;
  activeRef: Ref<HTMLButtonElement>;
  /** The eval of the position after this move, or `undefined` when not scored. */
  evalText?: string;
}) {
  const { number, isWhiteMove } = plyLabel(startFen, node.ply);
  // White's move always carries its number; Black's carries one only at the
  // head of a line, or where a side line has just interrupted the reader's place.
  const prefix = isWhiteMove
    ? `${number}. `
    : forceNumber
      ? `${number}… `
      : "";

  return (
    <ButtonBase
      ref={isCurrent ? activeRef : undefined}
      dir="ltr"
      data-testid={`tree-move-${node.id}`}
      data-san={node.san}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => onSelect?.(node.id)}
      sx={{
        ...moveSx,
        ...sanTokenSx,
        gap: 0.25,
        ...(isCurrent ? selectedTokenSx : {}),
      }}
    >
      {`${prefix}${node.san}`}
      {evalText !== undefined && (
        <Typography
          component="span"
          data-testid={`tree-eval-${node.id}`}
          sx={evalTokenSx}
        >
          {evalText}
        </Typography>
      )}
    </ButtonBase>
  );
}

/**
 * One side line: an indented, bordered group under the move it answers, with
 * the line's own moves restating their number inside.
 */
export function VariationBlock({
  node,
  startFen,
  currentId,
  onSelectNode,
  activeRef,
  evalTextOf,
}: {
  /** The side line's first move; its children continue it, and branch in turn. */
  node: VariationNode;
  startFen: string;
  /** The selected node; `null` is the start position, which no token matches. */
  currentId: string | null;
  onSelectNode?: (id: string) => void;
  activeRef: Ref<HTMLButtonElement>;
  /** The eval of a position, as it is printed — or `undefined` to print nothing. */
  evalTextOf?: (fen: string) => string | undefined;
}) {
  const { t } = useTranslation();

  return (
    <Box
      data-testid={`tree-variation-${node.id}`}
      role="group"
      aria-label={t("moveList.variation")}
      sx={{
        // A block in the middle of an inline flow: the side line gets its own
        // row, indented from the line it branches off. Inside the move list it
        // is a grid item among the numbered pairs instead, so it spans all
        // three columns; the flex container the flowing tree wraps it in
        // simply ignores the property.
        gridColumn: "1 / -1",
        width: "100%",
        paddingInlineStart: 1.5,
        marginBlock: 0.25,
        borderInlineStart: "2px solid",
        borderColor: "divider",
        color: "text.secondary",
      }}
    >
      {/* A side line is a line of its own, so it restates its number. */}
      <VariationLine
        nodes={[node]}
        startFen={startFen}
        forceNumber
        currentId={currentId}
        onSelectNode={onSelectNode}
        activeRef={activeRef}
        evalTextOf={evalTextOf}
      />
    </Box>
  );
}

/**
 * One run of alternatives: the first is the line, the rest are side lines
 * drawn under it. The same shape `treeToPgn` writes, and for the same reason —
 * it is how a branch reads.
 */
export function VariationLine({
  nodes,
  startFen,
  forceNumber,
  currentId,
  onSelectNode,
  activeRef,
  evalTextOf,
}: {
  /** The alternatives at this point; `nodes[0]` is the line, the rest side lines. */
  nodes: readonly VariationNode[];
  startFen: string;
  /** Whether the first move restates its number — the head of a side line. */
  forceNumber: boolean;
  currentId: string | null;
  onSelectNode?: (id: string) => void;
  activeRef: Ref<HTMLButtonElement>;
  evalTextOf?: (fen: string) => string | undefined;
}) {
  const [main, ...alternatives] = nodes;
  if (main === undefined) return null;

  return (
    <>
      <MoveToken
        node={main}
        startFen={startFen}
        forceNumber={forceNumber}
        isCurrent={main.id === currentId}
        onSelect={onSelectNode}
        activeRef={activeRef}
        evalText={evalTextOf?.(main.fen)}
      />

      {alternatives.map((alternative) => (
        <VariationBlock
          key={alternative.id}
          node={alternative}
          startFen={startFen}
          currentId={currentId}
          onSelectNode={onSelectNode}
          activeRef={activeRef}
          evalTextOf={evalTextOf}
        />
      ))}

      <VariationLine
        nodes={main.children}
        startFen={startFen}
        // A side line between two moves breaks the reader's place, so the move
        // after it restates its number.
        forceNumber={alternatives.length > 0}
        currentId={currentId}
        onSelectNode={onSelectNode}
        activeRef={activeRef}
        evalTextOf={evalTextOf}
      />
    </>
  );
}
