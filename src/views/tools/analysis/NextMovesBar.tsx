import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { VariationNode } from "../../../lib/gameTree";
import { moveSx, sanTokenSx } from "../../shared/moveTokenSx";

/**
 * The pinned "next moves" bar (CTA-54): the continuations of the position on
 * screen, two per row with the mainline first — a third way to advance, beside
 * the merged list's rows and the step controls. The panel renders it between
 * the tab's scrolling region and the board controls, so it stays put while the
 * list scrolls.
 *
 * Presentational, like the pieces it is drawn with: the continuations arrive as
 * nodes and a click goes out as the node it names — the same selection a
 * side-line token in the merged list makes, so the board, the list highlight
 * and the stepping all follow a click here exactly as they follow one there.
 * The first node is the mainline (`children[0]` at every level,
 * `lib/gameTree.ts`) and prints in the standard text colour; the rest are
 * variations and print dimmed — the lichess colouring CTA-53 established for
 * the merged list.
 *
 * **A fork is two or more continuations, and only a fork renders.** One move or
 * none is a position with nothing to choose between, and a strip of panel
 * reserved for it would push the board controls down for nothing — so this
 * returns `null` and the panel's flex column closes over the gap: no bar, no
 * label, no space.
 *
 * SAN is Latin text in a panel that may be RTL: each token carries the
 * `dir="ltr"` **attribute**, never a CSS direction declaration — under Hebrew
 * the panel's styles go through the RTL emotion cache, whose stylis plugin
 * flips `direction: ltr` into the bug it exists to prevent, and the attribute
 * is out of its reach (`VariationLine.tsx` has the full story). The grid
 * mirrors with the panel, so the reading order — mainline first — follows the
 * direction on its own.
 */
function NextMovesBar({
  nodes,
  onSelect,
}: {
  /** The continuations of the position on screen; `nodes[0]` is the mainline. */
  nodes: readonly VariationNode[];
  /** Select the node a move names — the same call the move list's clicks make. */
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();

  // A fork, or nothing at all — see the component note.
  if (nodes.length < 2) return null;

  return (
    <Box
      data-testid="analysis-next-moves"
      sx={{
        flexShrink: 0,
        display: "grid",
        // Two moves per row — the layout the reader asked for.
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        justifyItems: "start",
        alignContent: "start",
        gap: 0.5,
      }}
    >
      <Typography
        variant="caption"
        sx={{ gridColumn: "1 / -1", color: "text.secondary" }}
      >
        {t("analysis.nextMoves")}
      </Typography>
      {nodes.map((node, index) => (
        <ButtonBase
          key={node.id}
          dir="ltr"
          data-testid={`next-move-${node.id}`}
          data-san={node.san}
          onClick={() => onSelect(node.id)}
          sx={{
            ...moveSx,
            ...sanTokenSx,
            // The mainline token is standard text; the variations are dimmed.
            ...(index === 0 ? {} : { color: "text.secondary" }),
          }}
        >
          {node.san}
        </ButtonBase>
      ))}
    </Box>
  );
}

export default NextMovesBar;
