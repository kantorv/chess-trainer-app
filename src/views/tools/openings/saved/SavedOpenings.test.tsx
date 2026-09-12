import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Chess } from "chess.js";

import i18n from "../../../../i18n";
import AppThemeWithLang from "../../../../theme/AppThemeWithLang";
import { addMove, emptyTree, fenAtNode, nodeAtSanPath, type GameTree } from "../../../../lib/gameTree";
import { savedOpeningOf, type SavedOpening } from "../../../../lib/savedOpenings";
import { saveOpening, savedOpeningsSnapshot } from "../../../../lib/savedOpeningStore";
import {
  createOpeningFolder,
  findOpeningFolder,
  openingFoldersSnapshot,
} from "../../../../lib/savedOpeningFolderStore";
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

/*
  The export is mocked at the module boundary rather than through the blob URL:
  what is under test is *what* the screen hands `downloadPgn` — the stems and
  the records — not the browser's save itself, which is the DOM half of
  `lib/pgnExport.ts` and cannot run in jsdom meaningfully anyway.
*/
const { downloadCalls } = vi.hoisted(() => ({
  downloadCalls: [] as { stem: string; pgns: string[] }[],
}));

vi.mock("../../../../lib/pgnExport", () => ({
  downloadPgn: (stem: string, pgns: readonly string[]) => {
    downloadCalls.push({ stem, pgns: [...pgns] });
    return true;
  },
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
  folderId: string | null = null,
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedOpening =>
  savedOpeningOf(id, grow(lines), orientation, note, folderId, now);

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

/*
  A checkbox's `data-testid` sits on the Checkbox's root, and in jsdom a click
  there never reaches the input — so a row's checkbox is queried by role inside
  its row, and the header's inside its own box. The input is what carries the
  state (and MUI's `data-indeterminate`), and the click is what toggles it.
*/
const rowCheckbox = (id: string) =>
  within(screen.getByTestId(`saved-openings-item-${id}`)).getByRole("checkbox");

const selectAllInput = () =>
  within(screen.getByTestId("saved-openings-select-all")).getByRole("checkbox");

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

  it("offers a New button to the plain board view, with no query params", () => {
    renderScreen();

    // The board left the sidebar (CTA-42) — this button is how it is reached.
    expect(screen.getByTestId("saved-openings-new")).toHaveAttribute(
      "href",
      "/openings",
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

describe("Saved openings — the folder browser", () => {
  /** Two roots, a sub-folder, and openings filed at each level. */
  const seedTree = () => {
    const open = createOpeningFolder("Openings", null);
    const e4 = createOpeningFolder("e4 lines", open?.id ?? null);
    const games = createOpeningFolder("Games", null);

    saveOpening(save("direct", [[[], ["e4"]]], "In Openings", "white", open?.id ?? null));
    saveOpening(save("nested", [[[], ["d4"]]], "In e4 lines", "white", e4?.id ?? null));
    saveOpening(save("loose", [[[], ["c4"]]], "Unfiled"));

    return { open: open?.id, e4: e4?.id, games: games?.id };
  };

  it("shows root folders at the top level, each counting everything under it", () => {
    const ids = seedTree();

    renderScreen();

    // Openings' caption counts its whole subtree: the opening in it and the
    // one in e4 lines — a folder card stands for what is behind the click.
    // e4 lines itself is one level down; only the roots are listed here.
    expect(screen.getByTestId(`saved-openings-folder-${ids.open}`)).toHaveTextContent(
      "2 openings",
    );
    // Games has nothing under it: the Unfiled opening is an item at the top
    // level, not filed in a folder.
    expect(screen.getByTestId(`saved-openings-folder-${ids.games}`)).toHaveTextContent(
      "0 openings",
    );
    // The Unfiled opening is an item at the top level, not hidden away.
    expect(screen.getByTestId("saved-openings-item-loose")).toBeInTheDocument();
    // No breadcrumb at the top — there is no chain to show.
    expect(
      screen.queryByTestId("saved-openings-breadcrumb"),
    ).not.toBeInTheDocument();
  });

  it("drills in and shows that folder's sub-folders and its openings", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-open-${ids.open}`),
    );

    // The sub-folder is listed; the Unfiled opening is not.
    expect(
      screen.queryByTestId(`saved-openings-folder-${ids.e4}`),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("saved-openings-item-loose")).not.toBeInTheDocument();
    // The opening filed directly here shows; the nested one stays a level down.
    expect(screen.getByTestId("saved-openings-item-direct")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-openings-item-nested")).not.toBeInTheDocument();
  });

  it("navigates back up by the breadcrumb chain", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-open-${ids.open}`),
    );
    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-open-${ids.e4}`),
    );

    // Two levels down: the breadcrumb names the whole chain.
    expect(screen.getByTestId("saved-openings-breadcrumb-root")).toBeInTheDocument();
    expect(screen.getByTestId(`saved-openings-breadcrumb-${ids.open}`)).toBeInTheDocument();
    expect(screen.getByTestId(`saved-openings-breadcrumb-${ids.e4}`)).toHaveTextContent(
      "e4 lines",
    );

    await userEvent.click(
      screen.getByTestId(`saved-openings-breadcrumb-${ids.open}`),
    );

    // Back at Openings, not at the top.
    expect(screen.getByTestId("saved-openings-item-direct")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("saved-openings-breadcrumb-root"));

    // And the top level again: root folders and the Unfiled opening.
    expect(screen.getByTestId(`saved-openings-folder-${ids.open}`)).toBeInTheDocument();
    expect(screen.getByTestId("saved-openings-item-loose")).toBeInTheDocument();
  });

  it("creates a folder under the folder the reader is standing in", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-openings-new-folder"));
    await userEvent.type(screen.getByTestId("opening-folder-name-input"), "New root");
    await userEvent.click(screen.getByTestId("opening-folder-name-save"));

    const created = openingFoldersSnapshot().find((f) => f.name === "New root");
    expect(created?.parentId).toBeNull();

    // Inside Openings, the same button nests one level down.
    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-open-${ids.open}`),
    );
    await userEvent.click(screen.getByTestId("saved-openings-new-folder"));
    await userEvent.type(screen.getByTestId("opening-folder-name-input"), "New sub");
    await userEvent.click(screen.getByTestId("opening-folder-name-save"));

    const sub = openingFoldersSnapshot().find((f) => f.name === "New sub");
    expect(sub?.parentId).toBe(ids.open);
  });

  it("renames a folder in place", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-rename-${ids.open}`),
    );
    const input = screen.getByTestId("opening-folder-name-input");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.click(screen.getByTestId("opening-folder-name-save"));

    expect(screen.getByTestId(`saved-openings-folder-${ids.open}`)).toHaveTextContent(
      "Renamed",
    );
  });

  it("moves a folder via the dialog, never into its own subtree", async () => {
    const ids = seedTree();
    renderScreen();

    // Move "Openings" from the top: Games is offered, but e4 lines — inside
    // Openings' own subtree — is never offered.
    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-move-${ids.open}`),
    );
    expect(
      screen.getByTestId(`opening-folder-picker-${ids.games}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`opening-folder-picker-${ids.e4}`),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("opening-folder-move-cancel"));
    expect(findOpeningFolder(ids.open)?.parentId).toBeNull();

    // Move "e4 lines" (inside Openings): Games is offered; e4 itself is not.
    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-open-${ids.open}`),
    );
    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-move-${ids.e4}`),
    );
    expect(
      screen.getByTestId(`opening-folder-picker-${ids.games}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`opening-folder-picker-${ids.e4}`),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByTestId(`opening-folder-picker-${ids.games}`),
    );

    expect(findOpeningFolder(ids.e4)?.parentId).toBe(ids.games);
  });

  it("deletes an empty folder outright, without asking", async () => {
    const empty = createOpeningFolder("Empty", null);
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-delete-${empty?.id}`),
    );

    expect(openingFoldersSnapshot()).toEqual([]);
    expect(
      screen.queryByTestId("opening-folder-delete-confirm"),
    ).not.toBeInTheDocument();
  });

  it("asks before deleting a folder with contents, and keeps them", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-delete-${ids.open}`),
    );

    // The dialog states the rule and what is behind the click — everything
    // under Openings, directly and not: two openings (one in e4 lines), one
    // sub-folder.
    expect(screen.getByTestId("opening-folder-delete-counts")).toHaveTextContent(
      "2 openings",
    );
    expect(screen.getByTestId("opening-folder-delete-counts")).toHaveTextContent(
      "1 sub-folders",
    );

    await userEvent.click(screen.getByTestId("opening-folder-delete-cancel"));
    expect(findOpeningFolder(ids.open)).toBeDefined();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-delete-${ids.open}`),
    );
    await userEvent.click(screen.getByTestId("opening-folder-delete-confirm"));

    // The folder is gone; the tree closed up — e4 lines re-parented to the
    // top, its opening still filed in it.
    expect(findOpeningFolder(ids.open)).toBeUndefined();
    expect(findOpeningFolder(ids.e4)?.parentId).toBeNull();
    expect(
      savedOpeningsSnapshot().find((row) => row.id === "nested")?.folderId,
    ).toBe(ids.e4);
  });

  it("files openings filed directly in a deleted folder back to Unfiled", async () => {
    const only = createOpeningFolder("Only", null);
    saveOpening(save("direct", [[[], ["e4"]]], "In Only", "white", only?.id ?? null));
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-delete-${only?.id}`),
    );
    await userEvent.click(screen.getByTestId("opening-folder-delete-confirm"));

    // The opening survives, unfiled — it shows at the top level again.
    expect(savedOpeningsSnapshot().find((row) => row.id === "direct")?.folderId).toBeNull();
    expect(screen.getByTestId("saved-openings-item-direct")).toBeInTheDocument();
  });
});

describe("Saved openings — export", () => {
  beforeEach(() => {
    downloadCalls.length = 0;
  });

  /** Two root folders, one opening in each. */
  const seedTwoFolders = () => {
    const open = createOpeningFolder("Openings", null);
    const games = createOpeningFolder("Games", null);
    saveOpening(save("inOpen", [[[], ["e4"]]], "In Openings", "white", open?.id ?? null));
    saveOpening(save("inGames", [[[], ["d4"]]], "In Games", "white", games?.id ?? null));
    return { open: open?.id, games: games?.id };
  };

  it("keeps the picks across folder navigation, and select-all in a folder adds to them", async () => {
    const ids = seedTwoFolders();
    renderScreen();

    // Drill into Openings and pick its one opening.
    await userEvent.click(screen.getByTestId(`saved-openings-folder-open-${ids.open}`));
    await userEvent.click(rowCheckbox("inOpen"));
    expect(screen.getByTestId("saved-openings-selected-count")).toHaveTextContent(
      "1 selected",
    );

    // Back out and into Games: the pick persists, the chip stays visible.
    await userEvent.click(screen.getByTestId("saved-openings-breadcrumb-root"));
    await userEvent.click(screen.getByTestId(`saved-openings-folder-open-${ids.games}`));
    expect(screen.getByTestId("saved-openings-selected-count")).toHaveTextContent(
      "1 selected",
    );

    // Select-all here adds Games' opening to the picks, not replaces them.
    await userEvent.click(selectAllInput());
    expect(screen.getByTestId("saved-openings-selected-count")).toHaveTextContent(
      "2 selected",
    );

    // And the first pick is still ticked back in Openings.
    await userEvent.click(screen.getByTestId("saved-openings-breadcrumb-root"));
    await userEvent.click(screen.getByTestId(`saved-openings-folder-open-${ids.open}`));
    expect(rowCheckbox("inOpen")).toBeChecked();
    expect(screen.getByTestId("saved-openings-selected-count")).toHaveTextContent(
      "2 selected",
    );
  });

  it("marks select-all indeterminate while only part of the folder is picked", async () => {
    const open = createOpeningFolder("Openings", null);
    saveOpening(save("a1", [[[], ["e4"]]], "First", "white", open?.id ?? null));
    saveOpening(save("a2", [[[], ["d4"]]], "Second", "white", open?.id ?? null));

    renderScreen();

    await userEvent.click(screen.getByTestId(`saved-openings-folder-open-${open?.id}`));
    await userEvent.click(rowCheckbox("a1"));

    // One of this folder's two openings is picked — the header box says so,
    // without claiming that all of them are (MUI surfaces the tri-state as an
    // attribute on the input rather than the `.indeterminate` property).
    const selectAll = selectAllInput();
    expect(selectAll).toHaveAttribute("data-indeterminate", "true");
    expect(selectAll).not.toBeChecked();
  });

  it("exports one .pgn of everything under the folder, sub-folders included", async () => {
    const open = createOpeningFolder("Openings", null);
    const e4 = createOpeningFolder("e4 lines", open?.id ?? null);
    const direct = save("direct", [[[], ["e4"]]], "Direct", "white", open?.id ?? null);
    const nested = save("nested", [[[], ["d4"]]], "Nested", "white", e4?.id ?? null);
    saveOpening(direct);
    saveOpening(nested);
    saveOpening(save("loose", [[[], ["c4"]]], "Unfiled"));

    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-download-${open?.id}`),
    );

    // One file, named from the folder, holding the subtree's openings — the
    // same set the folder's count stands for — and not the Unfiled one. The
    // store is newest first, so the nested opening (saved later) leads.
    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0].stem).toBe("openings");
    expect(downloadCalls[0].pgns).toEqual([nested.pgn, direct.pgn]);
  });

  it("falls back to a fixed stem for a folder whose name slugs to nothing", async () => {
    // A folder named in Hebrew slugs to empty — `slugify` keeps [a-z0-9] only.
    const hebrew = createOpeningFolder("פתיחות", null);
    saveOpening(save("a1", [[[], ["e4"]]], "Here", "white", hebrew?.id ?? null));

    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-openings-folder-download-${hebrew?.id}`),
    );

    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0].stem).toBe("saved-openings");
  });

  it("exports the raw stored PGN for a record that will not parse", async () => {
    saveOpening({ ...save("broken", [[[], ["e4"]]]), pgn: "1. Zz9" });

    renderScreen();

    // Selectable, despite not parsing — the export copies the stored PGN.
    await userEvent.click(rowCheckbox("broken"));
    expect(screen.getByTestId("saved-openings-download")).toBeEnabled();

    await userEvent.click(screen.getByTestId("saved-openings-download"));

    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0].stem).toBe("chess-trainer-openings");
    expect(downloadCalls[0].pgns).toEqual(["1. Zz9"]);
  });

  it("disables the download while nothing is picked", () => {
    saveOpening(save("a1", [[[], ["e4"]]]));

    renderScreen();

    expect(screen.getByTestId("saved-openings-download")).toBeDisabled();
    expect(
      screen.queryByTestId("saved-openings-selected-count"),
    ).not.toBeInTheDocument();
  });

  it("disables a folder's download when it is empty, and enables one with contents", () => {
    const empty = createOpeningFolder("Empty", null);
    const full = createOpeningFolder("Full", null);
    saveOpening(save("a1", [[[], ["d4"]]], "In Full", "white", full?.id ?? null));

    renderScreen();

    expect(
      screen.getByTestId(`saved-openings-folder-download-${empty?.id}`),
    ).toBeDisabled();
    expect(
      screen.getByTestId(`saved-openings-folder-download-${full?.id}`),
    ).toBeEnabled();
  });

  it("drops the selection when the view switches to boards", async () => {
    saveOpening(save("a1", [[[], ["e4"]]]));

    renderScreen();

    await userEvent.click(rowCheckbox("a1"));
    expect(screen.getByTestId("saved-openings-selected-count")).toBeInTheDocument();

    // The checkboxes only exist in the list view, and the selection drops with
    // them.
    await userEvent.click(screen.getByTestId("saved-openings-view-compact"));
    expect(screen.queryByTestId("saved-openings-export")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("saved-openings-view-list"));
    expect(screen.getByTestId("saved-openings-download")).toBeDisabled();
    expect(rowCheckbox("a1")).not.toBeChecked();
  });
});