import { gameTag } from "../../lib/gameModel";
import {
  itemCountUnder,
  itemsInLibraryCategory,
  type LibraryCatalog,
  type LibraryCategory,
} from "../../lib/libraryCatalog";

/**
 * What an index screen can say about a **collection** — a `.pgn` file holding
 * several studies — derived from the games in it and from nothing else.
 *
 * Pure, and separate from the screen for the same reason `gameSummary.ts` is:
 * what a collection *is* is a question about data, and it is the part worth
 * asserting. `PgnCollection.tsx` keeps the layout.
 *
 * Everything here is **conditional on the data having it**, so a bare export
 * shows its counts and stops rather than printing a row of blanks — the rule a
 * card's footer already follows.
 */

/** Who wrote the studies: a display name, and the URL when the tag was one. */
export type CollectionAuthor = { name: string; url?: string };

export type CollectionSummary = {
  /** How many studies — the sub-folders of the collection. */
  studies: number;
  /** How many chapters, everything under it counted. */
  chapters: number;
  /** From the `Annotator` tag the study chapters carry, when they agree on one. */
  author?: CollectionAuthor;
};

/**
 * A lichess export writes the annotator as a profile URL
 * (`https://lichess.org/@/methurst`); the handle is the part worth showing and
 * the URL is worth keeping as a link. Anything else is taken as a plain name.
 */
export const authorOf = (annotator: string): CollectionAuthor => {
  const trimmed = annotator.trim();
  if (!/^https?:\/\//i.test(trimmed)) return { name: trimmed };

  const handle = trimmed.replace(/\/+$/, "").split("/").pop();
  return {
    name: handle === undefined || handle === "" ? trimmed : handle,
    url: trimmed,
  };
};

/**
 * Read the collection at `category` — its studies, its chapters, and its author
 * if the chapters name one.
 *
 * The author is only reported when **every** chapter that names one names the
 * same one: a file gathering several people's studies has no single author, and
 * printing the first chapter's would be a guess presented as a fact.
 */
export const collectionSummaryOf = (
  category: LibraryCategory,
  catalog: LibraryCatalog,
): CollectionSummary => {
  const chapters = catalog.items.filter(
    (item) =>
      item.category === category.path ||
      item.category.startsWith(`${category.path}/`),
  );

  const annotators = new Set<string>();
  for (const chapter of chapters) {
    if (chapter.kind !== "game") continue;
    const annotator = gameTag(chapter.game.headers, "Annotator");
    if (annotator !== undefined) annotators.add(annotator);
  }

  const [only] = [...annotators];
  return {
    studies: category.children.length,
    chapters: chapters.length,
    ...(annotators.size === 1 ? { author: authorOf(only) } : {}),
  };
};

/** How many chapters one study of a collection holds — a nav row's second line. */
export const studyChapterCount = (
  study: LibraryCategory,
  catalog: LibraryCatalog,
): number => itemCountUnder(study, catalog);

/**
 * The chapters filed directly under the collection itself — a lichess export
 * can carry a chapter with no `StudyName`, and the loader leaves it beside the
 * study folders rather than inventing one to hold it. Usually empty.
 */
export const looseChaptersOf = (
  category: LibraryCategory,
  catalog: LibraryCatalog,
) => itemsInLibraryCategory(category.path, catalog);
