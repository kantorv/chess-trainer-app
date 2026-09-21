import type { SvgIconComponent } from "@mui/icons-material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LibraryAddRoundedIcon from "@mui/icons-material/LibraryAddRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";

import type { LocalizedText } from "../../lib/localizedText";
import { devNavItems } from "../dev/devNav";
import type { NavFolderId } from "./navFolders";

export type NavItem = {
  /** Route path, matched against `useLocation().pathname` for the active state. */
  to: string;
  /** i18n key — for an authored screen, whose name is chrome the app ships. */
  labelKey?: string;
  /** Per-language name — for a screen whose name is data, not chrome. */
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
 * A **function**, for the reason `navFolders` is one: the Development
 * section's entries are a spread gated on `import.meta.env.DEV`.
 */
export const navItems = (): readonly NavItem[] => [
  {
    to: "/engine/play",
    labelKey: "nav.playWithEngine",
    icon: SportsEsportsRoundedIcon,
    folder: "engine",
  },
  // Play with Engine v2's games (CTA-74) — the list the nav calls Saved games.
  {
    to: "/engine/games",
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
  /*
    The Library (CTA-75): the collections, and the screen one is brought in
    on. A collection's table and a game's board are reached from the list —
    routes, not nav entries.
  */
  {
    to: "/library",
    labelKey: "nav.libraryCollections",
    icon: ViewListRoundedIcon,
    folder: "library",
  },
  {
    to: "/library/new",
    labelKey: "nav.addCollection",
    icon: UploadFileRoundedIcon,
    folder: "library",
  },
  {
    to: "/tools/editor",
    labelKey: "nav.boardEditor",
    icon: DashboardCustomizeRoundedIcon,
    folder: "tools",
  },
  /*
    The Analysis Board has no nav entry (CTA-58, mirroring CTA-42's Openings
    folder): the top-level Analysis folder is a single entry (`navFolders.ts`)
    that renders as the screen below, and the board is reached from the saved
    list's New button. The `/tools/analysis` route stays — every `?fen=`,
    `?game=` and `?analysis=` hand-off still lands there.
  */
  {
    to: "/tools/analysis/saved",
    labelKey: "nav.savedAnalyses",
    icon: HistoryRoundedIcon,
    folder: "analysis",
  },
  /*
    The Openings board has no nav entry (CTA-42): the top-level Openings folder
    is a single entry (`navFolders.ts`) that renders as the screen below, and
    the board is reached from the saved list's New button. The `/openings`
    route stays — it is where a Continue hand-off and the ECO chip land.
  */
  {
    to: "/openings/saved",
    labelKey: "nav.savedOpenings",
    icon: HistoryRoundedIcon,
    folder: "openings",
  },
  {
    to: "/repertoires",
    labelKey: "nav.repertoires",
    icon: MenuBookRoundedIcon,
    folder: "repertoires",
  },
  {
    to: "/repertoires/new",
    labelKey: "nav.addRepertoire",
    icon: LibraryAddRoundedIcon,
    folder: "repertoires",
  },
  /*
    The Development section's five boards (CTA-60) — the same `import.meta.env.DEV`
    gate the folder and the routes carry, and for the same reason: in a
    production build the spread is dead code and rollup drops the module behind
    it. See `views/dev/devNav.ts`.
  */
  ...(import.meta.env.DEV ? devNavItems() : []),
];

/** The screens filed under one folder, in registration order. */
export const navItemsInFolder = (folder: NavFolderId): readonly NavItem[] =>
  navItems().filter((item) => item.folder === folder);
