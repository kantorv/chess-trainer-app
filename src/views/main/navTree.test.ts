import { describe, expect, it } from "vitest";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import { TreeManager } from "../../lib/treeManager";
import {
  buildNavTree,
  folderPath,
  navLabelKeys,
  navTree,
  type NavTreeNode,
} from "./navTree";
import { navItems } from "./navItems";
import { navFolders } from "./navFolders";

describe("the shipped nav tree", () => {
  it("mirrors the folder tree at the top and holds every screen as a leaf", () => {
    const tree = navTree();

    expect(tree.map((node) => node.id)).toEqual(navFolders.map((f) => f.id));
    expect(tree.every((node) => node.kind === "folder")).toBe(true);

    const screens = new TreeManager<NavTreeNode>(tree)
      .toArray()
      .filter((node) => node.kind === "screen");
    expect(screens.map((node) => node.to)).toEqual(navItems.map((i) => i.to));
  });

  it("files every screen under the folder it names", () => {
    for (const item of navItems) {
      expect(folderPath(item.to)).toEqual([item.folder]);
    }
  });

  it("returns an empty breadcrumb for a path that is not a screen", () => {
    expect(folderPath("/nope")).toEqual([]);
    expect(folderPath("")).toEqual([]);
  });

  it("lists every label key the sidebar renders, folders and screens alike", () => {
    expect(navLabelKeys()).toEqual(
      expect.arrayContaining([
        ...navFolders.map((f) => f.labelKey),
        ...navItems.map((i) => i.labelKey),
      ]),
    );
  });
});

describe("buildNavTree nests folders to any depth", () => {
  /*
    A folder holding a sub-folder *and* screens of its own, three levels deep —
    deeper than anything shipped. No cast anywhere: the builder is generic in
    the folder id, so a fixture nests ids of its own without pretending to be a
    `NavFolderId`. Nesting is a data edit; the builder is untouched.
  */
  const icon = GridViewRoundedIcon;
  const nested = [
    {
      id: "outer",
      labelKey: "outer",
      icon,
      children: [
        {
          id: "inner",
          labelKey: "inner",
          icon,
          children: [{ id: "deepest", labelKey: "deepest", icon }],
        },
      ],
    },
    { id: "sibling", labelKey: "sibling", icon },
  ] as const;

  const screensOf = (id: string) =>
    ({
      outer: [
        { to: "/a", labelKey: "a", icon },
        { to: "/b", labelKey: "b", icon },
      ],
      inner: [{ to: "/c", labelKey: "c", icon }],
      deepest: [{ to: "/d", labelKey: "d", icon }],
    })[id] ?? [];

  const tree = buildNavTree(nested, screensOf);

  it("puts sub-folders before the folder's own screens", () => {
    expect(tree[0].children?.map((n) => `${n.kind}:${n.id}`)).toEqual([
      "folder:inner",
      "screen:/a",
      "screen:/b",
    ]);
  });

  it("attaches each screen under the folder that names it, at every level", () => {
    const inner = tree[0].children?.[0] as NavTreeNode;
    expect(inner.children?.map((n) => n.to)).toEqual([undefined, "/c"]);

    const deepest = inner.children?.[0] as NavTreeNode;
    expect(deepest.children?.map((n) => n.to)).toEqual(["/d"]);
  });

  it("yields the full folder breadcrumb three levels down", () => {
    expect(folderPath("/d", tree)).toEqual(["outer", "inner", "deepest"]);
    expect(folderPath("/a", tree)).toEqual(["outer"]);
  });

  it("walks every level depth-first, parent before children", () => {
    expect(
      new TreeManager<NavTreeNode>(tree)
        .toArray()
        .map((node) => `${node.kind}:${node.id}`),
    ).toEqual([
      "folder:outer",
      "folder:inner",
      "folder:deepest",
      "screen:/d",
      "screen:/c",
      "screen:/a",
      "screen:/b",
      "folder:sibling",
    ]);
  });

  it("is pure — the same input builds an equal tree and mutates nothing", () => {
    const again = buildNavTree(nested, screensOf as never);
    expect(again).toEqual(tree);
    expect(again).not.toBe(tree);
    expect(nested[0].children?.[0].id).toBe("inner");
  });
});
