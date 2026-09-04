import type { SvgIconComponent } from "@mui/icons-material";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import SnippetFolderRoundedIcon from "@mui/icons-material/SnippetFolderRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";

import { userPgnsLibrary } from "../../lib/pgnCatalog";
import { pgnKindOf } from "../../lib/pgnKind";
import { positionsCatalog } from "../../lib/positionsCatalog";
import {
  itemsInLibraryCategory,
  type LibraryCatalog,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import type { NavFolder } from "./navFolders";
import type { NavItem } from "./navItems";

/**
 * The sidebar subtree of a **library section**, generated from its catalog.
 *
 * The Mates section registers its three categories by hand, because three is
 * all it will ever have. A library that grows cannot: the whole point of
 * `src/data/positions.json` is that a category at any depth is a data edit, and
 * a hand-written folder plus a hand-written screen entry per category would
 * make it three edits in three files. So the folder tree and the list screens
 * are *built* from the catalog and merged into the authored registries, and
 * everything downstream — `buildNavTree`, `folderPath`, `folderChain`,
 * `Sidebar.tsx`'s `TreeRow`, the landing page — recursed already and did not
 * change for it.
 *
 * Two things make that work:
 *
 * - **A category is a folder holding exactly one screen**, its own list, both
 *   carrying the category's name — and a category with sub-categories holds
 *   them alongside its own list rather than instead of it. For a *leaf*
 *   category that folder is redundant, so `collapseLeafCategories` in
 *   `navTree.ts` folds it back down to just the screen before the sidebar
 *   renders it (the same fold the hand-written Mates sub-folders now get). A
 *   *position* stays a route rather than a nav entry, or the sidebar would grow
 *   without bound.
 * - **A category that only groups sub-categories — no items of its own — gets
 *   no list screen**, just the folder. A manifest group like
 *   `chess-fundamentals-capablanca` holds its three parts and nothing else, so
 *   a list screen for it would be a second, empty row named the same as the
 *   folder it sits in. It is `collapseLeafCategories`' `group` shape.
 * - **A generated node is named from the data**, so it carries `label` rather
 *   than a `labelKey` — see `navTree.ts`. There is no locale key to write, and
 *   `locales.test.ts` keeps asserting exactly what it asserted before.
 *
 * Folder ids are namespaced (`positions:queen-vs-rook/rosettes`) so a generated
 * id can never collide with an authored one, and so the id says at a glance
 * which section and which category a row belongs to.
 */

export type LibraryNavOptions = {
  /**
   * Whether this category gets a list screen of its own. The default rule is
   * below in {@link libraryNavItems}: everything except a category that only
   * groups sub-categories and holds nothing itself.
   *
   * A section overrides it when one of its grouping folders has a screen worth
   * reaching anyway — the User PGNs **collection**, whose index page is a real
   * screen (`views/pgn/PgnCollection.tsx`) rather than a list that would come
   * out empty, and its **Uploads** folder, whose screen is the upload button
   * itself and therefore has to be there before anything is in the folder.
   */
  hasScreen?: (category: LibraryCategory) => boolean;
  /** Folder id of the section's root folder, and the namespace of every id under it. */
  rootId: string;
  /** The root folder's name — chrome, since the *section* is part of the app. */
  rootLabelKey: string;
  rootIcon: SvgIconComponent;
  /** Route base of the section's screens, no trailing slash. */
  routeBase: string;
  /** The icon every generated category folder takes. */
  categoryIcon: SvgIconComponent;
  /** The icon every generated list screen takes. */
  screenIcon: SvgIconComponent;
};

/** A generated folder's id: the section's namespace plus the category path. */
export const libraryFolderId = (rootId: string, path: string): string =>
  `${rootId}:${path}`;

const folderOf = (
  category: LibraryCategory,
  options: LibraryNavOptions,
): NavFolder => ({
  id: libraryFolderId(options.rootId, category.path),
  ...(category.labelKey !== undefined ? { labelKey: category.labelKey } : {}),
  ...(category.label !== undefined ? { label: category.label } : {}),
  icon: options.categoryIcon,
  ...(category.children.length > 0
    ? { children: category.children.map((child) => folderOf(child, options)) }
    : {}),
});

/** The section's root folder, with a sub-folder per category, nested as the data is. */
export const libraryNavFolder = (
  catalog: LibraryCatalog,
  options: LibraryNavOptions,
): NavFolder => ({
  id: options.rootId,
  labelKey: options.rootLabelKey,
  icon: options.rootIcon,
  children: catalog.categories.map((category) => folderOf(category, options)),
});

/**
 * One list screen per category that has items of its own, at every depth, each
 * filed under that category's generated folder.
 *
 * A category that **only groups sub-categories** — a manifest group like
 * `chess-fundamentals-capablanca` — is skipped: it keeps its folder (from
 * {@link libraryNavFolder}) but gets no screen, so the sidebar does not show a
 * second row named the same as the folder holding it.
 *
 * Emitted **children before the category's own screen**, which is the order
 * `buildNavTree` lays a folder out in (sub-folders first, then that folder's
 * own screens). Registration order is otherwise invisible — `navItemsInFolder`
 * filters, and each generated folder holds at most one screen — but keeping the
 * two in step means "the tree's screens are `navItems`, in order" stays an
 * assertion rather than an approximation.
 */
export const libraryNavItems = (
  catalog: LibraryCatalog,
  options: LibraryNavOptions,
): NavItem[] => {
  const items: NavItem[] = [];

  const walk = (categories: readonly LibraryCategory[]) => {
    for (const category of categories) {
      walk(category.children);
      const groupsOnly =
        category.children.length > 0 &&
        itemsInLibraryCategory(category.path, catalog).length === 0;
      // The section may claim a group anyway — see `hasScreen`.
      if (groupsOnly && options.hasScreen?.(category) !== true) continue;
      items.push({
        to: `${options.routeBase}/${category.path}`,
        ...(category.labelKey !== undefined ? { labelKey: category.labelKey } : {}),
        ...(category.label !== undefined ? { label: category.label } : {}),
        icon: options.screenIcon,
        folder: libraryFolderId(options.rootId, category.path),
      });
    }
  };

  walk(catalog.categories);
  return items;
};

/** How the Positions section is generated. */
export const positionsNavOptions: LibraryNavOptions = {
  rootId: "positions",
  rootLabelKey: "nav.folders.positions",
  rootIcon: LibraryBooksRoundedIcon,
  routeBase: "/positions",
  categoryIcon: FolderRoundedIcon,
  screenIcon: ViewListRoundedIcon,
};

/** The Positions folder subtree, built from the shipped catalog. */
export const positionsNavFolder = (): NavFolder =>
  libraryNavFolder(positionsCatalog, positionsNavOptions);

/** The Positions list screens, built from the shipped catalog. */
export const positionsNavItems = (): NavItem[] =>
  libraryNavItems(positionsCatalog, positionsNavOptions);

/**
 * How the User PGNs section is generated.
 *
 * The same generator over a catalog whose categories came out of `.pgn` files
 * rather than out of JSON — which is the whole point of building the subtree
 * from a catalog rather than from the data file behind one. Nothing here knows
 * that a folder is a file, and nothing had to change for it: **dropping a
 * `.pgn` into `src/data/pgn/` puts a folder in the sidebar.**
 */
export const userPgnsNavOptions: LibraryNavOptions = {
  /*
    A **collection** — one `.pgn` holding several studies — groups sub-folders
    and holds nothing itself, so the default rule would give it no screen. It
    has one: `PgnCollection` is the file's index page, with its counts, its
    author and its authored notes, and a folder that only expands would leave
    that unreachable. Every other group (a manifest shelf) keeps the default.
  */
  hasScreen: (category) => {
    const kind = pgnKindOf(category.path, userPgnsLibrary().kinds);
    return kind === "collection" || kind === "uploads";
  },
  rootId: "user-pgns",
  rootLabelKey: "nav.folders.userPgns",
  rootIcon: SnippetFolderRoundedIcon,
  routeBase: "/pgn",
  categoryIcon: FolderRoundedIcon,
  screenIcon: ViewListRoundedIcon,
};

/**
 * The User PGNs folder subtree, built from the **live** library — the shipped
 * files plus whatever the reader has uploaded, which is why this section's
 * registries are functions called per render rather than constants.
 */
export const userPgnsNavFolder = (): NavFolder =>
  libraryNavFolder(userPgnsLibrary(), userPgnsNavOptions);

/** The User PGNs list screens, from that same live library. */
export const userPgnsNavItems = (): NavItem[] =>
  libraryNavItems(userPgnsLibrary(), userPgnsNavOptions);
