import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  type RouteObject,
} from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { DefaultLayout } from "./Layout";
import { RightPanel } from "./rightPanel";

/** The one throwaway screen most of these tests put behind the `<Outlet />`. */
const blankScreen: RouteObject[] = [
  { index: true, element: <div data-testid="screen" /> },
];

/**
 * Mounts the real app shell over a data router (which `useMatches` inside the
 * layout needs). `children` and `initialEntries` default to a single blank
 * screen at "/"; the right-panel tests pass their own routes. The router comes
 * back alongside the render result so a test can navigate.
 */
const renderShell = (
  children: RouteObject[] = blankScreen,
  initialEntries: string[] = ["/"],
) => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <DefaultLayout />,
        children,
      },
    ],
    { initialEntries },
  );

  return {
    ...render(
      <AppThemeWithLang>
        <RouterProvider router={router} />
      </AppThemeWithLang>,
    ),
    router,
  };
};

/**
 * The emotion cache prefix (`muiltr` / `muirtl`) of the nearest styled ancestor
 * — i.e. which direction the subtree is rendering through.
 */
const nearestCache = (start: Element | null) => {
  for (let n = start; n; n = n.parentElement) {
    const hit = [...n.classList].find((c) => /^mui(ltr|rtl)-/.test(c));
    if (hit) return hit.slice(0, 6);
  }
  return undefined;
};

const rect = (width: number, height: number): DOMRect =>
  ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("app shell footer", () => {
  it("is rendered once by the shell", () => {
    renderShell();
    expect(screen.getAllByTestId("layout-footer")).toHaveLength(1);
  });

  it("shows the app version injected at build time", () => {
    renderShell();
    // `__APP_VERSION__` is Vite's `define` from package.json — Vitest replaces
    // it here the same way it does in the component.
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
    expect(screen.getByTestId("layout-footer")).toHaveTextContent(
      `v${__APP_VERSION__}`,
    );
  });

  it("links to the source repo, opening in a new tab", () => {
    renderShell();
    const link = screen.getByTestId("layout-footer-repo-link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/kantorv/chess-trainer-app",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("labels the repo link from the catalog in both languages", async () => {
    const first = renderShell();
    expect(screen.getByTestId("layout-footer-repo-link")).toHaveTextContent(
      i18n.t("footer.source"),
    );
    first.unmount();

    await i18n.changeLanguage("he");
    renderShell();
    expect(screen.getByTestId("layout-footer-repo-link")).toHaveTextContent(
      "מקור",
    );
  });

  it("leaves the footer on the shell's direction — only the board is pinned LTR", async () => {
    await i18n.changeLanguage("he");
    renderShell();

    // The emotion cache each subtree renders through: `muirtl` is the mirrored
    // one the shell uses under Hebrew. The footer goes through it like the
    // sidebar does — it is not pinned LTR.
    expect(nearestCache(screen.getByTestId("layout-footer"))).toBe("muirtl");

    // The board area, by contrast, still has `ForceLTR`'s `dir="ltr"` wrapper
    // inside it — mirroring has not leaked in.
    const board = screen.getByTestId("layout-board-square-body");
    expect(board.querySelector('[dir="ltr"]')).not.toBeNull();
  });
});

describe("board square reflow on window resize", () => {
  afterEach(() => vi.restoreAllMocks());

  it("re-measures and re-squares when the window resizes", async () => {
    const grbc = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    grbc.mockReturnValue(rect(800, 600));

    renderShell();
    const square = screen.getByTestId("layout-board-square-body");

    // min(800 - 320 - 32, 600 - 32): the fixed 320px panel comes off the width
    // before squaring, and the p:2 inset off both edges (2 * 16px).
    await waitFor(() =>
      expect(square).toHaveStyle({ width: "448px", height: "448px" }),
    );

    grbc.mockReturnValue(rect(500, 400));
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    // min(500 - 320 - 32, 400 - 32) — width-bound at this size.
    await waitFor(() =>
      expect(square).toHaveStyle({ width: "148px", height: "148px" }),
    );
  });

  it("never sizes the square below zero", async () => {
    const grbc = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    grbc.mockReturnValue(rect(10, 10));

    renderShell();
    const square = screen.getByTestId("layout-board-square-body");

    await waitFor(() =>
      expect(square).toHaveStyle({ width: "0px", height: "0px" }),
    );
  });
});

describe("route-driven right panel slot", () => {
  const aside = () => screen.getByTestId("layout-board-square-sidebar");

  /** A screen that fills the shell's aside, and owns the state it shows there. */
  const PanelScreen = () => {
    const [count, setCount] = useState(0);

    return (
      <div data-testid="screen">
        <Link to="/plain">away</Link>
        <button onClick={() => setCount((c) => c + 1)}>bump</button>
        <RightPanel>
          <div data-testid="panel-content">panel {count}</div>
        </RightPanel>
      </div>
    );
  };

  /** Index route registers a panel; "/plain" registers nothing. */
  const panelRoutes: RouteObject[] = [
    { index: true, element: <PanelScreen /> },
    { path: "plain", element: <div data-testid="screen" /> },
  ];

  it("shows the Analysis placeholder when no route registers a panel", () => {
    renderShell();

    expect(aside()).toHaveTextContent(i18n.t("panel.analysisTitle"));
    expect(aside()).toHaveTextContent(i18n.t("panel.analysisPlaceholder"));
    // The host element only exists while the slot is occupied, so an
    // unregistered aside is the placeholder and nothing else.
    expect(screen.queryByTestId("layout-right-panel")).toBeNull();
  });

  it("renders a route's registered panel in the aside, in place of the placeholder", () => {
    renderShell(panelRoutes);

    const content = screen.getByTestId("panel-content");
    expect(aside()).toContainElement(content);
    expect(aside()).not.toHaveTextContent(i18n.t("panel.analysisPlaceholder"));
  });

  it("keeps the panel live: it re-renders with the screen that owns it", async () => {
    renderShell(panelRoutes);

    expect(screen.getByTestId("panel-content")).toHaveTextContent("panel 0");

    fireEvent.click(screen.getByRole("button", { name: "bump" }));

    await waitFor(() =>
      expect(screen.getByTestId("panel-content")).toHaveTextContent("panel 1"),
    );
  });

  it("restores the placeholder when the registering route is navigated away from", async () => {
    const { router } = renderShell(panelRoutes);
    expect(screen.getByTestId("panel-content")).toBeInTheDocument();

    await act(() => router.navigate("/plain"));

    expect(screen.queryByTestId("panel-content")).toBeNull();
    expect(screen.queryByTestId("layout-right-panel")).toBeNull();
    expect(aside()).toHaveTextContent(i18n.t("panel.analysisPlaceholder"));

    // …and back again: the slot is reusable, not a one-shot.
    await act(() => router.navigate("/"));
    expect(screen.getByTestId("panel-content")).toBeInTheDocument();
  });

  it("keeps the panel's DOM node in place across shell re-renders", async () => {
    const grbc = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    grbc.mockReturnValue(rect(800, 600));

    renderShell(panelRoutes);
    const before = screen.getByTestId("panel-content");

    // A window resize re-renders the whole shell, the outlet included. The
    // panel's own DOM has to survive that untouched — it may hold a scroll
    // position or the focused element — so the host is never re-created and
    // the portal is never torn down and rebuilt.
    grbc.mockReturnValue(rect(500, 400));
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("layout-board-square-body")).toHaveStyle({
        width: "148px",
      }),
    );

    expect(screen.getByTestId("panel-content")).toBe(before);
    grbc.mockRestore();
  });

  it("mirrors panel content under Hebrew — the aside is not pinned LTR", async () => {
    await i18n.changeLanguage("he");
    renderShell(panelRoutes);

    expect(nearestCache(screen.getByTestId("panel-content"))).toBe("muirtl");
  });
});

describe("fixed-width rails", () => {
  it("gives the nav rail and the panel fixed widths, and the board area the rest", () => {
    renderShell();

    // Both are `width` + `flexShrink: 0` rather than flex ratios, so neither
    // grows with the window and the board keeps every pixel they do not need.
    expect(screen.getByTestId("layout-sidebar-container")).toHaveStyle({
      width: "240px",
      flexShrink: "0",
    });
    expect(screen.getByTestId("layout-board-square-sidebar")).toHaveStyle({
      width: "320px",
      flexShrink: "0",
    });
  });

  it("does not scroll the aside itself, so a panel can pin content to its foot", () => {
    renderShell();

    // The Load PGN panel divides this height between a scrolling move list and
    // the ingestion controls beneath it; a scrolling aside would let the
    // controls slide out of view under a long game instead.
    expect(screen.getByTestId("layout-board-square-sidebar")).toHaveStyle({
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    });
  });

  it("still squares the board against height when height is the binding side", async () => {
    const grbc = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    // Wide and short: the panel leaves 1200 - 320 - 32 = 848 of width, but only
    // 400 - 32 = 368 of height, so the square is height-bound.
    grbc.mockReturnValue(rect(1200, 400));

    renderShell();

    await waitFor(() =>
      expect(screen.getByTestId("layout-board-square-body")).toHaveStyle({
        width: "368px",
        height: "368px",
      }),
    );
    grbc.mockRestore();
  });

  it("never sizes the square below zero when the panel outgrows the row", async () => {
    const grbc = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    // Narrower than the panel alone — the width term goes negative.
    grbc.mockReturnValue(rect(200, 600));

    renderShell();

    await waitFor(() =>
      expect(screen.getByTestId("layout-board-square-body")).toHaveStyle({
        width: "0px",
        height: "0px",
      }),
    );
    grbc.mockRestore();
  });
});
