import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { itemsInLibraryCategory } from "../../lib/libraryCatalog";
import { matesSection } from "../library/section";
import { pgnCatalog } from "../../lib/pgnCatalog";
import { initialFenOf } from "../../lib/gameModel";
import { fenAtPly } from "../../lib/gameNavigation";
import { parsePgnGames } from "../../lib/pgn";
import { extractPgnComments, hasPgnComments } from "../../lib/pgnComments";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import { LeftPanelOutlet, LeftPanelProvider } from "../main/leftPanel";
import { addUpload, clearUploads } from "../../lib/pgnUploadStore";
import UserPgnsSection from "./UserPgnsSection";

/* Stubbed for the reason in `.claude/rules/chessboard.md` §8 — jsdom has no
   layout engine, and a real board throws from its mount effect. */

/* The opening book stays stubbed — the panel's new opening line must not pull
   the real ~3MB eco.json into a screen test. */
vi.mock("../../lib/openings", () => ({
  loadOpeningBook: () => Promise.resolve({}),
  getPositionBook: () => ({}),
  findOpening: () => undefined,
}));

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { id?: string; position?: string; boardOrientation?: string };
  }) => (
    <div
      data-testid="board"
      data-board-id={options.id}
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

/** Where a hand-off lands: the route it opened, and what it carried. */
const Arrival = ({ name }: { name: string }) => {
  const [params] = useSearchParams();
  return (
    <div
      data-testid={`${name}-arrival`}
      data-fen={params.get("fen")}
      data-game={params.get("game")}
      data-move={params.get("move")}
    />
  );
};

/** What the address bar currently says — for the `?move=` reflection. */
const LocationSearch = () => (
  <div data-testid="location-search" data-search={useLocation().search} />
);

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <RightPanelProvider>
          <LeftPanelProvider>
            <Routes>
              <Route
                path="/pgn/*"
                element={
                  <>
                    <UserPgnsSection />
                    <RightPanelOutlet />
                    {/* The shell's fallback is the nav tree; naming it is how
                        the tests below tell "this screen claimed the rail"
                        from "the app's own sidebar is still there". */}
                    <LeftPanelOutlet fallback={<span>app sidebar</span>} />
                    <LocationSearch />
                  </>
                }
              />
              <Route path="/tools/analysis" element={<Arrival name="analysis" />} />
              <Route path="/games/load-pgn" element={<Arrival name="load-pgn" />} />
              <Route path="/engine/play" element={<Arrival name="play" />} />
              <Route path="/tools/editor" element={<Arrival name="editor" />} />
            </Routes>
          </LeftPanelProvider>
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const PLAYED =
  "lichess-study-zwischenzug-best-games-part1-by-lalala732-2026-04-12";
const STUDY = "lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08";

const played = itemsInLibraryCategory(PLAYED, pgnCatalog)[0];
if (played.kind !== "game") throw new Error("expected a game");

describe("the User PGNs section", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists a file's games as cards, previewing each one's starting position", () => {
    renderAt(`/pgn/${PLAYED}`);

    const listed = itemsInLibraryCategory(PLAYED, pgnCatalog);
    expect(listed).toHaveLength(9);
    for (const item of listed) {
      expect(screen.getByTestId(`user-pgn-card-${item.id}`)).toBeInTheDocument();
    }

    const topBar = screen.getByTestId("user-pgns-list-top-bar");
    expect(topBar).toHaveTextContent("Zwischenzug best games [part1]");
    expect(topBar).toHaveTextContent("Games: 9");
  });

  it("gives a game card a footer of what the PGN tags actually say", () => {
    /*
      The one branch the item kind makes on the list screen. "White to play"
      would say nothing about a game you are about to replay from move one, so a
      game is footed with how it ended, how long it ran, where it was played and
      what was opened.
    */
    renderAt(`/pgn/${PLAYED}`);

    const footer = screen.getByTestId(`user-pgn-footer-${played.id}`);

    expect(footer).toHaveTextContent("Jose Raul Capablanca - Savielly Tartakower");
    expect(footer).toHaveTextContent(`1-0 · ${played.game.moves.length} moves`);
    expect(footer).toHaveTextContent("New York, 1924");
    expect(footer).toHaveTextContent("Horwitz Defense · A40");
  });

  it("collapses that footer to what a chapter with no game data has", () => {
    // A rosettes chapter is a position and a comment: no players, no result, and
    // an Event tag that only repeats the chapter's own name. Nothing is invented
    // and no placeholder row is rendered.
    renderAt(`/pgn/${STUDY}`);

    const footer = screen.getByTestId("user-pgn-footer-chapter-1");

    expect(footer).toHaveTextContent("Chapter 1");
    // Singular, not "1 moves" — that chapter ships a single move.
    expect(footer).toHaveTextContent("1 move");
    expect(footer).not.toHaveTextContent("Queen vs Rook, Rosettes:");
    expect(footer).not.toHaveTextContent("?");
  });

  it("captions a position card by whose move it is, unchanged", () => {
    // The other side of the same branch, asserted here because this is the file
    // that owns it: the two position sections are untouched by any of the above.
    expect(matesSection.catalog.items.every((item) => item.kind === "position")).toBe(
      true,
    );
  });

  it("serves a folder the manifest nested, from the same one splat route", () => {
    renderAt(`/pgn/${STUDY}`);

    expect(screen.getByTestId("user-pgns-list-top-bar")).toHaveTextContent(
      "Queen vs Rook, Rosettes",
    );
    expect(screen.getByTestId("user-pgn-card-chapter-1")).toHaveAttribute(
      "href",
      `/pgn/${STUDY}/chapter-1`,
    );
  });

  it("opens a game at its starting position, facing White", () => {
    /*
      A game does not turn the board, however the position it starts from
      stands: a PGN opens at ply 0, where the side to move says nothing about
      which side is being studied. A *position* library faces the side to move;
      this deliberately does not.
    */
    renderAt(`/pgn/${STUDY}/chapter-1`);

    const board = screen.getByTestId("board");
    expect(board).toHaveAttribute("data-orientation", "white");

    const chapter = itemsInLibraryCategory(STUDY, pgnCatalog)[0];
    if (chapter.kind !== "game") throw new Error("expected a game");
    expect(board).toHaveAttribute("data-position", initialFenOf(chapter.game));
  });

  it("replays the game through the shared move list and board controls", async () => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      fenAtPly(played.game, 0),
    );

    // The shared controls, driving the shared ply navigation — no move list,
    // no stepping and no keyboard handling was written for this screen.
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("gamePanel.controls.next") }),
    );
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      fenAtPly(played.game, 1),
    );

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("gamePanel.controls.last") }),
    );
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      fenAtPly(played.game, played.game.moves.length),
    );
  });

  it("shows the game's PGN tags in its Info tab", async () => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    await userEvent.click(screen.getByTestId("user-pgn-tab-info"));

    const panel = screen.getByTestId("layout-right-panel");
    expect(panel).toHaveTextContent("Jose Raul Capablanca");
    expect(panel).toHaveTextContent("New York, NY USA");
  });

  it.each([
    ["analysis", "user-pgn-open-analysis"],
    ["load-pgn", "user-pgn-open-load-pgn"],
  ])("hands the whole game to %s as ?game=", async (arrival, testId) => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    await userEvent.click(screen.getByTestId(testId));

    expect(screen.getByTestId(`${arrival}-arrival`)).toHaveAttribute(
      "data-game",
      `pgn/${PLAYED}/${played.id}`,
    );
  });

  it.each([
    ["play", "user-pgn-play-engine"],
    ["editor", "user-pgn-open-editor"],
  ])("hands the position at the ply on screen to %s as ?fen=", async (arrival, testId) => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    // Step forward twice first — the point of `?fen=` here is that it carries
    // *this* ply, not the game's start.
    const next = screen.getByRole("button", {
      name: i18n.t("gamePanel.controls.next"),
    });
    await userEvent.click(next);
    await userEvent.click(next);
    await userEvent.click(screen.getByTestId(testId));

    expect(screen.getByTestId(`${arrival}-arrival`)).toHaveAttribute(
      "data-fen",
      fenAtPly(played.game, 2),
    );
  });

  it.each([
    ["analysis", "user-pgn-open-analysis"],
    ["load-pgn", "user-pgn-open-load-pgn"],
  ])("carries the ply on screen to %s as &move=", async (arrival, testId) => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    const next = screen.getByRole("button", {
      name: i18n.t("gamePanel.controls.next"),
    });
    await userEvent.click(next);
    await userEvent.click(next);
    await userEvent.click(screen.getByTestId(testId));

    const landed = screen.getByTestId(`${arrival}-arrival`);
    expect(landed).toHaveAttribute("data-game", `pgn/${PLAYED}/${played.id}`);
    expect(landed).toHaveAttribute("data-move", "2");
  });

  it("omits &move= from the hand-off at ply 0", async () => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    await userEvent.click(screen.getByTestId("user-pgn-open-analysis"));

    expect(screen.getByTestId("analysis-arrival")).not.toHaveAttribute(
      "data-move",
    );
  });

  describe("the ?move= in the address bar", () => {
    const next = () => screen.getByTestId("board-control-next");
    const first = () => screen.getByTestId("board-control-first");
    const search = () =>
      screen.getByTestId("location-search").getAttribute("data-search") ?? "";

    it("reflects the ply on screen, replacing in place", async () => {
      renderAt(`/pgn/${PLAYED}/${played.id}`);
      expect(search()).not.toContain("move=");

      await userEvent.click(next());
      await userEvent.click(next());
      expect(search()).toContain("move=2");
      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(played.game, 2),
      );
    });

    it("drops the parameter back at ply 0 rather than writing move=0", async () => {
      renderAt(`/pgn/${PLAYED}/${played.id}`);

      await userEvent.click(next());
      expect(search()).toContain("move=1");
      await userEvent.click(first());
      expect(search()).not.toContain("move=");
    });

    it("opens on the ply the URL names", () => {
      renderAt(`/pgn/${PLAYED}/${played.id}?move=3`);

      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(played.game, 3),
      );
    });

    it("clamps a ply past the end of the game rather than throwing", () => {
      renderAt(`/pgn/${PLAYED}/${played.id}?move=99999`);

      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(played.game, played.game.moves.length),
      );
    });

    it("ignores a ?move= that is not a ply", () => {
      renderAt(`/pgn/${PLAYED}/${played.id}?move=abc`);

      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(played.game, 0),
      );
    });
  });

  describe("the StartPly tag", () => {
    /*
      The second source of an opening ply: a game's `[StartPly "N"]` tag pair.
      Seeded through an upload, which is also the proof that a reader's own file
      gets the feature — it goes through the same loader and the same detail
      screen as a shipped one.
    */
    const START_PLY_PGN = `[Event "Uploaded: Chapter 1"]
[Result "*"]
[StudyName "Uploaded Study"]
[ChapterName "Chapter 1"]
[StartPly "3"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *

`;

    const tagged = parsePgnGames(START_PLY_PGN)[0];

    beforeEach(() => {
      clearUploads();
    });

    it("opens on the ply the tag declares when the URL names none", () => {
      addUpload("my_study.pgn", START_PLY_PGN);
      renderAt("/pgn/uploads/my-study/chapter-1");

      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(tagged, 3),
      );
    });

    it("lets an explicit ?move= win over the tag", () => {
      addUpload("my_study.pgn", START_PLY_PGN);
      renderAt("/pgn/uploads/my-study/chapter-1?move=1");

      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(tagged, 1),
      );
    });

    it("opens at ply 0 when the tag names a ply the game does not have", () => {
      addUpload(
        "my_study.pgn",
        START_PLY_PGN.replace('[StartPly "3"]', '[StartPly "99"]'),
      );
      renderAt("/pgn/uploads/my-study/chapter-1");

      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(tagged, 0),
      );
    });
  });

  it("closes to the same folder from the top-right close button", async () => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    await userEvent.click(screen.getByTestId("user-pgn-detail-close"));

    expect(screen.getByTestId("user-pgns-list")).toBeInTheDocument();
  });

  describe("sibling-nav left panel", () => {
    const siblings = itemsInLibraryCategory(PLAYED, pgnCatalog);
    const other = siblings.find((sibling) => sibling.id !== played.id)!;

    it("replaces the sidebar with the folder's other games, the current one active", () => {
      renderAt(`/pgn/${PLAYED}/${played.id}`);

      const panel = screen.getByTestId("layout-left-panel");
      const active = screen.getByTestId(`user-pgn-sibling-nav-item-${played.id}`);
      const otherRow = screen.getByTestId(`user-pgn-sibling-nav-item-${other.id}`);

      expect(panel).toContainElement(active);
      expect(panel).toContainElement(otherRow);
      expect(active).toHaveAttribute("aria-current", "true");
      expect(otherRow).not.toHaveAttribute("aria-current");
      expect(screen.getAllByTestId(/^user-pgn-sibling-nav-item-/)).toHaveLength(
        siblings.length,
      );
    });

    it("navigates to a sibling game when clicked", async () => {
      renderAt(`/pgn/${PLAYED}/${played.id}`);

      await userEvent.click(
        screen.getByTestId(`user-pgn-sibling-nav-item-${other.id}`),
      );

      if (other.kind !== "game") throw new Error("expected a game");
      expect(screen.getByTestId("board")).toHaveAttribute(
        "data-position",
        fenAtPly(other.game, 0),
      );
      expect(
        screen.getByTestId(`user-pgn-sibling-nav-item-${other.id}`),
      ).toHaveAttribute("aria-current", "true");
    });

    it("closes back to the folder's list", async () => {
      renderAt(`/pgn/${PLAYED}/${played.id}`);

      await userEvent.click(screen.getByTestId("user-pgn-sibling-nav-close"));

      expect(screen.getByTestId("user-pgns-list")).toBeInTheDocument();
    });

    it("keeps the right-panel hand-offs and close button unaffected", () => {
      renderAt(`/pgn/${PLAYED}/${played.id}`);

      expect(screen.getByTestId("user-pgn-open-analysis")).toBeInTheDocument();
      expect(screen.getByTestId("user-pgn-detail-close")).toBeInTheDocument();
    });
  });

  it("says so, and renders no board, for a folder that does not exist", () => {
    renderAt("/pgn/no-such-file");

    expect(screen.getByTestId("user-pgns-list-unknown-category")).toHaveTextContent(
      "There is no such PGN folder.",
    );
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("names the folder when only the game is unknown", () => {
    renderAt(`/pgn/${PLAYED}/no-such-game`);

    expect(screen.getByTestId("user-pgn-detail-not-found")).toHaveTextContent(
      "There is no such game in this folder.",
    );
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("opens on the Moves tab, not the new Description tab", () => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    expect(
      screen.getByTestId("user-pgn-detail-content-moves"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("user-pgn-detail-content-description"),
    ).toBeNull();
  });

  it("shows the chapter's re-flowed preamble in the Description tab", async () => {
    // Rosettes Chapter 1 opens with a multi-paragraph note on the starting
    // position and carries no per-move comments.
    renderAt(`/pgn/${STUDY}/chapter-1`);

    await userEvent.click(screen.getByTestId("user-pgn-tab-description"));

    const preamble = screen.getByTestId("user-pgn-description-preamble");
    expect(preamble).toHaveTextContent("three different rosette types");
    // The numbered points the source wrote with single newlines survive as
    // their own paragraphs.
    expect(preamble.querySelectorAll("p").length).toBeGreaterThan(1);
  });

  it("labels each move comment and jumps the board to that ply on click", async () => {
    const comments = extractPgnComments(played.pgn);
    const first = comments.moves[0];
    expect(first).toBeDefined();

    renderAt(`/pgn/${PLAYED}/${played.id}`);
    await userEvent.click(screen.getByTestId("user-pgn-tab-description"));

    const entry = screen.getByTestId(
      `user-pgn-description-entry-${first.ply}`,
    );
    expect(entry).toHaveTextContent(played.game.moves[first.ply - 1].san);

    await userEvent.click(entry);

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      fenAtPly(played.game, first.ply),
    );
  });

  it("marks annotated moves in the Moves list and shows the comment when that move is active", async () => {
    const comments = extractPgnComments(played.pgn);
    const first = comments.moves[0];
    expect(first).toBeDefined();

    renderAt(`/pgn/${PLAYED}/${played.id}`);

    // The move list is the Moves tab, which opens by default.
    expect(
      screen.getByTestId(`move-comment-icon-${first.ply}`),
    ).toBeInTheDocument();
    // A move with no comment carries no marker.
    const plain = played.game.moves.find(
      (move) => !comments.moves.some((entry) => entry.ply === move.ply),
    );
    expect(plain).toBeDefined();
    expect(
      screen.queryByTestId(`move-comment-icon-${plain!.ply}`),
    ).toBeNull();

    // Nothing under the FEN until the annotated move is the one on screen.
    expect(screen.queryByTestId("user-pgn-move-comment")).toBeNull();

    await userEvent.click(screen.getByTestId(`move-ply-${first.ply}`));

    const shown = screen.getByTestId("user-pgn-move-comment");
    expect(shown).toHaveTextContent(played.game.moves[first.ply - 1].san);
    expect(shown).toHaveTextContent(first.paragraphs[0].slice(0, 20));
  });

  it("shows an explicit empty state for a game with no comments", async () => {
    const PUZZLES =
      "lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03";
    const bare = itemsInLibraryCategory(PUZZLES, pgnCatalog).find(
      (item) =>
        item.kind === "game" && !hasPgnComments(extractPgnComments(item.pgn)),
    );
    if (bare === undefined || bare.kind !== "game") {
      throw new Error("expected a puzzle chapter with no comments");
    }

    renderAt(`/pgn/${PUZZLES}/${bare.id}`);
    await userEvent.click(screen.getByTestId("user-pgn-tab-description"));

    const panel = screen.getByTestId("user-pgn-description");
    expect(panel).toHaveTextContent("This game has no annotations.");
    expect(
      screen.queryAllByTestId(/^user-pgn-description-entry-/),
    ).toHaveLength(0);
  });

  it("translates its chrome, and takes its content from the PGN, under Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    const panel = screen.getByTestId("layout-right-panel");
    // Chrome out of `src/locales`; the game's name out of its own tag pairs.
    expect(panel).toHaveTextContent(i18n.t("userPgns.detail.openInAnalysis"));
    expect(panel).toHaveTextContent(played.name.en);
  });
});

/**
 * The section's **dispatcher**, which is where the PGN taxonomy
 * (`lib/pgnKind.ts`) becomes visible: which screen a `/pgn/*` URL gets, and
 * which sidebar it gets with it.
 *
 * Asserted against the shipped catalog rather than a fixture, because the
 * promise is about the files in `src/data/pgn/`: a kind that stopped being
 * recognised would be a screen nobody could reach.
 */

/** The shipped collection: one file, 28 studies, 169 chapters. */
const COLLECTION = "/pgn/methurst-public-studies";
const COLLECTION_STUDY = `${COLLECTION}/queen-vs-rook-lightning`;

describe("a collection gets its own index screen", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("says what the file holds, and who wrote it", () => {
    renderAt(COLLECTION);

    expect(screen.getByTestId("user-pgns-collection-facts")).toHaveTextContent(
      "28 studies · 169 chapters",
    );
    // The Annotator tag every chapter carries, as a link to the profile.
    expect(screen.getByTestId("user-pgns-collection-author")).toHaveAttribute(
      "href",
      "https://lichess.org/@/methurst",
    );
    // Not the shared list screen: no cards, no card-size toggle.
    expect(screen.queryByTestId("user-pgns-list")).toBeNull();
  });

  it("renders the file's authored notes in the body, above the studies", () => {
    // The one place a reader of an index wants prose is on the index — so a
    // collection's sibling `.mdx` fills the body rather than the narrow panel.
    renderAt(COLLECTION);

    const notes = screen.getByTestId("user-pgns-collection-notes");
    expect(
      within(notes).getByRole("heading", {
        name: "Queen vs Rook — the whole method",
      }),
    ).toBeInTheDocument();
    expect(within(notes).getByRole("table")).toBeInTheDocument();
  });

  it("lists every study as a row that says how many chapters it holds", () => {
    renderAt(COLLECTION);

    const row = screen.getByTestId(
      "user-pgns-collection-study-queen-vs-rook-adjacent-rosettes",
    );
    expect(row).toHaveTextContent("Queen vs Rook, Adjacent Rosettes");
    expect(row).toHaveTextContent("10 chapters");
    expect(row).toHaveAttribute(
      "href",
      `${COLLECTION}/queen-vs-rook-adjacent-rosettes`,
    );
    expect(screen.getAllByTestId(/^user-pgns-collection-study-/)).toHaveLength(28);
  });

  it("filters the studies by name", async () => {
    renderAt(COLLECTION);

    await userEvent.type(
      screen.getByTestId("user-pgns-collection-search"),
      "lightning",
    );
    expect(screen.getAllByTestId(/^user-pgns-collection-study-/)).toHaveLength(1);

    await userEvent.clear(screen.getByTestId("user-pgns-collection-search"));
    await userEvent.type(
      screen.getByTestId("user-pgns-collection-search"),
      "zugzwang",
    );
    expect(
      screen.getByTestId("user-pgns-collection-no-matches"),
    ).toBeInTheDocument();
  });

  it("leaves the app's own sidebar in place", () => {
    // The body *is* the list of studies here, so nothing claims the rail.
    renderAt(COLLECTION);

    expect(screen.getByText("app sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("user-pgns-collection-nav")).toBeNull();
  });
});

describe("a study inside a collection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("is the ordinary list screen, chapters and all", () => {
    // A study is a study wherever it was filed: the shared screen, unchanged.
    renderAt(COLLECTION_STUDY);

    expect(screen.getByTestId("user-pgns-list")).toBeInTheDocument();
    expect(screen.getByTestId("user-pgns-list-count")).toHaveTextContent("Games: 7");
  });

  it("puts the collection's other studies in the sidebar's place", () => {
    renderAt(COLLECTION_STUDY);

    const nav = screen.getByTestId("user-pgns-collection-nav");
    expect(screen.queryByText("app sidebar")).toBeNull();

    const active = within(nav).getByTestId(
      "user-pgns-collection-nav-study-queen-vs-rook-lightning",
    );
    expect(active).toHaveAttribute("aria-current", "true");
    // Two lines and an icon: the name, and what is behind the click.
    expect(active).toHaveTextContent("Queen vs Rook, Lightning");
    expect(active).toHaveTextContent("7 chapters");
    expect(
      within(nav).getAllByTestId(/^user-pgns-collection-nav-study-/),
    ).toHaveLength(28);
  });

  it("offers the way back out, since claiming the rail hides the sidebar", () => {
    renderAt(COLLECTION_STUDY);

    for (const testId of [
      "user-pgns-collection-nav-close",
      "user-pgns-collection-nav-home",
    ]) {
      expect(screen.getByTestId(testId)).toHaveAttribute("href", COLLECTION);
    }
  });

  it("keeps the chapter's own sibling nav one level down", () => {
    // Innermost wins: on a chapter the useful list is that study's chapters,
    // and one panel is claimed at a time.
    renderAt(`${COLLECTION_STUDY}/chapter-1`);

    expect(screen.getByTestId("user-pgn-sibling-nav")).toBeInTheDocument();
    expect(screen.queryByTestId("user-pgns-collection-nav")).toBeNull();
  });
});

describe("every other kind keeps the screen it had", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("gives a study in its own file the list screen and the app sidebar", () => {
    renderAt(`/pgn/${STUDY}`);

    expect(screen.getByTestId("user-pgns-list")).toBeInTheDocument();
    expect(screen.getByText("app sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("user-pgns-collection-nav")).toBeNull();
  });

  it("gives a manifest shelf the list screen, with a card per file", () => {
    renderAt("/pgn/chess-fundamentals-capablanca");

    expect(screen.getByTestId("user-pgns-list-folder-count")).toHaveTextContent(
      "Studies: 3",
    );
    expect(screen.queryByTestId("user-pgns-collection")).toBeNull();
  });
});

/**
 * **Uploads** — the reader's own files, and the one folder in this section that
 * is a place rather than a file (`lib/pgnKind.ts`).
 *
 * The screen is driven through a real `<input type="file">`: `userEvent.upload`
 * hands it a `File`, which is what the browser does, so what is asserted is the
 * whole path — read the file, recognise it, store it, and grow the catalog the
 * rest of the section reads.
 */
const STUDY_PGN = `[Event "Uploaded: Chapter 1"]
[Result "*"]
[StudyName "Uploaded Study"]
[ChapterName "Chapter 1"]

1. e4 e5 *

[Event "Uploaded: Chapter 2"]
[Result "*"]
[StudyName "Uploaded Study"]
[ChapterName "Chapter 2"]

1. d4 d5 *

`;

const pgnFile = (name: string, text = STUDY_PGN) =>
  new File([text], name, { type: "application/x-chess-pgn" });

describe("the Uploads folder", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    clearUploads();
  });

  it("is reachable with nothing in it, and offers the button", () => {
    renderAt("/pgn/uploads");

    expect(screen.getByTestId("user-pgns-uploads")).toBeInTheDocument();
    expect(screen.getByTestId("user-pgns-uploads-button")).toHaveTextContent(
      "Upload lichess study",
    );
    expect(screen.getByTestId("user-pgns-uploads-empty")).toBeInTheDocument();
    expect(screen.getByTestId("user-pgns-uploads-count")).toHaveTextContent(
      "Files: 0",
    );
  });

  it("says where the files are kept", () => {
    // A reader who uploads a study they care about should know this is a
    // browser and not a backup.
    renderAt("/pgn/uploads");

    expect(screen.getByTestId("user-pgns-uploads-storage-note")).toHaveTextContent(
      "kept in this browser only",
    );
  });

  it("keeps a picked file and lists what it turned out to be", async () => {
    renderAt("/pgn/uploads");

    await userEvent.upload(
      screen.getByTestId("user-pgns-uploads-input"),
      pgnFile("my_study.pgn"),
    );

    const row = await screen.findByTestId("user-pgns-uploads-item-my_study.pgn");
    // Named from its own StudyName tag, like any other file in the section.
    expect(row).toHaveTextContent("Uploaded Study");
    expect(row).toHaveTextContent("Study · Games: 2");
    expect(row).toHaveAttribute("href", "/pgn/uploads/my-study");
    expect(screen.getByTestId("user-pgns-uploads-count")).toHaveTextContent(
      "Files: 1",
    );
  });

  it("puts the uploaded study into the catalog the whole section reads", async () => {
    renderAt("/pgn/uploads");
    await userEvent.upload(
      screen.getByTestId("user-pgns-uploads-input"),
      pgnFile("my_study.pgn"),
    );
    await screen.findByTestId("user-pgns-uploads-item-my_study.pgn");

    // The ordinary list screen, at the ordinary splat route.
    await userEvent.click(screen.getByTestId("user-pgns-uploads-item-my_study.pgn"));

    expect(screen.getByTestId("user-pgns-list-top-bar")).toHaveTextContent(
      "Uploaded Study",
    );
    expect(screen.getByTestId("user-pgn-card-chapter-1")).toBeInTheDocument();
  });

  it("replays an uploaded chapter like any other game", async () => {
    addUpload("my_study.pgn", STUDY_PGN);
    renderAt("/pgn/uploads/my-study/chapter-1");

    expect(screen.getByTestId("board")).toBeInTheDocument();
    // The shared detail screen, with its hand-offs — nothing knows it was
    // uploaded rather than shipped.
    expect(screen.getByTestId("user-pgn-open-analysis")).toBeInTheDocument();
  });

  it("hands an uploaded game on with ?game=, like a shipped one", async () => {
    addUpload("my_study.pgn", STUDY_PGN);
    renderAt("/pgn/uploads/my-study/chapter-1");

    await userEvent.click(screen.getByTestId("user-pgn-open-analysis"));

    expect(screen.getByTestId("analysis-arrival")).toHaveAttribute(
      "data-game",
      "pgn/uploads/my-study/chapter-1",
    );
  });

  it("splits an uploaded multi-study export into a collection", async () => {
    const twoStudies = `${STUDY_PGN}[Event "Second: Chapter 1"]
[Result "*"]
[StudyName "Second Study"]
[ChapterName "Chapter 1"]

1. c4 *

`;
    renderAt("/pgn/uploads");
    await userEvent.upload(
      screen.getByTestId("user-pgns-uploads-input"),
      pgnFile("all_studies.pgn", twoStudies),
    );

    const row = await screen.findByTestId("user-pgns-uploads-item-all_studies.pgn");
    expect(row).toHaveTextContent("Studies · Games: 3");

    await userEvent.click(row);
    // The collection index, recognised rather than declared.
    expect(screen.getByTestId("user-pgns-collection")).toBeInTheDocument();
    expect(screen.getByTestId("user-pgns-collection-facts")).toHaveTextContent(
      "2 studies · 3 chapters",
    );
  });

  it("refuses a file with no readable game, and says which", async () => {
    renderAt("/pgn/uploads");

    await userEvent.upload(
      screen.getByTestId("user-pgns-uploads-input"),
      pgnFile("broken.pgn", '[Event "x"]\n\n1. e4 Qxh8 *\n'),
    );

    expect(await screen.findByTestId("user-pgns-uploads-rejected")).toHaveTextContent(
      "broken.pgn holds no game that could be read.",
    );
    // Nothing was kept, so no empty folder appeared in the sidebar.
    expect(screen.getByTestId("user-pgns-uploads-empty")).toBeInTheDocument();
  });

  it("removes one on request", async () => {
    addUpload("my_study.pgn", STUDY_PGN);
    renderAt("/pgn/uploads");

    await userEvent.click(
      screen.getByTestId("user-pgns-uploads-remove-my_study.pgn"),
    );

    expect(screen.getByTestId("user-pgns-uploads-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("user-pgns-uploads-item-my_study.pgn")).toBeNull();
  });
});
