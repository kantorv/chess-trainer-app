import { describe, expect, it } from "vitest";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import { TreeManager } from "../../lib/treeManager";
import {
  buildNavTree,
  collapseLeafCategories,
  folderChain,
  folderPath,
  navLabelKeys,
  navTree,
  type NavTreeNode,
} from "./navTree";
import { navItems, navItemsInFolder } from "./navItems";
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
    const raw = buildNavTree(navFolders, navItemsInFolder);

    for (const item of navItems) {
      /*
        In the raw tree every screen still sits directly under the folder it
        names — that is the registration contract, unchanged.
      */
      const registered = folderPath(item.to, raw);
      expect(registered.length).toBeGreaterThan(0);
      expect(registered.at(-1)).toBe(item.folder);

      /*
        The rendered tree folds a redundant leaf-category folder away, so a
        screen that named one now hangs one level up. The breadcrumb is then a
        *prefix* of the registered chain — never empty, never a different
        branch.
      */
      const rendered = folderPath(item.to);
      expect(rendered.length).toBeGreaterThan(0);
      expect(registered.slice(0, rendered.length)).toEqual(rendered);
    }
  });

  it("returns an empty breadcrumb for a path that is not a screen", () => {
    expect(folderPath("/nope")).toEqual([]);
    expect(folderPath("")).toEqual([]);
  });

  it("lists every label key the sidebar renders, folders and screens alike", () => {
    /*
      Only the nodes whose name *is* a catalog key. A folder or screen generated
      from a library catalog is named from the data and has none — reporting a
      stand-in key for one would make `locales.test.ts` demand a catalog entry
      that must not exist.
    */
    const authoredKeys = [
      ...navFolders.map((f) => f.labelKey),
      ...navItems.map((i) => i.labelKey),
    ].filter((key) => key !== undefined);

    expect(navLabelKeys()).toEqual(expect.arrayContaining(authoredKeys));
    expect(navLabelKeys().every((key) => typeof key === "string")).toBe(true);
  });

  it("leaves a node named from the data out of the catalog keys", () => {
    // The Positions section's categories carry `{ en, he }` rather than a key —
    // the reason `navLabelKeys` filters at all. Asserted through `navLabel`, so
    // the node it skips is still one the sidebar can name.
    const dataNamed = new TreeManager<NavTreeNode>(navTree())
      .toArray()
      .filter((node) => node.labelKey === undefined);

    expect(dataNamed.length).toBeGreaterThan(0);
    for (const node of dataNamed) {
      expect(node.label?.en, `${node.id} has no data label either`).toBeTypeOf(
        "string",
      );
      expect(navLabelKeys()).not.toContain(node.id);
    }
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

  it("yields a folder's own ancestor chain, itself included", () => {
    // What the sidebar opens when a folder is clicked: the folders it lives in
    // come with it, or it would open inside a shut parent.
    expect(folderChain("deepest", tree)).toEqual(["outer", "inner", "deepest"]);
    expect(folderChain("outer", tree)).toEqual(["outer"]);
    expect(folderChain("sibling", tree)).toEqual(["sibling"]);
    // A screen is not a folder, and neither is an id that is not in the tree.
    expect(folderChain("/d", tree)).toEqual([]);
    expect(folderChain("nope", tree)).toEqual([]);
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

describe("collapseLeafCategories folds a redundant category folder", () => {
  const icon = GridViewRoundedIcon;

  /*
    Every shape the fold has to tell apart, one level down from a section root:

    - `leaf`   — a folder with one screen and nothing else → becomes the screen
    - `group`  — a folder with several screens (a multi-file PGN group, once its
                 own leaf children have folded) → stays a folder
    - `parent` — a folder with a sub-folder *and* its own list screen → stays a
                 folder, and the sub-folder folds inside it
  */
  const section: NavTreeNode = {
    kind: "folder",
    id: "section",
    label: { en: "Section" },
    icon,
    children: [
      {
        kind: "folder",
        id: "section:leaf",
        label: { en: "Leaf" },
        icon,
        children: [
          { kind: "screen", id: "/s/leaf", label: { en: "Leaf" }, icon, to: "/s/leaf" },
        ],
      },
      {
        kind: "folder",
        id: "section:group",
        label: { en: "Group" },
        icon,
        children: [
          {
            kind: "folder",
            id: "section:group/a",
            label: { en: "A" },
            icon,
            children: [
              { kind: "screen", id: "/s/group/a", label: { en: "A" }, icon, to: "/s/group/a" },
            ],
          },
          { kind: "screen", id: "/s/group/b", label: { en: "B" }, icon, to: "/s/group/b" },
        ],
      },
      {
        kind: "folder",
        id: "section:parent",
        label: { en: "Parent" },
        icon,
        children: [
          {
            kind: "folder",
            id: "section:parent/child",
            label: { en: "Child" },
            icon,
            children: [
              { kind: "screen", id: "/s/parent/child", label: { en: "Child" }, icon, to: "/s/parent/child" },
            ],
          },
          { kind: "screen", id: "/s/parent", label: { en: "Parent" }, icon, to: "/s/parent" },
        ],
      },
    ],
  };

  const folded = collapseLeafCategories([section])[0];

  it("keeps the section root a folder and folds its leaf child to a screen", () => {
    expect(folded.kind).toBe("folder");
    const [leaf] = folded.children ?? [];
    expect(leaf).toMatchObject({ kind: "screen", to: "/s/leaf" });
  });

  it("keeps a folder that still holds more than one child", () => {
    const group = folded.children?.find((n) => n.id === "section:group");
    expect(group?.kind).toBe("folder");
    // Its own leaf child folded, so it now lists two screens.
    expect(group?.children?.map((n) => `${n.kind}:${n.to}`)).toEqual([
      "screen:/s/group/a",
      "screen:/s/group/b",
    ]);
  });

  it("keeps a parent that has a sub-folder alongside its own screen", () => {
    const parent = folded.children?.find((n) => n.id === "section:parent");
    expect(parent?.kind).toBe("folder");
    expect(parent?.children?.map((n) => `${n.kind}:${n.id}`)).toEqual([
      // the sub-folder folded to its screen, the parent's own screen stays
      "screen:/s/parent/child",
      "screen:/s/parent",
    ]);
  });

  it("never folds a top-level folder, even one holding a single screen", () => {
    const top: NavTreeNode = {
      kind: "folder",
      id: "top",
      labelKey: "top",
      icon,
      children: [
        { kind: "screen", id: "/only", labelKey: "only", icon, to: "/only" },
      ],
    };
    expect(collapseLeafCategories([top])[0]).toMatchObject({
      kind: "folder",
      id: "top",
    });
  });
});
