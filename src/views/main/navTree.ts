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
 * *generated* from a library catalog carries (`navFromLibrary.ts`): a category
 * added to `src/data/positions.json` must not need a locale edit, and it has no
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

/** Build the tree fresh from the registries. Cheap — a handful of nodes. */
export const navTree = (): NavTreeNode[] =>
  buildNavTree(navFolders, navItemsInFolder);

/**
 * The folder ids from the top of the tree down to the screen at `to`, in order
 * — the breadcrumb trail, and the chain the sidebar expands so the active
 * screen is never hidden. Empty for a path that is not a screen.
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
