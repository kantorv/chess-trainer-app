import { describe, expect, it } from "vitest";

import { findLibraryCategory } from "../../lib/libraryCatalog";
import { loadPgnLibrary } from "../../lib/pgnLibrary";
import { authorOf, collectionSummaryOf, looseChaptersOf } from "./collectionSummary";

/**
 * What a collection's index screen says about the file behind it — derived from
 * the games, and asserted here rather than through the screen, for the reason
 * `gameSummary.test.ts` gives: what a collection *is* is a question about data.
 */

const chapter = (study: string, name: string, annotator?: string) => `[Event "${study}: ${name}"]
[Result "*"]
[StudyName "${study}"]
[ChapterName "${name}"]
${annotator === undefined ? "" : `[Annotator "${annotator}"]\n`}
1. e4 *

`;

const METHURST = "https://lichess.org/@/methurst";

const collectionOf = (text: string) => {
  const catalog = loadPgnLibrary({ "studies.pgn": text });
  const category = findLibraryCategory("studies", catalog);
  if (category === undefined) throw new Error("expected the collection");
  return { catalog, category };
};

describe("authorOf", () => {
  it("takes the handle out of a lichess profile URL, and keeps the link", () => {
    expect(authorOf(METHURST)).toEqual({ name: "methurst", url: METHURST });
    // A trailing slash is not a handle.
    expect(authorOf(`${METHURST}/`).name).toBe("methurst");
  });

  it("takes anything else as the name it is", () => {
    expect(authorOf("  J. R. Capablanca ")).toEqual({ name: "J. R. Capablanca" });
  });
});

describe("collectionSummaryOf", () => {
  it("counts the studies and every chapter under them", () => {
    const { catalog, category } = collectionOf(
      chapter("First", "Chapter 1", METHURST) +
        chapter("First", "Chapter 2", METHURST) +
        chapter("Second", "Chapter 1", METHURST),
    );

    expect(collectionSummaryOf(category, catalog)).toMatchObject({
      studies: 2,
      chapters: 3,
      author: { name: "methurst", url: METHURST },
    });
  });

  it("names no author when the chapters do not agree on one", () => {
    // A file gathering several people's studies has no single author, and the
    // first chapter's is a guess rather than a fact.
    const { catalog, category } = collectionOf(
      chapter("First", "Chapter 1", METHURST) +
        chapter("Second", "Chapter 1", "https://lichess.org/@/someone-else"),
    );

    expect(collectionSummaryOf(category, catalog).author).toBeUndefined();
  });

  it("names no author when no chapter carries the tag", () => {
    const { catalog, category } = collectionOf(
      chapter("First", "Chapter 1") + chapter("Second", "Chapter 1"),
    );

    expect(collectionSummaryOf(category, catalog).author).toBeUndefined();
  });

  it("counts a chapter that named no study, and reports it as loose", () => {
    // It sits in the collection's own folder, so the index has to list it or
    // nothing ever will.
    const { catalog, category } = collectionOf(
      chapter("First", "Chapter 1") +
        chapter("Second", "Chapter 1") +
        '[Event "Odd one out"]\n[Result "*"]\n\n1. d4 *\n',
    );

    expect(collectionSummaryOf(category, catalog)).toMatchObject({
      studies: 2,
      chapters: 3,
    });
    expect(looseChaptersOf(category, catalog).map((item) => item.name.en)).toEqual([
      "Odd one out",
    ]);
  });
});
