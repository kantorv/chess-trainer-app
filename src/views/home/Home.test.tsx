import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import Home from "./Home";

const renderHome = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the landing page", () => {
  it("shows one Openings card linking to the saved list, and none to the board", () => {
    renderHome();

    // The single entry — the same one the sidebar shows, under the same name.
    const openings = screen.getAllByRole("link", { name: "Openings" });
    expect(openings).toHaveLength(1);
    expect(openings[0]).toHaveAttribute("href", "/openings/saved");

    // The board view has no card: it is the saved list's New button (CTA-42).
    const cards = screen.getAllByRole("link");
    expect(cards.map((link) => link.getAttribute("href"))).not.toContain(
      "/openings",
    );
  });

  it("still shows a card per screen of every other section", () => {
    renderHome();

    // The nav shape changed for one folder only; every other screen keeps its
    // card. A PGN section's screens are generated, so the exact set is the
    // nav's own — one card per screen node in the tree.
    const cards = screen.getAllByRole("link").map((link) =>
      link.getAttribute("href"),
    );
    expect(cards).toContain("/engine/play");
    expect(cards).toContain("/tools/analysis");
    expect(cards.some((href) => href?.startsWith("/library"))).toBe(true);
  });
});
