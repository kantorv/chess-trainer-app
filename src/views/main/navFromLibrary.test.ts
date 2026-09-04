import { describe, expect, it } from "vitest";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";

import {
  allCategories,
  itemsInLibraryCategory,
  loadLibraryCatalog,
} from "../../lib/libraryCatalog";
import { loadPgnLibrary } from "../../lib/pgnLibrary";
import { pgnCatalog, pgnKinds } from "../../lib/pgnCatalog";
import { pgnKindOf } from "../../lib/pgnKind";
import { positionsCatalog } from "../../lib/positionsCatalog";
import {
  libraryNavFolder,
  libraryNavItems,
  positionsNavFolder,
  positionsNavItems,
  userPgnsNavFolder,
  userPgnsNavItems,
  type LibraryNavOptions,
} from "./navFromLibrary";
import {
  buildNavTree,
  collapseLeafCategories,
  folderPath,
  navLabelKeys,
  navTree,
} from "./navTree";
import { navItemsInFolder } from "./navItems";
import { navFolders } from "./navFolders";
import { TreeManager } from "../../lib/treeManager";
import type { NavFolder } from "./navFolders";

const icon = GridViewRoundedIcon;

const options: LibraryNavOptions = {
  rootId: "lib",
  rootLabelKey: "nav.folders.library",
  rootIcon: icon,
  routeBase: "/lib",
  categoryIcon: icon,
  screenIcon: icon,
};

const KQ_VS_K = "7k/8/8/8/8/8/4Q3/4K3 w - - 0 1";

/**
 * A three-level library, deeper than anything shipped. Every category carries a
 * position of its own, so every one of them is a listable screen — the
 * `groupsOnly` skip below has its own fixture.
 */
const catalog = loadLibraryCatalog({
  categories: [
    {
      id: "outer",
      label: { en: "Outer" },
      children: [
        {
          id: "inner",
          label: { en: "Inner" },
          children: [{ id: "deepest", label: { en: "Deepest" } }],
        },
      ],
    },
    { id: "sibling", label: { en: "Sibling" } },
  ],
  positions: [
    { id: "p-outer", category: "outer", fen: KQ_VS_K, name: { en: "Outer" } },
    { id: "p-inner", category: "outer/inner", fen: KQ_VS_K, name: { en: "Inner" } },
    {
      id: "p-deepest",
      category: "outer/inner/deepest",
      fen: KQ_VS_K,
      name: { en: "Deepest" },
    },
    { id: "p-sibling", category: "sibling", fen: KQ_VS_K, name: { en: "Sibling" } },
  ],
});

/** A library whose top category only groups two leaves — no items of its own. */
const groupingCatalog = loadLibraryCatalog({
  categories: [
    {
      id: "group",
      label: { en: "Group" },
      children: [
        { id: "a", label: { en: "A" } },
        { id: "b", label: { en: "B" } },
      ],
    },
  ],
  positions: [
    { id: "p-a", category: "group/a", fen: KQ_VS_K, name: { en: "A" } },
    { id: "p-b", category: "group/b", fen: KQ_VS_K, name: { en: "B" } },
  ],
});

/** Every folder id in a subtree, depth-first. */
const idsOf = (folders: readonly NavFolder[]) =>
  new TreeManager<NavFolder>(folders).collectIds("id");

/** The shipped tree before the leaf-category fold — the registration contract. */
const rawShippedTree = () => buildNavTree(navFolders, navItemsInFolder);

/**
 * A generated screen is in the shipped (rendered) tree under `section`, and the
 * fold only ever shortened its breadcrumb — it never moved the screen to a
 * different branch or dropped it. `folder` is the folder the screen *names*,
 * still the last id of its breadcrumb in the un-folded tree.
 */
const expectFiledUnder = (to: string, folder: string, section: string) => {
  const registered = folderPath(to, rawShippedTree());
  const rendered = folderPath(to, navTree());

  expect(rendered[0], `${to} is not under ${section}`).toBe(section);
  expect(rendered.length).toBeGreaterThan(0);
  expect(registered.at(-1)).toBe(folder);
  expect(registered.slice(0, rendered.length)).toEqual(rendered);
};

describe("libraryNavFolder", () => {
  const folder = libraryNavFolder(catalog, options);

  it("mirrors the category tree, at every depth", () => {
    expect(folder.id).toBe("lib");
    expect(folder.labelKey).toBe("nav.folders.library");
    expect(idsOf(folder.children ?? [])).toEqual([
      "lib:outer",
      "lib:outer/inner",
      "lib:outer/inner/deepest",
      "lib:sibling",
    ]);
  });

  it("names every generated folder from the data, never with a catalog key", () => {
    // The whole point: a category added to the JSON has no `src/locales` entry
    // to write, and `locales.test.ts` must not start demanding one.
    for (const node of new TreeManager<NavFolder>(folder.children ?? []).toArray()) {
      expect(node.labelKey).toBeUndefined();
      expect(node.label?.en).toBeTypeOf("string");
    }
    // The section's own root *is* chrome, and keeps its key.
    expect(folder.label).toBeUndefined();
  });

  it("namespaces its ids so a generated one cannot collide with an authored one", () => {
    expect(idsOf([folder]).every((id) => id === "lib" || id.startsWith("lib:"))).toBe(
      true,
    );
  });
});

describe("libraryNavItems", () => {
  const items = libraryNavItems(catalog, options);

  it("gives every category that has items one list screen, at its own route", () => {
    expect(items.map((item) => item.to)).toEqual([
      "/lib/outer/inner/deepest",
      "/lib/outer/inner",
      "/lib/outer",
      "/lib/sibling",
    ]);
  });

  it("gives a category that only groups sub-categories a folder but no screen", () => {
    /*
      The manifest-group shape: `group` has two leaves under it and nothing of
      its own. It stays a folder (see `libraryNavFolder`), but a list screen for
      it would be a second row named "Group" sitting inside the "Group" folder.
    */
    const grouped = libraryNavItems(groupingCatalog, options);

    expect(grouped.map((item) => item.to)).toEqual([
      "/lib/group/a",
      "/lib/group/b",
    ]);
    expect(idsOf(libraryNavFolder(groupingCatalog, options).children ?? [])).toContain(
      "lib:group",
    );
  });

  it("files each screen under that category's own folder", () => {
    for (const item of items) {
      expect(item.folder).toBe(`lib:${item.to.slice("/lib/".length)}`);
    }
  });

  it("orders itself the way the tree lays a folder out", () => {
    /*
      Sub-folders come before a folder's own screens, so a category's screen
      follows its descendants'. Asserted through the builder rather than by
      eye — it is what keeps "the tree's screens are the registry, in order" an
      assertion in `navTree.test.ts`.
    */
    const tree = buildNavTree([libraryNavFolder(catalog, options)], (id) =>
      items.filter((item) => item.folder === id),
    );
    const screens = new TreeManager(tree)
      .toArray()
      .filter((node) => node.kind === "screen");

    expect(screens.map((node) => node.to)).toEqual(items.map((item) => item.to));
  });
});

describe("the generated Positions subtree, as shipped", () => {
  it("holds a folder and a list screen for every category in the JSON", () => {
    const folders = idsOf(positionsNavFolder().children ?? []);
    const items = positionsNavItems();

    expect(folders.length).toBe(items.length);
    expect(new Set(items.map((item) => item.folder))).toEqual(new Set(folders));
    // Nested at least once — the thing the Mates section cannot do.
    expect(folders.some((id) => id.split("/").length > 1)).toBe(true);
  });

  it("puts every one of them into the shipped nav tree, under Positions", () => {
    for (const item of positionsNavItems()) {
      // In the tree the sidebar renders, a redundant leaf-category folder is
      // folded away — so the screen hangs one level up, but under the same
      // section and never on a different branch.
      expectFiledUnder(item.to, item.folder, "positions");
      expect(navItemsInFolder(item.folder)).toEqual([item]);
    }
  });

  it("contributes no catalog key beyond the section's own", () => {
    // `locales.test.ts` asserts every key here resolves in both languages; a
    // generated category must therefore contribute none.
    const keys = navLabelKeys();

    expect(keys).toContain("nav.folders.positions");
    expect(keys.filter((key) => key.startsWith("nav.folders.positions."))).toEqual([]);
    expect(keys.length).toBeLessThan(
      new TreeManager(navTree()).toArray().length,
    );
  });

  it("reaches the same categories the catalog declares, and no others", () => {
    // A category added to `src/data/positions.json` is a route the sidebar
    // offers, with nothing else edited. This is that promise, asserted.
    expect(positionsNavItems().map((item) => item.to).sort()).toEqual(
      allCategories(positionsCatalog)
        .map((category) => `/positions/${category.path}`)
        .sort(),
    );
  });
});

/*
  The second shipped use of the generator, and the one that shows it is a
  generator rather than a Positions-shaped special case: the same functions over
  a catalog whose categories came out of `.pgn` files instead of out of JSON.
  Nothing in `navFromLibrary.ts` knows the difference, and nothing had to.
*/
describe("the generated User PGNs subtree", () => {
  it("makes a folder per PGN file, named from the data", () => {
    const folder = userPgnsNavFolder();

    expect(folder.id).toBe("user-pgns");
    expect(folder.labelKey).toBe("nav.folders.userPgns");
    // The section is chrome and is named from the catalog; a *file* is content
    // and is named from itself, so it carries a `label` and no key.
    for (const child of folder.children ?? []) {
      expect(child.labelKey).toBeUndefined();
      expect(child.label?.en).toBeTruthy();
    }
  });

  it("keeps a manifest group that gathers several files as one folder", () => {
    /*
      The multi-file grouping path: two `.pgn` files nested under one named
      folder via `folders.<id>` + a per-file `under`. Each file's own folder is
      a leaf and folds down to a screen, but the group folder then holds several
      of those, so it survives the fold as a folder that lists both files.
    */
    const grouped = loadPgnLibrary(
      {
        "alpha.pgn": '[Event "Alpha"]\n\n1. e4 e5 *\n',
        "beta.pgn": '[Event "Beta"]\n\n1. d4 d5 *\n',
      },
      {
        folders: { lessons: { en: "Lessons", he: "שיעורים" } },
        files: {
          "alpha.pgn": { under: "lessons" },
          "beta.pgn": { under: "lessons" },
        },
      },
    );
    expect(grouped.problems).toEqual([]);

    const opts: LibraryNavOptions = { ...options, rootId: "grp", routeBase: "/grp" };
    const items = libraryNavItems(grouped, opts);
    const tree = collapseLeafCategories(
      buildNavTree([libraryNavFolder(grouped, opts)], (id) =>
        items.filter((item) => item.folder === id),
      ),
    );

    const lessons = tree[0].children?.find((node) => node.id === "grp:lessons");
    expect(lessons?.kind).toBe("folder");

    const routes = (lessons?.children ?? [])
      .filter((node) => node.kind === "screen")
      .map((node) => node.to);
    expect(routes).toContain("/grp/lessons/alpha");
    expect(routes).toContain("/grp/lessons/beta");
  });

  it("puts every generated screen into the shipped nav tree, under User PGNs", () => {
    for (const item of userPgnsNavItems()) {
      expectFiledUnder(item.to, item.folder, "user-pgns");
      expect(navItemsInFolder(item.folder)).toEqual([item]);
    }
  });

  it("contributes no catalog key beyond the section's own", () => {
    const keys = navLabelKeys();

    expect(keys).toContain("nav.folders.userPgns");
    expect(keys.filter((key) => key.startsWith("nav.folders.userPgns."))).toEqual([]);
  });

  it("reaches every catalog folder that has games, and no others", () => {
    /*
      Dropping a `.pgn` into `src/data/pgn/` is a route the sidebar offers, with
      nothing else edited. This is that promise, asserted — with the two
      exceptions the section declares: a manifest group
      (`chess-fundamentals-capablanca`) holds only its parts, so it is a folder
      without a screen; a **collection** holds only its studies but claims a
      screen anyway through `hasScreen`, because its index page
      (`views/pgn/PgnCollection.tsx`) is where its notes and counts live.
    */
    const listable = allCategories(pgnCatalog).filter(
      (category) =>
        itemsInLibraryCategory(category.path, pgnCatalog).length > 0 ||
        pgnKindOf(category.path, pgnKinds) === "collection",
    );
    expect(listable.length).toBeLessThan(allCategories(pgnCatalog).length);
    // The collection is in it, and it holds no chapters of its own.
    expect(listable.map((category) => category.path)).toContain(
      "methurst-public-studies",
    );

    expect(userPgnsNavItems().map((item) => item.to).sort()).toEqual(
      listable.map((category) => `/pgn/${category.path}`).sort(),
    );
  });

  it("gives a manifest shelf no screen, and a collection one", () => {
    // The `hasScreen` override, at its two ends: both folders group and hold
    // nothing, and only the one with a screen of its own gets a row.
    const routes = userPgnsNavItems().map((item) => item.to);

    expect(routes).toContain("/pgn/methurst-public-studies");
    expect(routes).not.toContain("/pgn/chess-fundamentals-capablanca");
  });

  it("cannot collide with the other generated section's ids", () => {
    const positions = new Set(positionsNavItems().map((item) => item.folder));

    for (const item of userPgnsNavItems()) {
      expect(positions.has(item.folder)).toBe(false);
    }
  });
});
