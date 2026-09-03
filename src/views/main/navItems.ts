import type { SvgIconComponent } from "@mui/icons-material";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";

import type { LocalizedText } from "../../lib/libraryCatalog";
import type { NavFolderId } from "./navFolders";
import { positionsNavItems } from "./navFromLibrary";

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
 * The exception, and the reason `label` exists above, is the Positions section:
 * its list screens are **generated** from `src/data/positions.json`
 * (`navFromLibrary.ts`), one per category at any depth, and are named from the
 * data. `/positions/*` is a single splat route, so a new category needs no
 * entry here and no route either.
 */
export const navItems: readonly NavItem[] = [
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
];

/** The screens filed under one folder, in registration order. */
export const navItemsInFolder = (folder: NavFolderId): readonly NavItem[] =>
  navItems.filter((item) => item.folder === folder);
