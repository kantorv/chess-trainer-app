import { useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Arrow, ChessboardOptions } from "react-chessboard";

import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../../lib/analysisSettings";
import { initialPlyOf, parseMoveParam } from "../../../lib/gameNavigation";
import { resolveGameReference } from "../../../lib/gameReference";
import { emptyTree, findNode, type VariationNode } from "../../../lib/gameTree";
import { localizedText } from "../../../lib/libraryCatalog";
import { parsePgnTree } from "../../../lib/pgn";
import { pgnCatalog, pgnKinds } from "../../../lib/pgnCatalog";
import { pgnKindOf } from "../../../lib/pgnKind";
import { asAppLanguage } from "../../../i18n";
import AnalysisSettingsPanel from "../../tools/analysis/AnalysisSettings";
import NextMovesBar from "../../tools/analysis/NextMovesBar";
import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  NEXT_MOVE_ARROW_COLOR,
} from "../../tools/analysis/nextMoveArrows";
import VariationTree from "../../tools/analysis/VariationTree";
import CurrentOpening from "../../shared/CurrentOpening";
import GameInfo from "../../shared/GameInfo";
import BoardShell from "../core/BoardShell";
import TreeMoveList from "../core/TreeMoveList";
import { useBoardCore } from "../core/useBoardCore";
import { useEngineModule } from "../core/useEngineModule";

/**
 * **Repertoire v2** (`/dev/repertoire`) — a repertoire line out of the shipped
 * `.pgn` catalog, replayed on a board composed from the unified core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md) §4).
 *
 * It is **standalone**: `views/library/LibraryVariationDetail.tsx` is its
 * eventual swap target and is not touched here. What it reads is a
 * `?game=library/<category path>/<id>` reference — the ordinary `?game=`
 * hand-off, resolved through the same `resolveGameReference` every destination
 * uses — re-parsed with `parsePgnTree`, because a repertoire's `( … )` side
 * lines *are* the content and `chess.js` `loadPgn` discards them.
 *
 * With no reference it falls back to **the first game the shipped catalog
 * has**, so the screen is never a blank board in dev; a reference that resolves
 * to nothing and an empty catalog both leave it empty with a line saying so.
 *
 * ## What it gained
 *
 * The shipped viewer is 367 lines with no hook of its own, no engine, no evals
 * and none of CTA-51/53/54/55. This one has all of them by composition, and
 * keeps the two things that are the viewer's own: the **flowing variation tree**
 * (a tab, because a flowing line is what a repertoire is read as) and the
 * game's **tag pairs** (the Info tab, the shared `GameInfo`).
 *
 * It composes **no persistence**: a shipped `.pgn` is not the reader's own
 * work, so there is nothing here worth writing down.
 */
function RepertoireV2() {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);
  const [searchParams] = useSearchParams();

  /*
    The line. The `?game=` reference first; failing that, the first line of a
    folder the catalog actually labelled `repertoire`, so a developer opening
    the route sees a real repertoire — branches and all — rather than an empty
    board or, worse, a study chapter that happens to sort first and would make
    the screen look like it had lost its side lines. Only if the catalog ships
    no repertoire at all does it fall back to any game.
  */
  const item = useMemo(() => {
    const referenced = resolveGameReference(searchParams.get("game"));
    if (referenced !== undefined) return referenced;

    const games = pgnCatalog.items.filter(
      (candidate) => candidate.kind === "game",
    );
    return (
      games.find(
        (candidate) => pgnKindOf(candidate.category, pgnKinds) === "repertoire",
      ) ?? games[0]
    );
  }, [searchParams]);

  const tree = useMemo(() => {
    if (item === undefined) return emptyTree();
    try {
      return parsePgnTree(item.pgn);
    } catch {
      // A line that will not parse as a tree is an empty board, not a crash —
      // the "ignore what does not resolve" rule every arrival keeps.
      return emptyTree();
    }
  }, [item]);

  /* The `?move=` that may ride beside it, then the game's own `StartPly` tag. */
  const initialPly = useMemo(
    () =>
      parseMoveParam(searchParams.get("move")) ??
      (item === undefined ? undefined : initialPlyOf(item.game)),
    [searchParams, item],
  );

  const core = useBoardCore({ tree, ply: initialPly });

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
    // `setSettings` is stable, but naming it is what lets the React Compiler
    // keep this memoisation rather than skipping the component.
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
    // No `onBestMove`: a repertoire viewer never moves a piece by itself.
  });

  const continuations = useMemo(
    () =>
      core.nodeId === null
        ? core.tree.moves
        : (findNode(core.tree, core.nodeId)?.children ?? []),
    [core.tree, core.nodeId],
  );

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

  return (
    <BoardShell
      id="dev-repertoire"
      core={core}
      score={topLine?.score ?? null}
      showEvalBar={showEvalBar}
      boardOptions={boardOptions}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                data-testid="dev-repertoire-source"
                sx={{ color: "text.secondary", display: "block" }}
              >
                {item === undefined
                  ? t("dev.repertoire.missing")
                  : `${t("dev.repertoire.source")} — ${localizedText(item.name, language)}`}
              </Typography>
              <CurrentOpening
                fen={core.fen}
                testId="dev-repertoire-current-opening"
              />
            </Box>
            <FormControlLabel
              sx={{ flexShrink: 0 }}
              control={
                <Switch
                  checked={engineOn}
                  data-testid="dev-repertoire-setting-engine"
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
            id: "moves",
            label: t("dev.tabs.moves"),
            content: (
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
            label: t("dev.tabs.engine"),
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
                onClear={core.reset}
              />
            ),
          },
          {
            id: "tree",
            label: t("dev.tabs.tree"),
            content: (
              <VariationTree
                tree={core.tree}
                currentId={core.nodeId}
                onSelectNode={core.goToNode}
              />
            ),
          },
          {
            id: "info",
            label: t("dev.tabs.info"),
            content:
              item === undefined ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {t("dev.repertoire.missing")}
                </Typography>
              ) : (
                <GameInfo game={item.game} />
              ),
          },
        ],
        footer:
          tab === "moves" ? (
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

export default RepertoireV2;
