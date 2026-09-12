import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chess } from "chess.js";
import { MemoryRouter, useLocation } from "react-router";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { MOVE_ARROW_COLOR } from "../../../lib/gameNavigation";
import {
  HOVERED_MOVE_ARROW_COLOR,
  KNOWN_MOVE_ARROW_COLOR,
} from "../../../lib/openings";
import { savedOpeningsSnapshot } from "../../../lib/savedOpeningStore";
import {
  createOpeningFolder,
  openingFoldersSnapshot,
} from "../../../lib/savedOpeningFolderStore";
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

/** After 1. e4 e5 2. f4 Nf6 — the book names it "King's Gambit Declined: Petrov's Defense". */
const deepFen = () => {
  const chess = new Chess();
  for (const san of ["e4", "e5", "f4", "Nf6"]) chess.move(san);
  return chess.fen();
};

const boardArrows = (): BoardArrow[] =>
  JSON.parse(screen.getByTestId("board").getAttribute("data-arrows") ?? "[]");

/*
  Where "Play from here" lands. The screen navigates to `/engine/play?fen=…`;
  the whole of that interface is the FEN in the URL, so this records it without
  mounting the engine board.
*/
const LocationProbe = () => {
  const location = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={location.pathname}
      data-search={location.search}
    />
  );
};

const handOffFen = () =>
  new URLSearchParams(
    screen.getByTestId("location").getAttribute("data-search") ?? "",
  ).get("fen");

const renderScreen = (entry = "/openings") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppThemeWithLang>
        <RightPanelProvider>
          <OpeningsBoard />
          <RightPanelOutlet />
          <LocationProbe />
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

describe("the Openings screen — hovering a next move", () => {
  it("recolors exactly the hovered move's arrow, leaving the rest green", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.hover(screen.getByTestId("openings-next-move-e4"));

    const arrows = boardArrows();
    expect(arrows).toHaveLength(20);
    // The e2->e4 arrow, matched by its squares, is the highlight colour...
    expect(
      arrows.filter((arrow) => arrow.color === HOVERED_MOVE_ARROW_COLOR),
    ).toEqual([
      { startSquare: "e2", endSquare: "e4", color: HOVERED_MOVE_ARROW_COLOR },
    ]);
    // ...and every other known move keeps green.
    expect(
      arrows.filter((arrow) => arrow.color === KNOWN_MOVE_ARROW_COLOR),
    ).toHaveLength(19);
  });

  it("restores the arrow to green when the pointer leaves the row", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    const row = screen.getByTestId("openings-next-move-e4");
    await user.hover(row);
    await user.unhover(row);

    const arrows = boardArrows();
    expect(
      arrows.some((arrow) => arrow.color === HOVERED_MOVE_ARROW_COLOR),
    ).toBe(false);
    expect(
      arrows.filter((arrow) => arrow.color === KNOWN_MOVE_ARROW_COLOR),
    ).toHaveLength(20);
  });

  it("matches the arrow by move identity, not list position", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    // d4 is not the first row; its arrow, not the first one, must recolor.
    await user.hover(screen.getByTestId("openings-next-move-d4"));

    const highlighted = boardArrows().filter(
      (arrow) => arrow.color === HOVERED_MOVE_ARROW_COLOR,
    );
    expect(highlighted).toEqual([
      { startSquare: "d2", endSquare: "d4", color: HOVERED_MOVE_ARROW_COLOR },
    ]);
  });

  it("highlights on hover at a deeper ply, without disturbing the last-move arrow", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.hover(screen.getByTestId("openings-next-move-e5"));

    const arrows = boardArrows();
    // amber last-move arrow untouched
    expect(
      arrows.filter((arrow) => arrow.color === MOVE_ARROW_COLOR),
    ).toEqual([{ startSquare: "e2", endSquare: "e4", color: MOVE_ARROW_COLOR }]);
    // exactly the hovered continuation is red
    expect(
      arrows.filter((arrow) => arrow.color === HOVERED_MOVE_ARROW_COLOR),
    ).toEqual([
      { startSquare: "e7", endSquare: "e5", color: HOVERED_MOVE_ARROW_COLOR },
    ]);
  });
});

describe("the Openings screen — Play from here", () => {
  it("hands the position on screen to Play with Engine as ?fen=", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.click(screen.getByTestId("openings-play-from-here"));

    expect(screen.getByTestId("location")).toHaveAttribute(
      "data-pathname",
      "/engine/play",
    );
    expect(handOffFen()).toBe(AFTER_E4);
  });

  it("carries an earlier ply's position after stepping back", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.click(screen.getByTestId("openings-next-move-e5"));
    await user.click(screen.getByTestId("board-control-first"));
    await user.click(screen.getByTestId("openings-play-from-here"));

    expect(handOffFen()).toBe(START_FEN);
  });
});

describe("the Openings screen — arriving with a position", () => {
  it("opens on a readable ?fen= and faces the side to move", async () => {
    renderScreen(`/openings?fen=${encodeURIComponent(AFTER_E4)}`);
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
    renderScreen(`/openings?fen=${encodeURIComponent(fen)}`);
    await bookSettled();

    expect(screen.getByTestId("openings-current")).toHaveTextContent(
      i18n.t("openings.current.unknown"),
    );
    expect(screen.getByTestId("openings-next-moves-empty")).toBeInTheDocument();
    expect(boardArrows()).toEqual([]);
  });

  it("New game returns to the handed-over position, not the standard start", async () => {
    const user = userEvent.setup();
    renderScreen(`/openings?fen=${encodeURIComponent(AFTER_E4)}`);
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e5"));
    await user.click(screen.getByTestId("openings-new-game"));

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      AFTER_E4,
    );
  });

  it("ignores a ?fen= nobody can read", () => {
    renderScreen("/openings?fen=not-a-fen");

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      START_FEN,
    );
  });
});

/*
  The store is *not* stubbed: it writes to the `localStorage` jsdom provides and
  `src/test/setup.ts` clears between tests, which is the behaviour under test —
  the same stand-in policy the Saved openings suite states.
*/
describe("the Openings screen — saving", () => {
  it("opens the save prompt with Unfiled, a picker and the default hint", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));

    expect(screen.getByTestId("opening-folder-picker-unfiled")).toBeInTheDocument();
    expect(screen.getByTestId("opening-new-folder")).toBeInTheDocument();
    expect(screen.getByTestId("opening-folder-default-hint")).toHaveTextContent(
      i18n.t("savedOpenings.folder.defaultHint"),
    );
  });

  it("saves into the folder the reader chose", async () => {
    const user = userEvent.setup();
    const folder = createOpeningFolder("My lines", null);
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId(`opening-folder-picker-${folder?.id}`));
    await user.type(screen.getByTestId("opening-note-input"), "My line");
    await user.click(screen.getByTestId("opening-note-save"));

    expect(savedOpeningsSnapshot()).toHaveLength(1);
    expect(savedOpeningsSnapshot()[0].note).toBe("My line");
    expect(savedOpeningsSnapshot()[0].folderId).toBe(folder?.id);
  });

  it("saves Unfiled when the reader picks it, over the default rule", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    // After 1. e4 the default rule would file by the opening's name; picking
    // Unfiled explicitly is the choice that wins.
    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-folder-picker-unfiled"));
    await user.click(screen.getByTestId("opening-note-save"));

    expect(savedOpeningsSnapshot()[0].folderId).toBeNull();
    expect(openingFoldersSnapshot()).toEqual([]);
  });

  it("creates a folder inline and saves into it", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-new-folder"));
    await user.type(
      screen.getByTestId("opening-new-folder-input"),
      "New lines{Enter}",
    );

    // The folder is a real record already, and it is the picker's selection.
    const created = openingFoldersSnapshot().find((f) => f.name === "New lines");
    expect(created).toBeDefined();

    await user.click(screen.getByTestId("opening-note-save"));

    expect(savedOpeningsSnapshot()[0].folderId).toBe(created?.id);
  });

  it("keeps a folder the reader created inline, even if the save is cancelled", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-new-folder"));
    await user.type(screen.getByTestId("opening-new-folder-input"), "Kept{Enter}");
    await user.click(screen.getByTestId("opening-note-cancel"));

    expect(openingFoldersSnapshot().map((f) => f.name)).toEqual(["Kept"]);
    expect(savedOpeningsSnapshot()).toEqual([]);
  });

  it("files by the opening's own name when no folder was chosen", async () => {
    const user = userEvent.setup();
    renderScreen();
    await bookSettled();

    await user.click(screen.getByTestId("openings-next-move-e4"));
    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-note-save"));

    // A folder named after the opening, at the top level, and the opening in it.
    const created = openingFoldersSnapshot().find(
      (f) => f.name === "King's Pawn Game",
    );
    expect(created?.parentId).toBeNull();
    expect(savedOpeningsSnapshot()[0].folderId).toBe(created?.id);
    // And the note defaults to the top-level name — no variation to take.
    expect(savedOpeningsSnapshot()[0].note).toBe("King's Pawn Game");
  });

  it("files by the opening's top-level name when the book name is deep", async () => {
    const user = userEvent.setup();
    // After 1. e4 e5 2. f4 Nf6 — the book names it "King's Gambit Declined:
    // Petrov's Defense"; the folder is the part before the first ":".
    renderScreen(`/openings?fen=${encodeURIComponent(deepFen())}`);
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-note-save"));

    // The family name, not the whole "Opening: Variation" convention.
    const created = openingFoldersSnapshot().find(
      (f) => f.name === "King's Gambit Declined",
    );
    expect(created).toBeDefined();
    expect(created?.parentId).toBeNull();
    expect(savedOpeningsSnapshot()[0].folderId).toBe(created?.id);
    expect(
      openingFoldersSnapshot().find(
        (f) => f.name === "King's Gambit Declined: Petrov's Defense",
      ),
    ).toBeUndefined();
  });

  it("names a note-less save by the variation, falling back to the top level", async () => {
    const user = userEvent.setup();
    // "King's Gambit Declined: Petrov's Defense" — the variation is the name.
    renderScreen(`/openings?fen=${encodeURIComponent(deepFen())}`);
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-note-save"));

    expect(savedOpeningsSnapshot()[0].note).toBe("Petrov's Defense");
  });

  it("keeps a typed note over the default name", async () => {
    const user = userEvent.setup();
    renderScreen(`/openings?fen=${encodeURIComponent(deepFen())}`);
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.type(screen.getByTestId("opening-note-input"), "My line");
    await user.click(screen.getByTestId("opening-note-save"));

    expect(savedOpeningsSnapshot()[0].note).toBe("My line");
  });

  it("files an off-book position to Unfiled when no folder was chosen", async () => {
    const user = userEvent.setup();
    renderScreen(`/openings?fen=${encodeURIComponent(offBookFen())}`);
    await bookSettled();

    await user.click(screen.getByTestId("openings-save"));
    await user.click(screen.getByTestId("opening-note-save"));

    expect(savedOpeningsSnapshot()[0].folderId).toBeNull();
    expect(openingFoldersSnapshot()).toEqual([]);
  });
});
