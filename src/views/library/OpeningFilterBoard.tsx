import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import FirstPageRoundedIcon from "@mui/icons-material/FirstPageRounded";
import NavigateBeforeRoundedIcon from "@mui/icons-material/NavigateBeforeRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import { Chess, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions, type PieceDropHandlerArgs } from "react-chessboard";
import { useTranslation } from "react-i18next";

import type { OpeningTreeNode } from "../../lib/openingTree";
import { ForceLTR } from "../../theme/ForceLTR";
import PromotionPicker, { type PromotionChoice } from "../shared/PromotionPicker";
import { moveSx, sanTokenSx } from "../shared/moveTokenSx";
import { nextMoveArrowsOf } from "../tools/analysis/nextMoveArrows";

/**
 * **The opening-moves filter** (CTA-76) — a small board at the foot of a
 * collection table's filters: the reader plays an opening on it, and the
 * table keeps the games that began that way.
 *
 * Presentational over an opening tree (`lib/openingTree.ts`, merged from the
 * games the table's other filters leave): `line` is the moves played so far,
 * `node` where they lead in that tree — a node of no games when those games
 * never played the line — and every change goes out through `onLine`. From the
 * position it reaches, the board shows
 *
 * - the **continuations** as arrows through the shared `nextMoveArrowsOf` —
 *   the most played in the mainline colour, the rest in the side-line colour,
 *   the hovered one in the hover colour — and as a list, lichess-explorer
 *   style: each move with its games, their share, and a White / draw / Black
 *   bar. A click plays it, a hover draws its arrow;
 * - **only those moves**: a drop the games never played is refused and the
 *   piece snaps back. A promotion the games made more than one way asks which
 *   piece, the shared picker over the board.
 *
 * `chess.js` only turns the line into a position and SAN into squares here —
 * at most 30 plies, replayed when the line changes. The board is pinned LTR
 * (`ForceLTR`): files run a–h left to right in every language.
 */

type Continuation = {
  /** Its SAN, which is unique among a position's moves — the arrows' id. */
  id: string;
  san: string;
  from: Square;
  to: Square;
  promotion?: string;
  node: OpeningTreeNode;
};

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

function ResultBar({ node }: { node: OpeningTreeNode }) {
  const { white, draw, black } = node.results;
  const total = white + draw + black;
  if (total === 0) return <Box />;
  const part = (count: number, bgcolor: string, color: string) =>
    count === 0 ? null : (
      <Box
        sx={{
          flexGrow: count,
          flexBasis: 0,
          bgcolor,
          color,
          fontSize: 10,
          lineHeight: "14px",
          textAlign: "center",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {percent(count, total) >= 15 ? `${percent(count, total)}%` : ""}
      </Box>
    );
  return (
    <Box
      sx={{ display: "flex", height: 14, borderRadius: 0.5, overflow: "hidden", border: "1px solid", borderColor: "divider" }}
    >
      {part(white, "#f5f5f5", "#212121")}
      {part(draw, "#9e9e9e", "#212121")}
      {part(black, "#424242", "#f5f5f5")}
    </Box>
  );
}

type OpeningFilterBoardProps = {
  /** The moves played, already matched against the collection's tree. */
  line: readonly string[];
  /** The node `line` reaches. */
  node: OpeningTreeNode;
  onLine: (line: string[]) => void;
};

function OpeningFilterBoard({ line, node, onLine }: OpeningFilterBoardProps) {
  const { t } = useTranslation();
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [hovered, setHovered] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);

  const key = line.join(" ");
  const { fen, turn, continuations } = useMemo(() => {
    const chess = new Chess();
    for (const san of key === "" ? [] : key.split(" ")) chess.move(san);
    const legal = new Map(chess.moves({ verbose: true }).map((move) => [move.san, move]));
    const found: Continuation[] = [];
    for (const child of node.children) {
      const move = legal.get(child.san);
      if (move === undefined) continue;
      found.push({ id: child.san, san: child.san, from: move.from, to: move.to, promotion: move.promotion, node: child });
    }
    return { fen: chess.fen(), turn: chess.turn(), continuations: found };
  }, [key, node]);

  const play = (san: string) => {
    setHovered(null);
    setPromotion(null);
    onLine([...line, san]);
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (targetSquare === null) return false;
    const played = continuations.filter((move) => move.from === sourceSquare && move.to === targetSquare);
    if (played.length === 0) return false;
    if (played.length === 1) {
      play(played[0].san);
      return true;
    }
    // Promoted more than one way in these games: the reader picks. `true`, or the
    // pawn would snap back and jump forward again when the choice lands.
    setPromotion({ from: sourceSquare, to: targetSquare });
    return true;
  };

  const resolvePromotion = (piece: PromotionChoice | null) => {
    const move = continuations.find(
      (candidate) =>
        candidate.from === promotion?.from && candidate.to === promotion.to && candidate.promotion === piece,
    );
    setPromotion(null);
    if (piece !== null && move !== undefined) play(move.san);
  };

  const options: ChessboardOptions = {
    id: "library-filter-board",
    position: fen,
    boardOrientation: orientation,
    arrows: nextMoveArrowsOf(continuations, hovered),
    allowDrawingArrows: false,
    canDragPiece: ({ piece }) => piece.pieceType.startsWith(turn),
    onPieceDrop,
  };

  const numbered = line.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san)).join(" ");

  return (
    <Box data-testid="library-filter-moves" sx={{ display: "grid", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {t("library.filters.moves.title")}
        </Typography>
        <Tooltip title={t("library.filters.moves.reset")}>
          <span>
            <IconButton
              size="small"
              disabled={line.length === 0}
              onClick={() => onLine([])}
              aria-label={t("library.filters.moves.reset")}
              data-testid="library-filter-moves-reset"
            >
              <FirstPageRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("library.filters.moves.back")}>
          <span>
            <IconButton
              size="small"
              disabled={line.length === 0}
              onClick={() => onLine(line.slice(0, -1))}
              aria-label={t("library.filters.moves.back")}
              data-testid="library-filter-moves-back"
            >
              <NavigateBeforeRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("library.filters.moves.flip")}>
          <IconButton
            size="small"
            onClick={() => setOrientation((side) => (side === "white" ? "black" : "white"))}
            aria-label={t("library.filters.moves.flip")}
            data-testid="library-filter-moves-flip"
          >
            <SwapVertRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <ForceLTR sx={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
        <Chessboard options={options} />
        {promotion && (
          <PromotionPicker
            targetSquare={promotion.to}
            orientation={orientation}
            color={turn}
            onSelect={resolvePromotion}
          />
        )}
      </ForceLTR>

      <Typography
        variant="caption"
        dir="ltr"
        data-testid="library-filter-moves-line"
        sx={{ color: "text.secondary", minHeight: "1.5em", unicodeBidi: "isolate" }}
      >
        {line.length === 0 ? t("library.filters.moves.start") : numbered}
      </Typography>

      {continuations.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.secondary" }} data-testid="library-filter-moves-end">
          {t(node.count === 0 ? "library.filters.moves.none" : "library.filters.moves.end")}
        </Typography>
      ) : (
        <Box
          data-testid="library-filter-moves-list"
          sx={{ display: "grid", gridTemplateColumns: "auto auto 1fr", alignItems: "center", columnGap: 1, rowGap: 0.25 }}
          onMouseLeave={() => setHovered(null)}
        >
          {continuations.map((move) => (
            <Box key={move.id} sx={{ display: "contents" }}>
              <ButtonBase
                dir="ltr"
                data-testid={`library-filter-move-${move.san}`}
                onClick={() => play(move.san)}
                onMouseEnter={() => setHovered(move.id)}
                sx={{ ...moveSx, ...sanTokenSx, justifySelf: "start" }}
              >
                {move.san}
              </ButtonBase>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", textAlign: "end", whiteSpace: "nowrap" }}
                data-testid={`library-filter-move-count-${move.san}`}
              >
                {t("library.games", { count: move.node.count })} · {percent(move.node.count, node.count)}%
              </Typography>
              <ResultBar node={move.node} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default OpeningFilterBoard;
