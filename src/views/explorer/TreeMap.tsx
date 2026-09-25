import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AbcRoundedIcon from "@mui/icons-material/AbcRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FitScreenRoundedIcon from "@mui/icons-material/FitScreenRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import type { SxProps, Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { findNode, pathTo, type GameTree } from "../../lib/gameTree";
import { isMoveMark, nagGlyph, nagsInPrintOrder, nagTone } from "../../lib/moveAnnotations";
import { maskNodeSan, type PieceMask } from "../../lib/pieceMask";
import { nagToneStyles } from "../shared/nagToneSx";
import MoveContextMenu, { type MoveMenuTarget } from "./MoveContextMenu";
import { menuAnchorOf, type ContextMenuNodeHandler } from "../shared/moveContextMenu";
import {
  MAP_DX,
  MAP_DY,
  MAP_INITIAL_K,
  MAP_LABEL_FONT,
  MAP_LABEL_MIN_K,
  MAP_PAD,
  centerView,
  fitView,
  mapDots,
  mapEdgePaths,
  mapLabelsIn,
  mapLayoutOf,
  mapPathDots,
  mapPathTo,
  mapPixel,
  visibleRect,
  zoomViewAt,
  type MapCoverage,
  type MapLayout,
  type MapView,
} from "../../lib/treeMap";

/**
 * **The tree map** (CTA-63; was `views/repertoires/RepertoireMap.tsx` until
 * CTA-72, when it became a part of the shared variations explorer) — a game
 * tree drawn as a tree, so the reader sees where they are in it and how much
 * is left: the repertoire player's Map tab, and Backtracking's with its
 * coverage. The layout is `lib/treeMap.ts`; this draws it. Everything a
 * screen knows — which tree, whose coverage, whether a dot is a link — comes
 * in as a prop; `useVariationsExplorer` is what usually passes them.
 *
 * ## One viewport, in the tab and full screen
 *
 * The drawing is shown through one interactive viewport ({@link MapViewport}),
 * rendered twice from the same memoised path strings: filling the tab, and in
 * a full-screen MUI `Dialog` opened from it, where the panel's width no longer
 * hides the detail. Both behave alike:
 *
 * - the **wheel zooms about the pointer** and a **drag pans** (`MapView`,
 *   `zoomViewAt` — the arithmetic is pure and tested), with buttons to zoom,
 *   fit the whole tree and go back to the reader's position;
 * - they open at a readable scale (`MAP_INITIAL_K`) centred on the reader, and
 *   **follow** them: when play moves the marker out of view, the view
 *   re-centres on it, keeping its zoom;
 * - **Show moves** — on by default, one setting for both — writes each move's
 *   SAN above its dot, in the drawing's units so labels scale with the view
 *   and never overlap (not drawn below `MAP_LABEL_MIN_K`, where a hint says
 *   to zoom in), and only for the dots on screen (`mapLabelsIn`), so a huge
 *   tree costs what is visible;
 * - in the player (`onSelectNode`), a written move is a **link** to its
 *   position — full screen, the dialog closes on it. A drag that starts on a
 *   dot still pans: the pointer is captured, and the click refused, only once
 *   it has travelled a few pixels.
 * - in the player (`onEditTree`, CTA-67), a right-click on a written move
 *   opens the variations explorer's move menu (`MoveContextMenu`) at the
 *   pointer — promote, make main line, delete from here, copy the line's PGN.
 *   One menu serves both viewports and renders above the full-screen dialog,
 *   which an edit leaves open: the edited tree is what `tree` becomes,
 *   so the map redraws from it at once, and the view keeps its zoom and pan
 *   (it follows the marker only when the marker leaves it — the rule play
 *   already keeps). Only a move is bound; elsewhere the right-click is the
 *   browser's, and a game passes nothing.
 *
 * Each viewport measures itself (a `ResizeObserver`, a fallback size where
 * there is none), so the labels culled and the follow are the viewport's own.
 *
 * ## What is drawn
 *
 * Every move is a dot **in the colour of the side that made it**, ringed so it
 * shows on either theme, larger at a line's end; the way from the start to the
 * position on screen is highlighted, its dots ringed in the primary colour,
 * with a marker on the position. The lines keep their width at every scale
 * (`non-scaling-stroke`); the dots and labels scale with the drawing.
 *
 * **Coverage is optional**: Backtracking passes it — covered lines green, a
 * progress bar — and the player passes none. **What it maps is the screen's**:
 * the player hands it the session's tree with `addedIds`, so a move played off
 * the file appears at once, in the move list's extension colour; Backtracking
 * hands it the repertoire its coverage is defined on.
 *
 * The drawing is a diagram, not text, so it is pinned left-to-right (`dir`)
 * the way the move numbers are. Its colours are theme tokens, but for the
 * dots' own white and black, which name a side.
 */

const stroke = (pick: (palette: Theme["palette"]) => string) => ({
  stroke: (theme: Theme) => pick((theme.vars ?? theme).palette as Theme["palette"]),
});

/** The drawing's look, for every `<svg>` it is drawn in. */
const drawingSx: SxProps<Theme> = {
  display: "block",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "& .map-open": stroke((palette) => palette.text.disabled),
  "& .map-covered": stroke((palette) => palette.success.main),
  "& .map-trail": stroke((palette) => palette.primary.main),
  // The reader's additions — the move list's extension colour.
  "& .map-added": stroke((palette) => palette.success.main),
  "& .map-label": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.text.primary,
    // A halo in the paper colour, painted under the glyphs, so a label stays
    // legible where it crosses a line.
    ...stroke((palette) => palette.background.paper),
    strokeWidth: 1,
    paintOrder: "stroke",
  },
  // A move mark's lichess colour (CTA-97); evaluations and features stay the label's.
  "& .map-nag": (theme: Theme) => nagToneStyles(theme, "fill", "&"),
  "& .map-label-trail": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.primary.main,
    fontWeight: 700,
  },
  // Chess colours, not theme ones: a dot says which side moved. The ring under
  // each is a theme token, so a white dot shows on paper and a black one on
  // the dark theme's.
  "& .map-dot-ring": stroke((palette) => palette.text.secondary),
  "& .map-dot-white": { stroke: "#ffffff" },
  "& .map-dot-black": { stroke: "#000000" },
  "& .map-hit": { cursor: "pointer" },
  "& .map-hit:hover .map-label": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.primary.main,
  },
  "& .map-here": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.primary.main,
    ...stroke((palette) => palette.background.paper),
  },
};

/** No game: every line open, so every line is drawn in one neutral colour. */
const NO_COVERAGE: MapCoverage = { total: 0, under: () => 1 };

/** How far a pointer may travel and still be a click rather than a drag. */
const CLICK_SLOP_PX = 4;
/** How close to the viewport's edge the marker may come before the view follows it. */
const FOLLOW_EDGE_PX = 24;
/** How much one wheel notch zooms. */
const WHEEL_ZOOM = 0.0015;
/** How much a zoom button zooms. */
const BUTTON_ZOOM = 1.25;
/** The full-screen toolbar's height, for the view before the dialog is measured. */
const TOOLBAR_ESTIMATE_PX = 64;

type Size = { width: number; height: number };

type Drawing = {
  layout: MapLayout;
  /** The moves on the reader's way, for the labels to pick out. */
  trailIds: ReadonlySet<string>;
  edges: { covered: string; open: string; added: string };
  dots: { white: string; black: string; whiteEnds: string; blackEnds: string; added: string };
  trail: { edges: string; dots: string };
  here: { px: number; py: number };
  width: number;
  height: number;
  /** A move's label — its SAN, or a masked board's coordinates (CTA-79). */
  labelOf: (id: string, san: string) => string;
};

/** The drawing itself — the same layers in every viewport. */
function MapLayers({
  testId,
  drawing,
  nodeId,
}: {
  testId: string;
  drawing: Drawing;
  nodeId: string | null;
}) {
  const { t } = useTranslation();
  const { edges, dots, trail, here } = drawing;
  return (
    <>
      {/* Lines keep their width at any scale; the dots scale with the drawing. */}
      <path className="map-open" d={edges.open} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path
        className="map-covered"
        d={edges.covered}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        data-testid={`${testId}-covered-lines`}
      />
      <path
        className="map-added"
        d={edges.added}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        data-testid={`${testId}-added-lines`}
      />
      <path
        className="map-trail"
        d={trail.edges}
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        data-testid={`${testId}-trail`}
      />
      {/* The way played: a primary ring, under the dots it rings. */}
      <path className="map-trail" d={trail.dots} strokeWidth={8} data-testid={`${testId}-trail-moves`} />
      {/* Each dot: a thin ring, then the side's colour over it. */}
      <path className="map-dot-ring" d={dots.white + dots.black} strokeWidth={5.5} />
      <path className="map-dot-ring" d={dots.whiteEnds + dots.blackEnds} strokeWidth={7.5} />
      {/* An added move's ring, in the added colour, over its plain one. */}
      <path className="map-added" d={dots.added} strokeWidth={7} data-testid={`${testId}-added-moves`} />
      <path className="map-dot-white" d={dots.white} strokeWidth={4} data-testid={`${testId}-white-moves`} />
      <path className="map-dot-black" d={dots.black} strokeWidth={4} data-testid={`${testId}-black-moves`} />
      <path className="map-dot-white" d={dots.whiteEnds} strokeWidth={6} data-testid={`${testId}-white-ends`} />
      <path className="map-dot-black" d={dots.blackEnds} strokeWidth={6} data-testid={`${testId}-black-ends`} />
      <circle
        className="map-here"
        cx={here.px}
        cy={here.py}
        r={5}
        strokeWidth={1.5}
        data-testid={`${testId}-here`}
        data-node-id={nodeId ?? "start"}
      >
        <title>{t("treeMap.here")}</title>
      </circle>
    </>
  );
}

/** One icon button with its tooltip — the map's toolbars are rows of these. */
function MapButton({
  label,
  testId,
  onClick,
  pressed,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  /** A toggle's state; absent for a plain button. */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        color={pressed ? "primary" : "default"}
        data-testid={testId}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

/**
 * A box's size, as a `ResizeObserver` reports it — the fallback until it
 * does, and where there is none (jsdom). A hidden box (a kept tab, not
 * showing) reports nothing and keeps the size it had.
 */
const useBoxSize = (fallback: () => Size) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>(fallback);
  useEffect(() => {
    const box = ref.current;
    if (box === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
};

function TreeMap({
  testId,
  tree,
  coverage,
  nodeId,
  onSelectNode,
  onEditTree,
  playChances,
  addedIds,
  mask,
}: {
  testId: string;
  /** The tree to draw — the session's in the player, the repertoire in a game. */
  tree: GameTree;
  /** A game's coverage — Backtracking's; none draws every line alike. */
  coverage?: MapCoverage;
  /** Where the reader is, on `tree`; `null` is the start position. */
  nodeId: string | null;
  /** Go to a position — the player's; present, a written move is a link. */
  onSelectNode?: (id: string) => void;
  /** Opt-in: the move menu on a written move, and where its edits go — the player's. */
  onEditTree?: (next: GameTree) => void;
  /** Whether that menu offers *Play chances…* — `MoveContextMenu`'s default when absent. */
  playChances?: boolean;
  /** The moves in `tree` the reader added this session — the player's. */
  addedIds?: ReadonlySet<string>;
  /**
   * A masked board's costume (CTA-79): a label whose piece is hidden prints
   * as coordinates. Absent — every board but Masked Pieces — the SAN prints.
   */
  mask?: PieceMask;
}) {
  const { t } = useTranslation();
  const [fullScreen, setFullScreen] = useState(false);
  // One setting for both viewports; on by default.
  const [showMoves, setShowMoves] = useState(true);
  // The move menu — one for both viewports, above either.
  const [menu, setMenu] = useState<MoveMenuTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu: ContextMenuNodeHandler | undefined =
    onEditTree === undefined
      ? undefined
      : (id, anchor) => {
          setMenu({ nodeId: id, anchor });
          setMenuOpen(true);
        };

  const layout = useMemo(() => mapLayoutOf(tree), [tree]);
  const edges = useMemo(
    () => mapEdgePaths(layout, coverage ?? NO_COVERAGE, addedIds),
    [layout, coverage, addedIds],
  );
  const dots = useMemo(() => mapDots(layout, addedIds), [layout, addedIds]);
  const trail = useMemo(() => {
    const path = pathTo(tree, nodeId);
    return {
      edges: mapPathTo(layout, path),
      dots: mapPathDots(layout, path),
      ids: new Set(path.map((node) => node.id)),
    };
  }, [layout, tree, nodeId]);

  const drawing: Drawing = {
    layout,
    trailIds: trail.ids,
    edges,
    dots,
    trail,
    here: mapPixel(nodeId === null ? layout.root : (layout.points.get(nodeId) ?? layout.root)),
    width: MAP_PAD * 2 + layout.columns * MAP_DX,
    height: MAP_PAD * 2 + (layout.rows - 1) * MAP_DY,
    labelOf: (id, san) => {
      if (mask === undefined) return san;
      const node = findNode(tree, id);
      return node === null ? san : maskNodeSan(mask, node);
    },
  };

  const covered = coverage === undefined ? 0 : coverage.total - coverage.under(null);
  const left = coverage === undefined ? 0 : coverage.under(null);

  /** The tree's size — what the header says without a game — and what was added. */
  const added = addedIds?.size ?? 0;
  const size = [
    t("treeMap.size", {
      lines: t("treeMap.lines", {
        count: layout.order.length === 0 ? 0 : layout.rows,
      }),
      moves: t("treeMap.moves", { count: layout.order.length }),
    }),
    ...(added > 0 ? [t("treeMap.added", { count: added })] : []),
  ].join(" · ");

  const summary =
    coverage === undefined
      ? size
      : left === 0
        ? t("treeMap.done")
        : t("treeMap.left", { count: left });

  return (
    <Box
      data-testid={testId}
      sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1, height: "100%", minHeight: 0 }}
    >
      <Box sx={{ flexShrink: 0 }}>
        {coverage !== undefined && (
          <>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {t("treeMap.covered", { covered, total: coverage.total })}
            </Typography>
            <LinearProgress
              variant="determinate"
              color="success"
              value={coverage.total === 0 ? 0 : (covered / coverage.total) * 100}
              data-testid={`${testId}-progress`}
              sx={{ my: 0.5, height: 6, borderRadius: 3 }}
            />
          </>
        )}
        <Typography
          variant="caption"
          component="p"
          sx={{ color: "text.secondary" }}
          data-testid={`${testId}-left`}
        >
          {summary}
        </Typography>
      </Box>

      <MapViewport
        testId={testId}
        drawing={drawing}
        nodeId={nodeId}
        showMoves={showMoves}
        onShowMovesChange={setShowMoves}
        onSelectNode={onSelectNode}
        onContextMenuNode={openMenu}
        fallbackSize={() => ({ width: 320, height: 360 })}
        extraButtons={
          <MapButton
            label={t("treeMap.fullScreen")}
            testId={`${testId}-fullscreen`}
            onClick={() => setFullScreen(true)}
          >
            <FullscreenRoundedIcon fontSize="small" />
          </MapButton>
        }
        sx={{ flex: 1, minHeight: 240 }}
      />

      <Dialog
        fullScreen
        open={fullScreen}
        onClose={() => setFullScreen(false)}
        aria-labelledby={`${testId}-dialog-title`}
        data-testid={`${testId}-dialog`}
      >
        {fullScreen && (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 2,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                flexShrink: 0,
              }}
            >
              <Typography
                variant="h6"
                component="h2"
                id={`${testId}-dialog-title`}
                sx={{ fontWeight: 700, marginInlineEnd: 1 }}
              >
                {t("treeMap.title")}
              </Typography>
              <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                {coverage !== undefined && (
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {t("treeMap.covered", { covered, total: coverage.total })}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {summary}
                </Typography>
              </Box>
              <MapButton
                label={t("treeMap.close")}
                testId={`${testId}-dialog-close`}
                onClick={() => setFullScreen(false)}
              >
                <CloseRoundedIcon />
              </MapButton>
            </Box>
            <MapViewport
              testId={`${testId}-dialog`}
              drawing={drawing}
              nodeId={nodeId}
              showMoves={showMoves}
              onShowMovesChange={setShowMoves}
              onSelectNode={
                onSelectNode === undefined
                  ? undefined
                  : (id) => {
                      onSelectNode(id);
                      setFullScreen(false);
                    }
              }
              onContextMenuNode={openMenu}
              fallbackSize={() => ({
                width: window.innerWidth,
                height: window.innerHeight - TOOLBAR_ESTIMATE_PX,
              })}
              sx={{ flex: 1, minHeight: 0, px: 2, pb: 2 }}
            />
          </Box>
        )}
      </Dialog>

      {onEditTree !== undefined && (
        <MoveContextMenu
          tree={tree}
          target={menu}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onEditTree={onEditTree}
          playChances={playChances}
          mask={mask}
        />
      )}
    </Box>
  );
}

/**
 * The drawing, panned and zoomed with the mouse, under a row of controls —
 * the tab's and the full-screen dialog's alike. See the header note.
 */
function MapViewport({
  testId,
  drawing,
  nodeId,
  showMoves,
  onShowMovesChange,
  onSelectNode,
  onContextMenuNode,
  fallbackSize,
  extraButtons,
  sx,
}: {
  testId: string;
  drawing: Drawing;
  nodeId: string | null;
  showMoves: boolean;
  onShowMovesChange: (next: boolean) => void;
  /** Present: a written move's dot goes to its position. */
  onSelectNode?: (id: string) => void;
  /** Present: a right-click on a written move opens its menu there. */
  onContextMenuNode?: ContextMenuNodeHandler;
  /** The size assumed until the viewport is measured. */
  fallbackSize: () => Size;
  /** More buttons at the end of the row — the tab's full-screen one. */
  extraButtons?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const { t } = useTranslation();
  const { ref: viewport, size } = useBoxSize(fallbackSize);

  const centred = useCallback(
    (k: number, at: Size = size): MapView =>
      centerView(drawing.here.px, drawing.here.py, k, at.width, at.height),
    [drawing.here.px, drawing.here.py, size],
  );

  // Opens readable, on the reader's position.
  const [view, setView] = useState<MapView>(() => centred(MAP_INITIAL_K));
  /** Whether the reader has moved the view — until then, a new size re-centres it. */
  const [touched, setTouched] = useState(false);

  /*
    Two adjustments made during render against what changed, rather than in
    an effect (`react-hooks/set-state-in-effect`): the first real measurement
    re-centres an untouched view, and play moving the marker out of view
    brings the view after it, at the same zoom.
  */
  const [measured, setMeasured] = useState(size);
  if (measured !== size) {
    setMeasured(size);
    if (!touched) setView(centred(view.k, size));
  }
  // Keyed on where the marker is drawn as well as on its node: an edit to the
  // tree (CTA-67) can move the marker without the reader moving.
  const marker = `${nodeId ?? ""}@${drawing.here.px},${drawing.here.py}`;
  const [followed, setFollowed] = useState(marker);
  if (followed !== marker) {
    setFollowed(marker);
    const sx = drawing.here.px * view.k + view.x;
    const sy = drawing.here.py * view.k + view.y;
    if (
      sx < FOLLOW_EDGE_PX ||
      sy < FOLLOW_EDGE_PX ||
      sx > size.width - FOLLOW_EDGE_PX ||
      sy > size.height - FOLLOW_EDGE_PX
    ) {
      setView(centred(view.k));
    }
  }

  /*
    The wheel zooms about the pointer. A native listener, not React's
    `onWheel`: the page must not scroll or zoom under it, and a listener that
    can `preventDefault` has to be registered non-passive.
  */
  useEffect(() => {
    const box = viewport.current;
    if (box === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM);
      setTouched(true);
      setView((current) =>
        zoomViewAt(current, factor, event.clientX - rect.left, event.clientY - rect.top),
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [viewport]);

  /** A button zooms about the middle of the viewport. */
  const zoomBy = (factor: number) => {
    setTouched(true);
    setView((current) => zoomViewAt(current, factor, size.width / 2, size.height / 2));
  };

  /** The labels of the dots on screen, as the view moves. */
  const readable = view.k >= MAP_LABEL_MIN_K;
  const labels = useMemo(
    () =>
      showMoves && readable
        ? mapLabelsIn(drawing.layout, visibleRect(view, size.width, size.height))
        : [],
    [showMoves, readable, drawing.layout, view, size],
  );

  /*
    A drag pans: where the pointer went down, and the view it started from.
    It only becomes a drag — the pointer captured — once it has travelled
    `CLICK_SLOP_PX`; until then a release is a click, so a dot under it still
    receives one. `moved` tells that click it came at the end of a drag.
  */
  const drag = useRef<{ x: number; y: number; view: MapView } | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <Box sx={[{ display: "flex", flexDirection: "column" }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0, flexWrap: "wrap" }}>
        <Typography
          variant="caption"
          sx={{
            color: showMoves && !readable ? "warning.main" : "text.secondary",
            flexGrow: 1,
            minWidth: 0,
          }}
          data-testid={`${testId}-hint`}
        >
          {showMoves && !readable
            ? t("treeMap.zoomToRead")
            : t("treeMap.mouseHint")}
        </Typography>
        <MapButton
          label={t("treeMap.showMoves")}
          testId={`${testId}-show-moves`}
          pressed={showMoves}
          onClick={() => onShowMovesChange(!showMoves)}
        >
          <AbcRoundedIcon fontSize="small" />
        </MapButton>
        <MapButton
          label={t("treeMap.zoomOut")}
          testId={`${testId}-zoom-out`}
          onClick={() => zoomBy(1 / BUTTON_ZOOM)}
        >
          <ZoomOutRoundedIcon fontSize="small" />
        </MapButton>
        <Typography
          variant="caption"
          dir="ltr"
          data-testid={`${testId}-zoom`}
          sx={{ minWidth: "3.5em", textAlign: "center" }}
        >
          {`${Math.round(view.k * 100)}%`}
        </Typography>
        <MapButton
          label={t("treeMap.zoomIn")}
          testId={`${testId}-zoom-in`}
          onClick={() => zoomBy(BUTTON_ZOOM)}
        >
          <ZoomInRoundedIcon fontSize="small" />
        </MapButton>
        <MapButton
          label={t("treeMap.fit")}
          testId={`${testId}-fit`}
          onClick={() => {
            setTouched(true);
            setView(fitView(drawing.width, drawing.height, size.width, size.height));
          }}
        >
          <FitScreenRoundedIcon fontSize="small" />
        </MapButton>
        <MapButton
          label={t("treeMap.here")}
          testId={`${testId}-locate`}
          onClick={() => setView((current) => centred(current.k))}
        >
          <MyLocationRoundedIcon fontSize="small" />
        </MapButton>
        {extraButtons}
      </Box>

      <Box
        ref={viewport}
        dir="ltr"
        data-testid={`${testId}-viewport`}
        onPointerDown={(event) => {
          // The left button only: a right-click is the move menu's, never a pan.
          if (event.button !== 0) return;
          drag.current = { x: event.clientX, y: event.clientY, view };
          moved.current = false;
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start === null) return;
          if (!moved.current) {
            const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
            if (travel < CLICK_SLOP_PX) return;
            moved.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(true);
            setTouched(true);
          }
          setView({
            ...start.view,
            x: start.view.x + event.clientX - start.x,
            y: start.view.y + event.clientY - start.y,
          });
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <Box
          component="svg"
          role="img"
          aria-label={t("treeMap.label")}
          width="100%"
          height="100%"
          data-testid={`${testId}-svg`}
          data-rows={drawing.layout.rows}
          data-columns={drawing.layout.columns}
          sx={drawingSx}
        >
          <g
            transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
            data-testid={`${testId}-view`}
            data-x={view.x}
            data-y={view.y}
            data-k={view.k}
          >
            <MapLayers testId={testId} drawing={drawing} nodeId={nodeId} />
            {labels.length > 0 && (
              <g
                data-testid={`${testId}-labels`}
                fontSize={MAP_LABEL_FONT}
                textAnchor="middle"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {labels.map((label) => {
                  const text = (
                    <text
                      x={label.px}
                      // Above the dot, clear of the line running through it.
                      y={label.py - MAP_LABEL_FONT * 0.75}
                      className={
                        drawing.trailIds.has(label.id) ? "map-label map-label-trail" : "map-label"
                      }
                      data-testid={`${testId}-label-${label.id}`}
                    >
                      {drawing.labelOf(label.id, label.san)}
                      {label.nags !== undefined &&
                        nagsInPrintOrder(label.nags).map((nag) => (
                          <tspan
                            key={nag}
                            className="map-nag"
                            data-tone={nagTone(nag)}
                            dx={isMoveMark(nag) ? undefined : MAP_LABEL_FONT * 0.2}
                          >
                            {nagGlyph(nag)}
                          </tspan>
                        ))}
                    </text>
                  );
                  if (onSelectNode === undefined && onContextMenuNode === undefined) {
                    return <g key={label.id}>{text}</g>;
                  }
                  // A link: the move and a target round its dot, as one button —
                  // and, given a menu, what a right-click opens it on.
                  return (
                    <g
                      key={label.id}
                      className="map-hit"
                      role={onSelectNode === undefined ? undefined : "button"}
                      aria-label={
                        onSelectNode === undefined
                          ? undefined
                          : t("treeMap.goTo", { move: drawing.labelOf(label.id, label.san) })
                      }
                      data-testid={`${testId}-go-${label.id}`}
                      onClick={() => {
                        if (!moved.current) onSelectNode?.(label.id);
                      }}
                      onContextMenu={
                        onContextMenuNode === undefined
                          ? undefined
                          : (event) => {
                              event.preventDefault();
                              onContextMenuNode(label.id, menuAnchorOf(event));
                            }
                      }
                    >
                      <circle
                        cx={label.px}
                        cy={label.py}
                        r={5}
                        fill="transparent"
                        pointerEvents="all"
                      />
                      {text}
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        </Box>
      </Box>
    </Box>
  );
}

export default TreeMap;
