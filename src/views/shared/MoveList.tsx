import { Fragment, useEffect, useMemo, useRef, type Ref } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import { useTranslation } from "react-i18next";
import { formatScore, type Score } from "../../lib/engineAnalysis";
import { moveRowsOf } from "../../lib/gameNavigation";
import { initialFenOf, type Game, type GameMove } from "../../lib/gameModel";
import type { VariationNode } from "../../lib/gameTree";
import { maskSanLine, type PieceMask } from "../../lib/pieceMask";
import { VariationBlock } from "./VariationLine";

/**
 * The lichess-style move list: numbered pairs, the current ply highlighted,
 * every move a jump target.
 *
 * A branching game renders here too (CTA-53): its side lines arrive as the
 * optional `branches` prop and hang as indented runs under the mainline move
 * each branches from, inside this list — which is how the Analysis Board's
 * Moves tab shows one list instead of printing the mainline twice, once here
 * and once in the tree that used to sit below it. The props are optional on
 * purpose: a linear game renders exactly as before, so every other consumer
 * passes none.
 *
 * Presentational on purpose — the selected ply comes in as a prop and goes out
 * through `onSelectPly`, so `useGameNavigation` owns the state and this renders
 * against a fixture game in tests. It sits in the shell's right-hand aside,
 * *outside* `ForceLTR`: the panel is chrome and mirrors under Hebrew. Only the
 * board is exempt (see the root `CLAUDE.md`).
 */

type MoveListProps = {
  game: Game;
  /** The selected half-move; 0 is the starting position. */
  currentPly: number;
  onSelectPly: (ply: number) => void;
  /**
   * Optional piece mask (`lib/pieceMask.ts`). With one, a move made by a piece
   * whose identity the board is hiding is printed as coordinates instead of
   * SAN — `"Nf3"` in a list beside a masked board hands back the identity the
   * board is busy hiding. Without one nothing changes, which is why the three
   * screens that do not mask anything pass no prop.
   */
  mask?: PieceMask;
  /**
   * Plies that carry an annotation in the PGN, so the list can flag them with a
   * small comment marker beside the move. Only the User PGNs game detail passes
   * this — its Description tab is the list of those comments — and every other
   * screen passes nothing and renders exactly as before.
   */
  annotatedPlies?: ReadonlySet<number>;
  /**
   * The engine's scores for the positions it has finished searching, keyed by
   * the FEN they describe (CTA-50) — Play with Engine's live accumulation, and
   * what the list prints beside each move lichess-style: the SAN leads, the
   * score sits at the row's far edge. Each move already carries the FEN after
   * it, so a ply's eval is a lookup; ply 0 looks up the game's starting
   * position. A position the map does not know prints
   * nothing — not the no-data dash, which is the *chip's* empty state, not a
   * move's. Without the prop nothing changes, which is why every other consumer
   * passes none.
   */
  evalsByFen?: ReadonlyMap<string, Score>;
  /**
   * The side lines of a branching game (CTA-53), keyed by the mainline ply each
   * branches from — the ply of the mainline move the side line answers, 0
   * naming the start position, for a side line that branches before any
   * mainline move. Each is rendered as an indented run inside this list,
   * directly under the row holding that ply. Without the prop nothing changes,
   * which is why the linear consumers pass none — the Analysis Board's Moves
   * tab is the one consumer.
   */
  branches?: ReadonlyMap<number, readonly VariationNode[]>;
  /**
   * The selected node of the game the side lines belong to; it highlights the
   * side-line token the selection is on, and must not collide with the ply
   * highlight — a consumer standing inside a side line passes `currentPly: -1`
   * so no numbered row lights up. `null` — the default — highlights none of
   * the side-line tokens.
   */
  currentNodeId?: string | null;
  /**
   * A click on a side-line move, reported with the node it names: a click
   * inside a side line changes *which line is current*, which a ply cannot say
   * (`useTreeNavigation`). Without it the side-line tokens render but do not
   * navigate.
   */
  onSelectNode?: (id: string) => void;
};

/**
 * SAN is Latin text sitting in a container that may be RTL: without an explicit
 * direction and its own bidi isolate, "Nf3" and the move numbers get reordered
 * by the surrounding paragraph direction, and a token can bleed into its
 * neighbour across the two columns.
 *
 * The direction is carried by a `dir="ltr"` **attribute** on each token, not by
 * CSS. Under Hebrew these styles go through the RTL emotion cache, whose stylis
 * plugin flips `direction: ltr` into `direction: rtl` exactly as it flips the
 * paddings — a CSS declaration here would be reversed into the bug it exists to
 * prevent. The attribute is out of that plugin's reach. (`unicode-bidi` is not
 * flipped, and pairs with the attribute the way the HTML default sheet does.)
 */
const sanTokenSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

/** Shared box model for every clickable row of the list. */
const cellSx = {
  justifyContent: "flex-start",
  // Indentation follows the reading direction — never `paddingLeft`, which
  // would sit on the wrong side under Hebrew.
  paddingInlineStart: 0.75,
  paddingInlineEnd: 0.75,
  paddingBlock: 0.25,
  borderRadius: 0.5,
  minWidth: 0,
  width: "100%",
} as const;

const selectedCellSx = {
  bgcolor: "primary.main",
  color: "primary.contrastText",
  fontWeight: 700,
} as const;

/**
 * The eval printed beside a move: small and dimmed, so the SAN stays the thing
 * the eye reads first, and pushed to the row's far edge — the SAN leads, the
 * score trails. The auto margin is the *logical* one, not `marginLeft`: under
 * Hebrew these styles go through the RTL emotion cache, which flips physical
 * margins — inside this LTR-pinned row (`dir="ltr"`) that would push the score
 * to the wrong edge. The logical property is untouched by the plugin and
 * resolves against the row's own direction in both caches. It inherits the
 * row's colour rather than taking a fixed one — the selected row repaints its
 * text, and a hard `text.secondary` here would sit dark-on-primary.
 */
const evalTokenSx = {
  marginInlineStart: "auto",
  fontSize: "0.6875rem",
  opacity: 0.75,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flexShrink: 1,
} as const;

/** One clickable SAN cell, or an empty slot when that half of the pair is absent. */
function MoveCell({
  move,
  text,
  isCurrent,
  hasComment,
  evalText,
  onSelect,
  activeRef,
}: {
  move: GameMove | null;
  /** What to print for it — its SAN, or the mask's rewrite of it. */
  text: string;
  isCurrent: boolean;
  /** Whether the PGN carries an annotation for this move (see `annotatedPlies`). */
  hasComment: boolean;
  /** The eval of the position after this move, or `undefined` when not scored. */
  evalText?: string;
  onSelect: (ply: number) => void;
  activeRef: Ref<HTMLButtonElement>;
}) {
  if (move === null) {
    // A game that starts with Black to move opens with an empty White slot.
    return <Box aria-hidden sx={{ ...cellSx, visibility: "hidden" }} />;
  }

  return (
    <ButtonBase
      ref={isCurrent ? activeRef : undefined}
      dir="ltr"
      data-testid={`move-ply-${move.ply}`}
      data-has-comment={hasComment ? "true" : undefined}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => onSelect(move.ply)}
      sx={{
        ...cellSx,
        ...sanTokenSx,
        gap: 0.25,
        ...(isCurrent ? selectedCellSx : {}),
      }}
    >
      {text}
      {hasComment && (
        <ChatBubbleOutlineRoundedIcon
          aria-hidden
          data-testid={`move-comment-icon-${move.ply}`}
          sx={{ fontSize: "0.75rem", opacity: 0.7, flexShrink: 0 }}
        />
      )}
      {evalText !== undefined && (
        <Typography
          component="span"
          data-testid={`move-eval-${move.ply}`}
          sx={evalTokenSx}
        >
          {evalText}
        </Typography>
      )}
    </ButtonBase>
  );
}

function MoveList({
  game,
  currentPly,
  onSelectPly,
  mask,
  annotatedPlies,
  evalsByFen,
  branches,
  currentNodeId,
  onSelectNode,
}: MoveListProps) {
  const { t } = useTranslation();
  const rows = moveRowsOf(game);
  // The position the list starts from — what ply 0 selects, what the side
  // lines number their first move from, and what the start row's eval looks up.
  const startFen = initialFenOf(game);

  /*
    The eval of a position the engine has scored, as it is printed — or
    `undefined` for one it has not, which is the case that must print *nothing*:
    every unevaluated move showing the no-data dash would drown the list.
  */
  const evalTextOf = (fen: string): string | undefined => {
    const score = evalsByFen?.get(fen);
    return score === undefined ? undefined : formatScore(score);
  };

  /*
    The whole list's text, rewritten in one pass. `maskSanLine` replays the game
    because SAN alone does not carry the square a move came from, so this is one
    replay per game rather than one per move — and none at all when no mask is
    in play, which is every screen but the masked one.

    Indexed by ply - 1: a ply is a 1-based half-move index over exactly this
    array (`lib/gameNavigation.ts`).
  */
  const maskedSan = useMemo(
    () =>
      mask === undefined
        ? null
        : maskSanLine(
            mask,
            startFen,
            game.moves.map((move) => move.san),
          ),
    [mask, game, startFen],
  );
  const textOf = (move: GameMove) => maskedSan?.[move.ply - 1] ?? move.san;

  const activeRef = useRef<HTMLButtonElement | null>(null);

  /*
    The side lines branching from one mainline ply, as indented runs under the
    row that ply sits in. Ply 0 is the start position's own branch point: its
    runs hang under the start row, above the grid, rather than in it.
  */
  const branchBlocksAt = (ply: number) =>
    branches?.get(ply)?.map((node) => (
      <VariationBlock
        key={node.id}
        node={node}
        startFen={startFen}
        currentId={currentNodeId ?? null}
        onSelectNode={onSelectNode}
        activeRef={activeRef}
        evalTextOf={evalTextOf}
      />
    ));

  useEffect(() => {
    /*
      `block: "nearest"` scrolls the nearest scrollable ancestor and stops
      there — the box `LoadPgn` wraps this list in, which is the half of the
      panel above the ingestion controls. The aside itself does not scroll (see
      `Layout.tsx`), which is what keeps those controls pinned to its foot while
      this list moves. Optional call: jsdom implements no scrolling at all and
      leaves `scrollIntoView` undefined.
    */
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentPly, currentNodeId]);

  return (
    <Box data-testid="move-list">
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {t("moveList.title")}
      </Typography>

      <ButtonBase
        ref={currentPly === 0 ? activeRef : undefined}
        data-testid="move-ply-0"
        aria-current={currentPly === 0 ? "true" : undefined}
        onClick={() => onSelectPly(0)}
        sx={{
          ...cellSx,
          my: 0.5,
          fontSize: "0.8125rem",
          ...(currentPly === 0 ? selectedCellSx : {}),
        }}
      >
        {t("moveList.startPosition")}
        {/*
          The score carries `dir="ltr"` itself: this row is chrome and mirrors
          under Hebrew, and a signed score in an RTL flow has its sign migrate
          across the number. The move cells' tokens lean on their row's pin,
          which this row does not have — see the header note above for why the
          treatment is the attribute, not a CSS declaration.
        */}
        {evalsByFen?.has(startFen) && (
          <Typography
            component="span"
            dir="ltr"
            data-testid="move-eval-0"
            sx={evalTokenSx}
          >
            {formatScore(evalsByFen.get(startFen)!)}
          </Typography>
        )}
      </ButtonBase>

      {/*
        Side lines that branch from the start position itself hang under the
        start row, exactly as the others hang under their pair. A start-position
        side line implies a mainline exists, so when there are no rows there are
        none of these either.
      */}
      {branchBlocksAt(0)}

      {rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("moveList.noMoves")}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            // Number, White, Black — the pair wraps into two columns rather
            // than giving every half-move its own row. A side-line run spans
            // all three (`gridColumn: "1 / -1"` in `VariationBlock`), which
            // makes it a row of this grid in its own right, in DOM order
            // directly under the pair it answers.
            gridTemplateColumns: "auto 1fr 1fr",
            alignItems: "center",
            columnGap: 0.5,
          }}
        >
          {rows.map((row) => (
            <Fragment key={row.number}>
              <Box sx={{ display: "contents" }}>
                <Typography
                  component="span"
                  dir="ltr"
                  data-testid={`move-number-${row.number}`}
                  sx={{
                    ...sanTokenSx,
                    color: "text.secondary",
                    paddingInlineEnd: 0.5,
                    textAlign: "end",
                  }}
                >
                  {row.number}.
                </Typography>
                <MoveCell
                  move={row.white}
                  text={row.white === null ? "" : textOf(row.white)}
                  isCurrent={row.white?.ply === currentPly}
                  hasComment={
                    row.white != null &&
                    (annotatedPlies?.has(row.white.ply) ?? false)
                  }
                  evalText={row.white === null ? undefined : evalTextOf(row.white.fen)}
                  onSelect={onSelectPly}
                  activeRef={activeRef}
                />
                <MoveCell
                  move={row.black}
                  text={row.black === null ? "" : textOf(row.black)}
                  isCurrent={row.black?.ply === currentPly}
                  hasComment={
                    row.black != null &&
                    (annotatedPlies?.has(row.black.ply) ?? false)
                  }
                  evalText={row.black === null ? undefined : evalTextOf(row.black.fen)}
                  onSelect={onSelectPly}
                  activeRef={activeRef}
                />
              </Box>
              {/*
                The side lines branching from this row's moves, under the row
                that holds the move they answer — White's first, Black's after,
                the order they branch in.
              */}
              {row.white !== null && branchBlocksAt(row.white.ply)}
              {row.black !== null && branchBlocksAt(row.black.ply)}
            </Fragment>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default MoveList;
