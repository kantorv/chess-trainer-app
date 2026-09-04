import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { parsePgnGames } from "../../../lib/pgn";
import { MOVE_ARROW_COLOR, fenAtPly } from "../../../lib/gameNavigation";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import LoadPgn from "./LoadPgn";

/*
  Walking a loaded game end to end: the move list in the shell's aside, the
  keyboard, and what the board is handed for each ply.

  The board itself is stubbed — jsdom has no layout engine and `<Chessboard>`
  throws "Square width not found" on mount (`.claude/rules/chessboard.md` §8).
  This stub records the arrows as well as the position, which is what the
  "recomputed, never accumulated" assertions read.
*/
vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: {
      position?: string;
      arrows?: { startSquare: string; endSquare: string; color: string }[];
    };
  }) => (
    <div
      data-testid="pgn-board"
      data-position={options.position}
      data-arrows={JSON.stringify(options.arrows ?? [])}
    />
  ),
}));

const pgn = [
  `[Event "Club night"]`,
  `[White "Alice"]`,
  `[Black "Bob"]`,
  "",
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0",
].join("\n");

/* A second game — `splitPgnGames` starts one at an `[Event]` after a blank line. */
const secondPgn = [
  `[Event "Club night"]`,
  `[White "Carol"]`,
  `[Black "Dan"]`,
  "",
  "1. d4 d5 0-1",
].join("\n");

const twoGames = `${pgn}\n\n${secondPgn}\n`;

const game = parsePgnGames(pgn)[0];

/**
 * The screen inside the shell's panel slot — `<RightPanel>` needs the provider,
 * and the outlet is what gives its portal a host to land in. The screen fills
 * that slot from the moment it mounts (the ingestion controls live there), so
 * the `fallback` below is only ever proof that it *is* filled.
 */
const renderScreen = (entry = "/games/load-pgn") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppThemeWithLang>
        <RightPanelProvider>
          <LoadPgn />
          <RightPanelOutlet fallback={<div data-testid="panel-fallback" />} />
        </RightPanelProvider>
      </AppThemeWithLang>
    </MemoryRouter>,
  );

const board = () => screen.getByTestId("pgn-board");
const arrowsOn = () => JSON.parse(board().getAttribute("data-arrows") ?? "[]");
const currentPly = () =>
  Number(
    screen
      .getByRole("button", { current: true })
      .getAttribute("data-testid")
      ?.replace("move-ply-", ""),
  );

/** The panel jumps to Moves when a game parses; come back for the controls. */
const openLoadTab = async () => {
  await userEvent.setup().click(screen.getByTestId("game-panel-tab-load"));
};

const pasteAndLoad = async (text: string) => {
  const user = userEvent.setup();
  const box = screen.getByLabelText(i18n.t("loadPgn.pasteLabel"));
  await user.click(box);
  await user.paste(text);
  await user.click(screen.getByRole("button", { name: i18n.t("loadPgn.load") }));
};

/** A key press on the document, as one arrives with nothing focused. */
const press = (key: string) => fireEvent.keyDown(document.body, { key });

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("stepping through a loaded game", () => {
  it("fills the panel with the ingestion controls, and no move list, until a game is loaded", () => {
    renderScreen();

    // The screen owns the panel from the start — the shell's Analysis
    // placeholder never shows on this route.
    expect(screen.queryByTestId("panel-fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("load-pgn-controls")).toBeInTheDocument();
    expect(screen.queryByTestId("move-list")).not.toBeInTheDocument();
    // Nothing to step through yet, so the arrow keys still belong to the page.
    expect(fireEvent.keyDown(document.body, { key: "ArrowLeft" })).toBe(true);
  });

  it("puts the move list in the panel and opens on the final position", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    // A parsed game switches the panel to Moves on its own — that is the tab
    // the reader wants next, and the ingestion controls have done their job.
    expect(screen.getByTestId("game-panel-content-moves")).toBeInTheDocument();
    expect(screen.getByTestId("move-list")).toBeInTheDocument();
    expect(screen.queryByTestId("load-pgn-controls")).not.toBeInTheDocument();
    // The board controls sit below every tab, so they are still there.
    expect(screen.getByTestId("board-controls")).toBeInTheDocument();
    expect(currentPly()).toBe(5);
    expect(board()).toHaveAttribute("data-position", fenAtPly(game, 5));
  });

  it("steps back and forward one ply at a time", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    press("ArrowLeft");
    expect(currentPly()).toBe(4);
    expect(board()).toHaveAttribute("data-position", fenAtPly(game, 4));

    press("ArrowLeft");
    press("ArrowLeft");
    expect(currentPly()).toBe(2);

    press("ArrowRight");
    expect(currentPly()).toBe(3);
    expect(board()).toHaveAttribute("data-position", fenAtPly(game, 3));
  });

  it("clamps at the start instead of running past it", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    for (let i = 0; i < 9; i += 1) press("ArrowLeft");
    expect(currentPly()).toBe(0);
    expect(board()).toHaveAttribute("data-position", fenAtPly(game, 0));

    // One step forward from the wall is ply 1 — the overshoot was not banked.
    press("ArrowRight");
    expect(currentPly()).toBe(1);
  });

  it("clamps at the end instead of running past it", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    for (let i = 0; i < 9; i += 1) press("ArrowRight");
    expect(currentPly()).toBe(5);

    press("ArrowLeft");
    expect(currentPly()).toBe(4);
  });

  it("jumps to either end with Home and End", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    press("Home");
    expect(currentPly()).toBe(0);

    press("End");
    expect(currentPly()).toBe(5);

    // Up and Down mirror them.
    press("ArrowUp");
    expect(currentPly()).toBe(0);
    press("ArrowDown");
    expect(currentPly()).toBe(5);
  });

  it("jumps to the ply of a clicked move", async () => {
    const user = userEvent.setup();
    renderScreen();
    await pasteAndLoad(pgn);

    await user.click(screen.getByTestId("move-ply-2"));
    expect(currentPly()).toBe(2);
    expect(board()).toHaveAttribute("data-position", fenAtPly(game, 2));

    await user.click(screen.getByTestId("move-ply-0"));
    expect(currentPly()).toBe(0);
    expect(board()).toHaveAttribute("data-position", fenAtPly(game, 0));
  });

  it("recomputes the board arrow on every ply instead of accumulating", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    // Ply 5 — Bb5, and nothing left over from the four moves before it.
    expect(arrowsOn()).toEqual([
      { startSquare: "f1", endSquare: "b5", color: MOVE_ARROW_COLOR },
    ]);

    press("ArrowLeft");
    expect(arrowsOn()).toEqual([
      { startSquare: "b8", endSquare: "c6", color: MOVE_ARROW_COLOR },
    ]);

    // Walking the whole game never grows the set.
    for (let i = 0; i < 4; i += 1) {
      press("ArrowLeft");
      expect(arrowsOn()).toHaveLength(currentPly() === 0 ? 0 : 1);
    }

    // At the starting position there is no move to draw.
    expect(currentPly()).toBe(0);
    expect(arrowsOn()).toEqual([]);
  });

  it("leaves arrow keys to a focused text input", async () => {
    const user = userEvent.setup();
    renderScreen();
    await pasteAndLoad(pgn);
    const finalPosition = board().getAttribute("data-position");

    await openLoadTab();
    const box = screen.getByLabelText(i18n.t("loadPgn.pasteLabel"));
    await user.click(box);

    // Typed into the paste box, the key belongs to the caret, not the panel —
    // and the handler must not preventDefault on it either.
    expect(fireEvent.keyDown(box, { key: "ArrowLeft" })).toBe(true);
    // Read off the board rather than the move list: the list belongs to the
    // Moves tab, and this test is standing on the Load PGN one.
    expect(board()).toHaveAttribute("data-position", finalPosition);
  });

  it("only preventDefaults the keys it actually handles", async () => {
    renderScreen();
    await pasteAndLoad(pgn);

    expect(fireEvent.keyDown(document.body, { key: "ArrowLeft" })).toBe(false);
    // PageDown scrolls the panel; Tab moves focus. Neither is ours.
    expect(fireEvent.keyDown(document.body, { key: "PageDown" })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: "Tab" })).toBe(true);
    // Nor is a browser shortcut that happens to use one of our keys.
    expect(
      fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true }),
    ).toBe(true);
  });

  it("re-opens on the final position of a newly picked game", async () => {
    const user = userEvent.setup();
    renderScreen();

    await pasteAndLoad(twoGames);

    press("Home");
    expect(currentPly()).toBe(0);

    const second = parsePgnGames(twoGames)[1];
    await openLoadTab();
    await user.click(
      screen.getAllByRole("button", { name: /Carol vs Dan/ })[0],
    );

    // The ply follows the new game rather than staying pinned at 0.
    expect(currentPly()).toBe(2);
    expect(board()).toHaveAttribute("data-position", fenAtPly(second, 2));
  });
});
