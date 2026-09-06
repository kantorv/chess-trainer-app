import type { SvgIconComponent } from "@mui/icons-material";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";

import type { LocalizedText } from "../../lib/libraryCatalog";
import type { NavFolderId } from "./navFolders";
import { positionsNavItems, userPgnsNavItems } from "./navFromLibrary";

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
 * The exceptions, and the reason `label` exists above, are the two generated
 * sections: the Positions list screens come from `src/data/positions.json` and
 * the User PGNs ones from the `.pgn` files under `src/data/pgn/`
 * (`navFromLibrary.ts`), one per category at any depth, both named from their
 * data. Each is served by a single splat route, so a new category — or a new
 * PGN file — needs no entry here and no route either.
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
  /*
    Three entries, and three is all there will ever be: a position is a row in
    `src/data/mates.json` reached at `/mates/<category>/<id>`, not a nav entry.
    A fourth *category* is one more entry here plus its folder — a registration,
    not a code change to anything that renders.
  */
  {
    to: "/mates/basic",
    labelKey: "nav.matesBasic",
    icon: ViewListRoundedIcon,
    folder: "mates-basic",
  },
  {
    to: "/mates/advanced",
    labelKey: "nav.matesAdvanced",
    icon: ViewListRoundedIcon,
    folder: "mates-advanced",
  },
  {
    to: "/mates/complex",
    labelKey: "nav.matesComplex",
    icon: ViewListRoundedIcon,
    folder: "mates-complex",
  },
  ...positionsNavItems(),
  ...userPgnsNavItems(),
  {
    to: "/tools/analysis",
    labelKey: "nav.analysisBoard",
    icon: AccountTreeRoundedIcon,
    folder: "tools",
  },
  {
    to: "/tools/editor",
    labelKey: "nav.boardEditor",
    icon: DashboardCustomizeRoundedIcon,
    folder: "tools",
  },
  {
    to: "/tools/openings",
    labelKey: "nav.openings",
    icon: TravelExploreRoundedIcon,
    folder: "tools",
  },
];

/** The screens filed under one folder, in registration order. */
export const navItemsInFolder = (folder: NavFolderId): readonly NavItem[] =>
  navItems().filter((item) => item.folder === folder);
