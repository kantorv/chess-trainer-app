import type { SvgIconComponent } from "@mui/icons-material";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import TouchAppRoundedIcon from "@mui/icons-material/TouchAppRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import type { NavFolderId } from "./navFolders";

export type NavItem = {
  /** Route path, matched against `useLocation().pathname` for the active state. */
  to: string;
  /** i18n key, not a label — the sidebar renders `t(labelKey)`. */
  labelKey: string;
  icon: SvgIconComponent;
  /** The folder this screen hangs under in the sidebar — an id from `navFolders`. */
  folder: NavFolderId;
};

/**
 * Every screen, in one place. The sidebar builds its tree from this
 * rather than repeating a list item per route, so adding a screen is one entry
 * here plus the route in `App.tsx` and a string in both catalogs.
 */
export const navItems: readonly NavItem[] = [
  {
    to: "/",
    labelKey: "nav.basicBoard",
    icon: GridViewRoundedIcon,
    folder: "basic-examples",
  },
  {
    to: "/move",
    labelKey: "nav.movingPiece",
    icon: TouchAppRoundedIcon,
    folder: "basic-examples",
  },
  {
    to: "/analyze",
    labelKey: "nav.engineEvaluation",
    icon: InsightsRoundedIcon,
    folder: "basic-examples",
  },
  {
    to: "/player1",
    labelKey: "nav.playEngine",
    icon: SmartToyRoundedIcon,
    folder: "basic-examples",
  },
  {
    to: "/engine/play",
    labelKey: "nav.playWithEngine",
    icon: SportsEsportsRoundedIcon,
    folder: "engine",
  },
  {
    to: "/games/load-pgn",
    labelKey: "nav.loadPgn",
    icon: UploadFileRoundedIcon,
    folder: "games",
  },
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
