import { matesCatalog } from "../../lib/matesCatalog";
import { positionsCatalog } from "../../lib/positionsCatalog";
import type { LibraryCatalog } from "../../lib/libraryCatalog";

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
  /** `data-testid` base for one position, on the cards and on the detail page. */
  itemTestId: string;
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
