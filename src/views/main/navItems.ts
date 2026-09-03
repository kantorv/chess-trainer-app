import type { SvgIconComponent } from "@mui/icons-material";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
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
