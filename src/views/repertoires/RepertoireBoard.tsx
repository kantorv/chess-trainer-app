import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Arrow, ChessboardOptions } from "react-chessboard";

import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../lib/analysisSettings";
import { emptyTree, findNode, type VariationNode } from "../../lib/gameTree";
import {
  repertoireLinesOf,
  repertoireLineTree,
  type RepertoireLine,
  type SavedRepertoire,
} from "../../lib/savedRepertoires";
import BoardShell from "../dev/core/BoardShell";
import TreeMoveList from "../dev/core/TreeMoveList";
import { useBoardCore } from "../dev/core/useBoardCore";
import { useEngineModule } from "../dev/core/useEngineModule";
import CurrentOpening from "../shared/CurrentOpening";
import AnalysisSettingsPanel from "../tools/analysis/AnalysisSettings";
import NextMovesBar from "../tools/analysis/NextMovesBar";
import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  NEXT_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import VariationTree from "../tools/analysis/VariationTree";
import RepertoireLines from "./RepertoireLines";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **A repertoire, on the board** (`/repertoires/<id>`) — the first shipped
 * screen composed from the unified board core
 * ([`.claude/rules/chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md))
 * rather than a `/dev/*` one (CTA-61).
 *
 * It is Repertoire v2 (`views/dev/repertoire/RepertoireV2.tsx`) with the one
 * thing that screen could not have: **the repertoire's other lines**, in a
 * Lines tab, each one click from the board. Picking a line loads its tree into
 * the *same* board through the base's `loadTree` — no route change, no second
 * navigation level, and the engine worker is not rebuilt between lines. The
 * eval bar, the captured strips, the pinned best-variations block, the tab
 * strip and the board controls are all the core's; this file supplies slots.
 *
 * | Capability | Taken | Because |
 * | --- | --- | --- |
 * | Base | `useBoardCore()` | both colours move from any node: a reader tries a move against the file |
 * | Engine | switch, **no reply** | a repertoire viewer never moves a piece by itself |
 * | Book | header line only | the file *is* the book here |
 * | Autosave | ❌ | reading is not writing: the record is the file, and trying a move must not rewrite it |
 *
 * ## A line is parsed when it is picked, after a paint
 *
 * The Lines tab is read off the tags (`repertoireLinesOf`), so 310 lines list
 * without a parse. A line's tree is parsed on demand — and behind a
 * `setTimeout(0)`, because the 9,146-node Nimzo-Indian line takes about a
 * second of main thread even after `parsePgnTree` stopped copying the tree per
 * move. The board says it is reading rather than the tab freezing on arrival.
 */

/** Which line is on the board, and whether it has been read yet. */
type Shown = { index: number; state: "loading" | "ready" | "unreadable" };

function RepertoireBoard() {
  const { id } = useParams();
  const repertoires = useSavedRepertoires();
  const saved = repertoires.find((row) => row.id === id);

  if (saved === undefined) return <MissingRepertoire />;
  // Keyed, so opening another repertoire is a fresh board rather than this
  // one's state carried over — the "every arrival is initial state" rule.
  return <RepertoireBoardScreen key={saved.id} saved={saved} />;
}

function MissingRepertoire() {
  const { t } = useTranslation();
  return (
    <Box data-testid="repertoire-board-missing" sx={{ py: 4, textAlign: "center" }}>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("repertoires.detail.missing")}
      </Typography>
      <Button component={RouterLink} to="/repertoires" variant="outlined" size="small">
        {t("repertoires.detail.back")}
      </Button>
    </Box>
  );
}

function RepertoireBoardScreen({ saved }: { saved: SavedRepertoire }) {
  const { t } = useTranslation();

  const chapters = useMemo(() => repertoireLinesOf(saved.pgn), [saved.pgn]);
  const lines = useMemo(
    () => chapters.flatMap((chapter) => chapter.lines),
    [chapters],
  );
  const firstLine = lines.at(0);

  const core = useBoardCore();
  const { loadTree } = core;

  const [shown, setShown] = useState<Shown>({
    index: firstLine?.index ?? 0,
    state: firstLine === undefined ? "unreadable" : "loading",
  });
  const shownLine = lines.find((line) => line.index === shown.index);

  /*
    The parse, behind a timer — see the header note. Only the timer's own
    callback writes state, so an effect can start one without setting state
    from the effect itself; and a newer pick cancels an older one still
    waiting, so a reader clicking down the list does not parse every line on
    the way past.
  */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(
    (line: RepertoireLine) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const tree = repertoireLineTree(line);
        loadTree(tree ?? emptyTree());
        setShown({ index: line.index, state: tree === undefined ? "unreadable" : "ready" });
      }, 0);
    },
    [loadTree],
  );

  useEffect(() => {
    if (firstLine !== undefined) load(firstLine);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [firstLine, load]);

  const selectLine = (index: number) => {
    const line = lines.find((candidate) => candidate.index === index);
    if (line === undefined) return;
    setShown({ index, state: "loading" });
    load(line);
  };

  const [settings, setSettings] = useState<AnalysisSettings>(
    DEFAULT_ANALYSIS_SETTINGS,
  );
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);
  const [tab, setTab] = useState("lines");
  const [hoveredNextMove, setHoveredNextMove] = useState<VariationNode | null>(
    null,
  );

  const onUciOptionsReady = useCallback(
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => {
        const multiPv = clamped[ANALYSIS_UCI_OPTION.multiPv] ?? current.multiPv;
        return multiPv === current.multiPv ? current : { ...current, multiPv };
      }),
    [setSettings],
  );

  const engine = useEngineModule({
    enabled: engineOn,
    fen: core.fen,
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    uciOptions: useMemo(
      () => ({ [ANALYSIS_UCI_OPTION.multiPv]: settings.multiPv }),
      [settings.multiPv],
    ),
    onUciOptionsReady,
    // No `onBestMove`: a repertoire is read, never played against.
  });

  const continuations = useMemo(
    () =>
      core.nodeId === null
        ? core.tree.moves
        : (findNode(core.tree, core.nodeId)?.children ?? []),
    [core.tree, core.nodeId],
  );

  // The next-move arrows are the Moves tab's, as on the other tree boards
  // (CTA-54): only where the line actually branches, and only while that tab
  // — the one with the bar they point along — is showing.
  const arrows: Arrow[] =
    tab === "moves" && continuations.length >= 2
      ? continuations.map((node) => ({
          startSquare: node.from,
          endSquare: node.to,
          color:
            hoveredNextMove?.id === node.id
              ? HOVERED_NEXT_MOVE_ARROW_COLOR
              : NEXT_MOVE_ARROW_COLOR,
        }))
      : [];

  const boardOptions: ChessboardOptions = { arrows };
  const topLine = engine.analysis.lines.find((line) => line !== undefined);

  /** A tab body while its line is not on the board yet — or will not be. */
  const notReady =
    shown.state === "ready" ? undefined : (
      <Box
        data-testid={`repertoire-board-line-${shown.state}`}
        sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, color: "text.secondary" }}
      >
        {shown.state === "loading" && <CircularProgress size={16} />}
        <Typography variant="body2">
          {t(
            shown.state === "loading"
              ? "repertoires.detail.loading"
              : "repertoires.detail.unreadableLine",
          )}
        </Typography>
      </Box>
    );

  return (
    <BoardShell
      id="repertoire-board"
      core={core}
      score={topLine?.score ?? null}
      showEvalBar={showEvalBar}
      boardOptions={boardOptions}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                data-testid="repertoire-board-name"
                sx={{ fontWeight: 700, lineHeight: 1.3 }}
                noWrap
              >
                {saved.name || t("repertoires.untitled")}
              </Typography>
              <Typography
                variant="caption"
                data-testid="repertoire-board-line"
                dir="auto"
                sx={{ color: "text.secondary", display: "block" }}
                noWrap
              >
                {shownLine?.name ?? ""}
              </Typography>
              <CurrentOpening fen={core.fen} testId="repertoire-board-opening" />
            </Box>
            {/* In the header, so it shows whichever tab is open — the Lines tab
                a reader starts on has no body of its own to say it. */}
            {shown.state === "loading" && (
              <CircularProgress
                size={16}
                data-testid="repertoire-board-reading"
                aria-label={t("repertoires.detail.loading")}
                sx={{ flexShrink: 0 }}
              />
            )}
            <FormControlLabel
              sx={{ flexShrink: 0 }}
              control={
                <Switch
                  checked={engineOn}
                  data-testid="repertoire-board-setting-engine"
                  onChange={(event) => setEngineOn(event.target.checked)}
                />
              }
              label={t("analysis.settings.engineOn")}
            />
          </>
        ),
        analysis: engine.analysis,
        requestedMultiPv: settings.multiPv,
        engineOn,
        onPlayVariation: core.playVariation,
        activeTab: tab,
        onTabChange: setTab,
        tabs: [
          {
            id: "lines",
            label: t("repertoires.detail.tabs.lines"),
            content: (
              <RepertoireLines
                chapters={chapters}
                selected={shown.index}
                onSelect={selectLine}
              />
            ),
          },
          {
            id: "moves",
            label: t("repertoires.detail.tabs.moves"),
            content: notReady ?? (
              <TreeMoveList
                tree={core.tree}
                mainlineNodes={core.mainlineNodes}
                nodeId={core.nodeId}
                onSelectNode={core.goToNode}
                evalsByFen={engine.evalsByFen}
              />
            ),
          },
          {
            id: "tree",
            label: t("repertoires.detail.tabs.tree"),
            content: notReady ?? (
              <VariationTree
                tree={core.tree}
                currentId={core.nodeId}
                onSelectNode={core.goToNode}
              />
            ),
          },
          {
            id: "engine",
            label: t("repertoires.detail.tabs.engine"),
            content: (
              <AnalysisSettingsPanel
                settings={settings}
                onChange={(patch: Partial<AnalysisSettings>) =>
                  setSettings((current) => ({ ...current, ...patch }))
                }
                engineOptions={engine.engineOptions}
                engineOn={engineOn}
                showEvalBar={showEvalBar}
                onShowEvalBarChange={setShowEvalBar}
                // "Clear" puts the line back as the file has it — the moves a
                // reader tried against it go, the line does not.
                onClear={() => selectLine(shown.index)}
              />
            ),
          },
        ],
        footer:
          tab === "moves" && shown.state === "ready" ? (
            <NextMovesBar
              nodes={continuations}
              onSelect={core.goToNode}
              onHover={setHoveredNextMove}
            />
          ) : undefined,
      }}
    />
  );
}

export default RepertoireBoard;
