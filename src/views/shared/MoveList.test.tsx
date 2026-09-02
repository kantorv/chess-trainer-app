import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { parsePgnGames } from "../../lib/pgn";
import type { Game } from "../../lib/gameModel";
import MoveList from "./MoveList";

/*
  The move list is a panel, not a board — nothing here mounts `<Chessboard>`,
  which is the point of taking the game as a prop.
*/

const game: Game = parsePgnGames(
  [`[White "Alice"]`, `[Black "Bob"]`, "", "1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0"].join(
    "\n",
  ),
)[0];

const renderList = (currentPly: number, onSelectPly = vi.fn()) => {
  render(
    <AppThemeWithLang>
      <MoveList game={game} currentPly={currentPly} onSelectPly={onSelectPly} />
    </AppThemeWithLang>,
  );
  return onSelectPly;
};

const cell = (ply: number) => screen.getByTestId(`move-ply-${ply}`);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the move list", () => {
  it("renders the moves as numbered pairs, not one row per ply", () => {
    renderList(0);

    // Three numbered rows for five half-moves.
    expect(screen.getByTestId("move-number-1")).toHaveTextContent("1.");
    expect(screen.getByTestId("move-number-3")).toHaveTextContent("3.");
    expect(screen.queryByTestId("move-number-4")).not.toBeInTheDocument();

    expect(cell(1)).toHaveTextContent("e4");
    expect(cell(2)).toHaveTextContent("e5");
    expect(cell(5)).toHaveTextContent("Bb5");
  });

  it("makes the starting position a selectable entry of its own", async () => {
    const onSelectPly = renderList(3);
    expect(cell(0)).toHaveTextContent(i18n.t("moveList.startPosition"));

    await userEvent.click(cell(0));
    expect(onSelectPly).toHaveBeenCalledWith(0);
  });

  it("highlights the current ply, and only that one", () => {
    renderList(3);

    expect(cell(3)).toHaveAttribute("aria-current", "true");
    expect(cell(0)).not.toHaveAttribute("aria-current");
    expect(cell(2)).not.toHaveAttribute("aria-current");
    expect(
      within(screen.getByTestId("move-list")).getAllByRole("button", {
        current: true,
      }),
    ).toHaveLength(1);
  });

  it("highlights ply 0 when the starting position is selected", () => {
    renderList(0);
    expect(cell(0)).toHaveAttribute("aria-current", "true");
    expect(cell(1)).not.toHaveAttribute("aria-current");
  });

  it("reports the clicked move's ply", async () => {
    const onSelectPly = renderList(0);

    await userEvent.click(cell(4));
    expect(onSelectPly).toHaveBeenCalledWith(4);

    await userEvent.click(cell(1));
    expect(onSelectPly).toHaveBeenLastCalledWith(1);
  });

  it("says so for a game with no moves", () => {
    render(
      <AppThemeWithLang>
        <MoveList
          game={{ headers: {}, moves: [] }}
          currentPly={0}
          onSelectPly={vi.fn()}
        />
      </AppThemeWithLang>,
    );

    expect(screen.getByTestId("move-list")).toHaveTextContent(
      i18n.t("moveList.noMoves"),
    );
    // Ply 0 stays reachable even with nothing to step through.
    expect(cell(0)).toHaveAttribute("aria-current", "true");
  });

  it("keeps SAN tokens left-to-right under Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderList(0);

    // The direction is an attribute, not CSS: the RTL emotion cache flips a
    // `direction: ltr` declaration, and would turn this into the bug it guards.
    expect(cell(1)).toHaveAttribute("dir", "ltr");
    expect(screen.getByTestId("move-number-1")).toHaveAttribute("dir", "ltr");
    // The panel's own chrome is translated — it is not pinned to English.
    expect(cell(0)).toHaveTextContent(i18n.t("moveList.startPosition"));
  });

  it("indents with a logical property, so it follows the direction", () => {
    renderList(0);

    /*
      jsdom resolves no logical properties through `getComputedStyle`, so read
      what emotion actually inserted instead. `padding-left` would sit on the
      wrong side of the mirrored panel; `padding-inline-start` follows it.
    */
    const inserted = Array.from(document.querySelectorAll("style"))
      .map((tag) => tag.textContent ?? "")
      .join("");

    expect(inserted).toContain("padding-inline-start");
  });
});
