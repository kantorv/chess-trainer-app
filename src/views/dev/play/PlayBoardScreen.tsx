import { useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useTranslation } from "react-i18next";
import type { Arrow, ChessboardOptions, PieceRenderObject } from "react-chessboard";

import { findNode, type VariationNode } from "../../../lib/gameTree";
import { isAnyMasked, type PieceMask } from "../../../lib/pieceMask";
import EngineSettings from "../../engine/play/EngineSettings";
import NextMovesBar from "../../tools/analysis/NextMovesBar";
import { nextMoveArrowsOf } from "../../tools/analysis/nextMoveArrows";
import CurrentOpening from "../../shared/CurrentOpening";
import BoardShell from "../core/BoardShell";
import TreeMoveList from "../../explorer/TreeMoveList";
import type { BoardPanelTab } from "../core/BoardPanel";
import type { PlayBoardState } from "./usePlayBoard";

/**
 * **The screen Play with Engine v2 and Masked Pieces v2 both are.**
 *
 * One component, two routes, and the only thing the masked route passes extra
 * is a {@link PlayBoardScreenProps.mask} — which reaches exactly the two places
 * `.claude/rules/chessboard.md` says a mask may reach: `options.pieces` on the
 * board (and the captured strips' icons, which are the same costumes), and the
 * notation in the move list and the variations block. The state underneath is
 * the true position, untouched, so legality, captures, check, castling, en
 * passant, promotion and the engine's own play are computed from it and are
 * identical on the two routes.
 *
 * The extra tab a masked board needs — the mask editor — arrives through
 * {@link PlayBoardScreenProps.extraTabs}, so this component does not learn what
 * a `MaskEditor` is either.
 *
 * ## What this board gained by being derived
 *
 * The shipped play screen has none of CTA-53/54/55. This one has all three
 * without a line of its own for any of them: the merged move list is
 * `TreeMoveList`, the next-moves bar is the panel's footer slot, and the pinned
 * click-to-play variations are the panel skeleton's — the same block the other
 * four boards render. What it lost is its Variations *tab*: the lines are above
 * every tab now, so a tab for them would be the same component twice.
 */

export type PlayBoardScreenProps = {
  /** `options.id`, and the root of this screen's test ids. Unique per route. */
  id: string;
  state: PlayBoardState;
  /** The costume, on the masked route only. Absent ⇒ an ordinary board. */
  mask?: PieceMask;
  /** Whether the notation hides a masked piece's letter. Masked route only. */
  maskNotation?: boolean;
  /** `options.pieces` — the mask's renderers. Masked route only. */
  pieces?: PieceRenderObject;
  /** Tabs appended after Moves and Engine — the mask editor, and nothing else. */
  extraTabs?: readonly BoardPanelTab[];
  /** Appended to the header slot, after the opening line and before the switch. */
  headerExtra?: ReactNode;
};

function PlayBoardScreen({
  id,
  state,
  mask,
  maskNotation = false,
  pieces,
  extraTabs = [],
  headerExtra,
}: PlayBoardScreenProps) {
  const { t } = useTranslation();

  const [tab, setTab] = useState("moves");
  const [hoveredNextMove, setHoveredNextMove] = useState<VariationNode | null>(
    null,
  );

  /* The notation only wears the mask when the reader asked it to. */
  const notationMask = maskNotation ? mask : undefined;

  /*
    The continuations of the position on screen (CTA-54). On a linear board
    this is a fork only where a variation exists — which `canMoveAt` prevents
    here — so on a plain game the bar renders nothing, exactly as it should:
    the shared piece costs the board nothing when the board has no forks.
  */
  const continuations = useMemo(
    () =>
      state.nodeId === null
        ? state.tree.moves
        : (findNode(state.tree, state.nodeId)?.children ?? []),
    [state.tree, state.nodeId],
  );

  const arrows: Arrow[] =
    tab === "moves" && continuations.length >= 2
      ? nextMoveArrowsOf(continuations, hoveredNextMove?.id)
      : [];

  const boardOptions: ChessboardOptions = { arrows, ...(pieces ? { pieces } : {}) };

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  return (
    <BoardShell
      id={id}
      core={state}
      score={topLine?.score ?? null}
      showEvalBar={state.showEvalBar}
      boardOptions={boardOptions}
      capturedPieces={pieces}
      /*
        Off the live position, or while the engine is to move, a drag would
        apply to a position nobody is playing on. The core refuses it anyway
        (`canMoveAt`); this is the same answer given to the board, so the
        cursor says so before the drag starts.
      */
      allowDragging={state.isLive && !state.isEngineThinking}
      /*
        The material difference is derived from the true pieces, so showing it
        under a mask is the information leak §13 of the masking technique
        forbids. The captured *lists* stay — they are drawn in costume.
      */
      hideMaterialDiff={mask !== undefined && isAnyMasked(mask)}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <CurrentOpening fen={state.fen} testId={`${id}-current-opening`} />
            </Box>
            {headerExtra}
            <FormControlLabel
              sx={{ flexShrink: 0 }}
              control={
                <Switch
                  checked={state.engineOn}
                  data-testid={`${id}-setting-engine`}
                  onChange={(event) => state.setEngineOn(event.target.checked)}
                />
              }
              label={t("playEngine.settings.engineOn")}
            />
          </>
        ),
        analysis: state.analysis,
        requestedMultiPv: state.settings.multiPv,
        engineOn: state.engineOn,
        // Present, so the pinned lines are clickable — which the shipped play
        // screen's read-only Variations tab never was (CTA-55).
        onPlayVariation: state.playVariation,
        mask: notationMask,
        activeTab: tab,
        onTabChange: setTab,
        tabs: [
          {
            id: "moves",
            label: t("dev.tabs.moves"),
            content: (
              <TreeMoveList
                tree={state.tree}
                mainlineNodes={state.mainlineNodes}
                nodeId={state.nodeId}
                onSelectNode={state.goToNode}
                evalsByFen={state.evalsByFen}
                mask={notationMask}
              />
            ),
          },
          {
            id: "engine",
            label: t("dev.tabs.engine"),
            content: (
              <EngineSettings
                settings={state.settings}
                onChange={state.updateSettings}
                engineOptions={state.engineOptions}
                showEvalBar={state.showEvalBar}
                onShowEvalBarChange={state.setShowEvalBar}
                onNewGame={state.newGame}
              />
            ),
          },
          ...extraTabs,
        ],
        footer:
          tab === "moves" ? (
            <NextMovesBar
              nodes={continuations}
              onSelect={state.goToNode}
              onHover={setHoveredNextMove}
            />
          ) : undefined,
      }}
    />
  );
}

export default PlayBoardScreen;
