import { PGN_REFERENCE_KEY } from "../../lib/gameReference";
import { userPgnsLibrary } from "../../lib/pgnCatalog";
import type { LibraryCatalog } from "../../lib/libraryCatalog";
import type { FolderNotes } from "./folderNotes";
import { pgnFolderNotes } from "./pgnFolderNotes";

/**
 * What a **library section** is, as a value.
 *
 * `LibraryList` and `LibraryDetail` render any library; a section descriptor is
 * everything that tells one from another — where its routes live, which catalog
 * it reads, which locale block its chrome comes out of, and what its test ids
 * are called. User PGNs is one of these and nothing more, which is what would
 * make another section a data file plus a descriptor rather than a second pair
 * of screens.
 *
 * The test ids are part of the descriptor rather than derived, so a section can
 * name them whatever its tests already expect rather than having them imposed.
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
  /** Route base, no trailing slash — `"/pgn"`. */
  routeBase: string;
  /** The catalog behind it. */
  catalog: LibraryCatalog;
  /**
   * The locale block holding this section's chrome — `t(`${chromeKey}.list.empty`)`.
   * Every section carries the same key shape; only the strings differ.
   */
  chromeKey: string;
  /** `data-testid` base for the list screen. */
  listTestId: string;
  /** `data-testid` base for one item, on the cards and on the detail page. */
  itemTestId: string;
  /**
   * The key this section's games are addressed by in a `?game=` reference
   * (`lib/gameReference.ts`). Only a section that holds games has one — a
   * section of positions would leave it unset, and its detail pages would then
   * offer the `?fen=` hand-offs alone.
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
   * lookup is what would tell two sections apart: User PGNs resolves it from
   * `.mdx` files beside its `.pgn` files, and a section of positions could
   * carry notes — from anywhere — by filling this in and nothing else.
   */
  folderNotes?: FolderNotes;
};

/**
 * Where "back to the library" goes: the first root category's route. Read off
 * the catalog rather than configured, so it cannot come to name a category the
 * data no longer has.
 */
export const sectionHome = (section: LibrarySection): string => {
  const first = section.catalog.categories[0];
  return first === undefined ? section.routeBase : `${section.routeBase}/${first.path}`;
};

/**
 * The User PGNs section: one folder per `.pgn` file the project ships, one item
 * per game inside it. The one section whose items are **games**, which is why
 * it is also the one with a `gameReferenceKey`.
 */
export const userPgnsSection: LibrarySection = {
  routeBase: "/pgn",
  /*
    A getter: this library is the shipped `.pgn` files **plus whatever the
    reader has uploaded**, and an upload happens while the app is running.
    `userPgnsLibrary()` is memoised on the stored uploads, so reading it per
    render costs a string comparison; what re-*renders* on a change is whoever
    subscribed (`views/pgn/useUploads.ts`). A section over build-time constant
    data could keep its catalog a plain field.
  */
  get catalog() {
    return userPgnsLibrary();
  },
  chromeKey: "userPgns",
  listTestId: "user-pgns-list",
  itemTestId: "user-pgn",
  gameReferenceKey: PGN_REFERENCE_KEY,
  folderNotes: pgnFolderNotes,
};
