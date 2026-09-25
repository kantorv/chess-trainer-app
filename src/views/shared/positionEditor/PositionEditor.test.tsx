import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import PositionEditor from "./PositionEditor";
import { usePositionEditor } from "./usePositionEditor";

/*
  The shared position editor (CTA-83), mounted in a bare host: no router, no
  right-hand panel, no screen — which is the contract under test. The host
  owns the state (`usePositionEditor`) and prints what it reads off it, the way
  the Lobby reads the FEN and the problems for its Start button.

  `<Chessboard>` measures its own square on mount and throws "Square width not
  found" where there is no layout engine (`.claude/rules/chessboard.md` §8), so
  it is stubbed — the whole spare-piece trio, not just the board: the options
  go to `ChessboardProvider` and the palettes are `SparePiece`s. The provider
  keeps hold of the options it was handed, which is how a test drags a piece.
*/

const harness = vi.hoisted(() => {
  const board: { options: Record<string, never> | null } = { options: null };
  return { board };
});

vi.mock("react-chessboard", () => ({
  ChessboardProvider: ({
    options,
    children,
  }: {
    options: Record<string, never>;
    children: React.ReactNode;
  }) => {
    harness.board.options = options;
    return <div data-testid="chessboard-provider">{children}</div>;
  },
  // Takes no props of its own in v5's spare-piece setup — everything the board
  // knows came in through the provider above.
  Chessboard: () => {
    const options = harness.board.options as {
      id?: string;
      position?: string;
      boardOrientation?: string;
    } | null;
    return (
      <div
        data-testid="board"
        data-board-id={options?.id}
        data-position={options?.position}
        data-orientation={options?.boardOrientation}
      />
    );
  },
  SparePiece: ({ pieceType }: { pieceType: string }) => (
    <div data-testid={`spare-piece-${pieceType}`} />
  ),
}));

const boardOptions = () => {
  const options = harness.board.options as {
    position?: string;
    onPieceDrop?: (args: {
      piece: { pieceType: string; isSparePiece: boolean; position: string };
      sourceSquare: string;
      targetSquare: string | null;
    }) => boolean;
  } | null;
  if (!options) throw new Error("the board has not rendered");
  return options;
};

/** Drag a piece already on the board, the way the board would report it. */
const drag = (pieceType: string, from: string, to: string | null) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({
      piece: { pieceType, isSparePiece: false, position: from },
      sourceSquare: from,
      targetSquare: to,
    });
  });
  return accepted;
};

/** Drag one of the palette's pieces onto a square. */
const dropSpare = (pieceType: string, to: string | null) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({
      piece: { pieceType, isSparePiece: true, position: pieceType },
      sourceSquare: pieceType,
      targetSquare: to,
    });
  });
  return accepted;
};

/** A host: owns the state, renders the editor, and prints what it reads. */
function Host({
  initialFen,
  forms,
}: {
  initialFen?: string;
  forms?: ComponentProps<typeof PositionEditor>["forms"];
}) {
  const editor = usePositionEditor(initialFen);
  return (
    <>
      <PositionEditor editor={editor} testId="editor" forms={forms} />
      <div
        data-testid="host"
        data-fen={editor.fen}
        data-valid={String(editor.isValid)}
        data-problems={editor.problems.join(",")}
      />
    </>
  );
}

const renderEditor = (
  initialFen?: string,
  forms?: ComponentProps<typeof PositionEditor>["forms"],
) =>
  render(
    <AppThemeWithLang>
      <Host initialFen={initialFen} forms={forms} />
    </AppThemeWithLang>,
  );

const position = () => screen.getByTestId("board").getAttribute("data-position");
const placement = () => position()!.split(" ")[0];
const orientation = () =>
  screen.getByTestId("board").getAttribute("data-orientation");

const openTab = (tab: "position" | "fen" | "pgn") =>
  userEvent.click(screen.getByTestId(`editor-tab-${tab}`));

/*
  Pasted rather than typed. `userEvent.type` reads `{` and `[` as key
  descriptors and a PGN is full of both — and pasting is what a reader does with
  a game anyway.
*/
const pasteInto = async (testId: string, text: string) => {
  await userEvent.click(screen.getByTestId(testId));
  await userEvent.paste(text);
};

const setUpFen = async (fen: string) => {
  await openTab("fen");
  // Cleared first: a second set-up in one test would otherwise paste onto the
  // end of the first FEN and parse as neither.
  await userEvent.clear(screen.getByTestId("editor-fen-input"));
  await pasteInto("editor-fen-input", fen);
  await userEvent.click(screen.getByRole("button", { name: "Set position" }));
};

const checkbox = (flag: string) =>
  screen.getByTestId(`editor-castling-${flag}`).querySelector("input")!;

beforeEach(async () => {
  harness.board.options = null;
  await i18n.changeLanguage("en");
});

describe("PositionEditor — the palettes", () => {
  it("opens on the starting position with a palette on each side", () => {
    renderEditor();

    expect(position()).toMatch(/^rnbqkbnr\/pppppppp/);

    // Six pieces a colour, black above and white below.
    for (const piece of ["K", "Q", "R", "B", "N", "P"]) {
      expect(screen.getByTestId(`spare-piece-b${piece}`)).toBeInTheDocument();
      expect(screen.getByTestId(`spare-piece-w${piece}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("editor-palette-b")).toBeInTheDocument();
    expect(screen.getByTestId("editor-palette-w")).toBeInTheDocument();
  });

  it("places a spare piece on a square", async () => {
    renderEditor();
    await setUpFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");

    expect(dropSpare("wQ", "d4")).toBe(true);
    expect(placement()).toBe("4k3/8/8/8/3Q4/8/8/4K3");
  });

  it("removes a piece dragged off the board", () => {
    renderEditor();

    expect(drag("wP", "e2", null)).toBe(true);
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR");
  });

  it("moves a piece between squares", () => {
    renderEditor();

    expect(drag("wP", "e2", "e4")).toBe(true);
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
  });

  it("leaves the board alone when a spare is dragged into space", () => {
    renderEditor();
    const before = position();

    expect(dropSpare("wQ", null)).toBe(false);
    expect(position()).toBe(before);
  });

  it("refuses a second king of one colour", async () => {
    renderEditor();
    await setUpFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");

    // `chess.js` will not hold two white kings, and a refused drop must leave
    // the board exactly as it was.
    expect(dropSpare("wK", "d4")).toBe(false);
    expect(placement()).toBe("4k3/8/8/8/8/8/8/4K3");
  });

  it("replaces whatever was standing on the target square", () => {
    renderEditor();

    // The queen takes the pawn's square; nothing here is a capture, because
    // nothing here is a move.
    expect(drag("wQ", "d1", "d2")).toBe(true);
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPQPPPP/RNB1KBNR");
  });

  it("empties one colour off the board from that palette's trash", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("editor-trash-b"));

    expect(placement()).toBe("8/8/8/8/8/8/PPPPPPPP/RNBQKBNR");
    expect(screen.getByTestId("editor-problem-noBlackKing")).toBeInTheDocument();
  });

  it("gives the board a unique id from its test id, pinned LTR", async () => {
    await i18n.changeLanguage("he");
    renderEditor();

    expect(screen.getByTestId("board")).toHaveAttribute("data-board-id", "editor-board");
    // The host's panel is not under the board area's ForceLTR: the editor
    // pins its own board and palettes, whatever the language.
    expect(screen.getByTestId("editor-board-square").closest('[dir="ltr"]')).not.toBeNull();
  });
});

describe("PositionEditor — the position fields", () => {
  it("writes the side to move into the FEN", async () => {
    renderEditor();
    expect(position()).toContain(" w ");

    await userEvent.click(screen.getByTestId("editor-turn-b"));

    expect(position()).toContain(" b ");
  });

  it("writes the castling rights into the FEN", async () => {
    renderEditor();
    expect(position()).toContain(" KQkq ");

    await userEvent.click(checkbox("K"));
    expect(position()).toContain(" Qkq ");

    for (const flag of ["Q", "k", "q"]) await userEvent.click(checkbox(flag));
    // No flags left is a dash, not an empty field.
    expect(position()).toContain(" - - ");
  });

  it("writes an en passant target, on the rank the side to move allows", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("editor-en-passant"));
    // White to move, so a target can only be on the sixth rank.
    expect(screen.queryByRole("option", { name: "e3" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "e6" }));

    expect(position()).toContain(" KQkq e6 ");
  });

  it("drops the en passant target when the side to move changes", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("editor-en-passant"));
    await userEvent.click(screen.getByRole("option", { name: "e6" }));
    await userEvent.click(screen.getByTestId("editor-turn-b"));

    // The old target names a square no pawn could have been pushed over.
    expect(position()).toContain(" - 0 1");
  });

  it("reads the fields back out of a pasted FEN", async () => {
    renderEditor();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b Kq - 0 3";

    await setUpFen(fen);
    await openTab("position");

    expect(screen.getByTestId("editor-turn-b")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(checkbox("K")).toBeChecked();
    expect(checkbox("Q")).not.toBeChecked();
    expect(checkbox("k")).not.toBeChecked();
    expect(checkbox("q")).toBeChecked();

    // And the whole FEN round-trips, move counters included.
    expect(position()).toBe(fen);
  });
});

describe("PositionEditor — which way the board faces", () => {
  // A real position, Black to move.
  const blackToMove = "2b2rk1/3n1ppp/3Rp3/6B1/1q2N3/1P4Q1/r1P2PPP/2KR4 b - - 0 1";

  it("turns to Black when a Black-to-move position is pasted", async () => {
    renderEditor();
    expect(orientation()).toBe("white");

    await setUpFen(blackToMove);

    // You are about to answer this position, so you look at it from the side
    // that has to move.
    expect(orientation()).toBe("black");
    expect(position()).toBe(blackToMove);
  });

  it("turns back to White when a White-to-move position is pasted", async () => {
    renderEditor();
    await setUpFen(blackToMove);

    await setUpFen("7k/8/8/8/8/8/8/K7 w - - 0 1");

    expect(orientation()).toBe("white");
  });

  it("faces the side to move in a loaded game's final position", async () => {
    renderEditor();
    await openTab("pgn");

    // 1. e4 leaves Black to move.
    await pasteInto("editor-pgn-input", "1. e4");
    await userEvent.click(screen.getByRole("button", { name: "Load game" }));

    expect(orientation()).toBe("black");
  });

  it("leaves the reader's own viewpoint alone when the board is reset", async () => {
    renderEditor();
    await userEvent.click(screen.getByTestId("editor-reset-flip"));
    expect(orientation()).toBe("black");

    // A reset is about the pieces; it has no business overruling a viewpoint
    // the reader chose for themselves.
    await userEvent.click(screen.getByTestId("editor-reset-clear"));
    expect(orientation()).toBe("black");

    await userEvent.click(screen.getByTestId("editor-reset-start"));
    expect(orientation()).toBe("black");
  });

  it("does not turn the board when the side-to-move field is edited", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("editor-turn-b"));

    // Arranging a position is not being handed one — the board staying put is
    // what lets you set Black's move up while still looking from White.
    expect(orientation()).toBe("white");
  });
});

describe("PositionEditor — resets", () => {
  it("goes back to the starting position", async () => {
    renderEditor();
    drag("wP", "e2", "e4");

    await userEvent.click(screen.getByTestId("editor-reset-start"));

    expect(position()).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("clears the board", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("editor-reset-clear"));

    expect(placement()).toBe("8/8/8/8/8/8/8/8");
  });

  it("flips the board without touching the position", async () => {
    renderEditor();
    const before = position();

    await userEvent.click(screen.getByTestId("editor-reset-flip"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(position()).toBe(before);
  });
});

describe("PositionEditor — an initial position", () => {
  /*
    A position with something in every field: Black to move, all four castling
    rights, an en passant target and move counters that are not the start's — so
    "the whole FEN arrived" is an assertion rather than a coincidence.
  */
  const initial = "r3k2r/ppppp1pp/8/8/4Pp2/8/PPPP1PPP/R3K2R b KQkq e3 0 5";
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("opens on it, all six fields", async () => {
    renderEditor(initial);

    expect(position()).toBe(initial);

    // Fields 2-4 are panel controls, so they have to read the same way the FEN
    // does — and fields 5-6 are carried, which is what makes it round-trip.
    await openTab("position");
    expect(screen.getByTestId("editor-turn-b")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const flag of ["K", "Q", "k", "q"]) {
      expect(checkbox(flag)).toBeChecked();
    }
    expect(screen.getByTestId("editor-en-passant")).toHaveTextContent("e3");
  });

  it("faces the side to move in it", () => {
    // A position is something you are about to answer.
    renderEditor(initial);

    expect(orientation()).toBe("black");
  });

  it("opens on the starting position without one, and offers no extra reset", () => {
    renderEditor();

    expect(position()).toBe(START);
    expect(orientation()).toBe("white");
    expect(screen.queryByTestId("editor-reset-initial")).toBeNull();
    screen.getByTestId("editor-reset-start"); // the other two are always there
    screen.getByTestId("editor-reset-clear");
  });

  it("restores it after arbitrary edits", async () => {
    renderEditor(initial);

    drag("wP", "e4", "e5");
    dropSpare("wQ", "d4");
    await userEvent.click(screen.getByTestId("editor-turn-w"));
    await userEvent.click(checkbox("K"));
    await userEvent.click(screen.getByTestId("editor-reset-flip"));
    expect(position()).not.toBe(initial);

    await userEvent.click(screen.getByTestId("editor-reset-initial"));

    // Placement and all six fields, and the board turned back to the side that
    // has to answer it — this control re-hands the reader the position rather
    // than rearranging the pieces.
    expect(position()).toBe(initial);
    expect(orientation()).toBe("black");
  });

  it("keeps 'New board' meaning the standard start", async () => {
    renderEditor(initial);

    await userEvent.click(screen.getByTestId("editor-reset-start"));

    expect(position()).toBe(START);
    // And a reset is still about the pieces: it leaves the viewpoint alone.
    expect(orientation()).toBe("black");
  });
});

describe("PositionEditor — FEN in and out", () => {
  it("sets a position up from a pasted FEN", async () => {
    const fen = "7k/8/8/8/8/8/8/K7 w - - 0 1";
    renderEditor();

    await setUpFen(fen);

    expect(position()).toBe(fen);
    expect(screen.queryByTestId("editor-fen-error")).not.toBeInTheDocument();
  });

  it("reports a FEN it cannot read, and leaves the board alone", async () => {
    renderEditor();
    const before = position();

    await setUpFen("not a fen");

    expect(screen.getByTestId("editor-fen-error")).toBeInTheDocument();
    expect(position()).toBe(before);
  });

  it("shows the position read-only and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderEditor();
    drag("wP", "e2", "e4");
    await openTab("fen");

    const field = screen.getByTestId("editor-current-fen");
    expect(field).toHaveValue(position());
    expect(field).toHaveAttribute("readonly");

    await userEvent.click(screen.getByTestId("editor-current-fen-copy"));
    expect(writeText).toHaveBeenCalledWith(position());

    vi.unstubAllGlobals();
  });
});

describe("PositionEditor — PGN in", () => {
  it("loads a game's final position, not its first", async () => {
    renderEditor();
    await openTab("pgn");

    await pasteInto("editor-pgn-input", "1. e4 e5 2. Nf3 Nc6");
    await userEvent.click(screen.getByRole("button", { name: "Load game" }));

    expect(placement()).toBe(
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    );
  });

  it("offers a picker for a multi-game file", async () => {
    renderEditor();
    await openTab("pgn");

    await pasteInto(
      "editor-pgn-input",
      [
        '[Event "One"]',
        '[White "Alice"]',
        '[Black "Bob"]',
        "",
        "1. e4 e5 1-0",
        "",
        '[Event "Two"]',
        '[White "Carol"]',
        '[Black "Dan"]',
        "",
        "1. d4 d5 0-1",
      ].join("\n"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Load game" }));

    const picker = screen.getByTestId("editor-game-picker");
    expect(within(picker).getAllByRole("button")).toHaveLength(2);

    await userEvent.click(within(picker).getByText("Carol vs Dan"));
    expect(placement()).toBe(
      "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR",
    );
  });

  it("reports a PGN it cannot read", async () => {
    renderEditor();
    await openTab("pgn");

    await pasteInto("editor-pgn-input", "1. d4 Ke7");
    await userEvent.click(screen.getByRole("button", { name: "Load game" }));

    expect(screen.getByTestId("editor-pgn-error")).toBeInTheDocument();
  });

  it("a host can leave the PGN form out, drop and all", async () => {
    renderEditor(undefined, ["position", "fen"]);

    expect(screen.getByTestId("editor-tab-position")).toBeInTheDocument();
    expect(screen.getByTestId("editor-tab-fen")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-tab-pgn")).toBeNull();

    // A `.pgn` dropped on the editor is the PGN form's shortcut: no form, no load.
    fireEvent.drop(screen.getByTestId("editor"), {
      dataTransfer: {
        files: [new File(["1. e4 e5"], "game.pgn", { type: "application/x-chess-pgn" })],
      },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
  });

  it("a forms list of one is not a choice: no strip, the form always shown (the analyses Lobby, CTA-96)", () => {
    renderEditor(undefined, ["position"]);

    expect(screen.queryByTestId("editor-tab-position")).toBeNull();
    expect(screen.queryByTestId("editor-tab-fen")).toBeNull();
    expect(screen.getByTestId("editor-position-fields")).toBeInTheDocument();
  });

  it("a single form can be any of them — the FEN form alone, the fields gone", () => {
    renderEditor(undefined, ["fen"]);

    expect(screen.queryByTestId("editor-tab-fen")).toBeNull();
    expect(screen.getByTestId("editor-fen-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-position-fields")).toBeNull();
  });
});

describe("PositionEditor — illegal positions", () => {
  it("allows the edit, and says what is wrong", async () => {
    renderEditor();

    // Taking a king off is a step towards a different king, not a mistake.
    expect(drag("wK", "e1", null)).toBe(true);

    expect(screen.getByTestId("editor-problem-noWhiteKing")).toBeInTheDocument();
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR");
  });

  it("reports a pawn on the last rank, and the waiting side in check", async () => {
    renderEditor();
    await setUpFen("7k/8/8/8/8/8/8/K7 w - - 0 1");

    dropSpare("wP", "a8");
    expect(
      screen.getByTestId("editor-problem-pawnOnBackRank"),
    ).toBeInTheDocument();

    await setUpFen("7k/8/8/8/8/8/8/K6R w - - 0 1");
    expect(
      screen.getByTestId("editor-problem-opponentInCheck"),
    ).toBeInTheDocument();
  });

  it("switches off the copy button while it is illegal", async () => {
    renderEditor();
    await userEvent.click(screen.getByTestId("editor-reset-clear"));

    await openTab("fen");
    expect(screen.getByTestId("editor-current-fen-copy")).toBeDisabled();
    // The FEN itself is still shown — you have to see what you are fixing.
    expect(screen.getByTestId("editor-current-fen")).toHaveValue(position());
  });

  it("switches it back on once the position is playable", async () => {
    renderEditor();
    await userEvent.click(screen.getByTestId("editor-reset-clear"));

    dropSpare("wK", "e1");
    dropSpare("bK", "e8");

    await openTab("fen");
    expect(screen.getByTestId("editor-current-fen-copy")).toBeEnabled();
  });
});

describe("PositionEditor — an orientation the host pins", () => {
  function Pinned({ side }: { side?: "white" | "black" }) {
    const editor = usePositionEditor(undefined, { orientation: side });
    return <PositionEditor editor={editor} testId="editor" />;
  }
  const mountPinned = (side?: "white" | "black") =>
    render(
      <AppThemeWithLang>
        <Pinned side={side} />
      </AppThemeWithLang>,
    );

  it("faces the pinned side, offers no Flip, and a load does not turn it", async () => {
    mountPinned("black");
    expect(orientation()).toBe("black");
    expect(screen.queryByTestId("editor-reset-flip")).toBeNull();

    await setUpFen("7k/8/8/8/8/8/8/K7 w - - 0 1");
    expect(orientation()).toBe("black");
  });

  it("follows the pin as it changes, and hands the board back when it goes", () => {
    const view = mountPinned("white");
    expect(orientation()).toBe("white");

    view.rerender(
      <AppThemeWithLang>
        <Pinned side="black" />
      </AppThemeWithLang>,
    );
    expect(orientation()).toBe("black");

    view.rerender(
      <AppThemeWithLang>
        <Pinned />
      </AppThemeWithLang>,
    );
    // The editor's own orientation, as it last stood — the standard start's White.
    expect(orientation()).toBe("white");
    expect(screen.getByTestId("editor-reset-flip")).toBeInTheDocument();
  });
});

describe("PositionEditor — what the host reads", () => {
  it("hands the host the position and its problems, and nothing else", () => {
    renderEditor();
    const host = () => screen.getByTestId("host");
    expect(host()).toHaveAttribute("data-valid", "true");

    drag("wP", "e2", "e4");
    expect(host()).toHaveAttribute("data-fen", position());

    drag("wK", "e1", null);
    // The host decides what an illegal position switches off (the Lobby's
    // Start); the editor only reports it.
    expect(host()).toHaveAttribute("data-valid", "false");
    expect(host()).toHaveAttribute("data-problems", "noWhiteKing");
  });

  it("keeps the position across an unmount — the state is the host's", () => {
    function Toggle() {
      const editor = usePositionEditor();
      return (
        <>
          <button data-testid="toggle" onClick={() => editor.flipBoard()} />
          <div data-testid="host" data-fen={editor.fen} />
          {editor.orientation === "white" && (
            <PositionEditor editor={editor} testId="editor" />
          )}
        </>
      );
    }
    render(
      <AppThemeWithLang>
        <Toggle />
      </AppThemeWithLang>,
    );
    drag("wP", "e2", "e4");
    const edited = position();

    act(() => screen.getByTestId("toggle").click());
    expect(screen.queryByTestId("editor")).toBeNull();
    act(() => screen.getByTestId("toggle").click());

    expect(position()).toBe(edited);
  });
});
