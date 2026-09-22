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
  it("shows one Openings card, linking to the explorer itself", () => {
    renderHome();

    // The single entry — the same one the sidebar shows, under the same name.
    // Nothing on the explorer is saved, so the folder's destination is the
    // board, not a saved list (CTA-78).
    const openings = screen.getAllByRole("link", { name: "Openings" });
    expect(openings).toHaveLength(1);
    expect(openings[0]).toHaveAttribute("href", "/openings");

    const cards = screen.getAllByRole("link");
    expect(cards.map((link) => link.getAttribute("href"))).not.toContain(
      "/openings/saved",
    );
  });

  it("shows one Analysis Board card linking to the saved list, and none to the board", () => {
    renderHome();

    // The single entry — the same one the sidebar shows, under the same name
    // (CTA-58, mirroring CTA-42's Openings folder).
    const analysis = screen.getAllByRole("link", { name: "Analysis Board" });
    expect(analysis).toHaveLength(1);
    expect(analysis[0]).toHaveAttribute("href", "/tools/analysis/saved");

    // The board view has no card: it is the saved list's New button.
    const cards = screen.getAllByRole("link");
    expect(cards.map((link) => link.getAttribute("href"))).not.toContain(
      "/tools/analysis",
    );
  });

  it("still shows a card per screen of every other section", () => {
    renderHome();

    // One card per screen node in the tree — the Library's among them.
    const cards = screen.getAllByRole("link").map((link) =>
      link.getAttribute("href"),
    );
    expect(cards).toContain("/engine/play");
    expect(cards).toContain("/tools/editor");
    expect(cards).toContain("/library");
  });
});
