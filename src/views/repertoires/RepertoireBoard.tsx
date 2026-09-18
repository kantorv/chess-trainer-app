import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Arrow, ChessboardOptions } from "react-chessboard";

import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../lib/analysisSettings";
import { emptyTree, findNode, type VariationNode } from "../../lib/gameTree";
import {
  isMultiGameRepertoire,
  readRepertoireText,
  repertoireTreeOf,
  type RepertoireReading,
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
import RepertoireMergeSplit from "./RepertoireMergeSplit";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **A repertoire, on the board** (`/repertoires/<id>`) — the first shipped
 * screen composed from the unified board core
 * ([`.claude/rules/chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md))
 * rather than a `/dev/*` one (CTA-61).
 *
 * It is Repertoire v2 (`views/dev/repertoire/RepertoireV2.tsx`) over the
 * reader's own record: one game — a mainline with its side lines, the rule
 * `lib/savedRepertoires.ts` sets — on one board. The eval bar, the captured
 * strips, the pinned best-variations block, the tab strip and the board
 * controls are all the core's; this file supplies slots.
 *
 * Two tabs: **Moves · Engine**. The merged move list (CTA-53) hangs every side
 * line under the move it answers, so a flowing Tree tab would draw the same
 * tree twice, and a Lines tab has nothing to list once a repertoire is one
 * game.
 *
 * A record saved **before** the one-game rule, still holding several games,
 * does not open on a board at all: it opens on the merge-or-split choice
 * (`RepertoireMergeSplit`), and what the reader picks takes its place.
 *
 * | Capability | Taken | Because |
 * | --- | --- | --- |
 * | Base | `useBoardCore({ orientation })` | facing the repertoire's main color (its settings); both colours move from any node: a reader tries a move against the file |
 * | Engine | switch, **no reply** | a repertoire viewer never moves a piece by itself |
 * | Book | header line only | the file *is* the book here |
 * | Autosave | ❌ | reading is not writing: the record is the file, and trying a move must not rewrite it |
 *
 * ## The tree is parsed after a paint
 *
 * Behind a `setTimeout(0)`, because the 9,146-node Nimzo-Indian example takes
 * about a second of main thread even after `parsePgnTree` stopped copying the
 * tree per move. The board says it is reading rather than the tab freezing on
 * arrival.
 */

/** The tabs that stay mounted once opened — see `BoardPanel`'s `keepMounted`. */
const KEEP_MOUNTED = ["moves"] as const;

/** Whether the repertoire's tree is on the board yet. */
type Shown = "loading" | "ready" | "unreadable";

function RepertoireBoard() {
  const { id } = useParams();
  const repertoires = useSavedRepertoires();
  const saved = repertoires.find((row) => row.id === id);

  if (saved === undefined) return <MissingRepertoire />;
  // Keyed, so opening another repertoire is a fresh screen rather than this
  // one's state carried over — the "every arrival is initial state" rule.
  if (isMultiGameRepertoire(saved)) {
    return <MultiGameRepertoire key={saved.id} saved={saved} />;
  }
  return <RepertoireBoardScreen key={saved.id} saved={saved} />;
}

/**
 * A record from before the one-game rule: read (after a paint — the Alapin
 * example is 310 games) and offered the merge-or-split choice in its place.
 */
function MultiGameRepertoire({ saved }: { saved: SavedRepertoire }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reading, setReading] = useState<RepertoireReading | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setReading(readRepertoireText(saved.pgn)), 0);
    return () => clearTimeout(timer);
  }, [saved.pgn]);

  return (
    <Box data-testid="repertoire-board-multi" sx={{ height: "100%", overflowY: "auto" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {saved.name || t("repertoires.untitled")}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("repertoires.choice.legacy")}
      </Typography>
      {reading === null ? (
        <CircularProgress size={16} data-testid="repertoire-board-reading" />
      ) : reading.ok && reading.games.length > 1 ? (
        <RepertoireMergeSplit
          reading={reading}
          typedName={saved.name}
          replacing={saved.id}
          settings={saved.settings}
          onDone={(path) => navigate(path)}
        />
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("repertoires.detail.unreadable")}
        </Typography>
      )}
    </Box>
  );
}

/** An id this browser does not hold — the board's miss, and the play screen's. */
export function MissingRepertoire() {
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

  // Facing the side the repertoire is played from (its settings) — read once,
  // like every arrival: coming back from the settings screen remounts this.
  const core = useBoardCore({ orientation: saved.settings.color });
  const { loadTree } = core;

  const [shown, setShown] = useState<Shown>("loading");

  /*
    The parse, behind a timer — see the header note. Only the timer's own
    callback writes state, so the effect starts one without setting state
    from the effect itself. `load` is also the Engine tab's "clear": it puts
    the repertoire back as the record has it, dropping moves the reader tried.
  */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const tree = repertoireTreeOf(saved);
      loadTree(tree ?? emptyTree());
      setShown(tree === undefined ? "unreadable" : "ready");
    }, 0);
  }, [loadTree, saved]);

  useEffect(() => {
    load();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [load]);

  const [settings, setSettings] = useState<AnalysisSettings>(
    DEFAULT_ANALYSIS_SETTINGS,
  );
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);
  const [tab, setTab] = useState("moves");
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
    shown === "ready" ? undefined : (
      <Box
        data-testid={`repertoire-board-line-${shown}`}
        sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, color: "text.secondary" }}
      >
        {shown === "loading" && <CircularProgress size={16} />}
        <Typography variant="body2">
          {t(
            shown === "loading"
              ? "repertoires.detail.loading"
              : "repertoires.detail.unreadable",
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
              {/* The reader's own notes on it (its settings): one line here,
                  the whole of it on hover. */}
              {saved.settings.description !== "" && (
                <Typography
                  variant="caption"
                  data-testid="repertoire-board-description"
                  dir="auto"
                  title={saved.settings.description}
                  sx={{ color: "text.secondary", display: "block" }}
                  noWrap
                >
                  {saved.settings.description}
                </Typography>
              )}
              <CurrentOpening fen={core.fen} testId="repertoire-board-opening" />
            </Box>
            {/* In the header, so it shows whichever tab is open. */}
            {shown === "loading" && (
              <CircularProgress
                size={16}
                data-testid="repertoire-board-reading"
                aria-label={t("repertoires.detail.loading")}
                sx={{ flexShrink: 0 }}
              />
            )}
            {/* Drill it against the trainer (CTA-63). */}
            <Tooltip title={t("repertoires.play.open")}>
              <IconButton
                size="small"
                component={RouterLink}
                to={`/repertoires/${encodeURIComponent(saved.id)}/play`}
                aria-label={t("repertoires.play.open")}
                data-testid="repertoire-board-play"
                sx={{ flexShrink: 0 }}
              >
                <PlayArrowRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("repertoires.settings.open")}>
              <IconButton
                size="small"
                component={RouterLink}
                to={`/repertoires/${encodeURIComponent(saved.id)}/settings`}
                state={{ from: `/repertoires/${encodeURIComponent(saved.id)}` }}
                aria-label={t("repertoires.settings.open")}
                data-testid="repertoire-board-settings"
                sx={{ flexShrink: 0 }}
              >
                <SettingsRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
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
        // The move list of a 9,000-node tree takes most of a second to mount;
        // mounted once, switching Moves ↔ Engine is free.
        keepMounted: KEEP_MOUNTED,
        tabs: [
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
                // "Clear" puts the repertoire back as the record has it — the
                // moves a reader tried against it go.
                onClear={load}
              />
            ),
          },
        ],
        footer:
          tab === "moves" && shown === "ready" ? (
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
