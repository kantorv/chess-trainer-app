import type { SvgIconComponent } from "@mui/icons-material";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderSpecialRoundedIcon from "@mui/icons-material/FolderSpecialRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";

/**
 * Folders are the groupings in the sidebar. Each screen names exactly one of
 * them in `NavItem.folder`; the folder itself is an id with a label key and an
 * icon. Routes stay global — a folder is an organisational overlay over
 * `App.tsx`, not a route of its own, so nothing here appears in a URL.
 *
 * `navFolders` is a **tree**: a folder can hold sub-folders and screens at the
 * same time, to any depth. Nesting one is a data edit here; the renderer in
 * `Sidebar.tsx` recurses and needs no change.
 *
 * To add a folder: extend `NavFolderId`, place it in `navFolders` (nested or
 * not), give it a `labelKey` present in both `en.ts` and `he.ts`, and set
 * `folder` on the screens that join it.
 */
export type NavFolderId =
  | "basic-examples"
  | "engine"
  | "masked-pieces"
  | "games"
  | "tools"
  | "mates"
  | "mates-basic"
  | "mates-advanced"
  | "mates-complex";

export type NavFolder = {
  id: NavFolderId;
  /** i18n key, not a label — the sidebar renders `t(labelKey)`. */
  labelKey: string;
  icon: SvgIconComponent;
  /** Sub-folders. A folder may carry these *and* screens of its own. */
  children?: NavFolder[];
};

/** The folder tree, top to bottom. */
export const navFolders: readonly NavFolder[] = [
  {
    id: "basic-examples",
    labelKey: "nav.folders.basicExamples",
    icon: FolderRoundedIcon,
  },
  {
    id: "engine",
    labelKey: "nav.folders.engine",
    icon: MemoryRoundedIcon,
  },
  {
    id: "masked-pieces",
    labelKey: "nav.folders.maskedPieces",
    icon: VisibilityOffRoundedIcon,
  },
  {
    id: "games",
    labelKey: "nav.folders.games",
    icon: FolderSpecialRoundedIcon,
  },
  /*
    The first shipped folder with sub-folders. It is a data edit and nothing
    else: `buildNavTree` recurses and `Sidebar.tsx`'s `TreeRow` recurses, and
    both already carried fixtures nested deeper than anything that shipped.

    Each sub-folder holds exactly one screen — the category's list — and the
    positions inside it stay data. A folder per position would grow the sidebar
    without bound and would force these two registries to become data-driven;
    `/mates/<category>/<id>` is a route rather than a nav entry for that reason.
  */
  {
    id: "mates",
    labelKey: "nav.folders.mates",
    icon: EmojiEventsRoundedIcon,
    children: [
      {
        id: "mates-basic",
        labelKey: "nav.folders.matesBasic",
        icon: SchoolRoundedIcon,
      },
      {
        id: "mates-advanced",
        labelKey: "nav.folders.matesAdvanced",
        icon: TrendingUpRoundedIcon,
      },
      {
        id: "mates-complex",
        labelKey: "nav.folders.matesComplex",
        icon: PsychologyRoundedIcon,
      },
    ],
  },
  {
    id: "tools",
    labelKey: "nav.folders.tools",
    icon: HandymanRoundedIcon,
  },
];
