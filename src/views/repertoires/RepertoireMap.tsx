import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
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

import { pathTo, type GameTree } from "../../lib/gameTree";
import type { Coverage } from "../../lib/repertoireGames";
import {
  MAP_DX,
  MAP_DY,
  MAP_PAD,
  centerView,
  fitView,
  mapLabelsIn,
  visibleRect,
  MAP_LABEL_FONT,
  MAP_LABEL_MIN_K,
  mapEdgePaths,
  mapLayoutOf,
  mapLeafDots,
  mapMoveDots,
  mapPathDots,
  mapPathTo,
  mapPixel,
  MAP_DEFAULT_ZOOM,
  MAP_ZOOM_LEVELS,
  nextMapZoom,
  zoomViewAt,
  type MapLayout,
  type MapView,
} from "../../lib/repertoireMap";

/**
 * **Backtracking's Map tab** (CTA-63) — the repertoire drawn as a tree, so the
 * reader sees where they are in it and how much is left: lines already
 * covered in green, the rest grey, the way from the start to the position on
 * screen in the primary colour, and a marker on that position, kept in view as
 * play moves. A progress bar and a line count above it answer "how far to the
 * end". The layout is `lib/repertoireMap.ts`; this draws it.
 *
 * Every move is a dot — larger at a line's end, the one Backtracking counts —
 * and the moves on the way to the reader are drawn over in the primary
 * colour. The lines keep their width at every scale (`non-scaling-stroke`) so
 * the tree stays legible zoomed out; the dots scale with the drawing.
 *
 * ## Two views of one drawing
 *
 * The drawing ({@link MapLayers}) is rendered in two places, from the same
 * memoised path strings:
 *
 * - **the tab** — the panel's width, scrolled, zoomed by buttons through
 *   `MAP_ZOOM_LEVELS` (the level is the screen's, so it survives a trip to
 *   another tab);
 * - **full screen** — a full-screen MUI `Dialog` opened from the tab, where the
 *   panel's width no longer hides the detail: the **wheel zooms about the
 *   pointer** and a **drag pans** (`MapView`, `zoomViewAt` — the arithmetic is
 *   pure and tested), with buttons to zoom, fit the whole tree, and go back to
 *   the reader's position. It opens centred on that position. **Show moves**
 *   writes each move's SAN above its dot, in the drawing's units so it scales
 *   with the view (readable from about 2.5×, not drawn below 150%), and only
 *   for the dots on screen (`mapLabelsIn` / `visibleRect`), so a huge tree
 *   costs what is visible; the moves on the reader's way are bold and in the
 *   primary colour.
 *
 * It is a map of the **repertoire**, not of the session: a move the reader
 * added is not on it, and while they stand in one, the marker waits on the
 * last repertoire position before it (the screen hands that in).
 *
 * The drawing is a diagram, not text, so it is pinned left-to-right (`dir`)
 * the way the move numbers are: depth runs the same way in every language.
 * Its colours are theme tokens, so it follows light and dark.
 */

const stroke = (pick: (palette: Theme["palette"]) => string) => ({
  stroke: (theme: Theme) => pick((theme.vars ?? theme).palette as Theme["palette"]),
});

/** The drawing's look, for either `<svg>` it is drawn in. */
const drawingSx: SxProps<Theme> = {
  display: "block",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "& .map-open": stroke((palette) => palette.text.disabled),
  "& .map-covered": stroke((palette) => palette.success.main),
  "& .map-trail": stroke((palette) => palette.primary.main),
  "& .map-label": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.text.primary,
    // A halo in the paper colour, painted under the glyphs, so a label stays
    // legible where it crosses a line.
    ...stroke((palette) => palette.background.paper),
    strokeWidth: 1,
    paintOrder: "stroke",
  },
  "& .map-label-trail": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.primary.main,
    fontWeight: 700,
  },
  "& .map-here": {
    fill: (theme: Theme) => (theme.vars ?? theme).palette.primary.main,
    ...stroke((palette) => palette.background.paper),
  },
};

/** How much one wheel notch zooms the full-screen view. */
const WHEEL_ZOOM = 0.0015;
/** How much a zoom button zooms the full-screen view. */
const BUTTON_ZOOM = 1.25;
/** The full-screen toolbar's height, for the first centring before layout. */
const TOOLBAR_ESTIMATE_PX = 64;

type Drawing = {
  layout: MapLayout;
  /** The moves on the reader's way, for the labels to pick out. */
  trailIds: ReadonlySet<string>;
  edges: { covered: string; open: string };
  ends: { covered: string; open: string };
  moves: { covered: string; open: string };
  trail: { edges: string; dots: string };
  here: { px: number; py: number };
  width: number;
  height: number;
};

/** The drawing itself — the same layers in the tab and full screen. */
function MapLayers({
  testId,
  drawing,
  nodeId,
  markerRef,
}: {
  testId: string;
  drawing: Drawing;
  nodeId: string | null;
  markerRef?: Ref<SVGCircleElement>;
}) {
  const { t } = useTranslation();
  const { edges, ends, moves, trail, here } = drawing;
  return (
    <>
      {/* Lines keep their width at any scale; the dots scale with the drawing. */}
      <path className="map-open" d={edges.open} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path className="map-covered" d={edges.covered} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path className="map-open" d={moves.open} strokeWidth={4} data-testid={`${testId}-open-moves`} />
      <path className="map-covered" d={moves.covered} strokeWidth={4} data-testid={`${testId}-covered-moves`} />
      <path className="map-open" d={ends.open} strokeWidth={6} data-testid={`${testId}-open-ends`} />
      <path className="map-covered" d={ends.covered} strokeWidth={6} data-testid={`${testId}-covered-ends`} />
      <path
        className="map-trail"
        d={trail.edges}
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        data-testid={`${testId}-trail`}
      />
      <path className="map-trail" d={trail.dots} strokeWidth={5} data-testid={`${testId}-trail-moves`} />
      <circle
        ref={markerRef}
        className="map-here"
        cx={here.px}
        cy={here.py}
        r={5}
        strokeWidth={1.5}
        data-testid={`${testId}-here`}
        data-node-id={nodeId ?? "start"}
      >
        <title>{t("repertoires.play.map.here")}</title>
      </circle>
    </>
  );
}

/** One icon button with its tooltip — the map's toolbars are rows of these. */
function MapButton({
  label,
  testId,
  onClick,
  disabled = false,
  pressed,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  /** A toggle's state; absent for a plain button. */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-pressed={pressed}
          color={pressed ? "primary" : "default"}
          data-testid={testId}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function RepertoireMap({
  testId,
  repertoire,
  coverage,
  nodeId,
  zoom = MAP_DEFAULT_ZOOM,
  onZoomChange,
}: {
  testId: string;
  /** The repertoire as it arrived. */
  repertoire: GameTree;
  coverage: Coverage;
  /** Where the reader is, on the repertoire; `null` is the start position. */
  nodeId: string | null;
  /** The tab's scale — one of `MAP_ZOOM_LEVELS`. */
  zoom?: number;
  onZoomChange: (zoom: number) => void;
}) {
  const { t } = useTranslation();
  const [fullScreen, setFullScreen] = useState(false);

  const layout = useMemo(() => mapLayoutOf(repertoire), [repertoire]);
  const edges = useMemo(() => mapEdgePaths(layout, coverage), [layout, coverage]);
  const ends = useMemo(() => mapLeafDots(layout, coverage), [layout, coverage]);
  const moves = useMemo(() => mapMoveDots(layout, coverage), [layout, coverage]);
  const trail = useMemo(() => {
    const path = pathTo(repertoire, nodeId);
    return {
      edges: mapPathTo(layout, path),
      dots: mapPathDots(layout, path),
      ids: new Set(path.map((node) => node.id)),
    };
  }, [layout, repertoire, nodeId]);

  const drawing: Drawing = {
    layout,
    trailIds: trail.ids,
    edges,
    ends,
    moves,
    trail,
    here: mapPixel(nodeId === null ? layout.root : (layout.points.get(nodeId) ?? layout.root)),
    width: MAP_PAD * 2 + layout.columns * MAP_DX,
    height: MAP_PAD * 2 + (layout.rows - 1) * MAP_DY,
  };

  // Keep the marker in view as play moves — both scrolling boxes, the tab's
  // and this one's. jsdom has no scrolling, hence the optional call.
  const marker = useRef<SVGCircleElement | null>(null);
  useLayoutEffect(() => {
    marker.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [nodeId, zoom]);

  const covered = coverage.total - coverage.under(null);
  const left = coverage.under(null);
  const smallest = zoom <= MAP_ZOOM_LEVELS[0];
  const largest = zoom >= MAP_ZOOM_LEVELS[MAP_ZOOM_LEVELS.length - 1];

  const progress = (
    <>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {t("repertoires.play.score.covered", { covered, total: coverage.total })}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {left === 0
          ? t("repertoires.play.map.done")
          : t("repertoires.play.map.left", { count: left })}
      </Typography>
    </>
  );

  return (
    <Box data-testid={testId} sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t("repertoires.play.score.covered", { covered, total: coverage.total })}
        </Typography>
        <LinearProgress
          variant="determinate"
          color="success"
          value={coverage.total === 0 ? 0 : (covered / coverage.total) * 100}
          data-testid={`${testId}-progress`}
          sx={{ my: 0.5, height: 6, borderRadius: 3 }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", flexGrow: 1 }}
            data-testid={`${testId}-left`}
          >
            {left === 0
              ? t("repertoires.play.map.done")
              : t("repertoires.play.map.left", { count: left })}
          </Typography>
          <MapButton
            label={t("repertoires.play.map.zoomOut")}
            testId={`${testId}-zoom-out`}
            disabled={smallest}
            onClick={() => onZoomChange(nextMapZoom(zoom, -1))}
          >
            <ZoomOutRoundedIcon fontSize="small" />
          </MapButton>
          {/* The level, and a way back to the drawing's own size. */}
          <Tooltip title={t("repertoires.play.map.zoomReset")}>
            <ButtonBase
              onClick={() => onZoomChange(MAP_DEFAULT_ZOOM)}
              aria-label={t("repertoires.play.map.zoomReset")}
              data-testid={`${testId}-zoom`}
              sx={{ typography: "caption", minWidth: "3.5em", borderRadius: 1, px: 0.5 }}
            >
              <span dir="ltr">{`${Math.round(zoom * 100)}%`}</span>
            </ButtonBase>
          </Tooltip>
          <MapButton
            label={t("repertoires.play.map.zoomIn")}
            testId={`${testId}-zoom-in`}
            disabled={largest}
            onClick={() => onZoomChange(nextMapZoom(zoom, 1))}
          >
            <ZoomInRoundedIcon fontSize="small" />
          </MapButton>
          <MapButton
            label={t("repertoires.play.map.fullScreen")}
            testId={`${testId}-fullscreen`}
            onClick={() => setFullScreen(true)}
          >
            <FullscreenRoundedIcon fontSize="small" />
          </MapButton>
        </Box>
      </Box>

      <Box dir="ltr" sx={{ overflowX: "auto" }}>
        <Box
          component="svg"
          role="img"
          aria-label={t("repertoires.play.map.label")}
          // Scaled by the zoom; the viewBox keeps the layout's own coordinates.
          width={drawing.width * zoom}
          height={drawing.height * zoom}
          viewBox={`0 0 ${drawing.width} ${drawing.height}`}
          data-testid={`${testId}-svg`}
          data-rows={layout.rows}
          data-columns={layout.columns}
          data-zoom={zoom}
          sx={drawingSx}
        >
          <MapLayers testId={testId} drawing={drawing} nodeId={nodeId} markerRef={marker} />
        </Box>
      </Box>

      <Dialog
        fullScreen
        open={fullScreen}
        onClose={() => setFullScreen(false)}
        aria-labelledby={`${testId}-dialog-title`}
        data-testid={`${testId}-dialog`}
      >
        {fullScreen && (
          <FullScreenMap
            testId={`${testId}-dialog`}
            drawing={drawing}
            nodeId={nodeId}
            progress={progress}
            onClose={() => setFullScreen(false)}
          />
        )}
      </Dialog>
    </Box>
  );
}

/**
 * The map full screen: a toolbar over a viewport the drawing is panned and
 * zoomed in with the mouse. Mounted only while the dialog is open, so it
 * measures the viewport it actually has and opens on the reader's position.
 */
function FullScreenMap({
  testId,
  drawing,
  nodeId,
  progress,
  onClose,
}: {
  testId: string;
  drawing: Drawing;
  nodeId: string | null;
  progress: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement | null>(null);

  /** The viewport's size — jsdom lays nothing out, so the window stands in. */
  const size = useCallback(() => {
    const box = viewport.current;
    return {
      vw: box?.clientWidth || window.innerWidth,
      vh: box?.clientHeight || window.innerHeight,
    };
  }, []);

  const centred = useCallback(
    (k: number): MapView => {
      const { vw, vh } = size();
      return centerView(drawing.here.px, drawing.here.py, k, vw, vh);
    },
    [drawing.here.px, drawing.here.py, size],
  );

  /*
    Opens on the reader's position, at the drawing's own size. The viewport is
    not laid out yet on the first render, so the window below the toolbar
    stands in for it — the one estimate here; "where am I" centres exactly.
  */
  const [view, setView] = useState<MapView>(() =>
    centerView(
      drawing.here.px,
      drawing.here.py,
      1,
      window.innerWidth,
      window.innerHeight - TOOLBAR_ESTIMATE_PX,
    ),
  );

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
      setView((current) =>
        zoomViewAt(current, factor, event.clientX - rect.left, event.clientY - rect.top),
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  /*
    Show moves: the labels of the dots on screen, recomputed as the view
    moves. The viewport is the dialog below its toolbar — the window stands in
    for it, as for the first centring, so render reads no ref.
  */
  const [showMoves, setShowMoves] = useState(false);
  const readable = view.k >= MAP_LABEL_MIN_K;
  const labels = useMemo(
    () =>
      showMoves && readable
        ? mapLabelsIn(
            drawing.layout,
            visibleRect(view, window.innerWidth, window.innerHeight - TOOLBAR_ESTIMATE_PX),
          )
        : [],
    [showMoves, readable, drawing.layout, view],
  );

  /** A drag pans: where the pointer went down, and the view it started from. */
  const drag = useRef<{ x: number; y: number; view: MapView } | null>(null);
  const [dragging, setDragging] = useState(false);

  /** A button zooms about the middle of the viewport. */
  const zoomBy = (factor: number) => {
    const { vw, vh } = size();
    setView((current) => zoomViewAt(current, factor, vw / 2, vh / 2));
  };

  return (
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
          id={`${testId}-title`}
          sx={{ fontWeight: 700, marginInlineEnd: 1 }}
        >
          {t("repertoires.play.tabs.map")}
        </Typography>
        <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {progress}
        </Box>
        <Typography
          variant="caption"
          sx={{ color: showMoves && !readable ? "warning.main" : "text.secondary" }}
          data-testid={`${testId}-hint`}
        >
          {showMoves && !readable
            ? t("repertoires.play.map.zoomToRead")
            : t("repertoires.play.map.mouseHint")}
        </Typography>
        <MapButton
          label={t("repertoires.play.map.showMoves")}
          testId={`${testId}-show-moves`}
          pressed={showMoves}
          onClick={() => setShowMoves((current) => !current)}
        >
          <AbcRoundedIcon />
        </MapButton>
        <MapButton
          label={t("repertoires.play.map.zoomOut")}
          testId={`${testId}-zoom-out`}
          onClick={() => zoomBy(1 / BUTTON_ZOOM)}
        >
          <ZoomOutRoundedIcon />
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
          label={t("repertoires.play.map.zoomIn")}
          testId={`${testId}-zoom-in`}
          onClick={() => zoomBy(BUTTON_ZOOM)}
        >
          <ZoomInRoundedIcon />
        </MapButton>
        <MapButton
          label={t("repertoires.play.map.fit")}
          testId={`${testId}-fit`}
          onClick={() => {
            const { vw, vh } = size();
            setView(fitView(drawing.width, drawing.height, vw, vh));
          }}
        >
          <FitScreenRoundedIcon />
        </MapButton>
        <MapButton
          label={t("repertoires.play.map.here")}
          testId={`${testId}-locate`}
          onClick={() => setView((current) => centred(current.k))}
        >
          <MyLocationRoundedIcon />
        </MapButton>
        <MapButton label={t("repertoires.play.map.close")} testId={`${testId}-close`} onClick={onClose}>
          <CloseRoundedIcon />
        </MapButton>
      </Box>

      <Box
        ref={viewport}
        dir="ltr"
        data-testid={`${testId}-viewport`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, view };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start === null) return;
          setView({
            ...start.view,
            x: start.view.x + event.clientX - start.x,
            y: start.view.y + event.clientY - start.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <Box
          component="svg"
          role="img"
          aria-label={t("repertoires.play.map.label")}
          width="100%"
          height="100%"
          data-testid={`${testId}-svg`}
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
                {labels.map((label) => (
                  <text
                    key={label.id}
                    x={label.px}
                    // Above the dot, clear of the line running through it.
                    y={label.py - MAP_LABEL_FONT * 0.75}
                    className={
                      drawing.trailIds.has(label.id) ? "map-label map-label-trail" : "map-label"
                    }
                    data-testid={`${testId}-label-${label.id}`}
                  >
                    {label.san}
                  </text>
                ))}
              </g>
            )}
          </g>
        </Box>
      </Box>
    </Box>
  );
}

export default RepertoireMap;
