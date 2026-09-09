import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import {
  itemsInLibraryCategory,
  loadLibraryCatalog,
  type LibraryCatalog,
} from "../../lib/libraryCatalog";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import { CARD_MIN_PX } from "./cardSize";
import LibraryList from "./LibraryList";
import { userPgnsSection, type LibrarySection } from "./section";

/* Stubbed for the reason in `.claude/rules/chessboard.md` §8 — jsdom has no
   layout engine, and a real board throws from its mount effect. */
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string; position?: string } }) => (
    <div data-testid="board" data-board-id={options.id} data-position={options.position} />
  ),
}));

/**
 * The list screen is section-agnostic, so it is exercised here against local
 * sections built over hand-assembled catalogs — a flat one of positions and a
 * nested one — alongside the shipped User PGNs section for the game-shaped
 * cases. Everything asserted is behaviour any library section gets: the top
 * bar, the search, the card-size toggle and the two-region layout branch on
 * nothing but props.
 *
 * The local sections read their chrome out of the `userPgns` locale block —
 * the one a shipped section carries — so a count reads "Games:" and an empty
 * category "No games in this file yet." here.
 */
const sectionOver = (
  catalog: LibraryCatalog,
  ids: Pick<LibrarySection, "routeBase" | "listTestId" | "itemTestId">,
): LibrarySection => ({ ...ids, catalog, chromeKey: "userPgns" });

const KQK = "7k/8/8/8/8/8/4Q3/4K3 w - - 0 1";

/** Two flat categories, both with items — the plain list-screen fixture. */
const flatCatalog = loadLibraryCatalog({
  categories: [
    { id: "basic", label: { en: "Basic" } },
    { id: "advanced", label: { en: "Advanced" } },
  ],
  positions: [
    { id: "back-rank", category: "basic", fen: KQK, name: { en: "Back rank" } },
    { id: "smothered", category: "basic", fen: KQK, name: { en: "Smothered" } },
    { id: "anastasia", category: "basic", fen: KQK, name: { en: "Anastasia" } },
    { id: "ladder", category: "advanced", fen: KQK, name: { en: "Ladder" } },
  ],
});
const flatSection = sectionOver(flatCatalog, {
  routeBase: "/lib",
  listTestId: "lib-list",
  itemTestId: "lib-item",
});

/**
 * A category holding a position of its own *and* a sub-folder, and that
 * sub-folder holding nothing — the folder-card and empty-category fixtures.
 */
const nestedCatalog = loadLibraryCatalog({
  categories: [
    {
      id: "queen-vs-rook",
      label: { en: "Queen vs Rook" },
      children: [{ id: "rosettes", label: { en: "Rosettes" } }],
    },
  ],
  positions: [
    { id: "own", category: "queen-vs-rook", fen: KQK, name: { en: "Own position" } },
  ],
});
const nestedSection = sectionOver(nestedCatalog, {
  routeBase: "/lib",
  listTestId: "nested-list",
  itemTestId: "nested-item",
});

const listTree = (
  section: LibrarySection,
  categoryPath: string,
  fallback?: React.ReactNode,
) => (
  <AppThemeWithLang>
    <MemoryRouter initialEntries={["/"]}>
      <RightPanelProvider>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <LibraryList section={section} categoryPath={categoryPath} />
                <RightPanelOutlet fallback={fallback} />
              </>
            }
          />
        </Routes>
      </RightPanelProvider>
    </MemoryRouter>
  </AppThemeWithLang>
);

const renderList = (section: LibrarySection, categoryPath: string) =>
  render(listTree(section, categoryPath));

const CATEGORY = "basic";
const STUDY = "lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08";
/** The next User PGNs folder along, which ships no notes of its own. */
const UNANNOTATED = "lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03";

const firstItem = itemsInLibraryCategory(CATEGORY, flatSection.catalog)[0];

describe("LibraryList", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  describe("the two regions", () => {
    it("puts the top bar and the grid side by side, and scrolls only the grid", () => {
      /*
        The bug this screen was reworked for: one box that was both the
        scroller and the thing being measured grew instead of scrolling, and
        took the cards' width down with it. The fix is structural, so this
        asserts the structure — jsdom has no layout engine and cannot be asked
        whether anything actually scrolled.
      */
      renderList(flatSection, CATEGORY);

      const topBar = screen.getByTestId("lib-list-top-bar");
      const grid = screen.getByTestId("lib-list-grid");

      expect(topBar).toHaveStyle({ flexShrink: "0" });
      expect(grid).toHaveStyle({ overflowY: "auto", minHeight: "0px" });
      /*
        And the declaration that makes `overflowY` mean anything: an `auto` row
        inside a box of definite height is stretched to share it out, so the
        cards were squashed and clipped and there was never anything to scroll.
      */
      expect(grid).toHaveStyle({ gridAutoRows: "max-content" });
      expect(screen.getByTestId("lib-list")).toHaveStyle({
        display: "flex",
        flexDirection: "column",
        minHeight: "0px",
      });
    });

    it("renders every card of the category in the grid", () => {
      renderList(flatSection, CATEGORY);

      const grid = screen.getByTestId("lib-list-grid");
      for (const item of itemsInLibraryCategory(CATEGORY, flatSection.catalog)) {
        expect(within(grid).getByTestId(`lib-item-card-${item.id}`)).toBeInTheDocument();
      }
    });

    it("leaves the hint alone in the shell panel", () => {
      renderList(flatSection, CATEGORY);

      expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
        "Pick a game to replay it",
      );
    });
  });

  describe("a folder's notes", () => {
    it("fills the shell panel when the folder has some", () => {
      /*
        The rosettes study ships an `.mdx` beside its `.pgn`, and this is the
        whole of the seam: the section descriptor carries a lookup keyed by
        category path, and the panel renders what it finds there. That the file
        compiles at all is also asserted here — Vitest runs off the same Vite
        config, so a missing MDX plugin fails this test rather than only the
        production build.
      */
      renderList(userPgnsSection, STUDY);

      const notes = screen.getByTestId("user-pgns-list-notes");
      expect(notes).toBeInTheDocument();
      expect(
        within(notes).getByRole("heading", { name: "Queen vs Rook, Rosettes" }),
      ).toBeInTheDocument();
      // Formatted, not a string: the MDX became real elements.
      expect(within(notes).getByRole("table")).toBeInTheDocument();
      expect(
        within(notes).getByRole("link", { name: "methurst" }),
      ).toHaveAttribute("href", "https://lichess.org/@/methurst");
    });

    it("scrolls them itself, because the shell's aside does not", () => {
      // The aside is a flex column with `overflow: hidden`, and `RightPanel`
      // portals into a `display: contents` host — so this box is a flex child
      // of it and notes longer than the panel have to scroll here.
      renderList(userPgnsSection, STUDY);

      expect(screen.getByTestId("user-pgns-list-notes")).toHaveStyle({
        flex: "1",
        minHeight: "0px",
        overflowY: "auto",
      });
    });

    it("keeps the hint for a folder with none", () => {
      renderList(userPgnsSection, UNANNOTATED);

      expect(screen.queryByTestId("user-pgns-list-notes")).toBeNull();
      expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
        "Pick a game to replay it",
      );
    });

    it("keeps the hint for a whole section that carries none", () => {
      // A section that leaves `folderNotes` unset shows the static hint in
      // every folder's panel.
      expect(flatSection.folderNotes).toBeUndefined();
      expect(nestedSection.folderNotes).toBeUndefined();

      renderList(flatSection, CATEGORY);

      expect(screen.queryByTestId("lib-list-notes")).toBeNull();
    });
  });

  describe("the name search", () => {
    it("filters the cards live, and restores them when cleared", async () => {
      const user = userEvent.setup();
      renderList(flatSection, CATEGORY);

      const all = itemsInLibraryCategory(CATEGORY, flatSection.catalog);
      expect(all.length).toBeGreaterThan(1);

      await user.type(screen.getByTestId("lib-list-search"), firstItem.name.en);

      expect(screen.getByTestId(`lib-item-card-${firstItem.id}`)).toBeInTheDocument();
      expect(
        screen.getAllByTestId(/^lib-item-card-/).length,
      ).toBeLessThan(all.length);

      await user.clear(screen.getByTestId("lib-list-search"));

      expect(screen.getAllByTestId(/^lib-item-card-/)).toHaveLength(all.length);
    });

    it("counts what is on screen, not what the category holds", async () => {
      // The count moved into the top bar, so it now sits next to the box that
      // decides it — a count of the whole category beside three visible cards
      // would read as a bug.
      const user = userEvent.setup();
      renderList(flatSection, CATEGORY);

      const all = itemsInLibraryCategory(CATEGORY, flatSection.catalog);
      expect(screen.getByTestId("lib-list-count")).toHaveTextContent(
        `Games: ${all.length}`,
      );

      await user.type(screen.getByTestId("lib-list-search"), firstItem.name.en);

      expect(screen.getByTestId("lib-list-count")).toHaveTextContent(
        `Games: ${screen.getAllByTestId(/^lib-item-card-/).length}`,
      );
    });

    it("says so when a search matches nothing, and renders no grid", async () => {
      const user = userEvent.setup();
      renderList(flatSection, CATEGORY);

      await user.type(screen.getByTestId("lib-list-search"), "zugzwang");

      expect(screen.getByTestId("lib-list-no-matches")).toHaveTextContent(
        "No games match that search.",
      );
      expect(screen.queryByTestId("lib-list-grid")).toBeNull();
      expect(screen.getByTestId("lib-list-count")).toHaveTextContent("Games: 0");
    });

    it("drops the query when the reader moves to another category", async () => {
      /*
        A filter belongs to the folder it was typed into: carried across, it
        would show the next one as empty, which reads as missing data rather
        than as a search still running.
      */
      const user = userEvent.setup();
      const view = render(listTree(flatSection, "basic"));

      await user.type(screen.getByTestId("lib-list-search"), "zugzwang");
      expect(screen.getByTestId("lib-list-no-matches")).toBeInTheDocument();

      view.rerender(listTree(flatSection, "advanced"));

      expect(screen.getByTestId("lib-list-search")).toHaveValue("");
      expect(screen.getByTestId("lib-list-grid")).toBeInTheDocument();
    });

    it("finds a game by a player its card never prints", async () => {
      /*
        The section-agnostic half of the same control: over a library of games
        the haystack is what `gameSummaryOf` derives plus the two player tags,
        so a chapter titled "Chapter 1" is still reachable by its content.
      */
      const user = userEvent.setup();
      renderList(userPgnsSection, STUDY);

      const games = itemsInLibraryCategory(STUDY, userPgnsSection.catalog);
      expect(games.length).toBeGreaterThan(0);

      await user.type(screen.getByTestId("user-pgns-list-search"), "chapter 1");

      expect(screen.getByTestId("user-pgn-card-chapter-1")).toBeInTheDocument();
      expect(screen.getByTestId("user-pgns-list-search")).toHaveValue("chapter 1");
    });
  });

  describe("the card-size toggle", () => {
    it("starts compact, and never lets a track fall under that width", () => {
      renderList(flatSection, CATEGORY);

      expect(screen.getByTestId("lib-list-card-size-compact")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("lib-list-grid")).toHaveStyle({
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN_PX.compact}px, 100%), 1fr))`,
      });
    });

    it("raises that minimum when the reader asks for comfortable cards", async () => {
      const user = userEvent.setup();
      renderList(flatSection, CATEGORY);

      await user.click(screen.getByTestId("lib-list-card-size-comfortable"));

      expect(screen.getByTestId("lib-list-grid")).toHaveStyle({
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN_PX.comfortable}px, 100%), 1fr))`,
      });
      expect(CARD_MIN_PX.comfortable).toBeGreaterThan(CARD_MIN_PX.compact);
    });

    it("stays where it was put when the same button is pressed again", async () => {
      // A `null` from an exclusive group is a deselection, and the cards have to
      // be *some* size.
      const user = userEvent.setup();
      renderList(flatSection, CATEGORY);

      await user.click(screen.getByTestId("lib-list-card-size-comfortable"));
      await user.click(screen.getByTestId("lib-list-card-size-comfortable"));

      expect(screen.getByTestId("lib-list-card-size-comfortable")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("a category's sub-folders", () => {
    /*
      Two shapes: the local `queen-vs-rook` category holds a position of its own
      *and* the Rosettes sub-folder; the shipped Capablanca manifest group holds
      three files and nothing of its own.

      Not the multi-study PGN export, though it is the same shape as the second:
      the User PGNs section routes that path to `PgnCollection` rather than
      here (`views/pgn/UserPgnsSection.tsx`), so testing the shared screen
      against it would assert a screen the app does not show for it.
    */
    const MIXED = "queen-vs-rook";
    const GROUP = "chess-fundamentals-capablanca";

    it("renders a folder card in the same grid, ahead of the item cards", () => {
      renderList(nestedSection, MIXED);

      const grid = screen.getByTestId("nested-list-grid");
      const folder = within(grid).getByTestId("nested-list-folder-rosettes");

      expect(folder).toHaveAttribute("href", "/lib/queen-vs-rook/rosettes");
      // Folders first: the rest of the category's content is behind them.
      const cards = within(grid).getAllByTestId(/^nested-list-folder-|^nested-item-card-/);
      expect(cards[0]).toBe(folder);
    });

    it("counts everything under a folder, not the folder's own items", () => {
      // The group holds no chapters itself; the click behind each card leads to
      // one part's forty-odd.
      renderList(userPgnsSection, GROUP);

      const [card] = screen.getAllByTestId(/^user-pgns-list-folder-lichess/);
      expect(card).toHaveTextContent(/Games: \d+/);
      expect(card).not.toHaveTextContent("Games: 0");
    });

    it("counts the folders in the top bar, in the section's own words", () => {
      renderList(userPgnsSection, GROUP);

      expect(screen.getByTestId("user-pgns-list-folder-count")).toHaveTextContent(
        "Studies: 3",
      );
      // No games of its own, so no game count beside it.
      expect(screen.queryByTestId("user-pgns-list-count")).toBeNull();
      expect(screen.queryByTestId("user-pgns-list-empty")).toBeNull();
    });

    it("searches the folders as well as the cards", async () => {
      const user = userEvent.setup();
      renderList(userPgnsSection, GROUP);

      await user.type(screen.getByTestId("user-pgns-list-search"), "part 2");

      expect(screen.getAllByTestId(/^user-pgns-list-folder-lichess/)).toHaveLength(1);
      expect(screen.getByTestId("user-pgns-list-folder-count")).toHaveTextContent(
        "Studies: 1",
      );
    });

    it("says nothing matched when the search empties both", async () => {
      const user = userEvent.setup();
      renderList(userPgnsSection, GROUP);

      await user.type(screen.getByTestId("user-pgns-list-search"), "zugzwang");

      expect(screen.getByTestId("user-pgns-list-no-matches")).toBeInTheDocument();
      expect(screen.queryByTestId("user-pgns-list-grid")).toBeNull();
    });

    it("registers the panel for a folder that only holds folders", () => {
      // It has something to click, so it has something to say about clicking
      // it — the hint, or this folder's own notes.
      render(listTree(userPgnsSection, GROUP, <span>shell placeholder</span>));

      expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
        "Pick a game to replay it",
      );
    });
  });

  describe("a category with nothing in it", () => {
    // The local nested catalog has one: Rosettes is structure with no items
    // under it.
    const EMPTY = "queen-vs-rook/rosettes";

    it("says so where the cards would have been", () => {
      expect(
        itemsInLibraryCategory(EMPTY, nestedSection.catalog),
      ).toHaveLength(0);

      renderList(nestedSection, EMPTY);

      expect(screen.getByTestId("nested-list-empty")).toHaveTextContent(
        "No games in this file yet.",
      );
      expect(screen.queryByTestId("nested-list-grid")).toBeNull();
      // Still a top bar: the category has a name, and a search that will find
      // nothing is better than a control that vanishes.
      expect(screen.getByTestId("nested-list-top-bar")).toHaveTextContent(
        "Rosettes",
      );
      expect(screen.queryByTestId("nested-list-count")).toBeNull();
    });

    it("registers no panel, so the shell's own placeholder stands", () => {
      render(listTree(nestedSection, EMPTY, <span>shell placeholder</span>));

      // A category with no cards has no hint to give about picking one.
      expect(screen.queryByTestId("layout-right-panel")).toBeNull();
      expect(screen.getByText("shell placeholder")).toBeInTheDocument();
    });
  });
});
