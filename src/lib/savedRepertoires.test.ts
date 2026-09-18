import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";

import { addMove, countVariations, mainline, mergeTrees } from "./gameTree";
import { parsePgnTree } from "./pgn";
import { MAX_UPLOAD_CHARS } from "./pgnUploads";
import {
  isMultiGameRepertoire,
  mergedRepertoireOf,
  readRepertoireText,
  repertoireNameOf,
  repertoireTreeOf,
  repertoireTrunkFen,
  savedRepertoireFrom,
  savedRepertoireOf,
  splitFolderNameOf,
  splitRepertoiresOf,
  type RepertoireReading,
  repertoireCopyOf,
  withRepertoireTree,
} from "./savedRepertoires";

/** The three shipped repertoire files — the examples the issue names. */
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

/** One game, a mainline with a side line: a repertoire as it stands. */
const ONE = '[Event "My Caro"]\n\n1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *';

/** Two games, one line each: to merge or split. */
const TWO = [
  '[Event "My Caro"]',
  '[White "1) Advance"]',
  '[Black "3...Bf5"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 *",
  "",
  '[Event "My Caro"]',
  '[White "2) Exchange"]',
  '[Black "3...cxd5"]',
  "",
  "1. e4 c6 2. d4 d5 3. exd5 cxd5 *",
].join("\n");

const NOW = new Date("2026-09-18T10:00:00.000Z");
const AFTER_D5 = "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3";

const read = (text: string) => {
  const reading = readRepertoireText(text);
  if (!reading.ok) throw new Error(`did not read: ${reading.problem}`);
  return reading;
};

describe("reading a text on the way in", () => {
  it("refuses an empty text and one over the uploads' ceiling", () => {
    expect(readRepertoireText("  \n ")).toEqual({ ok: false, problem: "empty" });
    expect(readRepertoireText("x".repeat(MAX_UPLOAD_CHARS + 1))).toEqual({
      ok: false,
      problem: "too-large",
    });
  });

  it("refuses a text with no playable game, with the first reason", () => {
    const reading = readRepertoireText('[Event "x"]\n\n1. e4 Ke5 *');
    expect(reading).toMatchObject({ ok: false, problem: "unreadable" });
    if (!reading.ok) expect(reading.detail).toMatch(/Ke5/);
  });

  it("reads one game as a repertoire as it stands", () => {
    const reading = read(ONE);
    expect(reading.games).toHaveLength(1);
    expect(reading.mergeable).toBe(false);
    expect(reading.name).toBe("My Caro");
  });

  it("reads several games as a choice, and counts the ones it leaves out", () => {
    const reading = read(
      `${TWO}\n\n[Event "Intro"]\n\n{ Just prose. } *\n\n[Event "Broken"]\n\n1. e4 Kxe8 *`,
    );
    expect(reading.games.map((game) => game.index)).toEqual([0, 1]);
    expect(reading.skipped).toBe(2);
    expect(reading.mergeable).toBe(true);
  });

  it("does not offer a merge of games from different starts", () => {
    const reading = read(
      `${ONE}\n\n[Event "Endgame"]\n[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. Kd2 *`,
    );
    expect(reading.games).toHaveLength(2);
    expect(reading.mergeable).toBe(false);
    expect(mergedRepertoireOf("m", reading, "", NOW)).toBeUndefined();
  });

  it("names a lichess study by its StudyName, not its chapter-suffixed Event", () => {
    expect(repertoireNameOf(NIMZO)).toBe(
      "Complete Nimzo-Indian Repertoire for Black by @hpy",
    );
    expect(repertoireNameOf(ALAPIN)).toBeUndefined();
  });

  it("names each game: chapter and line for a Chessable file, the two tags otherwise", () => {
    expect(read(TWO).games.map((game) => game.name)).toEqual([
      "Advance · 3...Bf5",
      "Exchange · 3...cxd5",
    ]);
    expect(read(D4).games[0].name).toBe("QGD – Exchange I");
  });
});

describe("a file and a paste are one record", () => {
  it("reads CRLF file text and the textarea's LF text alike, into the identical record", () => {
    const fileText = `\r\n${ONE.replace(/\n/g, "\r\n")}\r\n\r\n`;
    const fromFile = read(fileText);
    const fromPaste = read(ONE);
    expect(savedRepertoireOf("r", fromFile.games[0], "", fromFile.name, NOW)).toEqual(
      savedRepertoireOf("r", fromPaste.games[0], "", fromPaste.name, NOW),
    );
  });
});

describe("one game, stored as written", () => {
  it("keeps the text, previews where it branches, and counts its size", () => {
    const reading = read(ONE);
    const record = savedRepertoireOf("r", reading.games[0], "", reading.name, NOW);
    expect(record.pgn).toBe(ONE);
    expect(record.name).toBe("My Caro");
    // 1.e4 c6 2.d4 d5 3.e5 — then 3...Bf5 or 3...c5.
    expect(record.previewFen).toBe(
      "rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
    );
    expect(record.stats).toEqual({ moves: 4, variations: 1 });
    expect(record.folderId).toBeNull();
  });

  it("is named by the reader first", () => {
    const reading = read(ONE);
    expect(savedRepertoireOf("r", reading.games[0], "  Mine ", reading.name, NOW).name).toBe(
      "Mine",
    );
  });
});

describe("a repertoire changed on its board", () => {
  /** ONE with 2. d3 added beside 2. d4 — a new side line. */
  const changed = () => {
    const tree = parsePgnTree(ONE);
    const c6 = tree.moves[0].children[0];
    return addMove(tree, c6.id, {
      san: "d3",
      from: "d2",
      to: "d3",
      fen: "rnbqkbnr/pp1ppppp/2p5/8/4P3/3P4/PPP2PPP/RNBQKBNR b KQkq - 0 2",
    }).tree;
  };

  it("takes the tree as its game, and re-reads its preview and size", () => {
    const reading = read(ONE);
    const saved = {
      ...savedRepertoireOf("r", reading.games[0], "", reading.name, NOW),
      folderId: "f",
    };
    const later = new Date("2026-09-19T10:00:00.000Z");
    const updated = withRepertoireTree(saved, changed(), later);
    expect(updated.pgn).toContain("2. d4 (2. d3)");
    expect(parsePgnTree(updated.pgn).moves[0].children[0].children).toHaveLength(2);
    expect(updated.stats).toEqual({ moves: 4, variations: 2 });
    // Branching at move two now, so the card previews the position after 1... c6.
    expect(updated.previewFen).toBe(
      "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    );
    expect(updated).toMatchObject({
      id: "r",
      name: "My Caro",
      folderId: "f",
      savedAt: saved.savedAt,
      updatedAt: later.toISOString(),
    });
  });

  it("copies into a new record, named, with the original's settings and folder", () => {
    const reading = read(ONE);
    const saved = {
      ...savedRepertoireOf("r", reading.games[0], "", reading.name, NOW),
      folderId: "f",
      settings: { description: "Mine", color: "black" as const, showArrows: false },
    };
    const later = new Date("2026-09-19T10:00:00.000Z");
    const copy = repertoireCopyOf(saved, changed(), "c", "My Caro (copy)", later);
    expect(copy).toMatchObject({
      id: "c",
      name: "My Caro (copy)",
      folderId: "f",
      settings: saved.settings,
      savedAt: later.toISOString(),
    });
    expect(copy.pgn).toContain('[Event "My Caro (copy)"]');
    expect(copy.pgn).toContain("2. d4 (2. d3)");
    // The original is a value, and is not touched.
    expect(saved.pgn).toBe(ONE);
  });
});

describe("merge", () => {
  it("folds the games into one tree, the first game's line the mainline", () => {
    const record = mergedRepertoireOf("m", read(TWO), "Caro", NOW)!;
    expect(isMultiGameRepertoire(record)).toBe(false);
    expect(record.name).toBe("Caro");

    const tree = repertoireTreeOf(record)!;
    expect(mainline(tree).map((node) => node.san)).toEqual([
      "e4", "c6", "d4", "d5", "e5", "Bf5", "Nf3",
    ]);
    // The second game leaves the first at move 3: one side line, there.
    expect(countVariations(tree)).toBe(1);
    const afterD5 = mainline(tree)[3];
    expect(afterD5.children.map((node) => node.san)).toEqual(["e5", "exd5"]);
    expect(record.previewFen).toBe(AFTER_D5);
    expect(record.pgn).toContain('[Event "Caro"]');
  });

  it("merges the Alapin example's 310 games into one tree that reads back whole", () => {
    const reading = read(ALAPIN);
    expect(reading.games).toHaveLength(310);
    expect(reading.mergeable).toBe(true);
    const record = mergedRepertoireOf("m", reading, "Alapin", NOW)!;
    const merged = mergeTrees(
      reading.games.map((game) => game.tree),
      reading.games[0].tree.startFen,
    );
    // What is stored is what the board reads: the written PGN parses back to
    // the same number of nodes the merge made.
    expect(repertoireTreeOf(record)?.nextId).toBe(merged.nextId);
    expect(record.stats?.variations).toBeGreaterThan(200);
  });
});

describe("split", () => {
  it("makes one repertoire per game, named by the game, all filed in the given folder", () => {
    let n = 0;
    const records = splitRepertoiresOf(() => `s${(n += 1)}`, read(TWO), "f1", NOW);
    expect(records.map((record) => [record.id, record.name, record.folderId])).toEqual([
      ["s1", "Advance · 3...Bf5", "f1"],
      ["s2", "Exchange · 3...cxd5", "f1"],
    ]);
    expect(records.every((record) => !isMultiGameRepertoire(record))).toBe(true);
    expect(records[1].pgn).toContain("3. exd5 cxd5");
  });

  it("names the split's folder by the reader, else by the text, else leaves it to the caller", () => {
    expect(splitFolderNameOf(read(TWO), " Caro ")).toBe("Caro");
    expect(splitFolderNameOf(read(TWO), "")).toBe("My Caro");
    const nameless: Extract<RepertoireReading, { ok: true }> = { ...read(TWO), name: undefined };
    expect(splitFolderNameOf(nameless, "")).toBeUndefined();
  });
});

describe("the one-tree Nimzo-Indian example", () => {
  it("is one game of 9,146 nodes — a repertoire as it stands", () => {
    // No wall-clock bound: a loaded suite run makes one flaky. For the record,
    // the parse was ~4.5s before `parsePgnTree` built the tree in place, ~1s after.
    const reading = read(NIMZO);
    expect(reading.games).toHaveLength(1);
    expect(reading.games[0].tree.nextId).toBe(9147);
  });
});

describe("a stored row", () => {
  it("round-trips, and fills in what an older or hand-edited row lacks", () => {
    const reading = read(ONE);
    const record = savedRepertoireOf("r", reading.games[0], "", reading.name, NOW);
    expect(savedRepertoireFrom(JSON.parse(JSON.stringify(record)))).toEqual(record);

    expect(
      savedRepertoireFrom({
        id: "r",
        pgn: "1. e4 *",
        savedAt: "x",
        updatedAt: "x",
        folderId: 7,
        stats: "junk",
      }),
    ).toEqual({
      id: "r",
      name: "",
      pgn: "1. e4 *",
      previewFen: DEFAULT_POSITION,
      // A record from before settings existed reads as the defaults.
      settings: { description: "", color: "white", showArrows: true },
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

  it("tells a record from before the one-game rule by its text", () => {
    const record = savedRepertoireFrom({ id: "r", pgn: TWO, savedAt: "x", updatedAt: "x" })!;
    expect(isMultiGameRepertoire(record)).toBe(true);
  });
});

describe("the trunk a card previews", () => {
  it("is the start when the lines disagree from move one", () => {
    const trees = [parsePgnTree("1. e4 *"), parsePgnTree("1. d4 *")];
    expect(repertoireTrunkFen(trees)).toBe(DEFAULT_POSITION);
    expect(repertoireTrunkFen([])).toBe(DEFAULT_POSITION);
  });
});
