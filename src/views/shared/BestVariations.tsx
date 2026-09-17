import { Fragment, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
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
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("variations.title")}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          data-testid="analysis-depth"
          label={t("variations.depth", { depth: analysis.depth })}
        />
      </Box>

      {lines.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("variations.thinking")}
        </Typography>
      ) : (
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
          {lines.map((line) => {
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
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1,
                  p: 0.75,
                  borderRadius: 0.5,
                  bgcolor: "action.hover",
                }}
              >
                <Typography
                  component="span"
                  dir="ltr"
                  data-testid={`variation-${line.multipv}-score`}
                  sx={{
                    ...sanSx,
                    fontWeight: 700,
                    flexShrink: 0,
                    minWidth: "3.5rem",
                  }}
                >
                  {formatScore(line.score)}
                </Typography>
                {/*
                  Collapsed, the span truncates — one line, the moves that
                  fit, the cut marked by an ellipsis; CSS does the cutting,
                  so it follows the panel for free. Expanded, it wraps as it
                  always did. Every move renders in both states, only the
                  clipping differs, so `data-expanded` is the state a test
                  can read: jsdom has no line boxes to observe truncation
                  with.
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
                  Centred on the row rather than sharing the baseline, because
                  an icon has no text baseline, and kept from shrinking so the
                  clipped line stops short of it, never under it. The label
                  names the variation, the score and the action, because an
                  icon says none of them to a screen reader on its own.
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
                    alignSelf: "center",
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

      {lines.length > 0 && lines.length < requested && (
        <Typography
          variant="caption"
          data-testid="variations-partial"
          sx={{ color: "text.secondary", display: "block", mt: 1 }}
        >
          {t("variations.partial", {
            shown: lines.length,
            requested,
          })}
        </Typography>
      )}
    </Box>
  );
}

export default BestVariations;
