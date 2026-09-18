import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useTranslation } from "react-i18next";
import {
  formatScore,
  variationNumbering,
  type Analysis,
} from "../../lib/engineAnalysis";
import { maskSanLine, type PieceMask } from "../../lib/pieceMask";
import { moveSx, sanTokenSx } from "./moveTokenSx";

/**
 * The top lines the engine is considering for the position on screen, each with
 * its score and its principal variation in SAN, under the depth the search has
 * reached. Play with Engine and Masked Pieces show this as their Variations
 * tab; the Analysis Board pins it above its tabs (CTA-55), where a line is
 * also something the reader plays — see `onSelectMove`.
 *
 * Presentational — it takes the analysis the screen collected and renders it, so
 * it can be driven straight from a fixture. Lines arrive one rank at a time and
 * fill in as the search deepens, so a `MultiPV` set with gaps in it is normal;
 * what reaches the screen is the ranks that are both present and still asked
 * for, which is `requested`'s second job (see below).
 *
 * A variation is printed one token per move, the move's number inside the token
 * the way the tree viewer's tokens carry theirs (`VariationLine.tsx`) and a
 * plain space between, so the line reads `23. Nf3 Qe7 24. Rd1`. Collapsed —
 * the default — the row is one line: the score plus as many moves as fit, cut
 * at the edge with an ellipsis by CSS (`white-space: nowrap` +
 * `overflow: hidden` + `text-overflow: ellipsis`), never by counting moves,
 * which would mean measuring the panel (CTA-56, lichess the reference).
 * A chevron at the row's end expands that row to the whole PV, wrapping
 * again; clicking it once more collapses it — lichess's disclosure arrow,
 * so the toggle is an explicit control beside the moves and the score stays
 * the plain text it always was. Rows expand independently, and an expansion
 * belongs to the position it was made on: the same position's
 * search deepening (same FEN) keeps it, a new analysed position starts every
 * row collapsed.
 *
 * The header is the block's own control (CTA-56): a small checkbox where a
 * plain title used to sit — checked by default. Clearing it hides the lines
 * and the waiting line both, the checkbox and the depth chip staying behind
 * as the way back: the reader analysing a position on their own gets the
 * engine's suggestions out of sight without giving up the search itself. It
 * is a working mode rather than an expansion, so it is *not* keyed to the
 * FEN — a new analysed position does not bring the lines back.
 *
 * Whether a *move* is clickable is decided by `onSelectMove` alone — the
 * score's toggle is there either way:
 *
 * - **without it** the moves render as plain text — the two engine screens'
 *   tab, which the reader reads while playing their own moves beside it.
 *   The moves are the DOM text they always were; the row's chevron is still
 *   the expand/collapse button.
 * - **with it** each move is a button, and a click hands over the SAN prefix
 *   up to and including the move clicked — the lichess analysis behaviour:
 *   clicking the third move of a line plays all three. The prefix carries the
 *   *true* SANs even under a mask, because the click is behaviour and the
 *   mask never touches that (`lib/pieceMask.ts`); what the token *prints* is
 *   what is disguised. This holds in both states: a move visible is a move
 *   playable, collapsed or expanded.
 *
 * **The block holds its height while the engine thinks.** It always renders one
 * row per requested line (`requested`): a rank not in yet is a placeholder row
 * of exactly a line row's height — the same box, the same text line, a spacer
 * where the chevron goes — showing "waiting for the engine" in the first row
 * and a skeleton bar in the others. Stepping to a new position clears the
 * analysis, and before this the block fell to one line of text and grew back
 * as the lines landed, jumping everything below it on every step (CTA-61).
 * The "N of M lines" note lives in the header row for the same reason: a line
 * under the grid that comes and goes is a jump of its own.
 *
 * SAN and the scores are Latin text in a panel that mirrors under Hebrew, so
 * every token carries `dir="ltr"` — an **attribute**, never a CSS declaration,
 * which the RTL emotion cache would flip into the bug it is meant to prevent
 * (see the root `CLAUDE.md`). The truncation cuts at the line span's own
 * inline end — the panel's outer edge in English, the side next to the score
 * under Hebrew — which is where the line's LTR span has to clip; the
 * alternative would be mirroring the SAN, and that never happens.
 */

type BestVariationsProps = {
  analysis: Analysis;
  /**
   * The current `MultiPV` — how many lines the engine was asked for. It both
   * bounds what is rendered (ranks above it are leftovers from a wider search)
   * and lets a set that has not filled up yet say so.
   */
  requested: number;
  /**
   * Optional piece mask (`lib/pieceMask.ts`), for the same reason `MoveList`
   * takes one: a variation printed in SAN names the pieces in it, and the
   * engine's lines are full of moves by pieces the board is hiding. With a mask
   * those moves are printed as coordinates. Without one nothing changes.
   */
  mask?: PieceMask;
  /**
   * Play a line: a click on its Nth move hands over the first N SANs — the
   * prefix up to and including the move clicked. Optional because the two
   * engine screens render this view plain; without it no move is a button
   * (see the component note).
   */
  onSelectMove?: (san: readonly string[]) => void;
};

const sanSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

/** One line's row box — shared by the real row and its placeholder. */
const rowSx = {
  display: "flex",
  alignItems: "baseline",
  gap: 1,
  p: 0.75,
  borderRadius: 0.5,
  bgcolor: "action.hover",
} as const;

/** The score cell's box, shared for the same reason. */
const scoreSx = {
  ...sanSx,
  fontWeight: 700,
  flexShrink: 0,
  minWidth: "3.5rem",
} as const;

/** The chevron's size: its icon plus the button's padding on each side. */
const CHEVRON_SIZE = "calc(1.125rem + 4px)";

/**
 * A rank the engine has not reported yet: the row a line will take, the same
 * height as one, so the block does not grow when the line lands. The same
 * box and the same two text cells as a line row (so the same line box), and
 * an invisible spacer the size of the chevron, which is the row's tallest
 * child. `text` is what the first row says while nothing is in; otherwise
 * the cells are skeleton bars.
 */
function PendingRow({ rank, text }: { rank: number; text?: string }) {
  return (
    <Box
      component="li"
      data-testid={`variation-${rank}-pending`}
      aria-busy="true"
      sx={rowSx}
    >
      <Typography component="span" sx={scoreSx}>
        <Skeleton variant="text" sx={{ display: "inline-block", width: "2.5rem" }} />
      </Typography>
      <Typography
        component="span"
        sx={{ ...sanSx, color: "text.secondary", minWidth: 0, flexGrow: 1 }}
        noWrap
      >
        {text ?? (
          <Skeleton
            variant="text"
            sx={{ display: "inline-block", width: `${85 - rank * 10}%` }}
          />
        )}
      </Typography>
      <Box
        aria-hidden
        sx={{
          flexShrink: 0,
          alignSelf: "flex-start",
          width: CHEVRON_SIZE,
          height: CHEVRON_SIZE,
        }}
      />
    </Box>
  );
}

/**
 * Which rows the reader has expanded (CTA-56), keyed by `MultiPV` rank and
 * stamped with the FEN they were expanded on — the stamp is what makes an
 * expansion about *that position's* line, so a new analysed position can
 * drop the lot in one write.
 */
type Expansion = { fen: string; ranks: ReadonlySet<number> };

function BestVariations({
  analysis,
  requested,
  mask,
  onSelectMove,
}: BestVariationsProps) {
  const { t } = useTranslation();

  /*
    Whether the lines show at all — the header's checkbox (CTA-56). A working
    mode rather than an expansion: hiding the lines is about the reader, not
    the position, so unlike the expansion set below it is *not* keyed to the
    FEN — a new analysed position must not bring back what they put away.
  */
  const [showLines, setShowLines] = useState(true);

  const [expansion, setExpansion] = useState<Expansion>(() => ({
    fen: analysis.fen,
    ranks: new Set(),
  }));

  /*
    An expansion was about *that position's* line, so a new analysed position
    starts every row collapsed. Adjusted during render against the previous
    FEN — React's own answer to "reset state when a value changes", the same
    move `Sidebar.tsx` makes for its open chain — so the new position never
    paints with the old one's expansions, the way it would for the one render
    before an effect fires. The same FEN deepening is not a change: the search
    streaming deeper results for the one position keeps what the reader
    opened, and the rows re-render with the longer lines.
  */
  if (expansion.fen !== analysis.fen) {
    setExpansion({ fen: analysis.fen, ranks: new Set() });
  }

  /*
    The toggle, built off the fen-matched view so a click can only ever see
    the same set the rows are rendering from — never a rank carried over from
    a position that has already gone.
  */
  const toggleExpanded = (rank: number) => {
    const ranks = new Set(
      expansion.fen === analysis.fen ? expansion.ranks : [],
    );
    if (ranks.has(rank)) ranks.delete(rank);
    else ranks.add(rank);
    setExpansion({ fen: analysis.fen, ranks });
  };

  /*
    The array is indexed by MultiPV rank, which leaves two kinds of entry that
    must not reach the screen.

    A set still *filling in* has holes, because lines arrive one rank at a time.
    A set left over from a *wider* search has ranks above the current `MultiPV`:
    lowering the setting re-searches the same position, so the analysis state is
    kept rather than replaced, and the ranks the engine has stopped reporting
    would otherwise sit there looking live while only rank 1 moved. Asking for
    one line has to show one line.
  */
  const lines = analysis.lines.filter(
    (line) => line !== undefined && line.multipv <= requested,
  );

  /*
    One slot per requested rank, in rank order — the line when it is in, a
    placeholder of the same height when it is not (see the component note).
    At least one, so a `requested` of 0 still has somewhere to say it waits.
  */
  const slots = Array.from({ length: Math.max(requested, 1) }, (_, index) => ({
    rank: index + 1,
    line: lines.find((line) => line.multipv === index + 1),
  }));

  return (
    <Box data-testid="best-variations">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1,
        }}
      >
        {/*
          The header is the block's own control (CTA-56): a small checkbox
          where the plain title was, checked by default. Clearing it puts the
          lines away — analysing a position on one's own means not having the
          engine's suggestions in the corner of the eye — while the row itself
          stays, the checkbox being the way back. The depth chip stays beside
          it: the search keeps running, lines or no lines.
        */}
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={showLines}
              data-testid="variations-toggle"
              onChange={(event) => setShowLines(event.target.checked)}
            />
          }
          slotProps={{
            typography: { variant: "subtitle2", sx: { fontWeight: 700 } },
          }}
          label={t("variations.title")}
        />
        {/*
          A set still filling in says so here, in the header row, rather than
          on a line under the grid that would appear and vanish (see above).
          The placeholder rows already show which ranks are missing.
        */}
        {showLines && lines.length > 0 && lines.length < requested && (
          <Typography
            variant="caption"
            data-testid="variations-partial"
            noWrap
            sx={{ color: "text.secondary", minWidth: 0, flexShrink: 1, marginInlineStart: "auto" }}
          >
            {t("variations.partial", {
              shown: lines.length,
              requested,
            })}
          </Typography>
        )}
        <Chip
          size="small"
          variant="outlined"
          data-testid="analysis-depth"
          label={t("variations.depth", { depth: analysis.depth })}
        />
      </Box>

      {/*
        The checkbox's gate (CTA-56): cleared, only the header renders —
        the waiting line too, not just the lines, because what the reader
        put away is the engine's talk, whatever shape it is in.
      */}
      {showLines && (
        <Box
          component="ol"
          sx={{
            listStyle: "none",
            m: 0,
            p: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 0.75,
          }}
        >
          {/*
            One column, floored at zero: a plain implicit `auto` track sizes
            to the rows' content, and a collapsed row's content is a nowrap
            line whose min-content is its own full width — the track would
            blow out past the panel and put a scrollbar under the rows
            instead of an ellipsis in them, which is the thing lichess does
            not have. `minmax(0, 1fr)` holds the track to the panel, which
            is what makes the CSS clipping below reachable at all, and keeps
            an expansion from re-laying the grid out — only the one row
            changes.
          */}
          {slots.map(({ rank, line }) => {
            if (line === undefined) {
              return (
                <PendingRow
                  key={`pending-${rank}`}
                  rank={rank}
                  // The first row says what is happening; the rest are bars.
                  text={rank === 1 && lines.length === 0 ? t("variations.thinking") : undefined}
                />
              );
            }
            /*
              What the tokens print: the true SANs, disguised when a mask is in
              force. A click below still hands over the true ones, because the
              mask is a costume, never a rule — and every line starts from the
              analysed position, which is the board the mask needs in order to
              name the squares.
            */
            const display =
              mask === undefined
                ? line.san
                : maskSanLine(mask, analysis.fen, line.san);
            const prefixes = variationNumbering(analysis.fen, display.length);
            const isExpanded =
              expansion.fen === analysis.fen &&
              expansion.ranks.has(line.multipv);

            return (
              <Box
                component="li"
                key={line.multipv}
                data-testid={`variation-${line.multipv}`}
                sx={rowSx}
              >
                <Typography
                  component="span"
                  dir="ltr"
                  data-testid={`variation-${line.multipv}-score`}
                  sx={scoreSx}
                >
                  {formatScore(line.score)}
                </Typography>
                {/*
                  Collapsed, the span truncates — one line, the moves that
                  fit, the cut marked by an ellipsis; CSS does the cutting,
                  so it follows the panel for free. Expanded, it wraps as it
                  always did. It also grows to fill whatever of the row the
                  score and the chevron leave, which is what holds the
                  chevron at the row's end in every row — a short line
                  stretches out to it instead of stranding the chevron beside
                  its last move, so the arrows stand in one column. Every
                  move renders in both states, only the clipping differs, so
                  `data-expanded` is the state a test can read: jsdom has no
                  line boxes to observe truncation with.
                */}
                <Typography
                  component="span"
                  dir="ltr"
                  data-testid={`variation-${line.multipv}-line`}
                  data-expanded={isExpanded}
                  sx={{
                    ...sanSx,
                    color: "text.secondary",
                    minWidth: 0,
                    flexGrow: 1,
                    ...(isExpanded
                      ? {}
                      : {
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }),
                  }}
                >
                  {display.map((san, index) => (
                    <Fragment key={index}>
                      {/*
                        A plain space between the tokens, so the line reads as
                        one sentence and wraps at the panel's edge.
                      */}
                      {index > 0 && " "}
                      {onSelectMove === undefined ? (
                        `${prefixes[index]}${san}`
                      ) : (
                        <ButtonBase
                          dir="ltr"
                          data-testid={`variation-${line.multipv}-move-${index + 1}`}
                          data-san={line.san[index]}
                          onClick={() =>
                            onSelectMove(line.san.slice(0, index + 1))
                          }
                          sx={{ ...moveSx, ...sanTokenSx }}
                        >
                          {`${prefixes[index]}${san}`}
                        </ButtonBase>
                      )}
                    </Fragment>
                  ))}
                </Typography>
                {/*
                  The disclosure arrow (CTA-56): lichess's expand icon, sitting
                  at the row's end so the toggle is an explicit control beside
                  the moves and the score stays the plain text it always was —
                  nothing about the row reads as clickable but its controls.
                  Pinned to the row's top rather than centred on it, so a row
                  grown tall keeps its chevron beside the first move instead
                  of floating at the middle — `flex-start` rather than the
                  row's baseline, which would perch the icon on the text's
                  baseline with nothing under it. The line span beside it
                  grows to fill the row (below), which is what holds every
                  row's chevron at the row's end, a short line no less than a
                  clipped one. Kept from shrinking, so the clipped line stops
                  short of it, never under it. The label names the variation,
                  the score and the action, because an icon says none of them
                  to a screen reader on its own.
                */}
                <ButtonBase
                  aria-label={t(
                    isExpanded ? "variations.collapse" : "variations.expand",
                    { rank: line.multipv, score: formatScore(line.score) },
                  )}
                  aria-expanded={isExpanded}
                  data-testid={`variation-${line.multipv}-toggle`}
                  onClick={() => toggleExpanded(line.multipv)}
                  sx={{
                    flexShrink: 0,
                    alignSelf: "flex-start",
                    p: 0.25,
                    borderRadius: 0.5,
                    color: "text.secondary",
                    "&:hover": { bgcolor: "action.selected" },
                  }}
                >
                  <ExpandMoreRoundedIcon
                    sx={{
                      fontSize: "1.125rem",
                      transition: "transform 150ms",
                      ...(isExpanded ? { transform: "rotate(180deg)" } : {}),
                    }}
                  />
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      )}

    </Box>
  );
}

export default BestVariations;
