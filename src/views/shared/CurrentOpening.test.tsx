import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import type { OpeningBook } from "../../lib/openings";
import CurrentOpening from "./CurrentOpening";

/*
  A one-entry stand-in for the vendored book — a screen test must not pull the
  real ~3MB of eco.json in, so only the *load* is stubbed; `findOpening`,
  `getPositionBook` and `stickyOpening` run for real over the small book.
*/
const BOOK: OpeningBook = {
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1": {
    eco: "B00",
    name: "King's Pawn Game",
    moves: "1. e4",
  },
};

vi.mock("../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/openings")>();
  return { ...actual, loadOpeningBook: () => Promise.resolve(BOOK) };
});

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
/* After 1. e4 e5 — a position the fixture book does not have. */
const AFTER_E4_E5 =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const line = (fen: string, testId = "test-current-opening") => (
  <MemoryRouter>
    <AppThemeWithLang>
      <CurrentOpening fen={fen} testId={testId} />
    </AppThemeWithLang>
  </MemoryRouter>
);

const renderLine = (fen: string, testId?: string) => render(line(fen, testId));

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

  it("keeps the last known opening when the game steps off the book", async () => {
    const { rerender } = renderLine(AFTER_E4);
    expect(await screen.findByText("King's Pawn Game")).toBeInTheDocument();

    // 1. e4 e5 is past the fixture book — the label must not go blank.
    rerender(line(AFTER_E4_E5));

    expect(screen.getByText("King's Pawn Game")).toBeInTheDocument();
    // The link follows the position on screen, not the remembered one.
    const link = screen.getByTestId("test-current-opening-eco");
    const href = link.getAttribute("href") ?? "";
    expect(new URLSearchParams(href.split("?")[1]).get("fen")).toBe(AFTER_E4_E5);
  });

  it("clears the remembered opening when the game goes back past it", async () => {
    const { rerender } = renderLine(AFTER_E4);
    expect(await screen.findByText("King's Pawn Game")).toBeInTheDocument();

    rerender(line(AFTER_E4_E5));
    expect(screen.getByText("King's Pawn Game")).toBeInTheDocument();

    // Back at the start — the e4 opening was never this position's.
    rerender(line(START_FEN));
    expect(
      screen.getByText(i18n.t("openings.current.unknown")),
    ).toBeInTheDocument();
  });
});
