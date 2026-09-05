import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import OpeningsBoard from "./OpeningsBoard";

/*
  `react-chessboard` measures its own square on mount and throws "Square width
  not found" under jsdom, which has no layout engine. The board is not what this
  screen is about — the stub records what it is handed, so the tests can assert
  the position and orientation the screen arrives on (.claude/rules/chessboard.md
  §8).
*/
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

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/* After 1. e4 — a position the vendored book knows ("King's Pawn Game", B00). */
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const renderScreen = (entry = "/tools/openings") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppThemeWithLang>
        <RightPanelProvider>
          <OpeningsBoard />
          <RightPanelOutlet />
        </RightPanelProvider>
      </AppThemeWithLang>
    </MemoryRouter>,
  );

/* The book loads over a dynamic import, so the lookup lands a tick after mount. */
const bookSettled = () =>
  waitFor(
    () =>
      expect(screen.getByTestId("openings-current")).not.toHaveTextContent(
        i18n.t("openings.current.loading"),
      ),
    // The book is ~3 MB of JSON over five dynamic imports — a parallel suite
    // does not land that within waitFor's default second.
    { timeout: 10000 },
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the Openings screen", () => {
  it("opens on the starting position, facing White", () => {
    renderScreen();

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      START_FEN,
    );
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "white",
    );
  });

  it("reports the starting position as not yet a named opening", async () => {
    renderScreen();
    await bookSettled();

    // eco.json starts at the first move; the bare starting position has no entry.
    expect(screen.getByTestId("openings-current")).toHaveTextContent(
      i18n.t("openings.current.unknown"),
    );
  });

  it("lists every legal move with what eco.json calls its reply", async () => {
    renderScreen();
    await bookSettled();

    const list = screen.getByTestId("openings-next-moves-list");
    // Twenty legal moves from the start, no more, no fewer.
    expect(list.querySelectorAll("[data-testid^='openings-next-move-']")).toHaveLength(
      20,
    );
    // 1. e4 and 1. a4 are both named replies ("Ware Opening" is a real A00).
    expect(screen.getByTestId("openings-next-move-e4")).toHaveTextContent(
      "King's Pawn Game",
    );
    expect(screen.getByTestId("openings-next-move-a4")).toHaveTextContent(
      "Ware Opening",
    );
  });

  it("plays a move clicked out of the explorer list", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      AFTER_E4,
    );
    expect(screen.getByTestId("openings-current")).toHaveTextContent(
      "King's Pawn Game",
    );
  });

  it("reports an unknown position as such, not as an error", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    // 1. a3 a6 2. h3 leaves every named line behind.
    await user.click(screen.getByTestId("openings-next-move-a3"));
    await user.click(screen.getByTestId("openings-next-move-a6"));
    await user.click(screen.getByTestId("openings-next-move-h3"));

    expect(screen.getByTestId("openings-current")).toHaveTextContent(
      i18n.t("openings.current.unknown"),
    );
    // ...and its next moves are listed, marked as unnamed rather than missing.
    expect(screen.getByTestId("openings-next-moves-list")).toHaveTextContent(
      i18n.t("openings.nextMoves.unknown"),
    );
  });

  it("returns to the position it opened on with New game", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.click(screen.getByTestId("openings-new-game"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      START_FEN,
    );
  });
});

describe("the Openings screen — arriving with a position", () => {
  it("opens on a readable ?fen= and faces the side to move", async () => {
    renderScreen(`/tools/openings?fen=${encodeURIComponent(AFTER_E4)}`);
    await bookSettled();

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      AFTER_E4,
    );
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(screen.getByTestId("openings-current")).toHaveTextContent(
      "King's Pawn Game",
    );
  });

  it("New game returns to the handed-over position, not the standard start", async () => {
    const user = userEvent.setup();
    renderScreen(`/tools/openings?fen=${encodeURIComponent(AFTER_E4)}`);
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e5"));
    await user.click(screen.getByTestId("openings-new-game"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      AFTER_E4,
    );
  });

  it("ignores a ?fen= nobody can read", () => {
    renderScreen("/tools/openings?fen=not-a-fen");

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      START_FEN,
    );
  });
});
