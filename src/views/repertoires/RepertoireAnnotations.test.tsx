import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import { FakeEngine } from "../dev/devTestHarness";
import { renderSection, storeRepertoire } from "./repertoireTestKit";

/*
  The player's comment block (CTA-69): what the PGN says at the position on
  screen, above the footer where the changes strip sits — the comments, the
  move's marks and the attributes read out of them.
*/
vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../dev/devTestHarness");
  return reactChessboardMock();
});
vi.mock("../../lib/engine", async () => ({
  default: (await import("../dev/devTestHarness")).FakeEngine,
}));
vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../dev/devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../lib/openings")>,
  );
});

const ANNOTATED = [
  '[Event "Annotated"]',
  "",
  "{Notes by Stockfish.} 1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7",
  "6. Bd3 dxc4 7. Bxc4 b5 8. Bd3 Bb7 {better is 8...b4 9.Ne4 = 0.00 (27 ply)}",
  "9. O-O?! {+/= +1.31 (21 ply) [%clk 0:05:00]} ({Instead:} 9. e4 $14) *",
].join("\n");

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

const ready = (id = "repertoire-board") =>
  waitFor(() => expect(screen.queryByTestId(`${id}-reading`)).not.toBeInTheDocument(), {
    timeout: 10_000,
  });

const block = () => screen.queryByTestId("repertoire-board-annotations");

describe("the player's comment block", () => {
  it("shows the game's own comment at the start position", async () => {
    renderSection(`/repertoires/${storeRepertoire("r", ANNOTATED)}`);
    await ready();
    expect(block()).toHaveTextContent("Comment");
    expect(screen.getByTestId("repertoire-board-annotations-move")).toHaveTextContent(
      "Start position",
    );
    expect(block()).toHaveTextContent("Notes by Stockfish.");
  });

  it("shows a move's comment, with the engine's numbers as attributes", async () => {
    renderSection(`/repertoires/${storeRepertoire("r", ANNOTATED)}?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7`);
    await ready();
    expect(screen.getByTestId("repertoire-board-annotations-move")).toHaveTextContent("8… Bb7");
    const comment = screen.getByTestId("repertoire-board-annotations-after-0");
    expect(comment).toHaveTextContent("better is 8...b4 9.Ne4");
    expect(within(comment).getByTestId("repertoire-board-annotations-after-0-attr-eval")).toHaveTextContent("Eval 0.00");
    expect(within(comment).getByTestId("repertoire-board-annotations-after-0-attr-depth")).toHaveTextContent("Depth 27");
    expect(within(comment).getByTestId("repertoire-board-annotations-after-0-attr-assessment")).toHaveTextContent("=");
  });

  it("marks the move, and reads [%key value] commands too", async () => {
    renderSection(`/repertoires/${storeRepertoire("r", ANNOTATED)}?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7,O-O`);
    await ready();
    expect(screen.getByTestId("repertoire-board-annotations-move")).toHaveTextContent("9. O-O?!");
    expect(screen.getByTestId("repertoire-board-annotations-after-0-attr-clk")).toHaveTextContent("Clock 0:05:00");
    expect(screen.getByTestId("repertoire-board-annotations-after-0-attr-eval")).toHaveTextContent("+1.31");
  });

  it("shows the comment opening a side line, and a position NAG", async () => {
    renderSection(`/repertoires/${storeRepertoire("r", ANNOTATED)}?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7,e4`);
    await ready();
    expect(screen.getByTestId("repertoire-board-annotations-before")).toHaveTextContent("Before this move");
    expect(screen.getByTestId("repertoire-board-annotations-before")).toHaveTextContent("Instead:");
    expect(screen.getByTestId("repertoire-board-annotations-nag-14")).toHaveTextContent("⩲");
  });

  it("follows the reader, and is gone where nothing is annotated", async () => {
    renderSection(`/repertoires/${storeRepertoire("r", ANNOTATED)}`);
    await ready();
    expect(block()).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("move-ply-1"));
    await waitFor(() => expect(block()).not.toBeInTheDocument());
  });

  it("is not shown in a game — a comment there would give the answer away", async () => {
    renderSection(`/repertoires/${storeRepertoire("r", ANNOTATED)}/games/end`);
    await ready("repertoire-game");
    expect(screen.queryByTestId("repertoire-game-annotations")).not.toBeInTheDocument();
  });
});
