import { PGN_REFERENCE_KEY } from "../../lib/gameReference";
import { matesCatalog } from "../../lib/matesCatalog";
import { pgnCatalog } from "../../lib/pgnCatalog";
import { positionsCatalog } from "../../lib/positionsCatalog";
import type { LibraryCatalog } from "../../lib/libraryCatalog";
import type { FolderNotes } from "./folderNotes";
import { pgnFolderNotes } from "./pgnFolderNotes";

/**
 * What a **library section** is, as a value.
 *
 * `LibraryList` and `LibraryDetail` render any library; a section descriptor is
 * everything that tells one from another — where its routes live, which catalog
 * it reads, which locale block its chrome comes out of, and what its test ids
 * are called. Mates and Positions are each one of these and nothing more, which
 * is what makes a third section a data file plus a descriptor rather than a
 * third pair of screens.
 *
 * The test ids are part of the descriptor rather than derived, because the
 * Mates section's were written before the shared layer existed and its tests
 * name them: `mates-list`, `mate-card-<id>`, `mate-open-analysis`. Keeping them
 * verbatim is what let the refactor leave the shipped section's tests alone.
 *
 * **Two ids, not two per widget.** A screen that grows a control derives its id
 * from the base it already has — the list screen's top bar, search box, card-size
 * buttons and grid are `${listTestId}-top-bar`, `-search`, `-card-size-<size>`
 * and `-grid` — rather than adding a field here. A descriptor field is for a
 * name that could not have been derived, which is what `listTestId` and
 * `itemTestId` are; three fields per new control would make a shared screen
 * expensive to add anything to, and each section would have to be edited to say
 * something no section actually differs on.
 */
export type LibrarySection = {
  /** Route base, no trailing slash — `"/mates"`, `"/positions"`. */
  routeBase: string;
  /** The catalog behind it. */
  catalog: LibraryCatalog;
  /**
   * The locale block holding this section's chrome — `t(`${chromeKey}.list.empty`)`.
   * Both sections carry the same key shape; only the strings differ.
   */
  chromeKey: string;
  /** `data-testid` base for the list screen. */
  listTestId: string;
  /** `data-testid` base for one item, on the cards and on the detail page. */
  itemTestId: string;
  /**
   * The key this section's games are addressed by in a `?game=` reference
   * (`lib/gameReference.ts`). Only a section that holds games has one — the two
   * position libraries leave it unset, and their detail pages therefore offer
   * the `?fen=` hand-offs alone.
   */
  gameReferenceKey?: string;
  /**
   * This section's authored folder notes, keyed by category path
   * ([`folderNotes.ts`](./folderNotes.ts)). A folder with an entry here shows it
   * in the right-hand panel of its list screen in place of the static hint; a
   * folder without one, and a section that leaves this unset entirely, keep the
   * hint exactly as before.
   *
   * It is a field rather than something `LibraryList` looks up, because the
   * lookup is what tells the sections apart: User PGNs resolves it from `.mdx`
   * files beside its `.pgn` files, and Mates and Positions could carry notes
   * later — from anywhere — by filling this in and nothing else.
   */
  folderNotes?: FolderNotes;
};

/**
 * Where "back to the library" goes: the first root category's route. Read off
 * the catalog rather than configured, so it cannot come to name a category the
 * data no longer has — and it is `/mates/basic` for Mates, which is what that
 * section's `notFound.back` string has always said.
 */
export const sectionHome = (section: LibrarySection): string => {
  const first = section.catalog.categories[0];
  return first === undefined ? section.routeBase : `${section.routeBase}/${first.path}`;
};

/** The Mates section: three categories, labelled from `src/locales`. */
export const matesSection: LibrarySection = {
  routeBase: "/mates",
  catalog: matesCatalog,
  chromeKey: "mates",
  listTestId: "mates-list",
  itemTestId: "mate",
};

/** The endgame Positions section: categories nested to any depth, labelled from the data. */
export const positionsSection: LibrarySection = {
  routeBase: "/positions",
  catalog: positionsCatalog,
  chromeKey: "positions",
  listTestId: "positions-list",
  itemTestId: "position",
};

/**
 * The User PGNs section: one folder per `.pgn` file the project ships, one item
 * per game inside it. The first section whose items are **games**, which is why
 * it is also the first with a `gameReferenceKey`.
 */
export const userPgnsSection: LibrarySection = {
  routeBase: "/pgn",
  catalog: pgnCatalog,
  chromeKey: "userPgns",
  listTestId: "user-pgns-list",
  itemTestId: "user-pgn",
  gameReferenceKey: PGN_REFERENCE_KEY,
  folderNotes: pgnFolderNotes,
};
