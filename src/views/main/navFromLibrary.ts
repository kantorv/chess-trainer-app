import type { SvgIconComponent } from "@mui/icons-material";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";

import { positionsCatalog } from "../../lib/positionsCatalog";
import type { LibraryCatalog, LibraryCategory } from "../../lib/libraryCatalog";
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
 *   carrying the category's name. That is the shape Mates already ships (the
 *   *Basic* folder holding the *Basic mates* screen), so the sidebar reads the
 *   same in both sections, and a category with sub-categories holds them
 *   alongside its own list rather than instead of it. A *position* stays a
 *   route rather than a nav entry, or the sidebar would grow without bound.
 * - **A generated node is named from the data**, so it carries `label` rather
 *   than a `labelKey` — see `navTree.ts`. There is no locale key to write, and
 *   `locales.test.ts` keeps asserting exactly what it asserted before.
 *
 * Folder ids are namespaced (`positions:queen-vs-rook/rosettes`) so a generated
 * id can never collide with an authored one, and so the id says at a glance
 * which section and which category a row belongs to.
 */

export type LibraryNavOptions = {
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
 * One list screen per category, at every depth, each filed under that
 * category's generated folder.
 *
 * Emitted **children before the category's own screen**, which is the order
 * `buildNavTree` lays a folder out in (sub-folders first, then that folder's
 * own screens). Registration order is otherwise invisible — `navItemsInFolder`
 * filters, and each generated folder holds exactly one screen — but keeping the
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

/** How the Positions section is generated — the only shipped use of the above. */
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
