import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { parsePgnGames } from "../../../lib/pgn";
import { finalFenOf } from "../../../lib/gameModel";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import { itemsInLibraryCategory } from "../../../lib/libraryCatalog";
import { pgnCatalog } from "../../../lib/pgnCatalog";
import { fenAtPly } from "../../../lib/gameNavigation";
import LoadPgn from "./LoadPgn";

/*
  `react-chessboard` measures its own square on mount and throws "Square width
  not found" under jsdom, which has no layout engine. The board is not what this
  screen is about — the stub records the position it is handed, so the tests can
  still assert that the loaded game reaches it.
*/
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string; position?: string } }) => (
    <div
      data-testid="pgn-board"
      data-board-id={options.id}
      data-position={options.position}
    />
  ),
}));

const singleGame = [
  `[Event "Club night"]`,
  `[White "Alice"]`,
  `[Black "Bob"]`,
  `[Result "1-0"]`,
  "",
  "1. e4 e5 2. Nf3 1-0",
].join("\n");

const secondGame = [
  `[Event "Club night"]`,
  `[White "Carol"]`,
  `[Black "Dan"]`,
  `[Result "0-1"]`,
  "",
  "1. d4 d5 0-1",
].join("\n");

const twoGames = `${singleGame}\n\n${secondGame}\n`;

/*
  Provider *and* outlet: the ingestion controls this file drives live in the
  shell's right-hand panel now, so without an outlet they would have nowhere to
  portal to and none of the queries below would find them.
  `LoadPgnNavigation.test.tsx` is where the move list above them is exercised.
*/
const renderScreen = (entry = "/games/load-pgn") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppThemeWithLang>
        <RightPanelProvider>
          <LoadPgn />
          <RightPanelOutlet />
        </RightPanelProvider>
      </AppThemeWithLang>
    </MemoryRouter>,
  );

/** Paste into the textarea and submit it with the Load button. */
const pasteAndLoad = async (pgn: string) => {
  const user = userEvent.setup();
  const box = screen.getByLabelText(i18n.t("loadPgn.pasteLabel"));
  await user.click(box);
  await user.paste(pgn);
  await user.click(screen.getByRole("button", { name: i18n.t("loadPgn.load") }));
};

/**
 * The panel switches to Moves as soon as a game parses, so every assertion
 * about the ingestion controls after a load has to come back to their tab.
 */
const openLoadTab = async () => {
  await userEvent.setup().click(screen.getByTestId("game-panel-tab-load"));
};

const pgnFile = (contents: string) =>
  new File([contents], "game.pgn", { type: "application/x-chess-pgn" });

const summary = () => screen.getByTestId("pgn-summary");

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the Load PGN screen", () => {
  it("starts with nothing loaded", () => {
    renderScreen();
    expect(summary()).toHaveTextContent(i18n.t("loadPgn.emptyState"));
    expect(screen.queryByTestId("pgn-error")).not.toBeInTheDocument();
  });

  it("loads a game pasted into the box", async () => {
    renderScreen();
    await pasteAndLoad(singleGame);

    // The board is showing the game, not the opening position it started on.
    expect(screen.getByTestId("pgn-board")).toHaveAttribute(
      "data-position",
      finalFenOf(parsePgnGames(singleGame)[0]),
    );

    await openLoadTab();
    expect(summary()).toHaveTextContent("Alice vs Bob");
    expect(summary()).toHaveTextContent("Moves: 3");
    expect(screen.queryByTestId("pgn-error")).not.toBeInTheDocument();
  });

  it("loads pasted text on blur, without waiting for the button", async () => {
    const user = userEvent.setup();
    renderScreen();

    const box = screen.getByLabelText(i18n.t("loadPgn.pasteLabel"));
    await user.click(box);
    await user.paste(singleGame);
    await user.tab();

    await openLoadTab();
    expect(summary()).toHaveTextContent("Alice vs Bob");
  });

  it("reports malformed PGN in the panel instead of throwing", async () => {
    renderScreen();
    await pasteAndLoad("[Event \"x\"]\n\n1. e4 Nf7");

    const error = screen.getByTestId("pgn-error");
    expect(error).toHaveTextContent("Could not read this PGN");
    // The underlying reason is kept, not swallowed.
    expect(error).toHaveTextContent("Nf7");
    expect(summary()).toHaveTextContent(i18n.t("loadPgn.emptyState"));
  });

  it("says so when there is nothing to load", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole("button", { name: i18n.t("loadPgn.load") }));

    expect(screen.getByTestId("pgn-error")).toHaveTextContent(
      i18n.t("loadPgn.errors.empty"),
    );
  });

  it("loads a chosen .pgn file", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.upload(screen.getByTestId("pgn-file-input"), pgnFile(singleGame));

    // FileReader is async, so wait for the parse to land before going back.
    await waitFor(() =>
      expect(screen.getByTestId("pgn-board")).toHaveAttribute(
        "data-position",
        finalFenOf(parsePgnGames(singleGame)[0]),
      ),
    );
    await openLoadTab();
    expect(summary()).toHaveTextContent("Alice vs Bob");
  });

  it("loads a .pgn file dropped onto the screen", async () => {
    renderScreen();

    fireEvent.drop(screen.getByTestId("load-pgn-screen"), {
      dataTransfer: { files: [pgnFile(singleGame)], types: ["Files"] },
    });

    await waitFor(() =>
      expect(screen.getByTestId("pgn-board")).toHaveAttribute(
        "data-position",
        finalFenOf(parsePgnGames(singleGame)[0]),
      ),
    );
    await openLoadTab();
    expect(summary()).toHaveTextContent("Alice vs Bob");
  });

  it("keeps the browser from opening the dragged file itself", () => {
    renderScreen();
    const screenBox = screen.getByTestId("load-pgn-screen");

    // Without preventDefault on dragover the drop never reaches the app.
    expect(fireEvent.dragOver(screenBox)).toBe(false);
    expect(fireEvent.drop(screenBox)).toBe(false);
  });

  it("shows no picker for a single-game file", async () => {
    renderScreen();
    await pasteAndLoad(singleGame);
    await openLoadTab();

    expect(screen.queryByTestId("pgn-game-picker")).not.toBeInTheDocument();
  });

  it("lists the games of a multi-game file and loads the one picked", async () => {
    const user = userEvent.setup();
    renderScreen();
    await pasteAndLoad(twoGames);
    await openLoadTab();

    const picker = screen.getByTestId("pgn-game-picker");
    const entries = within(picker).getAllByRole("button");
    expect(entries).toHaveLength(2);
    // Identified by their tag pairs, not by position alone.
    expect(entries[0]).toHaveTextContent("Alice vs Bob");
    expect(entries[0]).toHaveTextContent("Club night");
    expect(entries[1]).toHaveTextContent("Carol vs Dan");

    // The first game loads on its own; picking the second switches to it —
    // which counts as a new game, so the panel jumps to Moves again.
    expect(summary()).toHaveTextContent("Alice vs Bob");
    await user.click(entries[1]);
    await openLoadTab();
    expect(summary()).toHaveTextContent("Carol vs Dan");
    expect(summary()).toHaveTextContent("Moves: 2");
    expect(screen.getByTestId("pgn-board")).toHaveAttribute(
      "data-position",
      finalFenOf(parsePgnGames(twoGames)[1]),
    );
  });

  it("falls back to a numbered name for games with no players", async () => {
    renderScreen();
    await pasteAndLoad("1. e4 e5 *\n\n[Event \"x\"]\n\n1. d4 *");
    await openLoadTab();

    const entries = within(screen.getByTestId("pgn-game-picker")).getAllByRole(
      "button",
    );
    expect(entries[0]).toHaveTextContent("Game 1");
    expect(entries[1]).toHaveTextContent("Game 2");
  });

  it("translates its own strings rather than hardcoding English", async () => {
    await i18n.changeLanguage("he");
    renderScreen();

    expect(summary()).toHaveTextContent(i18n.t("loadPgn.emptyState"));
    expect(
      screen.getByRole("button", { name: i18n.t("loadPgn.load") }),
    ).toBeInTheDocument();
  });
});

describe("the Load PGN screen — arriving with a game", () => {
  /*
    The `?game=` hand-off from a User PGNs detail page. Nothing is pasted: the
    reference is resolved through the catalog and taken as *initial* state,
    because arriving at the URL is what mounts the screen.
  */
  const played = itemsInLibraryCategory("chess-com-games-2026-08-30", pgnCatalog)[0];
  if (played.kind !== "game") throw new Error("expected a game");

  const reference = `pgn/${played.category}/${played.id}`;

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("opens on the game the reference names, at ply 0", () => {
    renderScreen(`/games/load-pgn?game=${encodeURIComponent(reference)}`);

    /*
      Ply 0, where a *pasted* game opens at its final position. A paste opens at
      the end because that is the proof it all parsed; a game the reader picked
      out of a library is one they mean to replay, and a replay starts at the
      start.
    */
    expect(screen.getByTestId("pgn-board")).toHaveAttribute(
      "data-position",
      fenAtPly(played.game, 0),
    );
  });

  it("shows the arrived game's own moves and headers", async () => {
    renderScreen(`/games/load-pgn?game=${encodeURIComponent(reference)}`);

    await userEvent.click(screen.getByTestId("game-panel-tab-info"));
    expect(screen.getByTestId("game-panel-content-info")).toHaveTextContent(
      "AlbertSimTL",
    );
  });

  it("opens empty for a reference that names nothing", () => {
    renderScreen("/games/load-pgn?game=pgn/no-such-folder/no-such-game");

    expect(screen.getByTestId("game-panel-content-load")).toBeInTheDocument();
  });
});
