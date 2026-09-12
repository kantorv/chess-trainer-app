import { describe, expect, it } from "vitest";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import { TreeManager } from "../../lib/treeManager";
import {
  buildNavTree,
  collapseLeafCategories,
  folderChain,
  folderPath,
  foldSingleEntryFolders,
  navLabelKeys,
  navTree,
  type NavTreeNode,
} from "./navTree";
import { navItems, navItemsInFolder } from "./navItems";
import { navFolders } from "./navFolders";

describe("the shipped nav tree", () => {
  it("mirrors the folder tree at the top, a single-entry folder as its screen", () => {
    const tree = navTree();
    const folders = navFolders();

    expect(tree).toHaveLength(folders.length);
    for (const [index, folder] of folders.entries()) {
      const node = tree[index];
      if (folder.singleEntry) {
        // One destination: the row is the folder's single screen, under the
        // folder's own name — not the screen's own label.
        const item = navItemsInFolder(folder.id)[0];
        expect(node.kind).toBe("screen");
        expect(node.to).toBe(item.to);
        expect(node.labelKey).toBe(folder.labelKey);
      } else {
        expect(node.kind).toBe("folder");
        expect(node.id).toBe(folder.id);
      }
    }

    // Every screen is still reachable — the folded one included.
    const screens = new TreeManager<NavTreeNode>(tree)
      .toArray()
      .filter((node) => node.kind === "screen");
    expect(screens.map((node) => node.to)).toEqual(navItems().map((i) => i.to));
  });

  it("files every screen under the folder it names", () => {
    const raw = buildNavTree(navFolders(), navItemsInFolder);

    for (const item of navItems()) {
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
        branch. A screen filed under a single-entry folder is the one
        exception: folded to the top level, it has no breadcrumb at all — the
        row *is* the top level, and no chain has to open for it.
      */
      const rendered = folderPath(item.to);
      const singleEntryParent = navFolders().find(
        (folder) => folder.singleEntry && folder.id === item.folder,
      );
      if (singleEntryParent !== undefined) {
        expect(rendered).toEqual([]);
      } else {
        expect(rendered.length).toBeGreaterThan(0);
        expect(registered.slice(0, rendered.length)).toEqual(rendered);
      }
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
      ...navFolders().map((f) => f.labelKey),
      /*
        A screen filed under a single-entry folder renders under the
        *folder's* name (`foldSingleEntryFolders`), so its own key is declared
        but never rendered — the one screen whose key the tree drops.
      */
      ...navItems()
        .filter(
          (item) =>
            !navFolders().some((f) => f.singleEntry && f.id === item.folder),
        )
        .map((i) => i.labelKey),
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

describe("foldSingleEntryFolders folds a folder marked as one destination", () => {
  const icon = GridViewRoundedIcon;

  it("renders the folder as its single screen, under the folder's own name", () => {
    const folder: NavTreeNode = {
      kind: "folder",
      id: "openings",
      labelKey: "nav.folders.openings",
      icon,
      singleEntry: true,
      children: [
        {
          kind: "screen",
          id: "/openings/saved",
          labelKey: "nav.savedOpenings",
          icon,
          to: "/openings/saved",
        },
      ],
    };

    const [folded] = foldSingleEntryFolders([folder]);

    // The row is the screen — the folder's name and icon, the screen's route.
    // A screen node's active state is an exact pathname match and it has no
    // folder ancestors, so it lights up with nothing opened.
    expect(folded).toEqual({
      kind: "screen",
      id: "/openings/saved",
      labelKey: "nav.folders.openings",
      icon,
      to: "/openings/saved",
    });
  });

  it("keeps a single-entry folder that does not hold exactly one screen", () => {
    // The flag says "one destination"; a folder that does not match stays a
    // folder with the flag inert — the same way a mis-shaped leaf category is.
    const twoScreens: NavTreeNode = {
      kind: "folder",
      id: "two",
      labelKey: "two",
      icon,
      singleEntry: true,
      children: [
        { kind: "screen", id: "/a", labelKey: "a", icon, to: "/a" },
        { kind: "screen", id: "/b", labelKey: "b", icon, to: "/b" },
      ],
    };
    const withSubFolder: NavTreeNode = {
      kind: "folder",
      id: "with-sub",
      labelKey: "with-sub",
      icon,
      singleEntry: true,
      children: [
        {
          kind: "folder",
          id: "with-sub/inner",
          labelKey: "inner",
          icon,
          children: [{ kind: "screen", id: "/c", labelKey: "c", icon, to: "/c" }],
        },
      ],
    };

    const folded = foldSingleEntryFolders([twoScreens, withSubFolder]);
    expect(folded[0]).toEqual(twoScreens);
    expect(folded[1]).toEqual(withSubFolder);
  });

  it("never folds below the top level — the leaf fold's rule is the other one", () => {
    const nested: NavTreeNode = {
      kind: "folder",
      id: "outer",
      labelKey: "outer",
      icon,
      children: [
        {
          kind: "folder",
          id: "outer/inner",
          labelKey: "inner",
          icon,
          singleEntry: true,
          children: [{ kind: "screen", id: "/d", labelKey: "d", icon, to: "/d" }],
        },
      ],
    };

    // The inner folder carries the flag, but the fold does not reach it.
    expect(foldSingleEntryFolders([nested])[0]).toEqual(nested);
  });
});
