import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import {
  findLibraryPosition,
  positionsInLibraryCategory,
} from "../../lib/libraryCatalog";
import { positionsCatalog } from "../../lib/positionsCatalog";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import PositionsSection from "./PositionsSection";

/* Stubbed for the reason in `.claude/rules/chessboard.md` §8 — jsdom has no
   layout engine, and a real board throws from its mount effect. */
vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { id?: string; position?: string; boardOrientation?: string };
  }) => (
    <div
      data-testid="board"
      data-board-id={options.id}
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

/** Where a hand-off lands: the route it opened, and the FEN it carried. */
const Arrival = ({ name }: { name: string }) => {
  const [params] = useSearchParams();
  return <div data-testid={`${name}-arrival`} data-fen={params.get("fen")} />;
};

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <RightPanelProvider>
          <Routes>
            <Route
              path="/positions/*"
              element={
                <>
                  <PositionsSection />
                  <RightPanelOutlet />
                </>
              }
            />
            <Route path="/tools/analysis" element={<Arrival name="analysis" />} />
            <Route path="/engine/play" element={<Arrival name="play" />} />
            <Route path="/tools/editor" element={<Arrival name="editor" />} />
          </Routes>
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const lucena = findLibraryPosition(
  "rook-and-pawn-vs-rook",
  "lucena-position",
  positionsCatalog,
)!;

describe("the Positions section", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists a top-level category's positions", () => {
    renderAt("/positions/rook-and-pawn-vs-rook");

    const listed = positionsInLibraryCategory(
      "rook-and-pawn-vs-rook",
      positionsCatalog,
    );
    expect(listed.length).toBeGreaterThan(0);
    for (const position of listed) {
      expect(screen.getByTestId(`position-card-${position.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
      "Rook and pawn vs Rook",
    );
  });

  it("deep-links a card to the position's own path", () => {
    renderAt("/positions/rook-and-pawn-vs-rook");

    expect(screen.getByTestId(`position-card-${lucena.id}`)).toHaveAttribute(
      "href",
      `/positions/rook-and-pawn-vs-rook/${lucena.id}`,
    );
  });

  it("renders a nested category from its own path", () => {
    /*
      The thing the Mates section's `:category` route could not express, and the
      reason `/positions/*` is a splat: two segments, resolved against the
      catalog rather than against the route table.
    */
    renderAt("/positions/queen-vs-rook/rosettes");

    const panel = screen.getByTestId("layout-right-panel");
    expect(panel).toHaveTextContent("Rosettes");
    // Rosettes ships as structure with no positions in it yet.
    expect(panel).toHaveTextContent("No positions in this category yet.");
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("shows one position, facing the side to move", () => {
    renderAt(`/positions/rook-and-pawn-vs-rook/${lucena.id}`);

    const board = screen.getByTestId("board");
    expect(board).toHaveAttribute("data-position", lucena.fen);
    expect(board).toHaveAttribute("data-orientation", "white");
    expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
      lucena.name.en,
    );
  });

  it("faces a defensive position at the defender", () => {
    /*
      The Mates rule — the mating side is always to move — deliberately does not
      hold here. Philidor's rook defense is Black's to play, so the board opens
      on Black, which is also what `/engine/play` does with the same FEN.
    */
    const philidor = findLibraryPosition(
      "rook-and-pawn-vs-rook",
      "philidor-defense",
      positionsCatalog,
    )!;
    expect(philidor.fen.split(" ")[1]).toBe("b");

    renderAt(`/positions/rook-and-pawn-vs-rook/${philidor.id}`);

    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "black");
  });

  it.each([
    ["analysis", "position-open-analysis"],
    ["play", "position-play-engine"],
    ["editor", "position-open-editor"],
  ])("hands the position to %s as ?fen=", async (arrival, testId) => {
    renderAt(`/positions/rook-and-pawn-vs-rook/${lucena.id}`);

    await userEvent.click(screen.getByTestId(testId));

    expect(screen.getByTestId(`${arrival}-arrival`)).toHaveAttribute(
      "data-fen",
      lucena.fen,
    );
  });

  it("links back to the category a position sits in", async () => {
    renderAt(`/positions/rook-and-pawn-vs-rook/${lucena.id}`);

    await userEvent.click(screen.getByTestId("position-detail-back"));

    expect(screen.getByTestId("positions-list")).toBeInTheDocument();
  });

  it("says so, and renders no board, for a path no category starts", () => {
    renderAt("/positions/no-such-endgame");

    expect(screen.getByTestId("positions-list-unknown-category")).toHaveTextContent(
      "There is no such endgame category.",
    );
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("names the category when only the position is unknown", () => {
    renderAt("/positions/pawn-endgames/no-such-position");

    expect(screen.getByTestId("position-detail-not-found")).toHaveTextContent(
      "There is no such position in this category.",
    );
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("treats a real id under the wrong category as a miss", () => {
    expect(
      findLibraryPosition("pawn-endgames", lucena.id, positionsCatalog),
    ).toBeUndefined();

    renderAt(`/positions/pawn-endgames/${lucena.id}`);

    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("translates its chrome, and takes its content from the data, under Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderAt(`/positions/rook-and-pawn-vs-rook/${lucena.id}`);

    const panel = screen.getByTestId("layout-right-panel");
    // Chrome out of `src/locales`; the position's name out of the JSON.
    expect(panel).toHaveTextContent("משחק מול המנוע");
    expect(panel).toHaveTextContent(lucena.name.he!);
  });
});
