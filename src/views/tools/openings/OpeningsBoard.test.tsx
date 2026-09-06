import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chess } from "chess.js";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { MOVE_ARROW_COLOR } from "../../../lib/gameNavigation";
import { KNOWN_MOVE_ARROW_COLOR } from "../../../lib/openings";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import OpeningsBoard from "./OpeningsBoard";

type BoardArrow = { startSquare: string; endSquare: string; color: string };

/*
  `react-chessboard` measures its own square on mount and throws "Square width
  not found" under jsdom, which has no layout engine. The board is not what this
  screen is about — the stub records what it is handed, so the tests can assert
  the position, orientation and arrows the screen arrives on (.claude/rules/chessboard.md
  §8).
*/
vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: {
      id?: string;
      position?: string;
      boardOrientation?: string;
      arrows?: BoardArrow[];
    };
  }) => (
    <div
      data-testid="board"
      data-board-id={options.id}
      data-position={options.position}
      data-orientation={options.boardOrientation}
      data-arrows={JSON.stringify(options.arrows ?? [])}
    />
  ),
}));

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/* After 1. e4 — a position the vendored book knows ("King's Pawn Game", B00). */
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";

/** After 1. a3 a6 2. h3 — past every named line in eco.json. */
const offBookFen = () => {
  const chess = new Chess();
  for (const san of ["a3", "a6", "h3"]) chess.move(san);
  return chess.fen();
};

const boardArrows = (): BoardArrow[] =>
  JSON.parse(screen.getByTestId("board").getAttribute("data-arrows") ?? "[]");

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

  it("lists every book move from the start with what eco.json calls it", async () => {
    renderScreen();
    await bookSettled();

    const list = screen.getByTestId("openings-next-moves-list");
    // Twenty known first moves from the start — off-book ones are playable but
    // not listed.
    expect(list.querySelectorAll("[data-testid^='openings-next-move-']")).toHaveLength(
      20,
    );
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

  it("lists only the book continuations after a named move", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-a3"));

    const ids = [...screen.getByTestId("openings-next-moves-list").querySelectorAll(
      "[data-testid^='openings-next-move-']",
    )].map((el) => el.getAttribute("data-testid")?.replace("openings-next-move-", ""));

    expect(ids.sort()).toEqual(["a5", "e5", "g6"]);
    for (const san of ["a5", "e5", "g6"]) {
      expect(screen.getByTestId(`openings-next-move-${san}`)).not.toHaveTextContent(
        i18n.t("openings.current.unknown"),
      );
    }
  });

  it("draws a green arrow for every known next move at the start", async () => {
    renderScreen();
    await bookSettled();

    const arrows = boardArrows();
    expect(arrows).toHaveLength(20);
    expect(arrows.every((arrow) => arrow.color === KNOWN_MOVE_ARROW_COLOR)).toBe(
      true,
    );
  });

  it("adds an amber last-move arrow once a move has been played", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));

    const arrows = boardArrows();
    expect(arrows).toHaveLength(21);
    expect(
      arrows.filter((arrow) => arrow.color === MOVE_ARROW_COLOR),
    ).toEqual([{ startSquare: "e2", endSquare: "e4", color: MOVE_ARROW_COLOR }]);
    expect(
      arrows.filter((arrow) => arrow.color === KNOWN_MOVE_ARROW_COLOR),
    ).toHaveLength(20);
  });

  it("branches the variation tree when a different book move is tried from an earlier ply", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.click(screen.getByTestId("board-control-first"));
    await user.click(screen.getByTestId("openings-next-move-d4"));

    expect(screen.getByTestId("board")).toHaveAttribute("data-position", AFTER_D4);

    await user.click(screen.getByTestId("openings-panel-tab-moves"));

    expect(screen.getByTestId("variation-tree")).toBeInTheDocument();
    expect(document.querySelector('[data-san="e4"]')).toBeInTheDocument();
    expect(document.querySelector('[data-san="d4"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid^="tree-variation-"]')).toBeInTheDocument();

    await user.click(document.querySelector('[data-san="e4"]')!);

    expect(screen.getByTestId("board")).toHaveAttribute("data-position", AFTER_E4);
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

  it("reports an off-book ?fen= as unknown with no next moves or arrows", async () => {
    const fen = offBookFen();
    renderScreen(`/tools/openings?fen=${encodeURIComponent(fen)}`);
    await bookSettled();

    expect(screen.getByTestId("openings-current")).toHaveTextContent(
      i18n.t("openings.current.unknown"),
    );
    expect(screen.getByTestId("openings-next-moves-empty")).toBeInTheDocument();
    expect(boardArrows()).toEqual([]);
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
