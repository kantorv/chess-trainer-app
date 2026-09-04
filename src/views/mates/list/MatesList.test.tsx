import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { matesCatalog, positionsInCategory } from "../../../lib/matesCatalog";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import MatesList from "./MatesList";

/*
  `react-chessboard` measures its own square on mount and throws "Square width
  not found" under jsdom, which has no layout engine. A card's preview board is
  not what this screen is about — the stub records the position it is handed, so
  the tests can still assert that each card carries its own entry.
*/
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string; position?: string } }) => (
    <div
      data-testid="mate-preview"
      data-board-id={options.id}
      data-position={options.position}
    />
  ),
}));

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <RightPanelProvider>
          <Routes>
            <Route
              path="/mates/:category"
              element={
                <>
                  <MatesList />
                  <RightPanelOutlet />
                </>
              }
            />
          </Routes>
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

describe("MatesList", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists that category's positions, and only those", () => {
    renderAt("/mates/basic");

    const basic = positionsInCategory("basic");
    expect(basic.length).toBeGreaterThan(0);

    for (const position of basic) {
      expect(screen.getByTestId(`mate-card-${position.id}`)).toBeInTheDocument();
    }
    // Nothing from another category leaks in.
    for (const position of positionsInCategory("complex")) {
      expect(screen.queryByTestId(`mate-card-${position.id}`)).toBeNull();
    }
  });

  it("hands each card its own position, and names the side to move", () => {
    renderAt("/mates/basic");

    const first = positionsInCategory("basic")[0];
    const card = screen.getByTestId(`mate-card-${first.id}`);

    expect(card.querySelector("[data-testid='mate-preview']")).toHaveAttribute(
      "data-position",
      first.fen,
    );
    expect(card).toHaveTextContent(first.name.en);
    expect(card).toHaveTextContent("White to play");
  });

  it("deep-links each card to its detail route", () => {
    renderAt("/mates/advanced");

    const first = positionsInCategory("advanced")[0];
    expect(screen.getByTestId(`mate-card-${first.id}`)).toHaveAttribute(
      "href",
      `/mates/advanced/${first.id}`,
    );
  });

  it("shows the category and its count in the list's own top bar", () => {
    // Both moved out of the shell panel and above the cards, where the reader
    // is already looking; the panel keeps the hint alone.
    renderAt("/mates/complex");

    const topBar = screen.getByTestId("mates-list-top-bar");
    expect(topBar).toHaveTextContent("Complex");
    expect(topBar).toHaveTextContent(
      `Positions: ${positionsInCategory("complex").length}`,
    );
    expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
      "Pick a position to open it on a board",
    );
  });

  it("renders the position name in the active language, with an en fallback", async () => {
    await i18n.changeLanguage("he");
    renderAt("/mates/basic");

    const first = positionsInCategory("basic")[0];
    // Every shipped entry is translated; the fallback itself is covered in
    // `lib/matesCatalog.test.ts`, where a catalog can be built without one.
    expect(screen.getByTestId(`mate-card-${first.id}`)).toHaveTextContent(
      first.name.he!,
    );
  });

  it("says so, and renders no board, for a category the catalog does not have", () => {
    renderAt("/mates/impossible");

    expect(screen.getByTestId("mates-list-unknown-category")).toHaveTextContent(
      "There is no such mates category.",
    );
    expect(screen.queryByTestId("mate-preview")).toBeNull();
  });

  it("ships a catalog the screen can render whole", () => {
    // A dropped entry would silently shrink a category rather than fail here,
    // so the screen test asserts the data it is reading is intact.
    expect(matesCatalog.problems).toEqual([]);
  });
});
