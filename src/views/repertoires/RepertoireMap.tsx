import { useLayoutEffect, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { pathTo, type GameTree } from "../../lib/gameTree";
import type { Coverage } from "../../lib/repertoireGames";
import {
  MAP_DX,
  MAP_DY,
  MAP_PAD,
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
 * colour. The zoom buttons scale the drawing through a fixed set of steps
 * (`MAP_ZOOM_LEVELS`); the level is the screen's, so it survives a trip to
 * another tab. The lines keep their width at every zoom (`non-scaling-stroke`)
 * so the tree stays legible zoomed out; the dots scale with the drawing.
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
  /** The drawing's scale — one of `MAP_ZOOM_LEVELS`. */
  zoom?: number;
  onZoomChange: (zoom: number) => void;
}) {
  const { t } = useTranslation();

  const layout = useMemo(() => mapLayoutOf(repertoire), [repertoire]);
  const edges = useMemo(() => mapEdgePaths(layout, coverage), [layout, coverage]);
  const ends = useMemo(() => mapLeafDots(layout, coverage), [layout, coverage]);
  const moves = useMemo(() => mapMoveDots(layout, coverage), [layout, coverage]);
  const trail = useMemo(() => {
    const path = pathTo(repertoire, nodeId);
    return { edges: mapPathTo(layout, path), dots: mapPathDots(layout, path) };
  }, [layout, repertoire, nodeId]);

  const here = mapPixel(
    nodeId === null ? layout.root : (layout.points.get(nodeId) ?? layout.root),
  );

  // Keep the marker in view as play moves — both scrolling boxes, the tab's
  // and this one's. jsdom has no scrolling, hence the optional call.
  const marker = useRef<SVGCircleElement | null>(null);
  useLayoutEffect(() => {
    marker.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [nodeId, zoom]);

  const covered = coverage.total - coverage.under(null);
  const left = coverage.under(null);
  const width = MAP_PAD * 2 + layout.columns * MAP_DX;
  const height = MAP_PAD * 2 + (layout.rows - 1) * MAP_DY;
  const smallest = zoom <= MAP_ZOOM_LEVELS[0];
  const largest = zoom >= MAP_ZOOM_LEVELS[MAP_ZOOM_LEVELS.length - 1];

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
          <Tooltip title={t("repertoires.play.map.zoomOut")}>
            <span>
              <IconButton
                size="small"
                disabled={smallest}
                onClick={() => onZoomChange(nextMapZoom(zoom, -1))}
                aria-label={t("repertoires.play.map.zoomOut")}
                data-testid={`${testId}-zoom-out`}
              >
                <ZoomOutRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
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
          <Tooltip title={t("repertoires.play.map.zoomIn")}>
            <span>
              <IconButton
                size="small"
                disabled={largest}
                onClick={() => onZoomChange(nextMapZoom(zoom, 1))}
                aria-label={t("repertoires.play.map.zoomIn")}
                data-testid={`${testId}-zoom-in`}
              >
                <ZoomInRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box dir="ltr" sx={{ overflowX: "auto" }}>
        <Box
          component="svg"
          role="img"
          aria-label={t("repertoires.play.map.label")}
          // Scaled by the zoom; the viewBox keeps the layout's own coordinates.
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
          data-testid={`${testId}-svg`}
          data-rows={layout.rows}
          data-columns={layout.columns}
          data-zoom={zoom}
          sx={{
            display: "block",
            fill: "none",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "& .map-open": stroke((palette) => palette.text.disabled),
            "& .map-covered": stroke((palette) => palette.success.main),
            "& .map-trail": stroke((palette) => palette.primary.main),
            "& .map-here": {
              fill: (theme: Theme) => (theme.vars ?? theme).palette.primary.main,
              ...stroke((palette) => palette.background.paper),
            },
          }}
        >
          {/* Lines keep their width at any zoom; the dots scale with the drawing. */}
          <path className="map-open" d={edges.open} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path className="map-covered" d={edges.covered} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path className="map-open" d={moves.open} strokeWidth={4} data-testid={`${testId}-open-moves`} />
          <path
            className="map-covered"
            d={moves.covered}
            strokeWidth={4}
            data-testid={`${testId}-covered-moves`}
          />
          <path className="map-open" d={ends.open} strokeWidth={6} data-testid={`${testId}-open-ends`} />
          <path
            className="map-covered"
            d={ends.covered}
            strokeWidth={6}
            data-testid={`${testId}-covered-ends`}
          />
          <path
            className="map-trail"
            d={trail.edges}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            data-testid={`${testId}-trail`}
          />
          <path className="map-trail" d={trail.dots} strokeWidth={5} data-testid={`${testId}-trail-moves`} />
          <circle
            ref={marker}
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
        </Box>
      </Box>
    </Box>
  );
}

export default RepertoireMap;
