import { describe, expect, it } from "vitest";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";

import { allCategories, loadLibraryCatalog } from "../../lib/libraryCatalog";
import { positionsCatalog } from "../../lib/positionsCatalog";
import {
  libraryNavFolder,
  libraryNavItems,
  positionsNavFolder,
  positionsNavItems,
  type LibraryNavOptions,
} from "./navFromLibrary";
import { buildNavTree, folderPath, navLabelKeys, navTree } from "./navTree";
import { navItemsInFolder } from "./navItems";
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

/** A three-level library, deeper than anything shipped. */
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
  positions: [],
});

/** Every folder id in a subtree, depth-first. */
const idsOf = (folders: readonly NavFolder[]) =>
  new TreeManager<NavFolder>(folders).collectIds("id");

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

  it("gives every category one list screen, at its own route", () => {
    expect(items.map((item) => item.to)).toEqual([
      "/lib/outer/inner/deepest",
      "/lib/outer/inner",
      "/lib/outer",
      "/lib/sibling",
    ]);
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
      // The breadcrumb is the whole chain from the top, so this asserts both
      // that the screen is in the tree and that it hangs under the section.
      const breadcrumb = folderPath(item.to, navTree());

      expect(breadcrumb[0], `${item.to} is not under Positions`).toBe("positions");
      expect(breadcrumb.at(-1)).toBe(item.folder);
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
