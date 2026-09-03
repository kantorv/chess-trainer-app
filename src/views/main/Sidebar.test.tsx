import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";
import { Link, MemoryRouter } from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import SideBar from "./Sidebar";
import { navItems, navItemsInFolder } from "./navItems";
import { navFolders } from "./navFolders";
import type { NavTreeNode } from "./navTree";

const renderAt = (path: string, tree?: NavTreeNode[]) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <SideBar tree={tree} />
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** The shipped folder, by its translated name. Folders are buttons, not links. */
const basicExamples = () =>
  screen.getByRole("button", { name: i18n.t("nav.folders.basicExamples") });

/**
 * Every folder in the shipped tree, at any depth — sub-folders are folder rows
 * too, so the button count is this and not `navFolders.length`. Counted
 * recursively rather than by hand, so nesting one more is a data edit here as
 * well as in `navFolders.ts`.
 */
const folderCount = (folders: readonly { children?: readonly unknown[] }[]): number =>
  folders.reduce(
    (total, folder) =>
      total +
      1 +
      folderCount(
        (folder.children ?? []) as readonly { children?: readonly unknown[] }[],
      ),
    0,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("sidebar navigation", () => {
  it("renders one link per registered screen, and no more", () => {
    renderAt("/");
    // The folder row is a toggle, so it adds nothing to the link count.
    expect(screen.getAllByRole("link")).toHaveLength(navItems.length);
  });

  it("links to the route each entry declares", () => {
    renderAt("/");
    for (const { to, labelKey } of navItems) {
      expect(screen.getByRole("link", { name: i18n.t(labelKey) })).toHaveAttribute(
        "href",
        to,
      );
    }
  });

  it("marks only the current route as the current page", () => {
    renderAt("/analyze");

    const active = screen.getByRole("link", { name: i18n.t("nav.engineEvaluation") });
    expect(active).toHaveAttribute("aria-current", "page");

    const others = screen.getAllByRole("link").filter((link) => link !== active);
    for (const link of others) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it('does not treat "/" as a prefix of every other route', () => {
    // `startsWith` here would light up the basic board on every screen.
    renderAt("/player1");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.basicBoard") }),
    ).not.toHaveAttribute("aria-current");
  });

  it("translates every label rather than hardcoding English", async () => {
    const english = renderAt("/");
    expect(screen.getByRole("link", { name: "Basic board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Basic Examples" })).toBeInTheDocument();
    english.unmount();

    await i18n.changeLanguage("he");
    renderAt("/");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.basicBoard") }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Basic board" })).toBeNull();
    // The folder name is a catalog key too, not a hardcoded English string.
    expect(basicExamples()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Basic Examples" })).toBeNull();
  });

  it("gives the nav an accessible name from the catalog", () => {
    renderAt("/");
    expect(
      screen.getByRole("navigation", { name: i18n.t("nav.ariaLabel") }),
    ).toBeInTheDocument();
  });
});

describe("the folder tree", () => {
  it("renders a row per folder, each open on first render", () => {
    renderAt("/");

    const folder = basicExamples();
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button")).toHaveLength(folderCount(navFolders));

    // Every screen is visible on first paint — no regression on the flat list.
    for (const { labelKey } of navItems) {
      expect(screen.getByRole("link", { name: i18n.t(labelKey) })).toBeVisible();
    }
  });

  it("toggles its own body shut and open again", async () => {
    renderAt("/");
    const user = userEvent.setup();

    // Collapsing one folder hides that folder's screens and nobody else's, so
    // the count to expect is whatever lives in the other folders.
    const elsewhere = navItems.length - navItemsInFolder("basic-examples").length;

    await user.click(basicExamples());
    expect(basicExamples()).toHaveAttribute("aria-expanded", "false");
    // `Collapse` unmounts its body when the shut animation ends, not on click.
    await waitFor(() =>
      expect(screen.queryAllByRole("link")).toHaveLength(elsewhere),
    );

    await user.click(basicExamples());
    expect(basicExamples()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link")).toHaveLength(navItems.length);
  });

  it("swaps the chevron between more and less", async () => {
    const { container } = renderAt("/");
    const user = userEvent.setup();

    expect(
      container.querySelector('[data-testid="ExpandLessRoundedIcon"]'),
    ).toBeInTheDocument();

    await user.click(basicExamples());
    expect(
      container.querySelector('[data-testid="ExpandMoreRoundedIcon"]'),
    ).toBeInTheDocument();
  });

  it("keeps the open state in memory only — nothing is read or written to storage", async () => {
    renderAt("/");
    const user = userEvent.setup();

    // Spied after the first paint, so MUI's own color-scheme read is not
    // counted: what is under test is that *toggling a folder* persists nothing.
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await user.click(basicExamples());
    await user.click(basicExamples());

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("forgets a collapsed folder on the next mount", async () => {
    const user = userEvent.setup();
    const first = renderAt("/");
    await user.click(basicExamples());
    expect(basicExamples()).toHaveAttribute("aria-expanded", "false");
    first.unmount();

    // Open by default, every time: the session-only state is deliberate.
    renderAt("/");
    expect(basicExamples()).toHaveAttribute("aria-expanded", "true");
  });

  it("re-opens the folder holding the screen navigated to", async () => {
    render(
      <AppThemeWithLang>
        <MemoryRouter initialEntries={["/"]}>
          {/* A link outside the sidebar, so the route can change while the
              folder is shut — otherwise there is nothing left to click. */}
          <Link to="/analyze">go to analyze</Link>
          <SideBar />
        </MemoryRouter>
      </AppThemeWithLang>,
    );
    const user = userEvent.setup();

    await user.click(basicExamples());
    expect(basicExamples()).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("link", { name: "go to analyze" }));

    expect(basicExamples()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.engineEvaluation") }),
    ).toHaveAttribute("aria-current", "page");
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
      labelKey: "nav.folders.basicExamples",
      icon: GridViewRoundedIcon,
      children: [
        {
          kind: "folder",
          id: "inner",
          labelKey: "nav.playEngine",
          icon: GridViewRoundedIcon,
          children: [
            {
              kind: "screen",
              id: "/analyze",
              labelKey: "nav.engineEvaluation",
              icon: GridViewRoundedIcon,
              to: "/analyze",
            },
          ],
        },
        {
          kind: "screen",
          id: "/move",
          labelKey: "nav.movingPiece",
          icon: GridViewRoundedIcon,
          to: "/move",
        },
      ],
    },
  ];

  const outer = () =>
    screen.getByRole("button", { name: i18n.t("nav.folders.basicExamples") });
  const inner = () => screen.getByRole("button", { name: i18n.t("nav.playEngine") });

  it("renders a sub-folder as its own collapsible row, inside the level above", () => {
    const { container } = renderAt("/", nested);

    expect(outer()).toHaveAttribute("aria-expanded", "true");
    expect(inner()).toHaveAttribute("aria-expanded", "true");

    // The sub-folder and its screen live in the outer folder's Collapse body.
    const outerBody = container.querySelector(".MuiCollapse-root") as HTMLElement;
    expect(
      within(outerBody).getByRole("button", { name: i18n.t("nav.playEngine") }),
    ).toBeInTheDocument();
    expect(
      within(outerBody).getByRole("link", { name: i18n.t("nav.engineEvaluation") }),
    ).toBeInTheDocument();
  });

  it("collapses one level without touching the level above it", async () => {
    renderAt("/", nested);
    const user = userEvent.setup();

    await user.click(inner());
    expect(inner()).toHaveAttribute("aria-expanded", "false");
    expect(outer()).toHaveAttribute("aria-expanded", "true");

    // The deep screen is gone; the outer folder's own screen stays.
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: i18n.t("nav.engineEvaluation") }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("link", { name: i18n.t("nav.movingPiece") }),
    ).toBeInTheDocument();
  });

  it("expands the whole ancestor chain of a screen two levels down", async () => {
    renderAt("/analyze", nested);
    const user = userEvent.setup();

    await user.click(outer());
    expect(outer()).toHaveAttribute("aria-expanded", "false");

    // Re-opening the outer folder must not have lost the inner one's state.
    await user.click(outer());
    expect(inner()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.engineEvaluation") }),
    ).toHaveAttribute("aria-current", "page");
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
    renderAt("/");

    const folder = ownRule(basicExamples());
    const screenRow = ownRule(
      screen.getByRole("link", { name: i18n.t("nav.basicBoard") }),
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
    renderAt("/");

    const screenRow = ownRule(
      screen.getByRole("link", { name: i18n.t("nav.basicBoard") }),
    );
    expect(screenRow.cache).toBe("muiltr");
    expect(indent(screenRow.css)).toBeGreaterThan(0);
  });
});
