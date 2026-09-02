import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { DefaultLayout } from "./Layout";

/**
 * Mounts the real app shell over a data router (which `useMatches` inside the
 * layout needs) with one throwaway screen behind the `<Outlet />`.
 */
const renderShell = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <DefaultLayout />,
        children: [{ index: true, element: <div data-testid="screen" /> }],
      },
    ],
    { initialEntries: ["/"] },
  );

  return render(
    <AppThemeWithLang>
      <RouterProvider router={router} />
    </AppThemeWithLang>,
  );
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
    const nearestCache = (start: Element | null) => {
      for (let n = start; n; n = n.parentElement) {
        const hit = [...n.classList].find((c) => /^mui(ltr|rtl)-/.test(c));
        if (hit) return hit.slice(0, 6);
      }
      return undefined;
    };
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

    // min(800, 600) minus the p:2 inset on both edges (2 * 16px).
    await waitFor(() =>
      expect(square).toHaveStyle({ width: "568px", height: "568px" }),
    );

    grbc.mockReturnValue(rect(500, 400));
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    // min(500, 400) - 32.
    await waitFor(() =>
      expect(square).toHaveStyle({ width: "368px", height: "368px" }),
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
