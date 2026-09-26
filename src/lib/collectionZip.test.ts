import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { isZipFile, readCollectionZip } from "./collectionZip";

const PGN = '[Event "Club"]\n\n1. e4 e5 *\n';

describe("readCollectionZip", () => {
  it("reads the one .pgn, its stem the entry's name", () => {
    const zip = zipSync({ "games/Club_Games.pgn": strToU8(PGN) });
    expect(readCollectionZip(zip)).toEqual({ ok: true, text: PGN, stem: "Club_Games" });
  });

  it("does not count directories, __MACOSX files, dot-files or other files", () => {
    const zip = zipSync({
      "a/": new Uint8Array(),
      "a/one.PGN": strToU8(PGN),
      "__MACOSX/a/._one.pgn": strToU8("junk"),
      "a/.hidden.pgn": strToU8("junk"),
      "readme.txt": strToU8("hi"),
    });
    expect(readCollectionZip(zip)).toMatchObject({ ok: true, text: PGN, stem: "one" });
  });

  it("refuses a zip with no .pgn, or with several", () => {
    expect(readCollectionZip(zipSync({ "a.txt": strToU8("x") }))).toEqual({ ok: false, problem: "zip-empty" });
    expect(readCollectionZip(zipSync({ "a.pgn": strToU8(PGN), "b.pgn": strToU8(PGN) }))).toEqual({
      ok: false,
      problem: "zip-many",
    });
  });

  it("refuses bytes that are not a zip, without throwing", () => {
    expect(readCollectionZip(strToU8("not a zip at all"))).toEqual({ ok: false, problem: "zip" });
    const zip = zipSync({ "a.pgn": strToU8(PGN) });
    expect(readCollectionZip(zip.slice(0, zip.length - 10)).ok).toBe(false);
  });
});

describe("isZipFile", () => {
  it("goes by the name or the type", () => {
    expect(isZipFile({ name: "x.ZIP" })).toBe(true);
    expect(isZipFile({ name: "x", type: "application/zip" })).toBe(true);
    expect(isZipFile({ name: "x.pgn", type: "text/plain" })).toBe(false);
  });
});
