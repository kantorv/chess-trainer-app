import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { itemsInLibraryCategory } from "../../lib/libraryCatalog";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import { CARD_MIN_PX } from "./cardSize";
import LibraryList from "./LibraryList";
import {
  matesSection,
  positionsSection,
  userPgnsSection,
  type LibrarySection,
} from "./section";

/* Stubbed for the reason in `.claude/rules/chessboard.md` §8 — jsdom has no
   layout engine, and a real board throws from its mount effect. */
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string; position?: string } }) => (
    <div data-testid="board" data-board-id={options.id} data-position={options.position} />
  ),
}));

/**
 * The list screen itself, over two real sections — one of positions and one of
 * games. Everything asserted here is behaviour the three sections share, which
 * is why it is tested against the shared component rather than a fourth time in
 * each binding's own file: the top bar, the search, the card-size toggle and
 * the two-region layout branch on nothing but props.
 */
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

const MATES = "basic";
const STUDY = "lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08";
/** The next User PGNs folder along, which ships no notes of its own. */
const UNANNOTATED = "lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03";

const firstMate = itemsInLibraryCategory(MATES, matesSection.catalog)[0];

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
      renderList(matesSection, MATES);

      const topBar = screen.getByTestId("mates-list-top-bar");
      const grid = screen.getByTestId("mates-list-grid");

      expect(topBar).toHaveStyle({ flexShrink: "0" });
      expect(grid).toHaveStyle({ overflowY: "auto", minHeight: "0px" });
      /*
        And the declaration that makes `overflowY` mean anything: an `auto` row
        inside a box of definite height is stretched to share it out, so the
        cards were squashed and clipped and there was never anything to scroll.
      */
      expect(grid).toHaveStyle({ gridAutoRows: "max-content" });
      expect(screen.getByTestId("mates-list")).toHaveStyle({
        display: "flex",
        flexDirection: "column",
        minHeight: "0px",
      });
    });

    it("renders every card of the category in the grid", () => {
      renderList(matesSection, MATES);

      const grid = screen.getByTestId("mates-list-grid");
      for (const item of itemsInLibraryCategory(MATES, matesSection.catalog)) {
        expect(within(grid).getByTestId(`mate-card-${item.id}`)).toBeInTheDocument();
      }
    });

    it("leaves the hint alone in the shell panel", () => {
      renderList(matesSection, MATES);

      expect(screen.getByTestId("layout-right-panel")).toHaveTextContent(
        "Pick a position to open it on a board",
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
      // Mates and Positions leave `folderNotes` unset, so nothing about their
      // panels changed.
      expect(matesSection.folderNotes).toBeUndefined();
      expect(positionsSection.folderNotes).toBeUndefined();

      renderList(matesSection, MATES);

      expect(screen.queryByTestId("mates-list-notes")).toBeNull();
    });
  });

  describe("the name search", () => {
    it("filters the cards live, and restores them when cleared", async () => {
      const user = userEvent.setup();
      renderList(matesSection, MATES);

      const all = itemsInLibraryCategory(MATES, matesSection.catalog);
      expect(all.length).toBeGreaterThan(1);

      await user.type(screen.getByTestId("mates-list-search"), firstMate.name.en);

      expect(screen.getByTestId(`mate-card-${firstMate.id}`)).toBeInTheDocument();
      expect(
        screen.getAllByTestId(/^mate-card-/).length,
      ).toBeLessThan(all.length);

      await user.clear(screen.getByTestId("mates-list-search"));

      expect(screen.getAllByTestId(/^mate-card-/)).toHaveLength(all.length);
    });

    it("counts what is on screen, not what the category holds", async () => {
      // The count moved into the top bar, so it now sits next to the box that
      // decides it — a count of the whole category beside three visible cards
      // would read as a bug.
      const user = userEvent.setup();
      renderList(matesSection, MATES);

      const all = itemsInLibraryCategory(MATES, matesSection.catalog);
      expect(screen.getByTestId("mates-list-count")).toHaveTextContent(
        `Positions: ${all.length}`,
      );

      await user.type(screen.getByTestId("mates-list-search"), firstMate.name.en);

      expect(screen.getByTestId("mates-list-count")).toHaveTextContent(
        `Positions: ${screen.getAllByTestId(/^mate-card-/).length}`,
      );
    });

    it("says so when a search matches nothing, and renders no grid", async () => {
      const user = userEvent.setup();
      renderList(matesSection, MATES);

      await user.type(screen.getByTestId("mates-list-search"), "zugzwang");

      expect(screen.getByTestId("mates-list-no-matches")).toHaveTextContent(
        "No positions match that search.",
      );
      expect(screen.queryByTestId("mates-list-grid")).toBeNull();
      expect(screen.getByTestId("mates-list-count")).toHaveTextContent("Positions: 0");
    });

    it("drops the query when the reader moves to another category", async () => {
      /*
        A filter belongs to the folder it was typed into: carried across, it
        would show the next one as empty, which reads as missing data rather
        than as a search still running.
      */
      const user = userEvent.setup();
      const view = render(listTree(matesSection, "basic"));

      await user.type(screen.getByTestId("mates-list-search"), "zugzwang");
      expect(screen.getByTestId("mates-list-no-matches")).toBeInTheDocument();

      view.rerender(listTree(matesSection, "advanced"));

      expect(screen.getByTestId("mates-list-search")).toHaveValue("");
      expect(screen.getByTestId("mates-list-grid")).toBeInTheDocument();
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
      renderList(matesSection, MATES);

      expect(screen.getByTestId("mates-list-card-size-compact")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("mates-list-grid")).toHaveStyle({
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN_PX.compact}px, 100%), 1fr))`,
      });
    });

    it("raises that minimum when the reader asks for comfortable cards", async () => {
      const user = userEvent.setup();
      renderList(matesSection, MATES);

      await user.click(screen.getByTestId("mates-list-card-size-comfortable"));

      expect(screen.getByTestId("mates-list-grid")).toHaveStyle({
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN_PX.comfortable}px, 100%), 1fr))`,
      });
      expect(CARD_MIN_PX.comfortable).toBeGreaterThan(CARD_MIN_PX.compact);
    });

    it("stays where it was put when the same button is pressed again", async () => {
      // A `null` from an exclusive group is a deselection, and the cards have to
      // be *some* size.
      const user = userEvent.setup();
      renderList(matesSection, MATES);

      await user.click(screen.getByTestId("mates-list-card-size-comfortable"));
      await user.click(screen.getByTestId("mates-list-card-size-comfortable"));

      expect(screen.getByTestId("mates-list-card-size-comfortable")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("a category with nothing in it", () => {
    // The Positions section ships one: Rosettes is structure with no positions
    // under it yet.
    const EMPTY = "queen-vs-rook/rosettes";

    it("says so where the cards would have been", () => {
      expect(
        itemsInLibraryCategory(EMPTY, positionsSection.catalog),
      ).toHaveLength(0);

      renderList(positionsSection, EMPTY);

      expect(screen.getByTestId("positions-list-empty")).toHaveTextContent(
        "No positions in this category yet.",
      );
      expect(screen.queryByTestId("positions-list-grid")).toBeNull();
      // Still a top bar: the category has a name, and a search that will find
      // nothing is better than a control that vanishes.
      expect(screen.getByTestId("positions-list-top-bar")).toHaveTextContent(
        "Rosettes",
      );
      expect(screen.queryByTestId("positions-list-count")).toBeNull();
    });

    it("registers no panel, so the shell's own placeholder stands", () => {
      render(listTree(positionsSection, EMPTY, <span>shell placeholder</span>));

      // A category with no cards has no hint to give about picking one.
      expect(screen.queryByTestId("layout-right-panel")).toBeNull();
      expect(screen.getByText("shell placeholder")).toBeInTheDocument();
    });
  });
});
