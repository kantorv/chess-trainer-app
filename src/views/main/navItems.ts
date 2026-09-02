import type { SvgIconComponent } from "@mui/icons-material";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import TouchAppRoundedIcon from "@mui/icons-material/TouchAppRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
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
 * The four board screens, in one place. The sidebar builds its tree from this
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
];

/** The screens filed under one folder, in registration order. */
export const navItemsInFolder = (folder: NavFolderId): readonly NavItem[] =>
  navItems.filter((item) => item.folder === folder);
