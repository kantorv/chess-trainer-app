import { useLayoutEffect, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
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
  mapPathTo,
  mapPixel,
} from "../../lib/repertoireMap";

/**
 * **Backtracking's Map tab** (CTA-63) — the repertoire drawn as a tree, so the
 * reader sees where they are in it and how much is left: lines already
 * covered in green, the rest grey, the way from the start to the position on
 * screen in the primary colour, and a marker on that position, kept in view as
 * play moves. A progress bar and a line count above it answer "how far to the
 * end". The layout is `lib/repertoireMap.ts`; this draws it.
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
}: {
  testId: string;
  /** The repertoire as it arrived. */
  repertoire: GameTree;
  coverage: Coverage;
  /** Where the reader is, on the repertoire; `null` is the start position. */
  nodeId: string | null;
}) {
  const { t } = useTranslation();

  const layout = useMemo(() => mapLayoutOf(repertoire), [repertoire]);
  const edges = useMemo(() => mapEdgePaths(layout, coverage), [layout, coverage]);
  const dots = useMemo(() => mapLeafDots(layout, coverage), [layout, coverage]);
  const trail = useMemo(
    () => mapPathTo(layout, pathTo(repertoire, nodeId)),
    [layout, repertoire, nodeId],
  );

  const here = mapPixel(
    nodeId === null ? layout.root : (layout.points.get(nodeId) ?? layout.root),
  );

  // Keep the marker in view as play moves — both scrolling boxes, the tab's
  // and this one's. jsdom has no scrolling, hence the optional call.
  const marker = useRef<SVGCircleElement | null>(null);
  useLayoutEffect(() => {
    marker.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [nodeId]);

  const covered = coverage.total - coverage.under(null);
  const left = coverage.under(null);
  const width = MAP_PAD * 2 + layout.columns * MAP_DX;
  const height = MAP_PAD * 2 + (layout.rows - 1) * MAP_DY;

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
        <Typography variant="caption" sx={{ color: "text.secondary" }} data-testid={`${testId}-left`}>
          {left === 0
            ? t("repertoires.play.map.done")
            : t("repertoires.play.map.left", { count: left })}
        </Typography>
      </Box>

      <Box dir="ltr" sx={{ overflowX: "auto" }}>
        <Box
          component="svg"
          role="img"
          aria-label={t("repertoires.play.map.label")}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          data-testid={`${testId}-svg`}
          data-rows={layout.rows}
          data-columns={layout.columns}
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
          <path className="map-open" d={edges.open} strokeWidth={1.5} />
          <path className="map-covered" d={edges.covered} strokeWidth={1.5} />
          <path className="map-open" d={dots.open} strokeWidth={5} data-testid={`${testId}-open-ends`} />
          <path
            className="map-covered"
            d={dots.covered}
            strokeWidth={5}
            data-testid={`${testId}-covered-ends`}
          />
          <path className="map-trail" d={trail} strokeWidth={3} data-testid={`${testId}-trail`} />
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
