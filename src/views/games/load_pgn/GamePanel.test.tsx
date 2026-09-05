import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { parsePgnGames } from "../../../lib/pgn";
import { initialFenOf } from "../../../lib/gameModel";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import GamePanel from "./GamePanel";
import LoadPgn from "./LoadPgn";

/*
  The board is stubbed for the whole file — jsdom has no layout engine and
  `<Chessboard>` throws "Square width not found" on mount
  (`.claude/rules/chessboard.md` §8). This stub records the orientation, which
  is what the flip assertions read.
*/
/*
  The opening book stays stubbed here — this suite is about the panel, and the
  real one is ~3MB of JSON behind a dynamic import (see CurrentOpening.test.tsx
  for the component's own stubbed-book tests).
*/
vi.mock("../../../lib/openings", () => ({
  loadOpeningBook: () => Promise.resolve({}),
  getPositionBook: () => ({}),
  findOpening: () => undefined,
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { position?: string; boardOrientation?: string };
  }) => (
    <div
      data-testid="pgn-board"
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

const pgn = [
  `[Event "Club night"]`,
  `[Site "Haifa"]`,
  `[Date "2026.09.02"]`,
  `[White "Alice"]`,
  `[Black "Bob"]`,
  `[Result "1-0"]`,
  `[ECO "C20"]`,
  "",
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0",
].join("\n");

const game = parsePgnGames(pgn)[0];

/** The panel on its own, against a fixture — no board and no ingestion state. */
const renderPanel = (
  props: Partial<Parameters<typeof GamePanel>[0]> = {},
) => {
  const onSelectPly = vi.fn();
  const onFlip = vi.fn();
  render(
    <AppThemeWithLang>
      <GamePanel
        game={game}
        ply={6}
        lastPly={5}
        fen={game.moves[0].fen}
        onSelectPly={onSelectPly}
        onFlip={onFlip}
        ingest={<div data-testid="ingest" />}
        {...props}
      />
    </AppThemeWithLang>,
  );
  return { onSelectPly, onFlip };
};

/** The whole screen, so the flip actually reaches a board. */
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

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the game panel's tabs", () => {
  it("opens on Load PGN when nothing is loaded", () => {
    renderPanel({ game: undefined, ply: 0, lastPly: 0 });

    // Nothing to show on the other two tabs yet.
    expect(screen.getByTestId("ingest")).toBeInTheDocument();
    expect(screen.queryByTestId("move-list")).not.toBeInTheDocument();
  });

  it("switches to Moves on its own when a game arrives", async () => {
    const { rerender } = render(
      <AppThemeWithLang>
        <GamePanel
          game={undefined}
          ply={0}
          lastPly={0}
          fen={initialFenOf(game)}
          onSelectPly={vi.fn()}
          onFlip={vi.fn()}
          ingest={<div data-testid="ingest" />}
        />
      </AppThemeWithLang>,
    );
    expect(screen.getByTestId("ingest")).toBeInTheDocument();

    rerender(
      <AppThemeWithLang>
        <GamePanel
          game={game}
          ply={5}
          lastPly={5}
          fen={game.moves[4].fen}
          onSelectPly={vi.fn()}
          onFlip={vi.fn()}
          ingest={<div data-testid="ingest" />}
        />
      </AppThemeWithLang>,
    );

    expect(screen.getByTestId("move-list")).toBeInTheDocument();
    expect(screen.queryByTestId("ingest")).not.toBeInTheDocument();
  });

  it("shows one tab's content at a time, and moves between them on click", async () => {
    const user = userEvent.setup();
    renderPanel({ ply: 5 });

    // Starts on Moves — the fixture game is present from the first render.
    expect(screen.getByTestId("move-list")).toBeInTheDocument();

    await user.click(screen.getByTestId("game-panel-tab-info"));
    expect(screen.getByTestId("game-info")).toBeInTheDocument();
    expect(screen.queryByTestId("move-list")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("game-panel-tab-load"));
    expect(screen.getByTestId("ingest")).toBeInTheDocument();
    expect(screen.queryByTestId("game-info")).not.toBeInTheDocument();
  });

  it("keeps the board controls below every tab", async () => {
    const user = userEvent.setup();
    renderPanel({ ply: 5 });

    for (const tab of ["moves", "info", "load"]) {
      await user.click(screen.getByTestId(`game-panel-tab-${tab}`));
      expect(screen.getByTestId("board-controls")).toBeInTheDocument();
    }
  });
});

describe("the Info tab", () => {
  it("lists the game's tag pairs under translated labels", async () => {
    const user = userEvent.setup();
    renderPanel({ ply: 5 });
    await user.click(screen.getByTestId("game-panel-tab-info"));

    expect(screen.getByTestId("game-info-White")).toHaveTextContent("Alice");
    expect(screen.getByTestId("game-info-Black")).toHaveTextContent("Bob");
    expect(screen.getByTestId("game-info-Event")).toHaveTextContent("Club night");
    expect(screen.getByTestId("game-info-ECO")).toHaveTextContent("C20");
    expect(screen.getByText(i18n.t("gamePanel.info.white"))).toBeInTheDocument();
  });

  it("pins tag values to LTR with an attribute, not a flippable declaration", async () => {
    // Under Hebrew the panel renders through the RTL emotion cache, whose
    // stylis plugin would flip a `direction: ltr` declaration into the bug it
    // exists to prevent. Same reasoning as the move list's SAN cells.
    await i18n.changeLanguage("he");
    const user = userEvent.setup();
    renderPanel({ ply: 5 });
    await user.click(screen.getByTestId("game-panel-tab-info"));

    expect(screen.getByTestId("game-info-White")).toHaveAttribute("dir", "ltr");
  });

  it("says so rather than rendering an empty list when no game is loaded", async () => {
    const user = userEvent.setup();
    renderPanel({ game: undefined, ply: 0, lastPly: 0 });
    await user.click(screen.getByTestId("game-panel-tab-info"));

    expect(screen.getByText(i18n.t("gamePanel.info.empty"))).toBeInTheDocument();
    expect(screen.queryByTestId("game-info")).not.toBeInTheDocument();
  });
});

describe("the board controls", () => {
  it("jumps and steps by ply", async () => {
    const user = userEvent.setup();
    const { onSelectPly } = renderPanel({ ply: 3, lastPly: 5 });

    await user.click(screen.getByTestId("board-control-first"));
    expect(onSelectPly).toHaveBeenLastCalledWith(0);

    await user.click(screen.getByTestId("board-control-previous"));
    expect(onSelectPly).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByTestId("board-control-next"));
    expect(onSelectPly).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByTestId("board-control-last"));
    expect(onSelectPly).toHaveBeenLastCalledWith(5);
  });

  it("disables the ends it is already standing on", () => {
    renderPanel({ ply: 0, lastPly: 5 });

    expect(screen.getByTestId("board-control-first")).toBeDisabled();
    expect(screen.getByTestId("board-control-previous")).toBeDisabled();
    expect(screen.getByTestId("board-control-next")).toBeEnabled();
    expect(screen.getByTestId("board-control-last")).toBeEnabled();
  });

  it("disables the forward pair at the final position", () => {
    renderPanel({ ply: 5, lastPly: 5 });

    expect(screen.getByTestId("board-control-next")).toBeDisabled();
    expect(screen.getByTestId("board-control-last")).toBeDisabled();
    expect(screen.getByTestId("board-control-first")).toBeEnabled();
  });

  it("flips the board, and flips it back", async () => {
    const user = userEvent.setup();
    renderScreen();

    const board = () => screen.getByTestId("pgn-board");
    expect(board()).toHaveAttribute("data-orientation", "white");

    await user.click(screen.getByTestId("board-control-flip"));
    expect(board()).toHaveAttribute("data-orientation", "black");

    await user.click(screen.getByTestId("board-control-flip"));
    expect(board()).toHaveAttribute("data-orientation", "white");
  });

  it("stays usable with no game loaded", () => {
    renderPanel({ game: undefined, ply: 0, lastPly: 0 });

    // Every step is a no-op at ply 0 of an empty game, but flipping the board
    // is not — it works before anything is loaded.
    expect(screen.getByTestId("board-control-flip")).toBeEnabled();
    expect(screen.getByTestId("board-control-next")).toBeDisabled();
  });
});
