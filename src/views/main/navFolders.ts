import type { SvgIconComponent } from "@mui/icons-material";
import FolderSpecialRoundedIcon from "@mui/icons-material/FolderSpecialRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";

import type { LocalizedText } from "../../lib/libraryCatalog";
import { userPgnsNavFolder } from "./navFromLibrary";

/**
 * Folders are the groupings in the sidebar. Each screen names exactly one of
 * them in `NavItem.folder`; the folder itself is an id with a name and an icon.
 * Routes stay global — a folder is an organisational overlay over `App.tsx`,
 * not a route of its own, so nothing here appears in a URL.
 *
 * `navFolders` is a **tree**: a folder can hold sub-folders and screens at the
 * same time, to any depth. Nesting one is a data edit here; the renderer in
 * `Sidebar.tsx` recurses and needs no change.
 *
 * To add a folder: place it in `authoredFolders` (nested or not), give it a
 * `labelKey` present in both `en.ts` and `he.ts`, and set `folder` on the
 * screens that join it.
 */

/**
 * A folder id. A plain string rather than a union of the authored ids, because
 * the User PGNs subtree is **generated** from the `.pgn` files under
 * `src/data/pgn/` — a file dropped in there would otherwise be a TypeScript
 * edit, which is the one thing that section exists to avoid. Authored ids are
 * still written out below, where a typo is caught by the screen that fails to
 * find its folder.
 */
export type NavFolderId = string;

export type NavFolder = {
  id: NavFolderId;
  /** i18n key — for an authored folder, whose name is chrome the app ships. */
  labelKey?: string;
  /** Per-language name — for a folder generated from a data catalog. */
  label?: LocalizedText;
  icon: SvgIconComponent;
  /** Sub-folders. A folder may carry these *and* screens of its own. */
  children?: NavFolder[];
};

/**
 * The folder tree, top to bottom.
 *
 * Every folder here is written out by hand except one: the User PGNs subtree is
 * **generated** by `navFromLibrary.ts` from a library catalog — a folder per
 * `.pgn` file under `src/data/pgn/`, named from its data, so dropping a PGN
 * file in changes this tree without touching this file, which is the whole of
 * that section's promise.
 *
 * **A function, not a constant**, and that is the whole of what uploads cost
 * the navigation: the User PGNs library grows a folder when the reader uploads
 * a `.pgn` (`lib/pgnUploads.ts`), so the tree is built when it is asked for
 * rather than when this module is imported. `navTree()` already rebuilt on
 * every call, and `Sidebar.tsx` re-renders on a store change, so the new folder
 * appears without a reload. Everything else here is unchanged.
 */
export const navFolders = (): readonly NavFolder[] => [
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
  userPgnsNavFolder(),
  {
    id: "tools",
    labelKey: "nav.folders.tools",
    icon: HandymanRoundedIcon,
  },
];
