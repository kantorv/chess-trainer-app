import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Chess } from "chess.js";

import i18n from "../../../../i18n";
import AppThemeWithLang from "../../../../theme/AppThemeWithLang";
import { addMove, emptyTree, fenAtNode, nodeAtSanPath, type GameTree } from "../../../../lib/gameTree";
import { savedOpeningOf, type SavedOpening } from "../../../../lib/savedOpenings";
import { saveOpening } from "../../../../lib/savedOpeningStore";
import { cardSizeTrack } from "../../../library/cardSize";
import { RightPanelOutlet, RightPanelProvider } from "../../../main/rightPanel";
import SavedOpenings from "./SavedOpenings";

/*
  The same two stand-ins the Saved analyses suite needs, and for the same reasons.
  `<Chessboard>` measures its own square on mount and throws where there is no
  layout engine (`.claude/rules/chessboard.md` §8), so it is stubbed and the stub
  keeps the position and the id it was handed. The opening book is stubbed
  because the real one is ~3MB of JSON and what is under test is that the card
  prints what the book says, not the book.

  The store is *not* stubbed: it writes to the `localStorage` jsdom provides and
  `src/test/setup.ts` clears between tests, which is the behaviour under test.
*/
const OPENING = { eco: "C20", name: "King's Pawn Game", moves: "1. e4" };

vi.mock("../../../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/openings")>();
  return {
    ...actual,
    // Keyed on the position after 1. e4 — so an opening that played it is named
    // and one that opened 1. d4 is not.
    loadOpeningBook: () =>
      Promise.resolve({
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1": OPENING,
      }),
  };
});

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { id?: string; position?: string; boardOrientation?: string };
  }) => (
    <div
      data-testid={`board-${options.id}`}
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

/**
 * A tree grown by playing SAN: each entry is `[parent path, moves]`, so a second
 * entry branching off an earlier point is how a side line is made.
 */
const grow = (
  lines: readonly (readonly [readonly string[], readonly string[]])[],
): GameTree => {
  let tree = emptyTree();

  for (const [from, moves] of lines) {
    let nodeId = nodeAtSanPath(tree, from);
    for (const san of moves) {
      const move = new Chess(fenAtNode(tree, nodeId)).move(san);
      const added = addMove(tree, nodeId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
      });
      tree = added.tree;
      nodeId = added.nodeId;
    }
  }

  return tree;
};

const save = (
  id: string,
  lines: readonly (readonly [readonly string[], readonly string[]])[],
  note = "",
  orientation: "white" | "black" = "white",
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedOpening => savedOpeningOf(id, grow(lines), orientation, note, now);

const renderScreen = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/openings/saved"]}>
        <RightPanelProvider>
          <SavedOpenings />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** Let the opening book's promise settle, as it does a tick after mount. */
const settleBook = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Saved openings — the list", () => {
  it("says there is nothing yet on a browser that has saved nothing", () => {
    renderScreen();

    expect(screen.getByTestId("saved-openings-empty")).toBeInTheDocument();
    expect(screen.getByTestId("saved-openings-count")).toHaveTextContent(
      "Openings: 0",
    );
  });

  it("lists what has been saved, newest first", () => {
    saveOpening(save("a1", [[[], ["e4"]]], "First"));
    saveOpening(save("a2", [[[], ["d4"]]], "Second"));

    renderScreen();

    expect(
      screen.getAllByTestId(/^saved-openings-item-/).map((row) => row.dataset.testid),
    ).toEqual(["saved-openings-item-a2", "saved-openings-item-a1"]);
    expect(screen.getByTestId("saved-openings-count")).toHaveTextContent(
      "Openings: 2",
    );
  });

  it("names a row by its note, and a nameless one by the generic fallback", () => {
    saveOpening(save("a1", [[[], ["e4"]]], "My Italian"));
    saveOpening(save("a2", [[[], ["d4"]]]));

    renderScreen();

    expect(screen.getByTestId("saved-openings-item-a1")).toHaveTextContent(
      "My Italian",
    );
    expect(screen.getByTestId("saved-openings-item-a2")).toHaveTextContent(
      "Saved opening",
    );
  });

  it("says how long the mainline is and how many side lines it holds", () => {
    saveOpening(
      save(
        "a1",
        [
          [[], ["e4", "e5", "Nf3"]],
          [["e4"], ["c5", "Nf3"]],
        ],
        "Sicilian",
      ),
    );

    renderScreen();

    const row = screen.getByTestId("saved-openings-item-a1");
    expect(row).toHaveTextContent("3 moves");
    expect(row).toHaveTextContent("2 variations");
  });

  it("says nothing about variations for an opening with only one line", () => {
    saveOpening(save("a1", [[[], ["e4", "e5"]]]));

    renderScreen();

    const row = screen.getByTestId("saved-openings-item-a1");
    expect(row).toHaveTextContent("2 moves");
    expect(row).not.toHaveTextContent("variation");
  });

  it("falls back to the generic in Hebrew too, without a key falling through", async () => {
    saveOpening(save("a1", [[[], ["e4"]]]));
    await i18n.changeLanguage("he");

    renderScreen();

    expect(screen.getByTestId("saved-openings-item-a1")).toHaveTextContent(
      "פתיחה שמורה",
    );
  });
});

describe("Saved openings — where a row goes", () => {
  beforeEach(() => {
    saveOpening(save("a1", [[[], ["e4", "e5", "Nf3"]]], "My line"));
  });

  it("offers to go on exploring it, by its id", () => {
    renderScreen();

    expect(screen.getByTestId("saved-openings-continue-a1")).toHaveAttribute(
      "href",
      "/openings?openings=a1",
    );
  });

  it("hands Play with Engine the position at the end of the mainline", () => {
    renderScreen();

    const tree = grow([[[], ["e4", "e5", "Nf3"]]]);
    const end = fenAtNode(tree, nodeAtSanPath(tree, ["e4", "e5", "Nf3"]));

    expect(screen.getByTestId("saved-openings-play-a1")).toHaveAttribute(
      "href",
      `/engine/play?fen=${encodeURIComponent(end)}`,
    );
  });

  it("deletes one, and the list follows without a reload", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-openings-remove-a1"));

    expect(screen.queryByTestId("saved-openings-item-a1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-openings-empty")).toBeInTheDocument();
  });
});

describe("Saved openings — editing a note", () => {
  it("opens the dialog with the existing note, and keeps the edit in place", async () => {
    saveOpening(save("a1", [[[], ["e4"]]], "Before"));
    saveOpening(save("a2", [[[], ["d4"]]], "Second"));

    renderScreen();

    await userEvent.click(screen.getByTestId("saved-openings-edit-a1"));
    const input = screen.getByTestId("opening-note-input");
    expect(input).toHaveValue("Before");

    await userEvent.clear(input);
    await userEvent.type(input, "After");
    await userEvent.click(screen.getByTestId("opening-note-save"));

    // The name changed, and the record kept its place rather than jumping up.
    expect(screen.getByTestId("saved-openings-item-a1")).toHaveTextContent("After");
    expect(
      screen.getAllByTestId(/^saved-openings-item-/).map((row) => row.dataset.testid),
    ).toEqual(["saved-openings-item-a2", "saved-openings-item-a1"]);
  });

  it("does nothing when the note is left as it was", async () => {
    saveOpening(save("a1", [[[], ["e4"]]], "Same"));

    renderScreen();

    await userEvent.click(screen.getByTestId("saved-openings-edit-a1"));
    await userEvent.click(screen.getByTestId("opening-note-save"));

    expect(screen.getByTestId("saved-openings-item-a1")).toHaveTextContent("Same");
  });
});

describe("Saved openings — a record that will not read", () => {
  it("still lists it, and offers the one action that means anything", () => {
    saveOpening({ ...save("a1", [[[], ["e4"]]]), pgn: "1. Zz9" });

    renderScreen();

    const row = screen.getByTestId("saved-openings-item-a1");
    expect(row).toHaveTextContent("This opening could not be read.");
    expect(
      screen.queryByTestId("saved-openings-continue-a1"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-openings-remove-a1")).toBeInTheDocument();
  });
});

describe("Saved openings — the board view", () => {
  const showBoards = async (size: "compact" | "comfortable" = "compact") =>
    userEvent.click(screen.getByTestId(`saved-openings-view-${size}`));

  it("opens on the list, and switches to boards when asked", async () => {
    saveOpening(save("a1", [[[], ["e4"]]]));

    renderScreen();
    expect(screen.getByTestId("saved-openings-body")).toBeInTheDocument();

    await showBoards();

    expect(screen.getByTestId("saved-openings-grid")).toHaveStyle({
      gridTemplateColumns: cardSizeTrack("compact"),
    });
    expect(screen.getByTestId("board-saved-openings-preview-a1")).toBeInTheDocument();
  });

  it("previews the position at the end of the mainline", async () => {
    saveOpening(save("a1", [[[], ["e4", "e5", "Nf3"]]]));

    renderScreen();
    await showBoards();

    const tree = grow([[[], ["e4", "e5", "Nf3"]]]);
    expect(
      screen.getByTestId("board-saved-openings-preview-a1"),
    ).toHaveAttribute(
      "data-position",
      fenAtNode(tree, nodeAtSanPath(tree, ["e4", "e5", "Nf3"])),
    );
  });

  it("faces the way the board was saved", async () => {
    saveOpening(save("a1", [[[], ["e4"]]], "", "black"));

    renderScreen();
    await showBoards();

    expect(screen.getByTestId("board-saved-openings-preview-a1")).toHaveAttribute(
      "data-orientation",
      "black",
    );
  });

  it("names the opening the mainline reached, and only when the book knows it", async () => {
    saveOpening(save("a1", [[[], ["e4", "e5"]]]));
    saveOpening(save("a2", [[[], ["d4", "d5"]]]));

    renderScreen();
    await showBoards();
    await settleBook();

    expect(screen.getByTestId("saved-openings-opening-a1")).toHaveTextContent(
      "King's Pawn Game · C20",
    );
    expect(
      screen.queryByTestId("saved-openings-opening-a2"),
    ).not.toBeInTheDocument();
  });

  it("shows the message in the square for a record with no position to draw", async () => {
    saveOpening({ ...save("a1", [[[], ["e4"]]]), pgn: "1. Zz9" });

    renderScreen();
    await showBoards();

    expect(
      screen.queryByTestId("board-saved-openings-preview-a1"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-openings-item-a1")).toHaveTextContent(
      "This opening could not be read.",
    );
  });
});

describe("Saved openings — the panel", () => {
  it("says where the openings are kept", () => {
    renderScreen();

    expect(screen.getByTestId("saved-openings-storage-note")).toHaveTextContent(
      "this browser only",
    );
  });
});