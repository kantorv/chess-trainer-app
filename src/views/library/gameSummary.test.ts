import { describe, expect, it } from "vitest";

import { parsePgnGame } from "../../lib/pgn";
import { gameSummaryOf } from "./gameSummary";

/**
 * The two rules a card footer lives or dies by: never print a placeholder, and
 * never print the title back at the reader.
 */

const summaryOf = (pgn: string, title: string) =>
  gameSummaryOf(parsePgnGame(pgn), title);

const MASTER_GAME = [
  '[Event "New York"]',
  '[Site "New York, NY USA"]',
  '[Date "1924.03.23"]',
  '[Round "6"]',
  '[White "Jose Raul Capablanca"]',
  '[Black "Savielly Tartakower"]',
  '[Result "1-0"]',
  '[ECO "A40"]',
  '[Opening "Horwitz Defense"]',
  '[ChapterName "Jose Raul Capablanca - Savielly Tartakower"]',
  "",
  "1. d4 e6 2. Nf3 f5 1-0",
].join("\n");

/** A study chapter: a set-up position, a comment, and an Event that is its own name. */
const CHAPTER = [
  '[Event "Queen vs Rook, Rosettes: Chapter 1"]',
  '[Result "*"]',
  '[StudyName "Queen vs Rook, Rosettes"]',
  '[ChapterName "Chapter 1"]',
  '[FEN "8/8/3Q4/5r2/2K5/4k3/8/8 b - - 0 1"]',
  '[SetUp "1"]',
  "",
  "1... Rf4+ *",
].join("\n");

describe("gameSummaryOf reads what an annotated game knows", () => {
  const summary = summaryOf(MASTER_GAME, "Jose Raul Capablanca - Savielly Tartakower");

  it("reports the result and the length", () => {
    expect(summary.result).toBe("1-0");
    expect(summary.moves).toBe(4);
  });

  it("pairs the event with the year off the date", () => {
    expect(summary.occasion).toBe("New York, 1924");
  });

  it("reports the opening and its code", () => {
    expect(summary.opening).toBe("Horwitz Defense");
    expect(summary.eco).toBe("A40");
  });
});

describe("gameSummaryOf declines to print what would be noise", () => {
  const summary = summaryOf(CHAPTER, "Chapter 1");

  it("treats an unfinished result as absent rather than printing '*'", () => {
    expect(summary.result).toBeUndefined();
  });

  it("drops an event that only repeats the title", () => {
    /*
      A lichess study writes `Event` as "<study>: <chapter>", so for a chapter
      named "Chapter 1" the event *is* the title with a prefix. Printing it would
      fill the footer with the words already in bold above it.
    */
    expect(summary.occasion).toBeUndefined();
  });

  it("has no opening to report for a position that was set up", () => {
    expect(summary.opening).toBeUndefined();
    expect(summary.eco).toBeUndefined();
  });

  it("still knows how long the line is", () => {
    expect(summary.moves).toBe(1);
  });

  it("drops an event the title is a longer form of, too", () => {
    // The containment is checked both ways round: a title that spells out what
    // the event abbreviates is the same repetition seen from the other side.
    expect(
      summaryOf('[Event "New York"]\n\n1. e4 *', "New York 1924 round 6").occasion,
    ).toBeUndefined();
  });

  it("keeps an event that is genuinely something else", () => {
    expect(summaryOf('[Event "New York"]\n\n1. e4 *', "Capablanca - Tartakower").occasion).toBe(
      "New York",
    );
  });

  it("drops a date that is not a year", () => {
    // `????.??.??` is the spec's placeholder, and `gameTag` reports it absent —
    // but a partial date like "1924.??.??" still has a usable year.
    expect(
      summaryOf('[Event "Milan"]\n[Date "????.??.??"]\n\n1. e4 *', "x").occasion,
    ).toBe("Milan");
    expect(
      summaryOf('[Event "Milan"]\n[Date "1975.??.??"]\n\n1. e4 *', "x").occasion,
    ).toBe("Milan, 1975");
  });
});
