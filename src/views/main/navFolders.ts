import type { SvgIconComponent } from "@mui/icons-material";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FolderSpecialRoundedIcon from "@mui/icons-material/FolderSpecialRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";

import type { LocalizedText } from "../../lib/libraryCatalog";
import { positionsNavFolder, userPgnsNavFolder } from "./navFromLibrary";

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
 * the Positions subtree is **generated** from `src/data/positions.json` — a
 * category added there would otherwise be a TypeScript edit, which is the one
 * thing that section exists to avoid. Authored ids are still written out below,
 * where a typo is caught by the screen that fails to find its folder.
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
 * Every folder here is written out by hand except two, and both are
 * **generated** by `navFromLibrary.ts` from a library catalog: the Positions
 * subtree is a folder per endgame category, nested exactly as
 * `src/data/positions.json` nests them, and the User PGNs subtree is a folder
 * per `.pgn` file under `src/data/pgn/`. Both are named from their data, so
 * adding a category — or dropping a PGN file in — changes this tree without
 * touching this file, which is the whole of those sections' promise.
 */
export const navFolders: readonly NavFolder[] = [
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

    Three categories is all this section will have, so they are written out.
    The Positions section below is the case where that stops being true.
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
  positionsNavFolder(),
  userPgnsNavFolder(),
  {
    id: "tools",
    labelKey: "nav.folders.tools",
    icon: HandymanRoundedIcon,
  },
];
