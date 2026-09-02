import type { SvgIconComponent } from "@mui/icons-material";
import { TreeManager } from "../../lib/treeManager";
import { navItemsInFolder } from "./navItems";
import { navFolders } from "./navFolders";

/**
 * The navigation as a tree the sidebar renders: a node per folder, holding its
 * sub-folder nodes (folders first) and then a node per screen that names it.
 * Any depth — `navFolders` in `navFolders.ts` decides. This is the only place
 * `TreeManager` is used; nothing else walks the tree by hand.
 */
export type NavTreeNode = {
  kind: "folder" | "screen";
  /** Folder id for a folder node; the route path for a screen node. */
  id: string;
  /** i18n key — the renderer calls `t(labelKey)` for folders and screens alike. */
  labelKey: string;
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
  labelKey: string;
  icon: SvgIconComponent;
  children?: readonly FolderLike<Id>[];
};

type ScreenLike = { to: string; labelKey: string; icon: SvgIconComponent };

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
    labelKey: folder.labelKey,
    icon: folder.icon,
    children: [
      ...buildNavTree(folder.children ?? [], screensOf),
      ...screensOf(folder.id).map((item) => ({
        kind: "screen" as const,
        id: item.to,
        labelKey: item.labelKey,
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
 * Every catalog key the sidebar renders, folders and screens alike. The
 * catalog test reads the tree through this rather than listing keys by hand.
 */
export const navLabelKeys = (tree: NavTreeNode[] = navTree()): string[] =>
  new TreeManager<NavTreeNode>(tree).toArray().map((node) => node.labelKey);
