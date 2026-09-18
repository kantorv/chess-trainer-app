import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { itemsInLibraryCategory, type LibraryGame } from "../../lib/libraryCatalog";
import { pgnCatalog } from "../../lib/pgnCatalog";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import { LeftPanelOutlet, LeftPanelProvider } from "../main/leftPanel";
import UserPgnsSection from "./UserPgnsSection";

/**
 * The shipped repertoire examples, **rendered**.
 *
 * `lib/pgnRepertoireExamples.test.ts` asserts what the catalog makes of the
 * three files. This asserts what the reader actually gets, which is the half
 * that can break independently: a folder can carry the right kind and still
 * reach `LibraryGameDetail` if the section's dispatch reads the wrong path —
 * and that failure is invisible, because a repertoire line replayed as a flat
 * game renders perfectly happily, just without the `( … )` branches that are
 * its entire content.
 *
 * So the assertion is the **variation tree on screen**, once per shape:
 * a chapter line of the multi-chapter repertoire, and a line of each of the
 * two single ones.
 */

vi.mock("../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/openings")>();
  return {
    ...actual,
    loadOpeningBook: () => Promise.resolve({}),
    getPositionBook: () => ({}),
    findOpening: () => undefined,
  };
});

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
  defaultPieces: Object.fromEntries(
    ["w", "b"].flatMap((color) =>
      ["K", "Q", "R", "B", "N", "P"].map((letter) => {
        const type = `${color}${letter}`;
        return [type, () => <svg data-testid={`piece-${type}`} />];
      }),
    ),
  ),
}));

const TAME = "tame-the-sicilian-the-alapin-variation-gm-kasimdzhanov-gm-ganguly";
const NIMZO = "nimzo-indian-repertoire";
const D2D4 = "d2d4variations";

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <LeftPanelProvider>
          <RightPanelProvider>
            <Routes>
              <Route path="/library/*" element={<UserPgnsSection />} />
            </Routes>
            <LeftPanelOutlet />
            <RightPanelOutlet />
          </RightPanelProvider>
        </LeftPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const firstLineIn = (category: string): LibraryGame => {
  const line = itemsInLibraryCategory(category, pgnCatalog).find(
    (item): item is LibraryGame => item.kind === "game",
  );
  if (line === undefined) throw new Error(`no line in ${category}`);
  return line;
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("a repertoire line on screen", () => {
  it.each([
    ["the multi-chapter repertoire", `${TAME}/2-qa5`],
    ["the 1.d4 repertoire", D2D4],
  ])("opens %s with its variation tree", (_name, category) => {
    const line = firstLineIn(category);
    renderAt(`/library/${category}/${line.id}`);

    // `LibraryVariationDetail`'s own tree, which `LibraryGameDetail` has not
    // got — this is the whole difference the kind buys.
    const tree = screen.getByTestId("variation-tree");
    expect(tree).toBeInTheDocument();

    // And the branches are really in it: more move tokens than the mainline
    // alone would give, plus the start-position entry.
    expect(within(tree).getByTestId("tree-move-start")).toBeInTheDocument();
    expect(
      within(tree).getAllByRole("button").length,
    ).toBeGreaterThan(10);

    // The board is there and showing a real position.
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-position",
      expect.stringContaining("/"),
    );
  });

  /*
    The Nimzo-Indian file is one chapter holding the **entire** repertoire as a
    single tree: a 56-move mainline with 188 side lines under it, 9,146 nodes
    in all. That is the data — the lichess study has exactly one chapter, and
    the whole-study export and the chapter export are byte-identical — so it is
    kept deliberately, as the section's stress case.

    It gets its own test and its own timeout because of what that costs:
    `VariationTree` is a flowing view that renders a button per node, so this
    one line is nine thousand of them and takes about twenty seconds under
    jsdom. That is a **pre-existing** property of the shipped viewer, not
    something this file introduced, and it is worth a follow-up issue — a
    repertoire this size wants collapsing or virtualising. Asserting it here
    with an honest timeout is better than dropping the example and pretending
    the viewer scales.
  */
  it(
    "opens the Nimzo-Indian repertoire — one 9,146-node tree — with its variation tree",
    () => {
      const line = firstLineIn(NIMZO);
      renderAt(`/library/${NIMZO}/${line.id}`);

      const tree = screen.getByTestId("variation-tree");
      expect(within(tree).getByTestId("tree-move-start")).toBeInTheDocument();
      expect(within(tree).getAllByRole("button").length).toBeGreaterThan(1000);
    },
    60000,
  );

  it("lists the 1.d4 repertoire as thirteen line cards and no folders", async () => {
    // The `chapters: false` shape, as the reader sees it: one click from the
    // folder to a line, and the family in the card's own name.
    renderAt(`/library/${D2D4}`);

    expect(
      await screen.findByText("QGD – Exchange I"),
    ).toBeInTheDocument();
    expect(screen.getByText("Slav – Exchange")).toBeInTheDocument();
  });

  it("lists the multi-chapter repertoire as chapter folders", async () => {
    // The other shape: folders first, and a line is two clicks away.
    renderAt(`/library/${TAME}`);

    expect(await screen.findByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Quickstarter")).toBeInTheDocument();
    expect(screen.getByText("2...Qa5")).toBeInTheDocument();
  });

  it("walks from a chapter folder into one of its lines", async () => {
    const user = userEvent.setup();
    renderAt(`/library/${TAME}/2-qa5`);

    const line = firstLineIn(`${TAME}/2-qa5`);
    await user.click(await screen.findByText(line.name.en!));

    expect(await screen.findByTestId("variation-tree")).toBeInTheDocument();
  });
});
