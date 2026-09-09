import { describe, expect, it } from "vitest";

import {
  PGN_REFERENCE_KEY,
  gameReferenceOf,
  resolveGameReference,
} from "./gameReference";
import { pgnCatalog } from "./pgnCatalog";

/**
 * The `?game=` carrier: what a detail page writes into a link and what a
 * destination screen gets back out of one.
 *
 * The shipped User PGNs folders sit one segment deep now, but a reference is
 * still *resolved* against the catalog rather than split by counting segments —
 * the leftover after the section key goes to `resolveLibraryPath`, the same
 * longest-prefix match the splat route uses — so a reference into a folder the
 * manifest nested any number of levels needs no extra work here.
 * `resolveLibraryPath`'s own nested fixtures cover the deep case.
 */

const first = pgnCatalog.items[0];
const last = pgnCatalog.items[pgnCatalog.items.length - 1];

describe("gameReferenceOf and resolveGameReference round-trip", () => {
  it.each([
    ["the first shipped game", first],
    ["one in a different folder", last],
  ])("carries %s there and back", (_name, item) => {
    if (item.kind !== "game") throw new Error("expected a game");
    expect(item.category).not.toBe("");

    const reference = gameReferenceOf(PGN_REFERENCE_KEY, item);

    expect(reference).toBe(`pgn/${item.category}/${item.id}`);
    expect(resolveGameReference(reference)).toBe(item);
  });

  it("tolerates the empty segments a stray slash leaves", () => {
    expect(resolveGameReference(`/pgn/${first.category}/${first.id}/`)).toBe(first);
  });
});

describe("resolveGameReference refuses everything it cannot resolve", () => {
  it.each([
    ["nothing at all", null],
    ["an empty string", ""],
    ["a section key nobody registered", "library/basic/back-rank"],
    ["another unregistered section key", "endgames/pawn-endgames/opposition"],
    ["a key with no path after it", "pgn"],
    ["a folder the catalog does not have", "pgn/no-such-folder/whatever"],
    ["a game the folder does not have", `pgn/${first.category}/no-such-game`],
    ["the old nested path, since the folders were flattened", `pgn/studies/${first.category}/${first.id}`],
  ])("comes back undefined for %s", (_name, reference) => {
    expect(resolveGameReference(reference)).toBeUndefined();
  });
});
