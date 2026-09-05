import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import type { OpeningBook } from "../../lib/openings";
import CurrentOpening from "./CurrentOpening";

/*
  A two-entry stand-in for the vendored book — a screen test must not pull the
  real ~3MB of eco.json in, so the openings module is stubbed and `findOpening`
  / `getPositionBook` keep their real signatures over it.
*/
const BOOK: OpeningBook = {
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1": {
    eco: "B00",
    name: "King's Pawn Game",
    moves: "1. e4",
  },
};

vi.mock("../../lib/openings", () => ({
  loadOpeningBook: () => Promise.resolve(BOOK),
  getPositionBook: () => ({}),
  findOpening: (
    book: OpeningBook,
    fen: string,
  ): OpeningBook[string] | undefined => book[fen],
}));

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const renderLine = (fen: string, testId = "test-current-opening") =>
  render(
    <MemoryRouter>
      <AppThemeWithLang>
        <CurrentOpening fen={fen} testId={testId} />
      </AppThemeWithLang>
    </MemoryRouter>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("CurrentOpening", () => {
  it("names the opening at the position on screen, with its ECO code", async () => {
    renderLine(AFTER_E4);

    expect(await screen.findByText("King's Pawn Game")).toBeInTheDocument();
    expect(screen.getByTestId("test-current-opening")).toHaveTextContent("B00");
  });

  it("makes the ECO chip the link into the Openings explorer, at this position", async () => {
    renderLine(AFTER_E4);

    const link = await screen.findByTestId("test-current-opening-eco");
    // `createSearchParams` encodes spaces as `+`, so compare the parsed params.
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("/tools/openings?")).toBe(true);
    expect(new URLSearchParams(href.split("?")[1]).get("fen")).toBe(AFTER_E4);
  });

  it("says unknown — and offers no link — for a position the book does not have", async () => {
    renderLine(START_FEN);

    expect(
      await screen.findByText(i18n.t("openings.current.unknown")),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("test-current-opening-eco")).toBeNull();
  });

  it("reads as loading, not unknown, while the book is on its way", () => {
    renderLine(START_FEN);

    // The stubbed promise has not landed yet on the first synchronous render.
    expect(screen.getByTestId("test-current-opening")).toHaveTextContent(
      i18n.t("openings.current.loading"),
    );
  });
});
