import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import SideBar from "./Sidebar";
import { navItems } from "./navItems";

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <SideBar />
      </MemoryRouter>
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("sidebar navigation", () => {
  it("renders one link per registered screen, and no more", () => {
    renderAt("/");
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

    const others = screen
      .getAllByRole("link")
      .filter((link) => link !== active);
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
    english.unmount();

    await i18n.changeLanguage("he");
    renderAt("/");
    expect(
      screen.getByRole("link", { name: i18n.t("nav.basicBoard") }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Basic board" })).toBeNull();
  });

  it("gives the nav an accessible name from the catalog", () => {
    renderAt("/");
    expect(
      screen.getByRole("navigation", { name: i18n.t("nav.ariaLabel") }),
    ).toBeInTheDocument();
  });
});
