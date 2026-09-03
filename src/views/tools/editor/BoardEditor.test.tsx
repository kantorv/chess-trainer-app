import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useSearchParams,
} from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import BoardEditor from "./BoardEditor";

/*
  `<Chessboard>` measures its own square on mount and throws "Square width not
  found" where there is no layout engine (`.claude/rules/chessboard.md` §8), so
  it is stubbed — and on this screen the stub has to cover the whole spare-piece
  trio, not just the board: the options go to `ChessboardProvider` and the
  palettes are `SparePiece`s. The provider keeps hold of the options it was
  handed, which is how a test drags a piece.

  No `Engine` stand-in here, and that is the point: an editor never analyses, so
  a worker jsdom cannot build is never asked for.
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
      position?: string;
      boardOrientation?: string;
    } | null;
    return (
      <div
        data-testid="board"
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

/** Where the Analysis Board would be opened, once the hand-off is used. */
const AnalysisArrival = () => {
  const [params] = useSearchParams();
  return <div data-testid="analysis-arrival" data-fen={params.get("fen")} />;
};

const renderScreen = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/tools/editor"]}>
        <RightPanelProvider>
          <Routes>
            <Route
              path="/tools/editor"
              element={
                <>
                  <BoardEditor />
                  <RightPanelOutlet />
                </>
              }
            />
            <Route path="/tools/analysis" element={<AnalysisArrival />} />
          </Routes>
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const position = () => screen.getByTestId("board").getAttribute("data-position");
const placement = () => position()!.split(" ")[0];

const openTab = (tab: "position" | "fen" | "pgn") =>
  userEvent.click(screen.getByTestId(`editor-panel-tab-${tab}`));

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

describe("Board Editor — the palettes", () => {
  it("opens on the starting position with a palette on each side", () => {
    renderScreen();

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
    renderScreen();
    await setUpFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");

    expect(dropSpare("wQ", "d4")).toBe(true);
    expect(placement()).toBe("4k3/8/8/8/3Q4/8/8/4K3");
  });

  it("removes a piece dragged off the board", () => {
    renderScreen();

    expect(drag("wP", "e2", null)).toBe(true);
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR");
  });

  it("moves a piece between squares", () => {
    renderScreen();

    expect(drag("wP", "e2", "e4")).toBe(true);
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
  });

  it("leaves the board alone when a spare is dragged into space", () => {
    renderScreen();
    const before = position();

    expect(dropSpare("wQ", null)).toBe(false);
    expect(position()).toBe(before);
  });

  it("refuses a second king of one colour", async () => {
    renderScreen();
    await setUpFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");

    // `chess.js` will not hold two white kings, and a refused drop must leave
    // the board exactly as it was.
    expect(dropSpare("wK", "d4")).toBe(false);
    expect(placement()).toBe("4k3/8/8/8/8/8/8/4K3");
  });

  it("replaces whatever was standing on the target square", () => {
    renderScreen();

    // The queen takes the pawn's square; nothing here is a capture, because
    // nothing here is a move.
    expect(drag("wQ", "d1", "d2")).toBe(true);
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPQPPPP/RNB1KBNR");
  });

  it("empties one colour off the board from that palette's trash", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("editor-trash-b"));

    expect(placement()).toBe("8/8/8/8/8/8/PPPPPPPP/RNBQKBNR");
    expect(screen.getByTestId("editor-problem-noBlackKing")).toBeInTheDocument();
  });

  it("keeps the board square, with the palettes taking the difference", () => {
    renderScreen();

    /*
      2 × (44 palette + 8 gap) comes out of the board's side, exactly. Only the
      width is asserted: jsdom has no layout engine, and its CSS parser drops
      `aspect-ratio` outright — what the square *becomes* from that width is a
      browser check, not a jsdom one.
    */
    expect(screen.getByTestId("editor-board-square")).toHaveStyle({
      width: "calc(100% - 104px)",
    });
  });
});

describe("Board Editor — the position fields", () => {
  it("writes the side to move into the FEN", async () => {
    renderScreen();
    expect(position()).toContain(" w ");

    await userEvent.click(screen.getByTestId("editor-turn-b"));

    expect(position()).toContain(" b ");
  });

  it("writes the castling rights into the FEN", async () => {
    renderScreen();
    expect(position()).toContain(" KQkq ");

    await userEvent.click(checkbox("K"));
    expect(position()).toContain(" Qkq ");

    for (const flag of ["Q", "k", "q"]) await userEvent.click(checkbox(flag));
    // No flags left is a dash, not an empty field.
    expect(position()).toContain(" - - ");
  });

  it("writes an en passant target, on the rank the side to move allows", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("editor-en-passant"));
    // White to move, so a target can only be on the sixth rank.
    expect(screen.queryByRole("option", { name: "e3" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "e6" }));

    expect(position()).toContain(" KQkq e6 ");
  });

  it("drops the en passant target when the side to move changes", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("editor-en-passant"));
    await userEvent.click(screen.getByRole("option", { name: "e6" }));
    await userEvent.click(screen.getByTestId("editor-turn-b"));

    // The old target names a square no pawn could have been pushed over.
    expect(position()).toContain(" - 0 1");
  });

  it("reads the fields back out of a pasted FEN", async () => {
    renderScreen();
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

describe("Board Editor — resets", () => {
  it("goes back to the starting position", async () => {
    renderScreen();
    drag("wP", "e2", "e4");

    await userEvent.click(screen.getByTestId("editor-reset-start"));

    expect(position()).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("clears the board", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("editor-reset-clear"));

    expect(placement()).toBe("8/8/8/8/8/8/8/8");
  });

  it("flips the board without touching the position", async () => {
    renderScreen();
    const before = position();

    await userEvent.click(screen.getByTestId("editor-reset-flip"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-orientation",
      "black",
    );
    expect(position()).toBe(before);
  });
});

describe("Board Editor — FEN in and out", () => {
  it("sets a position up from a pasted FEN", async () => {
    const fen = "7k/8/8/8/8/8/8/K7 w - - 0 1";
    renderScreen();

    await setUpFen(fen);

    expect(position()).toBe(fen);
    expect(screen.queryByTestId("editor-fen-error")).not.toBeInTheDocument();
  });

  it("reports a FEN it cannot read, and leaves the board alone", async () => {
    renderScreen();
    const before = position();

    await setUpFen("not a fen");

    expect(screen.getByTestId("editor-fen-error")).toBeInTheDocument();
    expect(position()).toBe(before);
  });

  it("shows the position read-only and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderScreen();
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

describe("Board Editor — PGN in", () => {
  it("loads a game's final position, not its first", async () => {
    renderScreen();
    await openTab("pgn");

    await pasteInto("editor-pgn-input", "1. e4 e5 2. Nf3 Nc6");
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    expect(placement()).toBe(
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
    );
  });

  it("offers a picker for a multi-game file", async () => {
    renderScreen();
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
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    const picker = screen.getByTestId("editor-game-picker");
    expect(within(picker).getAllByRole("button")).toHaveLength(2);

    await userEvent.click(within(picker).getByText("Carol vs Dan"));
    expect(placement()).toBe(
      "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR",
    );
  });

  it("reports a PGN it cannot read", async () => {
    renderScreen();
    await openTab("pgn");

    await pasteInto("editor-pgn-input", "1. d4 Ke7");
    await userEvent.click(screen.getByRole("button", { name: "Load PGN" }));

    expect(screen.getByTestId("editor-pgn-error")).toBeInTheDocument();
  });
});

describe("Board Editor — illegal positions", () => {
  it("allows the edit, and says what is wrong", async () => {
    renderScreen();

    // Taking a king off is a step towards a different king, not a mistake.
    expect(drag("wK", "e1", null)).toBe(true);

    expect(screen.getByTestId("editor-problem-noWhiteKing")).toBeInTheDocument();
    expect(placement()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR");
  });

  it("reports a pawn on the last rank, and the waiting side in check", async () => {
    renderScreen();
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

  it("switches off the copy button and the hand-off while it is illegal", async () => {
    renderScreen();
    await userEvent.click(screen.getByTestId("editor-reset-clear"));

    expect(screen.getByTestId("editor-continue-analysis")).toBeDisabled();

    await openTab("fen");
    expect(screen.getByTestId("editor-current-fen-copy")).toBeDisabled();
    // The FEN itself is still shown — you have to see what you are fixing.
    expect(screen.getByTestId("editor-current-fen")).toHaveValue(position());
  });

  it("switches them back on once the position is playable", async () => {
    renderScreen();
    await userEvent.click(screen.getByTestId("editor-reset-clear"));

    dropSpare("wK", "e1");
    dropSpare("bK", "e8");

    expect(screen.getByTestId("editor-continue-analysis")).toBeEnabled();
    await openTab("fen");
    expect(screen.getByTestId("editor-current-fen-copy")).toBeEnabled();
  });
});

describe("Board Editor — the hand-off", () => {
  it("opens the Analysis Board on the edited position", async () => {
    renderScreen();
    drag("wP", "e2", "e4");
    const edited = position();

    await userEvent.click(screen.getByTestId("editor-continue-analysis"));

    // The FEN crosses the route boundary in the URL, so the link survives a
    // reload — and it arrives intact, spaces and slashes included.
    expect(screen.getByTestId("analysis-arrival")).toHaveAttribute(
      "data-fen",
      edited,
    );
  });
});
