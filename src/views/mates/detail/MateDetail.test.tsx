import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";

import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { findMatePosition, positionsInCategory } from "../../../lib/matesCatalog";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import MateDetail from "./MateDetail";

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
              path="/mates/:category/:id"
              element={
                <>
                  <MateDetail />
                  <RightPanelOutlet />
                </>
              }
            />
            <Route path="/mates/:category" element={<div data-testid="list" />} />
            <Route path="/tools/analysis" element={<Arrival name="analysis" />} />
            <Route path="/engine/play" element={<Arrival name="play" />} />
            <Route path="/tools/editor" element={<Arrival name="editor" />} />
          </Routes>
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const first = positionsInCategory("basic")[0];
const pathOf = (id: string) => `/mates/basic/${id}`;

describe("MateDetail", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the named position on the board", () => {
    renderAt(pathOf(first.id));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      first.fen,
    );
    expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
      first.name.en,
    );
  });

  it("faces the board at the side to move", () => {
    // A position is something you are about to answer, so you look at it from
    // the side that has to move — and `/engine/play` will do the same with this
    // very FEN a click later, so the board does not turn on the way over.
    renderAt(pathOf(first.id));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      first.fen.split(" ")[1] === "b" ? "black" : "white",
    );
  });

  it("hands the position to the Analysis Board as ?fen=", async () => {
    renderAt(pathOf(first.id));

    await userEvent.click(screen.getByTestId("mate-open-analysis"));

    expect(screen.getByTestId("analysis-arrival")).toHaveAttribute(
      "data-fen",
      first.fen,
    );
  });

  it("hands the position to Play with Engine as ?fen=", async () => {
    renderAt(pathOf(first.id));

    await userEvent.click(screen.getByTestId("mate-play-engine"));

    expect(screen.getByTestId("play-arrival")).toHaveAttribute(
      "data-fen",
      first.fen,
    );
  });

  it("hands the position to the Board Editor as ?fen=", async () => {
    // The third hand-off is the same mechanism with a third destination — the
    // editor reads `?fen=` exactly as the other two do.
    renderAt(pathOf(first.id));

    await userEvent.click(screen.getByTestId("mate-open-editor"));

    expect(screen.getByTestId("editor-arrival")).toHaveAttribute(
      "data-fen",
      first.fen,
    );
  });

  it("links back to its own category's list", async () => {
    renderAt(pathOf(first.id));

    await userEvent.click(screen.getByTestId("mate-detail-back"));

    expect(screen.getByTestId("list")).toBeInTheDocument();
  });

  it("renders no board for an id the category does not have", () => {
    renderAt(pathOf("no-such-position"));

    expect(screen.getByTestId("mate-detail-not-found")).toHaveTextContent(
      "There is no such position in this category.",
    );
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("renders no board for an unknown category", () => {
    renderAt(`/mates/impossible/${first.id}`);

    expect(screen.getByTestId("mate-detail-not-found")).toHaveTextContent(
      "There is no such mates category.",
    );
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("treats a real id under the wrong category as a miss", () => {
    const complex = positionsInCategory("complex")[0];
    expect(findMatePosition("basic", complex.id)).toBeUndefined();

    renderAt(pathOf(complex.id));

    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("translates its chrome and its content under Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderAt(pathOf(first.id));

    const panel = screen.getByTestId("layout-right-panel");
    expect(panel).toHaveTextContent(first.name.he!);
    expect(panel).toHaveTextContent("משחק מול המנוע");
  });
});
