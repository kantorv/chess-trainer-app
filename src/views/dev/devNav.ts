import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";

import type { NavFolder } from "../main/navFolders";
import type { NavItem } from "../main/navItems";

/**
 * **The Development section's sidebar entries** — the folder and the three
 * screens composed from the unified board core
 * ([`.claude/rules/chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md)).
 *
 * ## Dev-only, and provably so
 *
 * `navFolders()` and `navItems()` call these behind `import.meta.env.DEV`,
 * exactly as `App.tsx` gates the routes. In a production build Vite replaces
 * that expression with `false`, so the conditional is dead code, these
 * functions are unreachable, and rollup drops this module and its icons with
 * them — the deployed bundle carries no Development folder, no `/dev/*` route
 * and not even the labels. `devBoards.test.tsx` asserts the gate is the only
 * thing standing between the section and the sidebar.
 *
 * The gate being *cheap* is why the section can be a sidebar folder at all:
 * both registries were already functions (`navFolders.ts` explains why — the
 * Library subtree grows a folder when the reader uploads a `.pgn`), so nothing
 * had to change shape to make one of their entries conditional.
 *
 * ## The ids are namespaced
 *
 * `dev:*`, so a dev id cannot collide with an authored one and a screen filed
 * under `dev` cannot appear anywhere else.
 */

/** The folder id every Development screen files itself under. */
export const DEV_NAV_FOLDER_ID = "dev";

export const devNavFolder = (): NavFolder => ({
  id: DEV_NAV_FOLDER_ID,
  labelKey: "dev.folder",
  icon: ScienceRoundedIcon,
});

/**
 * The three boards, in the order the spec derives them: Play v2 the linear
 * case, Masked v2 derived from Play, then Openings v2. (Analysis v2, the
 * reference, shipped as the Analysis Board in CTA-73 and left the section;
 * Repertoire v2 read the old Library's catalog and was retired with it in
 * CTA-75 — the Library's own board is its successor.)
 */
export const devNavItems = (): readonly NavItem[] => [
  {
    to: "/dev/play",
    labelKey: "dev.screens.play",
    icon: SportsEsportsRoundedIcon,
    folder: DEV_NAV_FOLDER_ID,
  },
  {
    to: "/dev/masked",
    labelKey: "dev.screens.masked",
    icon: VisibilityOffRoundedIcon,
    folder: DEV_NAV_FOLDER_ID,
  },
  {
    to: "/dev/openings",
    labelKey: "dev.screens.openings",
    icon: TravelExploreRoundedIcon,
    folder: DEV_NAV_FOLDER_ID,
  },
];
