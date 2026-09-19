import type { SvgIconComponent } from "@mui/icons-material";
import type { AppLanguage } from "../../i18n";
import { localizedText, type LocalizedText } from "../../lib/libraryCatalog";
import { TreeManager } from "../../lib/treeManager";
import { navItemsInFolder } from "./navItems";
import { navFolders } from "./navFolders";

/**
 * The navigation as a tree the sidebar renders: a node per folder, holding its
 * sub-folder nodes (folders first) and then a node per screen that names it.
 * Any depth — `navFolders` in `navFolders.ts` decides. This is the only place
 * `TreeManager` is used to walk the navigation; nothing else walks it by hand.
 *
 * **A node's name is either chrome or content.** `labelKey` is an `src/locales`
 * key, which is what an authored screen or folder carries — the app ships those
 * strings and `locales.test.ts` asserts both catalogs have them. `label` is a
 * per-language `{ en, he }` carried by the data, which is what a folder
 * *generated* from a library catalog carries (`navFromLibrary.ts`): a `.pgn`
 * file dropped into `src/data/pgn/` must not need a locale edit, and it has no
 * catalog key to assert. Exactly one of the two; `navLabel` reads whichever is
 * there and `navLabelKeys` reports only the first kind.
 */
export type NavTreeNode = {
  kind: "folder" | "screen";
  /** Folder id for a folder node; the route path for a screen node. */
  id: string;
  /** i18n key — for a node whose name is chrome the app ships. */
  labelKey?: string;
  /** Resolved per-language name — for a node generated from a data catalog. */
  label?: LocalizedText;
  icon: SvgIconComponent;
  /** The route, screen nodes only. */
  to?: string;
  children?: NavTreeNode[];
  /** Carried from a single-entry folder, for the top-level fold. */
  singleEntry?: boolean;
};

/**
 * What the builder needs of a folder and of a screen. Structural, and generic
 * in the id, so a test fixture can nest ids of its own without pretending to be
 * a `NavFolderId` — `NavFolder` and `NavItem` satisfy them as they stand.
 */
type FolderLike<Id extends string> = {
  id: Id;
  labelKey?: string;
  label?: LocalizedText;
  icon: SvgIconComponent;
  children?: readonly FolderLike<Id>[];
  singleEntry?: boolean;
};

type ScreenLike = {
  to: string;
  labelKey?: string;
  label?: LocalizedText;
  icon: SvgIconComponent;
};

/** Carry across whichever of the two naming fields the input has. */
const nameOf = (source: { labelKey?: string; label?: LocalizedText }) => ({
  ...(source.labelKey !== undefined ? { labelKey: source.labelKey } : {}),
  ...(source.label !== undefined ? { label: source.label } : {}),
});

/**
 * Pure builder — folders in, tree out, with sub-folders ordered before the
 * screens of the same folder at every level. Both inputs are parameters rather
 * than module imports so tests can nest deeper than the shipped tree.
 */
export const buildNavTree = <Id extends string>(
  folders: readonly FolderLike<Id>[],
  screensOf: (folder: Id) => readonly ScreenLike[],
): NavTreeNode[] =>
  folders.map((folder) => ({
    kind: "folder",
    id: folder.id,
    ...nameOf(folder),
    icon: folder.icon,
    ...(folder.singleEntry ? { singleEntry: true } : {}),
    children: [
      ...buildNavTree(folder.children ?? [], screensOf),
      ...screensOf(folder.id).map((item) => ({
        kind: "screen" as const,
        id: item.to,
        ...nameOf(item),
        icon: item.icon,
        to: item.to,
      })),
    ],
  }));

/**
 * Fold a redundant category folder into its list screen.
 *
 * A library section (User PGNs) models a category as a folder holding one
 * same-named list screen. For a **leaf** category that folder is pure overhead:
 * a second click, a second copy of the name, and nothing inside it but the one
 * screen. So the sidebar renders it as just that screen.
 *
 * The rule is exactly "one child, and it is a screen":
 *
 * - a category that also holds **sub-folders** keeps its folder, and its own
 *   list screen sits alongside them (two-or-more children — untouched);
 * - a manifest **group** that gathers several `.pgn` files under one named
 *   folder keeps its folder too — once its own leaf children have folded down
 *   to screens it holds several of them, which is again two-or-more children.
 *
 * Applied **below the top level only**: the top-level rows are app-area
 * groupings (Engine, Games, Tools…), not categories. A top-level folder is
 * folded only by the other rule — `foldSingleEntryFolders`, for a folder
 * marked as one destination — so every level is folded by exactly one of the
 * two.
 */
export const collapseLeafCategory = (node: NavTreeNode): NavTreeNode => {
  if (node.kind !== "folder") return node;
  const children = (node.children ?? []).map(collapseLeafCategory);
  return children.length === 1 && children[0].kind === "screen"
    ? children[0]
    : { ...node, children };
};

/**
 * The built tree with every redundant leaf-category folder folded away. Kept
 * out of `buildNavTree` itself so the pure builder still round-trips a fixture
 * unchanged; `navTree` is the one caller that wants the fold.
 */
export const collapseLeafCategories = (tree: NavTreeNode[]): NavTreeNode[] =>
  tree.map((folder) =>
    folder.kind === "folder"
      ? { ...folder, children: (folder.children ?? []).map(collapseLeafCategory) }
      : folder,
  );

/**
 * Fold a **single-entry** folder into its one screen, under the folder's own
 * name.
 *
 * An app-area folder can be one destination rather than a grouping: the
 * Openings folder holds one screen worth reaching for, so a folder row that
 * expands to a single link is two clicks and a second row on the way to it.
 * Marked `singleEntry` in `navFolders.ts`, it renders as just that screen —
 * one clickable row, named by the **folder** (the folder's name is what the
 * reader navigates by, and the screen's own label says what is inside it, so
 * showing both would read the same thing twice) — carrying the folder's icon,
 * and navigating to the screen's route.
 *
 * Applied **at the top level only** — the counterpart of
 * `collapseLeafCategory`'s below-the-top-level-only rule, so every level is
 * folded by exactly one of the two. A top-level screen row has no folder
 * ancestors, so its exact-pathname active state shows with nothing opened.
 *
 * Fires on the same shape test the leaf fold applies — one child, and it is a
 * screen. A `singleEntry` folder that does not match (two screens, or a
 * sub-folder) stays a folder and the flag sits inert, the same way a
 * mis-shaped leaf category does.
 */
export const foldSingleEntryFolders = (tree: NavTreeNode[]): NavTreeNode[] =>
  tree.map((node) => {
    if (node.kind !== "folder" || !node.singleEntry) return node;
    const [only] = node.children ?? [];
    return node.children?.length === 1 &&
      only.kind === "screen" &&
      only.to !== undefined
      ? {
          kind: "screen",
          id: only.to,
          ...nameOf(node),
          icon: node.icon,
          to: only.to,
        }
      : node;
  });

/** Build the tree fresh from the registries. Cheap — a handful of nodes. */
export const navTree = (): NavTreeNode[] =>
  collapseLeafCategories(
    foldSingleEntryFolders(buildNavTree(navFolders(), navItemsInFolder)),
  );

/**
 * The folder ids from the top of the tree down to the screen at `to`, in order
 * — the breadcrumb trail, and the chain the sidebar expands so the active
 * screen is never hidden. Empty for a path that is not a screen — and for one
 * folded to the top level by `foldSingleEntryFolders`, which has no folder
 * ancestors to open.
 */
export const folderPath = (to: string, tree: NavTreeNode[] = navTree()): string[] =>
  (
    new TreeManager<NavTreeNode>(tree).getPath(
      (node) => node.kind === "screen" && node.to === to,
    ) ?? []
  )
    .filter((node) => node.kind === "folder")
    .map((node) => node.id);

/**
 * The folder ids from the top of the tree down to the folder `id` itself,
 * inclusive — `folderPath`'s counterpart for a folder rather than a screen.
 * It is what the sidebar opens when a folder is clicked: opening a sub-folder
 * has to open the folders it lives in, or it would open inside a shut parent.
 * Empty for an id that is not a folder in this tree.
 */
export const folderChain = (id: string, tree: NavTreeNode[] = navTree()): string[] =>
  (
    new TreeManager<NavTreeNode>(tree).getPath(
      (node) => node.kind === "folder" && node.id === id,
    ) ?? []
  ).map((node) => node.id);

/**
 * A node's name, from wherever it keeps it — the one place the two kinds are
 * told apart, so the sidebar and the landing page do not each have to.
 */
export const navLabel = (
  node: Pick<NavTreeNode, "labelKey" | "label">,
  translate: (key: string) => string,
  language: AppLanguage,
): string =>
  node.labelKey !== undefined
    ? translate(node.labelKey)
    : localizedText(node.label, language);

/**
 * Every **catalog key** the sidebar renders, folders and screens alike. The
 * catalog test reads the tree through this rather than listing keys by hand.
 *
 * Nodes named from the data are skipped rather than reported with some stand-in
 * key: they have no catalog entry by design, and a generated category must not
 * make `locales.test.ts` fail the day it ships. The assertion the test makes is
 * therefore unchanged and still exact — every key here really must resolve in
 * both languages.
 */
export const navLabelKeys = (tree: NavTreeNode[] = navTree()): string[] =>
  new TreeManager<NavTreeNode>(tree)
    .toArray()
    .map((node) => node.labelKey)
    .filter((key): key is string => key !== undefined);
