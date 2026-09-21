import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decodeCollectionIndex, textHash } from "./collectionIndex";

/*
  `node scripts/wirepgn.js` — the shipped collections' one way in — run for
  real against a temporary folder (`--dir`): wiring copies the file, writes
  its index and registers it; --check catches a file edited after; --remove
  takes it all back out.
*/

const SCRIPT = join(process.cwd(), "scripts/wirepgn.js");
const GAMES = [
  '[Event "Cup"]\n[White "Amy"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0',
  '[Event "Cup"]\n[White "Kim"]\n[Black "Lee"]\n[Result "*"]\n\n1. e4 e5 2. Ke3 *',
  '[Event "Cup"]\n[White "Bob"]\n[Black "Amy"]\n[Result "0-1"]\n\n1. d4 d5 0-1',
];

let work: string;
let dir: string;

const run = (...args: string[]) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, "--dir", dir], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
const manifest = () => JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "wirepgn-"));
  dir = join(work, "library");
  // Windows line endings, which the wired copy normalises.
  writeFileSync(join(work, "Club_Cup2024.pgn"), GAMES.join("\r\n\r\n").replace(/\n/g, "\r\n"));
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("wirepgn", () => {
  it("copies the file, indexes it and registers it", () => {
    const { code, out } = run(join(work, "Club_Cup2024.pgn"));
    expect(code, out).toBe(0);
    expect(out).toContain("3 games (1 unreadable)");

    const text = readFileSync(join(dir, "Club_Cup2024.pgn"), "utf8");
    expect(text).not.toContain("\r");
    expect(manifest().collections).toEqual([
      {
        id: "club-cup2024",
        name: "Club Cup 2024",
        pgn: "Club_Cup2024.pgn",
        index: "Club_Cup2024.index.json",
        games: 3,
        hash: textHash(text),
      },
    ]);
    const index = decodeCollectionIndex(JSON.parse(readFileSync(join(dir, "Club_Cup2024.index.json"), "utf8")));
    expect(index?.hash).toBe(textHash(text));
    expect(index?.rows.map((row) => [row.white, row.moves, row.unreadable ?? false])).toEqual([
      ["Amy", 2, false],
      ["Kim", 2, true],
      ["Bob", 1, false],
    ]);
    // The book fills an opening the tags left out.
    expect(index?.rows[0].opening).toBeDefined();

    expect(run("--check").code).toBe(0);
    expect(run("--list").out).toContain("club-cup2024");
  }, 60_000);

  it("takes a name and an id, and re-wiring replaces rather than duplicates", () => {
    expect(run(join(work, "Club_Cup2024.pgn"), "--name", "The Cup", "--id", "cup").code).toBe(0);
    expect(run(join(work, "Club_Cup2024.pgn"), "--name", "The Cup, again", "--id", "cup").code).toBe(0);
    expect(manifest().collections.map((entry: { id: string; name: string }) => [entry.id, entry.name])).toEqual([
      ["cup", "The Cup, again"],
    ]);
  }, 60_000);

  it("fails --check for a file edited after it was wired, or one never wired", () => {
    run(join(work, "Club_Cup2024.pgn"));
    writeFileSync(join(dir, "Club_Cup2024.pgn"), `${GAMES[0]}\n`);
    writeFileSync(join(dir, "Stray.pgn"), GAMES[0]);
    const { code, out } = run("--check");
    expect(code).toBe(1);
    expect(out).toContain("changed since it was wired");
    expect(out).toContain("Stray.pgn is not wired");

    // --rebuild re-indexes what is registered.
    rmSync(join(dir, "Stray.pgn"));
    expect(run("--rebuild").code).toBe(0);
    expect(run("--check").code).toBe(0);
    expect(manifest().collections[0].games).toBe(1);
  }, 60_000);

  it("removes a collection and its two files", () => {
    run(join(work, "Club_Cup2024.pgn"));
    expect(run("--remove", "club-cup2024").code).toBe(0);
    expect(manifest().collections).toEqual([]);
    expect(existsSync(join(dir, "Club_Cup2024.pgn"))).toBe(false);
    expect(existsSync(join(dir, "Club_Cup2024.index.json"))).toBe(false);
    expect(run("--remove", "club-cup2024").code).toBe(1);
  }, 60_000);

  it("refuses a file with no game, and prints its usage for nothing to do", () => {
    writeFileSync(join(work, "Empty.pgn"), "just words\n");
    expect(run(join(work, "Empty.pgn")).out).toContain("no game could be read");
    expect(run().code).toBe(1);
    expect(run().out).toContain("Usage:");
  }, 60_000);
});
