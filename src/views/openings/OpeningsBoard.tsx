import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { DEFAULT_POSITION } from "chess.js";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ChessboardOptions } from "react-chessboard";

import { analysisHandOffState, lineTreeOf } from "../../lib/analysisHandOff";
import { parseFen } from "../../lib/fen";
import type { GameTree } from "../../lib/gameTree";
import { atParamOf, atParamSans, nodeAtParam, REPERTOIRE_AT_PARAM } from "../../lib/repertoireLink";
import BoardShell from "../dev/core/BoardShell";
import { turnOf } from "../dev/core/useBoardCore";
import { useOpeningBookModule } from "../dev/core/useOpeningBookModule";
import { useVariationsExplorer } from "../explorer/useVariationsExplorer";
import CurrentOpening from "../shared/CurrentOpening";
import AnalysisExport from "../tools/analysis/AnalysisExport";
import AnalysisLoad from "../tools/analysis/AnalysisLoad";
import AnalysisSettingsPanel from "../tools/analysis/AnalysisSettings";
import EngineThinking from "../tools/analysis/EngineThinking";
import PlayToggleButton from "../tools/analysis/PlayToggleButton";
import { useAnalysisSession } from "../tools/analysis/useAnalysisSession";
import OpeningBookList from "./OpeningBookList";
import { openingArrowsOf } from "./openingArrows";

/**
 * **The Openings explorer** (`/openings`, CTA-78) — an opening played through
 * on a full analysis board, with the book's continuations from the position
 * on screen beside it. Composed as the Library's game board is
 * ([`chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md) §4 — no
 * behaviour hook of its own):
 *
 * | Capability | Taken |
 * | --- | --- |
 * | Base + engine + Play | `useAnalysisSession` — the Analysis Board's own session: `useBoardCore`, `useEngineModule` (on), `usePlayToggle` (off at the start) |
 * | Book | `useOpeningBookModule` — eco.json's continuations from the position on screen, listed in the Book tab (a click plays one, from any node — an earlier position branches) and drawn as arrows |
 * | Tree view | `useVariationsExplorer` — Moves, Map, the comment block, the next-moves bar, the arrows, the move menu; editing on, *Play chances…* off |
 * | Shell | `BoardShell` / `BoardPanel` — tabs Book · Moves (with the next-move arrows' switch) · Map · Load · Export · Engine |
 *
 * **Nothing is kept.** An opening is explored, not filed: there is no Save,
 * no changes strip and no folders, and the Load tab merges a text of several
 * games but never splits it into saved analyses. What the reader wants to
 * keep goes on to the **Analysis Board** — the header's button hands the
 * whole tree over (side lines, comments), with the position on screen and the
 * orientation, as a new unsaved board there (`lib/analysisHandOff.ts`: the
 * router's location state, beside `?at=`). "Play from here" hands the
 * position on screen to Play with Engine as `?fen=`.
 *
 * **Arrivals, read once**: `?fen=` (`CurrentOpening`'s ECO chip — validated with `parseFen`; a position turns
 * the board to the side to move) and **`?at=`** — the moves from that start as
 * SAN. The URL is written back with history replace on every step — `?fen=`
 * when the tree does not start at the standard position, `?at=` where the
 * reader stands — so the address is a link to the line on screen. (A link
 * carries that one line, not the side lines beside it.)
 *
 * The full reference — the book, the arrows, the URL, the hand-off, tests,
 * debugging and recipes — is
 * [`.claude/rules/openings-explorer.md`](../../../.claude/rules/openings-explorer.md).
 */

/** The tabs kept mounted once opened — a long move list is costly to mount; the Map keeps its view. */
const KEEP_MOUNTED = ["moves", "map"] as const;

/** What the URL hands the screen, read once: the start position and the line to replay. */
const arrivalOf = (params: URLSearchParams) => {
  let fen = DEFAULT_POSITION;
  const requested = params.get("fen");
  if (requested !== null) {
    try {
      fen = parseFen(requested);
    } catch {
      // A position nobody can read opens as the standard start.
    }
  }
  const at = params.get(REPERTOIRE_AT_PARAM);
  const tree: GameTree = lineTreeOf(fen, atParamSans(at));
  return {
    tree,
    nodeId: nodeAtParam(tree, at) ?? undefined,
    // A position turns the board; the standard start faces White.
    orientation: turnOf(fen) === "b" ? ("black" as const) : ("white" as const),
  };
};

function OpeningsBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [arrival] = useState(() => arrivalOf(searchParams));

  const session = useAnalysisSession(arrival);
  const { core, engine } = session;
  const book = useOpeningBookModule({ enabled: true, fen: core.fen });

  const [tab, setTab] = useState("book");
  const [showArrows, setShowArrows] = useState(true);

  const explorer = useVariationsExplorer({
    testId: "openings",
    source: core,
    evalsByFen: engine.evalsByFen,
    onEditTree: core.replaceTree,
    playChances: false,
    annotations: true,
    arrows: { show: showArrows },
    map: { linked: true },
  });
  const boardOptions: ChessboardOptions = {
    arrows: openingArrowsOf(explorer.arrows, book.nextMoves, book.hoveredMove?.san ?? null),
  };
  const topLine = engine.analysis.lines.find((line) => line !== undefined);

  /*
    The URL, derived and written back with history replace: the tree's start
    when it is not the standard one, and where the reader stands.
  */
  const linkedAt = useMemo(() => atParamOf(core.tree, core.nodeId), [core.tree, core.nodeId]);
  const startFen = core.tree.startFen;
  const wantedSearch = useMemo(
    () =>
      createSearchParams({
        ...(startFen === DEFAULT_POSITION ? {} : { fen: startFen }),
        ...(linkedAt === "" ? {} : { [REPERTOIRE_AT_PARAM]: linkedAt }),
      }).toString(),
    [startFen, linkedAt],
  );
  useEffect(() => {
    if (searchParams.toString() === wantedSearch) return;
    setSearchParams(wantedSearch, { replace: true });
  }, [wantedSearch, searchParams, setSearchParams]);

  /** A new tree on the board — a PGN loaded, a merge. */
  const loadTree = (tree: GameTree) => {
    core.loadTree(tree);
    engine.clearAnalysis();
  };

  /** Everything explored here, onto the Analysis Board as a new unsaved board. */
  const openInAnalysis = () =>
    navigate(
      {
        pathname: "/tools/analysis",
        search:
          linkedAt === ""
            ? ""
            : createSearchParams({ [REPERTOIRE_AT_PARAM]: linkedAt }).toString(),
      },
      { state: analysisHandOffState(core.tree, core.orientation) },
    );

  return (
    <BoardShell
      id="openings"
      core={core}
      score={topLine?.score ?? null}
      showEvalBar={session.engineOn && session.showEvalBar}
      boardOptions={boardOptions}
      overlay={explorer.overlay}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <CurrentOpening fen={core.fen} testId="openings-current" />
            </Box>
            <Tooltip title={t("openings.controls.analysis")}>
              <IconButton
                size="small"
                onClick={openInAnalysis}
                aria-label={t("openings.controls.analysis")}
                data-testid="openings-open-analysis"
                sx={{ flexShrink: 0 }}
              >
                <AccountTreeRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("openings.controls.playFromHere")}>
              <IconButton
                size="small"
                onClick={() =>
                  navigate({
                    pathname: "/engine/play",
                    search: createSearchParams({ fen: core.fen }).toString(),
                  })
                }
                aria-label={t("openings.controls.playFromHere")}
                data-testid="openings-play-from-here"
                sx={{ flexShrink: 0 }}
              >
                <SportsEsportsRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <PlayToggleButton
              testId="openings-play"
              engineOn={session.engineOn}
              playing={session.playing}
              thinking={session.thinking}
              onToggle={session.togglePlaying}
            />
            <FormControlLabel
              sx={{ flexShrink: 0, marginInlineEnd: 0 }}
              control={
                <Switch
                  size="small"
                  checked={session.engineOn}
                  data-testid="openings-setting-engine"
                  onChange={(event) => session.setEngineOn(event.target.checked)}
                />
              }
              label={t("openings.engineSwitch")}
            />
          </>
        ),
        analysis: engine.analysis,
        requestedMultiPv: session.settings.multiPv,
        engineOn: session.engineOn,
        onPlayVariation: core.playVariation,
        activeTab: tab,
        onTabChange: setTab,
        keepMounted: KEEP_MOUNTED,
        tabs: [
          {
            id: "book",
            label: t("openings.tabs.book"),
            content: (
              <OpeningBookList
                moves={book.nextMoves}
                // Like a drop, at any node: from an earlier position it branches.
                onPlay={(san) => core.playVariation([san])}
                onHover={book.setHoveredMove}
              />
            ),
          },
          {
            id: "moves",
            label: t("openings.tabs.moves"),
            content: (
              <>
                <FormControlLabel
                  sx={{ m: 0, px: 1 }}
                  control={
                    <Switch
                      size="small"
                      checked={showArrows}
                      data-testid="openings-arrows"
                      onChange={(event) => setShowArrows(event.target.checked)}
                    />
                  }
                  label={t("analysis.settings.arrows")}
                />
                {explorer.moves}
              </>
            ),
          },
          { id: "map", label: t("openings.tabs.map"), content: explorer.map },
          {
            id: "load",
            label: t("openings.tabs.load"),
            content: (
              <AnalysisLoad
                settings={session.settings}
                onLoadTree={loadTree}
                onLoadFen={(fen) => {
                  core.loadFen(fen);
                  engine.clearAnalysis();
                }}
                choiceLabelKey="openings.load.choice"
              />
            ),
          },
          {
            id: "export",
            label: t("openings.tabs.export"),
            content: <AnalysisExport fen={core.fen} tree={core.tree} fileStem="opening" />,
          },
          {
            id: "engine",
            label: t("openings.tabs.engine"),
            content: (
              <AnalysisSettingsPanel
                settings={session.settings}
                onChange={session.updateSettings}
                engineOptions={engine.engineOptions}
                engineOn={session.engineOn}
                showEvalBar={session.showEvalBar}
                onShowEvalBarChange={session.setShowEvalBar}
                onClear={() => {
                  core.reset();
                  engine.clearAnalysis();
                }}
              />
            ),
          },
        ],
        footer: (
          <>
            {explorer.annotations}
            {session.playing && (
              <EngineThinking
                thinking={session.thinking}
                depth={engine.analysis.fen === core.fen ? engine.analysis.depth : 0}
              />
            )}
            {tab === "moves" && explorer.nextMoves}
          </>
        ),
      }}
    />
  );
}

export default OpeningsBoard;
