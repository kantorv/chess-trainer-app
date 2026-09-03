import type { SvgIconComponent } from "@mui/icons-material";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderSpecialRoundedIcon from "@mui/icons-material/FolderSpecialRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
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
  | "tools";

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
  {
    id: "tools",
    labelKey: "nav.folders.tools",
    icon: HandymanRoundedIcon,
  },
];
