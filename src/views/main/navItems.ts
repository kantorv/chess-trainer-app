import type { SvgIconComponent } from "@mui/icons-material";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import TouchAppRoundedIcon from "@mui/icons-material/TouchAppRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";

export type NavItem = {
  /** Route path, matched against `useLocation().pathname` for the active state. */
  to: string;
  /** i18n key, not a label — the sidebar renders `t(labelKey)`. */
  labelKey: string;
  icon: SvgIconComponent;
};

/**
 * The four board screens, in one place. The sidebar maps over this rather than
 * repeating a list item per route, so adding a screen is one entry here plus
 * the route in `App.tsx` and a string in both catalogs.
 */
export const navItems: readonly NavItem[] = [
  { to: "/", labelKey: "nav.basicBoard", icon: GridViewRoundedIcon },
  { to: "/move", labelKey: "nav.movingPiece", icon: TouchAppRoundedIcon },
  { to: "/analyze", labelKey: "nav.engineEvaluation", icon: InsightsRoundedIcon },
  { to: "/player1", labelKey: "nav.playEngine", icon: SmartToyRoundedIcon },
];
