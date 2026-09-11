import type { SvgIconComponent } from "@mui/icons-material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";

import type { LocalizedText } from "../../lib/libraryCatalog";
import type { NavFolderId } from "./navFolders";
import { userPgnsNavItems } from "./navFromLibrary";

export type NavItem = {
  /** Route path, matched against `useLocation().pathname` for the active state. */
  to: string;
  /** i18n key — for an authored screen, whose name is chrome the app ships. */
  labelKey?: string;
  /** Per-language name — for a screen generated from a data catalog. */
  label?: LocalizedText;
  icon: SvgIconComponent;
  /** The folder this screen hangs under in the sidebar — an id from `navFolders`. */
  folder: NavFolderId;
};

/**
 * Every screen, in one place. The sidebar builds its tree from this rather than
 * repeating a list item per route, so adding a screen is one entry here plus
 * the route in `App.tsx` and a string in both catalogs.
 *
 * The exception, and the reason `label` exists above, is the one generated
 * section: the User PGNs list screens come from the `.pgn` files under
 * `src/data/pgn/` (`navFromLibrary.ts`), one per category at any depth, named
 * from their data. They are served by a single splat route, so a new PGN file
 * needs no entry here and no route either.
 *
 * A **function**, for the reason `navFolders` is one: a `.pgn` the reader
 * uploads adds a screen while the app is running, so the list is built when it
 * is asked for rather than when this module is imported.
 */
export const navItems = (): readonly NavItem[] => [
  {
    to: "/engine/play",
    labelKey: "nav.playWithEngine",
    icon: SportsEsportsRoundedIcon,
    folder: "engine",
  },
  {
    to: "/engine/saved",
    labelKey: "nav.savedGames",
    icon: HistoryRoundedIcon,
    folder: "engine",
  },
  {
    to: "/masked/play",
    labelKey: "nav.maskedPlay",
    icon: VisibilityOffRoundedIcon,
    folder: "masked-pieces",
  },
  {
    to: "/games/load-pgn",
    labelKey: "nav.loadPgn",
    icon: UploadFileRoundedIcon,
    folder: "games",
  },
  ...userPgnsNavItems(),
  {
    to: "/tools/analysis",
    labelKey: "nav.analysisBoard",
    icon: AccountTreeRoundedIcon,
    folder: "tools",
  },
  {
    to: "/tools/analysis/saved",
    labelKey: "nav.savedAnalyses",
    icon: HistoryRoundedIcon,
    folder: "tools",
  },
  {
    to: "/tools/editor",
    labelKey: "nav.boardEditor",
    icon: DashboardCustomizeRoundedIcon,
    folder: "tools",
  },
  {
    to: "/openings",
    labelKey: "nav.openings",
    icon: TravelExploreRoundedIcon,
    folder: "openings",
  },
  {
    to: "/openings/saved",
    labelKey: "nav.savedOpenings",
    icon: HistoryRoundedIcon,
    folder: "openings",
  },
];

/** The screens filed under one folder, in registration order. */
export const navItemsInFolder = (folder: NavFolderId): readonly NavItem[] =>
  navItems().filter((item) => item.folder === folder);
