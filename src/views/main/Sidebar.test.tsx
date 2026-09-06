import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import { Link, MemoryRouter } from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import SideBar from "./Sidebar";
import { navItems, navItemsInFolder } from "./navItems";
import { navFolders, type NavFolder } from "./navFolders";
import { folderPath, navLabel, type NavTreeNode } from "./navTree";

const renderAt = (path: string, tree?: NavTreeNode[]) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <SideBar tree={tree} />
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** A shipped folder with more than one screen, by its translated name. Folders are buttons, not links. */
const toolsFolder = () =>
  screen.getByRole("button", { name: i18n.t("nav.folders.tools") });

/**
 * The name a row renders, for a folder or a screen — through `navLabel`, the
 * same resolver the sidebar uses. Not `i18n.t(labelKey)` any more: a folder or
 * screen generated from a library catalog is named from the data and has no
 * catalog key at all, so a test that reached for one would be naming a row the
 * app does not render that way.
 */
const nameOf = (node: { labelKey?: string; label?: Parameters<typeof navLabel>[0]["label"] }) =>
  navLabel(node, (key) => i18n.t(key), "en");

/** A folder's rendered name, at any depth — so a test can name its row. */
const folderNameOf = (
  id: string,
  folders: readonly NavFolder[] = navFolders(),
): string => {
  for (const folder of folders) {
    if (folder.id === id) return nameOf(folder);
    const nested = folder.children && folderNameOf(id, folder.children);
    if (nested) return nested;
  }
  return "";
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("sidebar navigation", () => {
  it("renders one link per screen of the open folder, and no more", async () => {
    renderAt("/tools/analysis");
    // Only the active folder is open, so only its screens are links; the folder
    // row is a toggle and adds nothing to the count either way.
    expect(screen.getAllByRole("link")).toHaveLength(
      navItemsInFolder("tools").length,
    );

    // Every screen is reachable — one folder at a time.
    const user = userEvent.setup();
    for (const folder of navFolders()) {
      if (folder.children) continue;
      await user.click(screen.getByRole("button", { name: nameOf(folder) }));
      for (const item of navItemsInFolder(folder.id)) {
        expect(screen.getByRole("link", { name: nameOf(item) })).toBeVisible();
      }
    }
  });

  /*
    Walks every screen in the tree, opening its whole folder chain on the way —
    a click per folder, and `userEvent` is deliberately slow. The generated
    Positions screens roughly doubled the count, which is real coverage rather
    than a slow test to trim, so the budget is raised instead.
  */
  it("links to the route each entry declares", async () => {
    renderAt("/");
    const user = userEvent.setup();

    for (const item of navItems()) {
      // The screen's folder chain has to be opened first — and `folderPath`
      // gives it as the *rendered* tree has it, after a redundant leaf-category
      // folder has been folded into the screen itself.
      for (const id of folderPath(item.to)) {
        const row = screen.getByRole("button", { name: folderNameOf(id) });
        if (row.getAttribute("aria-expanded") === "false") await user.click(row);
      }
      /*
        `getAllBy`, because a name is not an id in a section built from
        content: the shipped PGN library holds the "Queen vs Rook, Rosettes"
        study twice — once as its own export, once as one study inside the
        author's export of all of them — and two rows named alike is what the
        data says rather than a bug in the tree. What must hold is that a row
        with this name links here.
      */
      const links = screen
        .getAllByRole("link", { name: nameOf(item) })
        .map((link) => link.getAttribute("href"));

      expect(links).toContain(item.to);
    }
  }, 30000);

  it("marks only the current route as the current page", () => {
    renderAt("/tools/analysis");

    const active = screen.getByRole("link", { name: i18n.t("nav.analysisBoard") });
    expect(active).toHaveAttribute("aria-current", "page");

    const others = screen.getAllByRole("link").filter((link) => link !== active);
    for (const link of others) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("matches a route exactly rather than by prefix", () => {
    // `startsWith` here would light up every screen whose path is nested under
    // another — the two `/tools/*` screens share a prefix.
    renderAt("/tools/editor");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    ).not.toHaveAttribute("aria-current");
  });

  it("translates every label rather than hardcoding English", async () => {
    // A route inside the Tools folder, so its screens are the open ones.
    const english = renderAt("/tools/analysis");
    expect(
      screen.getByRole("link", { name: "Analysis Board" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tools" })).toBeInTheDocument();
    english.unmount();

    await i18n.changeLanguage("he");
    renderAt("/tools/analysis");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Analysis Board" })).toBeNull();
    // The folder name is a catalog key too, not a hardcoded English string.
    expect(toolsFolder()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tools" })).toBeNull();
  });

  it("gives the nav an accessible name from the catalog", () => {
    renderAt("/");
    expect(
      screen.getByRole("navigation", { name: i18n.t("nav.ariaLabel") }),
    ).toBeInTheDocument();
  });
});

describe("the folder tree", () => {
  it("renders a row per folder, only the active screen's open", () => {
    renderAt("/tools/analysis");

    // Top-level rows only: a sub-folder lives in its parent's `Collapse` body,
    // which is unmounted while that parent is shut. Opening Positions is what
    // brings its one surviving sub-folder row into the tree.
    expect(screen.getAllByRole("button")).toHaveLength(navFolders().length);
    expect(toolsFolder()).toHaveAttribute("aria-expanded", "true");

    for (const folder of screen.getAllByRole("button")) {
      if (folder !== toolsFolder()) {
        expect(folder).toHaveAttribute("aria-expanded", "false");
      }
    }

    // Only the open folder's screens are on screen; the rest are one click away.
    expect(screen.getAllByRole("link")).toHaveLength(
      navItemsInFolder("tools").length,
    );
  });

  it("brings a folder's sub-folders into the tree when it is opened", async () => {
    renderAt("/tools/analysis");
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: i18n.t("nav.folders.positions") }),
    );

    /*
      Opening Positions mounts its rows. A leaf category folds to a plain link,
      but a category that still has sub-categories of its own — Queen vs Rook —
      stays a collapsible folder row, and comes in shut. One chain is open at a
      time, so nothing under any other section is mounted.
    */
    const queenVsRook = screen.getByRole("button", {
      name: folderNameOf("positions:queen-vs-rook"),
    });
    expect(queenVsRook).toHaveAttribute("aria-expanded", "false");

    // The top-level rows, plus the single sub-folder Positions brought with it.
    expect(screen.getAllByRole("button")).toHaveLength(navFolders().length + 1);
  });

  it("starts with everything shut on a route that is no screen", () => {
    renderAt("/");

    for (const folder of screen.getAllByRole("button")) {
      expect(folder).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("toggles its own body shut and open again", async () => {
    renderAt("/tools/analysis");
    const user = userEvent.setup();

    await user.click(toolsFolder());
    expect(toolsFolder()).toHaveAttribute("aria-expanded", "false");
    // `Collapse` unmounts its body when the shut animation ends, not on click.
    await waitFor(() => expect(screen.queryAllByRole("link")).toHaveLength(0));

    await user.click(toolsFolder());
    expect(toolsFolder()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link")).toHaveLength(
      navItemsInFolder("tools").length,
    );
  });

  it("shuts the folder that was open when another one is opened", async () => {
    renderAt("/tools/analysis");
    const user = userEvent.setup();

    const games = () =>
      screen.getByRole("button", { name: i18n.t("nav.folders.games") });

    await user.click(games());
    expect(games()).toHaveAttribute("aria-expanded", "true");
    // One chain at a time: opening a folder under a different parent shuts the
    // previous one rather than stacking a second open branch under it.
    expect(toolsFolder()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(screen.queryAllByRole("link")).toHaveLength(
        navItemsInFolder("games").length,
      ),
    );
  });

  it("swaps the chevron between more and less", async () => {
    const { container } = renderAt("/tools/analysis");
    const user = userEvent.setup();

    expect(
      container.querySelector('[data-testid="ExpandLessRoundedIcon"]'),
    ).toBeInTheDocument();

    await user.click(toolsFolder());
    expect(
      container.querySelector('[data-testid="ExpandLessRoundedIcon"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="ExpandMoreRoundedIcon"]'),
    ).toBeInTheDocument();
  });

  it("keeps the open state in memory only — nothing about it is stored", async () => {
    renderAt("/");
    const user = userEvent.setup();

    // Spied after the first paint, so MUI's own color-scheme read is not
    // counted: what is under test is that *toggling a folder* persists nothing.
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await user.click(toolsFolder());
    await user.click(toolsFolder());

    expect(setItem).not.toHaveBeenCalled();
    /*
      The sidebar does read one key, and only one: the tree grows a folder per
      uploaded `.pgn`, so it subscribes to that store and its snapshot checks
      the revision stamp (`lib/pgnUploadStore.ts`). Nothing it reads is about
      which folder is open — that is the claim, and it is narrowed rather than
      dropped.
    */
    for (const [key] of getItem.mock.calls) {
      expect(String(key)).toMatch(/^chessapp\.pgnUploads\.v1/);
    }
    vi.restoreAllMocks();
  });

  it("forgets what was opened by hand on the next mount", async () => {
    const user = userEvent.setup();
    const first = renderAt("/");
    await user.click(toolsFolder());
    expect(toolsFolder()).toHaveAttribute("aria-expanded", "true");
    first.unmount();

    // The route decides, every time: the session-only state is deliberate.
    renderAt("/");
    expect(toolsFolder()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the folder holding the screen navigated to", async () => {
    render(
      <AppThemeWithLang>
        <MemoryRouter initialEntries={["/"]}>
          {/* A link outside the sidebar, so the route can change while every
              folder is shut — otherwise there is nothing left to click. */}
          <Link to="/tools/analysis">go to analysis</Link>
          <SideBar />
        </MemoryRouter>
      </AppThemeWithLang>,
    );
    const user = userEvent.setup();

    expect(toolsFolder()).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("link", { name: "go to analysis" }));

    expect(toolsFolder()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("leaves the open folder alone on a route that is no screen", async () => {
    render(
      <AppThemeWithLang>
        <MemoryRouter initialEntries={["/mates/basic"]}>
          {/* A position's detail page is a route, not a nav entry — it has no
              chain of its own, and shutting the section the reader is inside
              would be the wrong answer to that. */}
          <Link to="/mates/basic/back-rank">go to a position</Link>
          <SideBar />
        </MemoryRouter>
      </AppThemeWithLang>,
    );
    const user = userEvent.setup();

    // `/mates/basic` is a plain link now — the redundant "Basic" sub-folder was
    // folded away — so the section that holds it is Mates, and it opens with the
    // route.
    const mates = () =>
      screen.getByRole("button", { name: i18n.t("nav.folders.mates") });
    expect(mates()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.matesBasic") }),
    ).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "go to a position" }));

    expect(mates()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.matesBasic") }),
    ).toBeVisible();
  });
});

describe("the tree nests folders to any depth", () => {
  /*
    Deeper than anything shipped: a folder holding a sub-folder *and* a screen
    of its own. Nesting is a data edit — this fixture goes through the same
    renderer as `navTree()`, with no change to it.
  */
  const nested: NavTreeNode[] = [
    {
      kind: "folder",
      id: "outer",
      labelKey: "nav.folders.tools",
      icon: GridViewRoundedIcon,
      children: [
        {
          kind: "folder",
          id: "inner",
          labelKey: "nav.folders.engine",
          icon: GridViewRoundedIcon,
          children: [
            {
              kind: "screen",
              id: "/tools/analysis",
              labelKey: "nav.analysisBoard",
              icon: GridViewRoundedIcon,
              to: "/tools/analysis",
            },
          ],
        },
        {
          kind: "screen",
          id: "/tools/editor",
          labelKey: "nav.boardEditor",
          icon: GridViewRoundedIcon,
          to: "/tools/editor",
        },
      ],
    },
  ];

  const outer = () =>
    screen.getByRole("button", { name: i18n.t("nav.folders.tools") });
  const inner = () =>
    screen.getByRole("button", { name: i18n.t("nav.folders.engine") });

  it("renders a sub-folder as its own collapsible row, inside the level above", () => {
    // The screen two levels down, so the whole chain is the open one.
    const { container } = renderAt("/tools/analysis", nested);

    expect(outer()).toHaveAttribute("aria-expanded", "true");
    expect(inner()).toHaveAttribute("aria-expanded", "true");

    // The sub-folder and its screen live in the outer folder's Collapse body.
    const outerBody = container.querySelector(".MuiCollapse-root") as HTMLElement;
    expect(
      within(outerBody).getByRole("button", { name: i18n.t("nav.folders.engine") }),
    ).toBeInTheDocument();
    expect(
      within(outerBody).getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    ).toBeInTheDocument();
  });

  it("collapses one level without touching the level above it", async () => {
    renderAt("/tools/analysis", nested);
    const user = userEvent.setup();

    await user.click(inner());
    expect(inner()).toHaveAttribute("aria-expanded", "false");
    // Shutting a sub-folder truncates the open chain above it rather than
    // clearing it: its parent is still where the reader is.
    expect(outer()).toHaveAttribute("aria-expanded", "true");

    // The deep screen is gone; the outer folder's own screen stays.
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: i18n.t("nav.analysisBoard") }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("link", { name: i18n.t("nav.boardEditor") }),
    ).toBeInTheDocument();
  });

  it("expands the whole ancestor chain of a screen two levels down", () => {
    renderAt("/tools/analysis", nested);

    expect(outer()).toHaveAttribute("aria-expanded", "true");
    expect(inner()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("opens a sub-folder's parents with it, and shuts them with the parent", async () => {
    renderAt("/", nested);
    const user = userEvent.setup();

    expect(outer()).toHaveAttribute("aria-expanded", "false");

    // Clicking the outer folder opens it alone; the sub-folder is a second
    // click, and opening it keeps the parent it lives in open.
    await user.click(outer());
    expect(inner()).toHaveAttribute("aria-expanded", "false");
    await user.click(inner());
    expect(outer()).toHaveAttribute("aria-expanded", "true");
    expect(inner()).toHaveAttribute("aria-expanded", "true");

    // Shutting the parent takes the whole branch with it.
    await user.click(outer());
    expect(outer()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.queryAllByRole("link")).toHaveLength(0));
  });
});

describe("the sidebar mirrors under RTL", () => {
  /**
   * The emotion class emotion generated for this element, and the CSS rule
   * behind it. The `mui{rtl,ltr}` prefix names the cache in force, which is how
   * a test can tell a mirrored subtree from a `ForceLTR` one.
   */
  const ownRule = (element: Element) => {
    const own = element.className
      .split(" ")
      .find((name) => /^mui(rtl|ltr)-/.test(name));

    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (own && rule.cssText.startsWith(`.${own} {`)) {
          return { cache: own.slice(0, 6), css: rule.cssText };
        }
      }
    }
    throw new Error(`no rule found for ${element.className}`);
  };

  /** The depth inset, as its multiple of the theme spacing unit. */
  const indent = (css: string) =>
    Number(/padding-inline-start:\s*calc\((\d+) \*/.exec(css)?.[1]);

  it("indents by depth with a direction-relative inset in Hebrew", async () => {
    await i18n.changeLanguage("he");
    // Inside the Tools folder, so there is a screen row to measure against.
    renderAt("/tools/analysis");

    const folder = ownRule(toolsFolder());
    const screenRow = ownRule(
      screen.getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    );

    // The sidebar is not the board: it goes through the mirrored cache rather
    // than being pinned LTR the way `ForceLTR` pins the board area.
    expect(folder.cache).toBe("muirtl");
    expect(screenRow.cache).toBe("muirtl");

    // Depth is carried entirely by `padding-inline-start`, which the browser
    // resolves against the text direction — so the tree indents leftwards under
    // RTL without a second rule. A physical `padding-left` here would pin the
    // indentation to the left in every language.
    expect(indent(screenRow.css)).toBeGreaterThan(indent(folder.css));
    expect(folder.css).not.toMatch(/padding-left|padding-right/);
    expect(screenRow.css).not.toMatch(/padding-left|padding-right/);
  });

  it("uses the same logical inset, through the plain cache, in English", async () => {
    renderAt("/tools/analysis");

    const screenRow = ownRule(
      screen.getByRole("link", { name: i18n.t("nav.analysisBoard") }),
    );
    expect(screenRow.cache).toBe("muiltr");
    expect(indent(screenRow.css)).toBeGreaterThan(0);
  });
});
