import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import i18n from "../../i18n";
import { FakeEngine } from "../board/boardTestHarness";
import { renderSection, storeRepertoire } from "./repertoireTestKit";

/*
  The player's comment block (CTA-69): what the PGN says at the position on
  screen, above the footer where the changes strip sits — the comments, the
  move's marks and the attributes read out of them.
*/
vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../board/boardTestHarness");
  return reactChessboardMock();
});
vi.mock("../../lib/engine", async () => ({
  default: (await import("../board/boardTestHarness")).FakeEngine,
}));
vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../board/boardTestHarness");
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
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}`);
    await ready();
    expect(block()).toHaveTextContent("Comment");
    expect(screen.getByTestId("repertoire-board-annotations-move")).toHaveTextContent(
      "Start position",
    );
    expect(block()).toHaveTextContent("Notes by Stockfish.");
  });

  it("shows a move's comment, with the engine's numbers as attributes", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7`);
    await ready();
    expect(screen.getByTestId("repertoire-board-annotations-move")).toHaveTextContent("8… Bb7");
    const comment = screen.getByTestId("repertoire-board-annotations-after-0");
    expect(comment).toHaveTextContent("better is 8...b4 9.Ne4");
    expect(within(comment).getByTestId("repertoire-board-annotations-after-0-attr-eval")).toHaveTextContent("Eval 0.00");
    expect(within(comment).getByTestId("repertoire-board-annotations-after-0-attr-depth")).toHaveTextContent("Depth 27");
    expect(within(comment).getByTestId("repertoire-board-annotations-after-0-attr-assessment")).toHaveTextContent("=");
  });

  it("marks the move, and reads [%key value] commands too", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7,O-O`);
    await ready();
    expect(screen.getByTestId("repertoire-board-annotations-move")).toHaveTextContent("9. O-O?!");
    expect(screen.getByTestId("repertoire-board-annotations-after-0-attr-clk")).toHaveTextContent("Clock 0:05:00");
    expect(screen.getByTestId("repertoire-board-annotations-after-0-attr-eval")).toHaveTextContent("+1.31");
  });

  it("shows the comment opening a side line, and a position NAG", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7,e4`);
    await ready();
    expect(screen.getByTestId("repertoire-board-annotations-before")).toHaveTextContent("Before this move");
    expect(screen.getByTestId("repertoire-board-annotations-before")).toHaveTextContent("Instead:");
    expect(screen.getByTestId("repertoire-board-annotations-nag-14")).toHaveTextContent("⩲");
  });

  it("follows the reader, and is gone where nothing is annotated", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}`);
    await ready();
    expect(block()).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("move-ply-1"));
    await waitFor(() => expect(block()).not.toBeInTheDocument());
  });

  it("is not shown in a game — a comment there would give the answer away", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}/games/end`);
    await ready("repertoire-game");
    expect(screen.queryByTestId("repertoire-game-annotations")).not.toBeInTheDocument();
  });
});

describe("editing a move's comment", () => {
  const AT_BB7 = "?at=d4,d5,c4,c6,Nf3,Nf6,Nc3,e6,e3,Nbd7,Bd3,dxc4,Bxc4,b5,Bd3,Bb7";
  const save = () => screen.getByTestId("repertoire-board-save");

  it("edits one from the block — a session change, Save lights up", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}${AT_BB7}`);
    await ready();
    expect(save()).toBeDisabled();

    await userEvent.click(screen.getByTestId("repertoire-board-annotations-after-0-edit"));
    const field = screen.getByTestId("comment-dialog-text");
    // The stored text, attributes and all.
    expect(field).toHaveValue("better is 8...b4 9.Ne4 = 0.00 (27 ply)");
    await userEvent.clear(field);
    await userEvent.type(field, "Playable.");
    await userEvent.click(screen.getByTestId("comment-dialog-save"));

    expect(screen.getByTestId("repertoire-board-annotations-after-0")).toHaveTextContent("Playable.");
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    expect(screen.getByTestId("repertoire-board-changes-summary")).toHaveTextContent(
      "Lines or comments edited",
    );
  });

  it("adds one from the block, and deletes one", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}${AT_BB7}`);
    await ready();
    await userEvent.click(screen.getByTestId("repertoire-board-annotations-add"));
    expect(screen.getByTestId("comment-dialog-save")).toBeDisabled();
    await userEvent.type(screen.getByTestId("comment-dialog-text"), "And a second.");
    await userEvent.click(screen.getByTestId("comment-dialog-save"));
    expect(screen.getByTestId("repertoire-board-annotations-after-1")).toHaveTextContent("And a second.");

    await userEvent.click(screen.getByTestId("repertoire-board-annotations-after-0-delete"));
    expect(screen.getByTestId("repertoire-board-annotations-after-0")).toHaveTextContent("And a second.");
    expect(screen.queryByTestId("repertoire-board-annotations-after-1")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it("adds one to an uncommented move from its right-click menu, and Discard takes it back", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}?at=d4`);
    await ready();
    expect(block()).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId("move-ply-1"), { clientX: 40, clientY: 60 });
    await userEvent.click(within(screen.getByRole("menu")).getByTestId("move-menu-comment"));
    await userEvent.type(screen.getByTestId("comment-dialog-text"), "The Queen's Gambit.");
    await userEvent.click(screen.getByTestId("comment-dialog-save"));

    expect(block()).toHaveTextContent("The Queen's Gambit.");
    expect(screen.getByTestId("move-comment-icon-1")).toBeInTheDocument();

    await userEvent.click(save());
    await userEvent.click(screen.getByTestId("repertoire-board-changes-discard"));
    await waitFor(() => expect(screen.queryByTestId("move-comment-icon-1")).not.toBeInTheDocument());
  });

  it("offers no editing in a game", async () => {
    await renderSection(`/repertoires/${await storeRepertoire("r", ANNOTATED)}/games/end`);
    await ready("repertoire-game");
    // A game opens on its Score tab; the move list is behind Moves.
    await userEvent.click(screen.getByTestId("repertoire-game-panel-tab-moves"));
    // No menu is bound: the right-click is the browser's (not prevented).
    expect(fireEvent.contextMenu(await screen.findByTestId("move-ply-1"))).toBe(true);
    expect(screen.queryByTestId("move-menu-comment")).not.toBeInTheDocument();
  });
});
