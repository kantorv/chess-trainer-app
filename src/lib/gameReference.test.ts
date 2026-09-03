import { describe, expect, it } from "vitest";

import {
  PGN_REFERENCE_KEY,
  gameReferenceOf,
  resolveGameReference,
} from "./gameReference";
import { pgnCatalog } from "./pgnCatalog";
import { positionsCatalog } from "./positionsCatalog";

/**
 * The `?game=` carrier: what a detail page writes into a link and what a
 * destination screen gets back out of one.
 *
 * The two shipped shapes are both here — a folder one segment deep (the
 * chess.com export) and one nested under `studies` by the manifest — because the
 * whole reason the category path is resolved rather than counted is that a
 * reference does not know how deep its own folder sits.
 */

const nested = pgnCatalog.items.find((item) =>
  item.category.startsWith("studies/"),
)!;
const flat = pgnCatalog.items.find((item) => !item.category.includes("/"))!;

describe("gameReferenceOf and resolveGameReference round-trip", () => {
  it.each([
    ["a folder one segment deep", flat],
    ["a folder the manifest nested", nested],
  ])("carries %s there and back", (_name, item) => {
    if (item.kind !== "game") throw new Error("expected a game");

    const reference = gameReferenceOf(PGN_REFERENCE_KEY, item);

    expect(reference).toBe(`pgn/${item.category}/${item.id}`);
    expect(resolveGameReference(reference)).toBe(item);
  });

  it("tolerates the empty segments a stray slash leaves", () => {
    expect(resolveGameReference(`/pgn/${flat.category}/${flat.id}/`)).toBe(flat);
  });
});

describe("resolveGameReference refuses everything it cannot resolve", () => {
  it.each([
    ["nothing at all", null],
    ["an empty string", ""],
    ["a section key nobody registered", "mates/basic/back-rank"],
    ["a section with no games in it", "positions/pawn-endgames/opposition"],
    ["a key with no path after it", "pgn"],
    ["a folder the catalog does not have", "pgn/no-such-folder/whatever"],
    ["a game the folder does not have", `pgn/${flat.category}/no-such-game`],
  ])("comes back undefined for %s", (_name, reference) => {
    expect(resolveGameReference(reference)).toBeUndefined();
  });

  it("refuses a reference that resolves to a position rather than a game", () => {
    /*
      Positions are a real library and its ids are real, but `?game=` promises a
      *game*: a screen that took a position back from it would then have to
      handle a `Game` it never got. The section key is not registered here at
      all, which is the first of the two gates; the kind check behind it is the
      second.
    */
    const position = positionsCatalog.positions[0];

    expect(
      resolveGameReference(`positions/${position.category}/${position.id}`),
    ).toBeUndefined();
  });
});
