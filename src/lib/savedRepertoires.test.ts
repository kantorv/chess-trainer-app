import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";

import { countVariations } from "./gameTree";
import { parsePgnTree } from "./pgn";
import { MAX_UPLOAD_CHARS } from "./pgnUploads";
import {
  checkRepertoirePgn,
  repertoireLineTree,
  repertoireLinesOf,
  repertoireNameOf,
  repertoireTrunkFen,
  savedRepertoireFrom,
  savedRepertoireOf,
  savedRepertoireSummary,
} from "./savedRepertoires";

/** The three shipped repertoires — the examples the issue names. */
const files = import.meta.glob<string>("../data/pgn/*.pgn", {
  query: "?raw",
  import: "default",
  eager: true,
});
const shipped = (name: string) => {
  const text = files[`../data/pgn/${name}`];
  if (text === undefined) throw new Error(`no shipped file ${name}`);
  return text;
};
const ALAPIN = shipped(
  "Tame_the_Sicilian_The_Alapin_Variation_GM_Kasimdzhanov__&_GM_Ganguly.pgn",
);
const NIMZO = shipped("nimzo-indian-repertoire.pgn");
const D4 = shipped("d2d4Variations.pgn");

const TWO_LINES = [
  '[Event "My Caro"]',
  '[White "1) Advance"]',
  '[Black "3...Bf5"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) *",
  "",
  '[Event "My Caro"]',
  '[White "2) Exchange"]',
  '[Black "3...cxd5"]',
  "",
  "1. e4 c6 2. d4 d5 3. exd5 cxd5 *",
].join("\n");

const NOW = new Date("2026-09-18T10:00:00.000Z");

describe("checking a repertoire on the way in", () => {
  it("refuses an empty text and one over the uploads' ceiling", () => {
    expect(checkRepertoirePgn("  \n ")).toEqual({ ok: false, problem: "empty" });
    expect(checkRepertoirePgn("x".repeat(MAX_UPLOAD_CHARS + 1))).toEqual({
      ok: false,
      problem: "too-large",
    });
  });

  it("refuses a text none of whose lines will read, with the first reason", () => {
    const check = checkRepertoirePgn('[Event "x"]\n\n1. e4 Ke5 *');
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.problem).toBe("unreadable");
      expect(check.detail).toMatch(/Ke5/);
    }
  });

  it("keeps a repertoire with one broken line among good ones, and counts it", () => {
    const check = checkRepertoirePgn(
      `${TWO_LINES}\n\n[Event "My Caro"]\n[White "3) Broken"]\n\n1. e4 Kxe8 *`,
    );
    expect(check).toMatchObject({ ok: true, lines: 3, broken: 1 });
  });

  it("previews the position where the lines first branch", () => {
    const check = checkRepertoirePgn(TWO_LINES);
    expect(check.ok).toBe(true);
    if (check.ok) {
      // 1.e4 c6 2.d4 d5 is common to both; 3.e5 / 3.exd5 is the branch.
      expect(check.previewFen).toBe(
        "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
      );
      expect(check.name).toBe("My Caro");
    }
  });

  it("previews the start when the lines disagree from move one", () => {
    const trees = [parsePgnTree("1. e4 *"), parsePgnTree("1. d4 *")];
    expect(repertoireTrunkFen(trees)).toBe(DEFAULT_POSITION);
    expect(repertoireTrunkFen([])).toBe(DEFAULT_POSITION);
  });
});

describe("a file and a paste are one record", () => {
  it("builds the identical record from CRLF file text and the textarea's LF text", () => {
    const fileText = `\r\n${TWO_LINES.replace(/\n/g, "\r\n")}\r\n\r\n`;
    const pastedText = TWO_LINES;

    const fromFile = checkRepertoirePgn(fileText);
    const fromPaste = checkRepertoirePgn(pastedText);
    expect(fromFile).toEqual(fromPaste);
    if (!fromFile.ok) throw new Error("expected the file to read");

    expect(savedRepertoireOf("r1", fileText, "", fromFile.previewFen, NOW)).toEqual(
      savedRepertoireOf("r1", pastedText, "", fromFile.previewFen, NOW),
    );
  });

  it("is named by the reader, or else by its own tags, or else not at all", () => {
    expect(savedRepertoireOf("r", TWO_LINES, "  Mine ", DEFAULT_POSITION, NOW).name).toBe(
      "Mine",
    );
    expect(savedRepertoireOf("r", TWO_LINES, "", DEFAULT_POSITION, NOW).name).toBe(
      "My Caro",
    );
    expect(savedRepertoireOf("r", "1. e4 *", "", DEFAULT_POSITION, NOW).name).toBe("");
    expect(savedRepertoireOf("r", TWO_LINES, "", DEFAULT_POSITION, NOW).folderId).toBeNull();
  });

  it("names a lichess study by its StudyName, not its chapter-suffixed Event", () => {
    expect(repertoireNameOf(NIMZO)).toBe(
      "Complete Nimzo-Indian Repertoire for Black by @hpy",
    );
    expect(repertoireNameOf(ALAPIN)).toBeUndefined();
  });
});

describe("reading the lines back", () => {
  it("splits a Chessable-style file into its N) chapters, in chapter order", () => {
    const chapters = repertoireLinesOf(ALAPIN);
    expect(chapters.reduce((n, chapter) => n + chapter.lines.length, 0)).toBe(310);
    expect(chapters.length).toBeGreaterThanOrEqual(29);
    // Unnumbered chapters first, then "1) 2...Qa5" ahead of "10) 2...b6".
    const labels = chapters.map((chapter) => chapter.label);
    expect(labels[0]).toBe("Introduction");
    expect(labels.indexOf("2...Qa5")).toBeLessThan(labels.indexOf("2...b6"));
  });

  it("keeps a flat file flat, naming each line by its two tags", () => {
    const chapters = repertoireLinesOf(D4);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].label).toBeUndefined();
    expect(chapters[0].lines).toHaveLength(13);
    expect(chapters[0].lines[0].name).toBe("QGD – Exchange I");
  });

  it("summarises a record without parsing a move", () => {
    const record = savedRepertoireOf("r", ALAPIN, "Alapin", DEFAULT_POSITION, NOW);
    const summary = savedRepertoireSummary(record);
    expect(summary.lines).toBe(310);
    expect(summary.chapters).toBeGreaterThanOrEqual(29);
    expect(savedRepertoireSummary(savedRepertoireOf("r", D4, "", DEFAULT_POSITION, NOW))).toEqual(
      { lines: 13, chapters: 0 },
    );
  });

  it("parses a picked line with its side lines intact", () => {
    const [chapter] = repertoireLinesOf(TWO_LINES).slice(0, 1);
    const tree = repertoireLineTree(chapter.lines[0]);
    expect(tree).toBeDefined();
    expect(countVariations(tree!)).toBe(1);
  });

  it("reads the one-tree Nimzo-Indian example as a single line of 9,146 nodes", () => {
    const [chapter] = repertoireLinesOf(NIMZO);
    expect(chapter.lines).toHaveLength(1);
    // No wall-clock bound: a loaded suite run makes one flaky. For the record,
    // this was ~4.5s before `parsePgnTree` built the tree in place, ~1s after.
    const tree = repertoireLineTree(chapter.lines[0]);
    expect(tree?.nextId).toBe(9147);
  });
});

describe("a stored row", () => {
  it("round-trips, and fills in what an older or hand-edited row lacks", () => {
    const record = savedRepertoireOf("r", TWO_LINES, "", DEFAULT_POSITION, NOW);
    expect(savedRepertoireFrom(JSON.parse(JSON.stringify(record)))).toEqual(record);

    expect(
      savedRepertoireFrom({
        id: "r",
        pgn: "1. e4 *",
        savedAt: "x",
        updatedAt: "x",
        folderId: 7,
      }),
    ).toEqual({
      id: "r",
      name: "",
      pgn: "1. e4 *",
      previewFen: DEFAULT_POSITION,
      folderId: null,
      savedAt: "x",
      updatedAt: "x",
    });
  });

  it("drops a row with no id or no text", () => {
    expect(savedRepertoireFrom(null)).toBeUndefined();
    expect(savedRepertoireFrom({ id: "", pgn: "1. e4", savedAt: "", updatedAt: "" })).toBeUndefined();
    expect(savedRepertoireFrom({ id: "r", pgn: "", savedAt: "", updatedAt: "" })).toBeUndefined();
  });
});
