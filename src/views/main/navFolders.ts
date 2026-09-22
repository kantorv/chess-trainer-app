import type { SvgIconComponent } from "@mui/icons-material";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import SnippetFolderRoundedIcon from "@mui/icons-material/SnippetFolderRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";

import type { LocalizedText } from "../../lib/localizedText";

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
 * A folder id. A plain string rather than a union of the authored ids, so a
 * folder built from data (the `label` case) needs no TypeScript edit. Authored
 * ids are written out below, where a typo is caught by the screen that fails
 * to find its folder.
 */
export type NavFolderId = string;

export type NavFolder = {
  id: NavFolderId;
  /** i18n key — for an authored folder, whose name is chrome the app ships. */
  labelKey?: string;
  /** Per-language name — for a folder whose name is data, not chrome. */
  label?: LocalizedText;
  icon: SvgIconComponent;
  /** Sub-folders. A folder may carry these *and* screens of its own. */
  children?: NavFolder[];
  /**
   * The folder is one destination, not a grouping: the top level renders its
   * single screen as one clickable row under the **folder's** own name and
   * icon, navigating straight to that screen — no expand toggle, one click.
   * The screen's own label (which says what is inside the folder) never
   * renders (`navTree.ts`, `foldSingleEntryFolders`), and a board screen the
   * entry hides is reached from that screen's own controls, not from here.
   */
  singleEntry?: boolean;
};

/**
 * The folder tree, top to bottom.
 *
 * **A function, not a constant**, so a dev-only folder can be a spread gated
 * on `import.meta.env.DEV`, evaluated when the tree is asked for
 * (`chessboard.md` §9.5 says how to open one). The Library's collections are
 * not folders here: they are the rows of the Library screen (`/library`), so
 * a `.pgn` dropped into `src/data/library/` or uploaded by the reader changes
 * that screen, not this tree.
 */
export const navFolders = (): readonly NavFolder[] => [
  {
    id: "engine",
    labelKey: "nav.folders.engine",
    icon: MemoryRoundedIcon,
  },
  /*
    The Library (CTA-75): collections of games — the shipped `.pgn` files and
    the reader's uploads — each a table, each game an analysis board.
  */
  {
    id: "library",
    labelKey: "nav.folders.library",
    icon: SnippetFolderRoundedIcon,
  },
  {
    id: "analysis",
    labelKey: "nav.folders.analysisBoard",
    icon: AccountTreeRoundedIcon,
    // One destination: the saved list is the screen worth reaching for, so
    // the folder renders as one clickable row to it; the board is the saved
    // list's New button.
    singleEntry: true,
  },
  {
    id: "openings",
    labelKey: "nav.folders.openings",
    icon: TravelExploreRoundedIcon,
    // One destination: the folder renders as one clickable row to the
    // Openings explorer.
    singleEntry: true,
  },
  /*
    The reader's own repertoires (CTA-61): the list and the screen they are
    brought in on. A repertoire's board is reached from its row, not from here —
    `/repertoires/<id>` is a route, not a nav entry, like a library item.
  */
  {
    id: "repertoires",
    labelKey: "nav.folders.repertoires",
    icon: MenuBookRoundedIcon,
    // One destination: the folder renders as one clickable row to the
    // Repertoires list, whose own "Add repertoire" link reaches
    // `/repertoires/new`.
    singleEntry: true,
  },
  /*
    The app's own settings (CTA-86), one screen per tab of `/settings/<tab>`
    — Export today. A folder rather than a single entry, so a tab added later
    is one more `navItems()` entry here.
  */
  {
    id: "settings",
    labelKey: "nav.folders.settings",
    icon: SettingsRoundedIcon,
  },
];
