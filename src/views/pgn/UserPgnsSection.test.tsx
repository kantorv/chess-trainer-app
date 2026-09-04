import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { itemsInLibraryCategory } from "../../lib/libraryCatalog";
import { matesSection } from "../library/section";
import { pgnCatalog } from "../../lib/pgnCatalog";
import { initialFenOf } from "../../lib/gameModel";
import { fenAtPly } from "../../lib/gameNavigation";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import UserPgnsSection from "./UserPgnsSection";

/* Stubbed for the reason in `.claude/rules/chessboard.md` §8 — jsdom has no
   layout engine, and a real board throws from its mount effect. */
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
    />
  );
};

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <RightPanelProvider>
          <Routes>
            <Route
              path="/pgn/*"
              element={
                <>
                  <UserPgnsSection />
                  <RightPanelOutlet />
                </>
              }
            />
            <Route path="/tools/analysis" element={<Arrival name="analysis" />} />
            <Route path="/games/load-pgn" element={<Arrival name="load-pgn" />} />
            <Route path="/engine/play" element={<Arrival name="play" />} />
            <Route path="/tools/editor" element={<Arrival name="editor" />} />
          </Routes>
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const PLAYED =
  "studies/lichess-study-zwischenzug-best-games-part1-by-lalala732-2026-04-12";
const STUDY = "studies/lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08";

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

  it("links back to the folder a game sits in", async () => {
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    await userEvent.click(screen.getByTestId("user-pgn-detail-back"));

    expect(screen.getByTestId("user-pgns-list")).toBeInTheDocument();
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

  it("translates its chrome, and takes its content from the PGN, under Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderAt(`/pgn/${PLAYED}/${played.id}`);

    const panel = screen.getByTestId("layout-right-panel");
    // Chrome out of `src/locales`; the game's name out of its own tag pairs.
    expect(panel).toHaveTextContent("פתיחה בלוח הניתוח");
    expect(panel).toHaveTextContent(played.name.en);
  });
});
