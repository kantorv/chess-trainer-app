import { beforeEach, describe, expect, it } from "vitest";

import { indexedRowOf } from "./collectionIndex";
import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { addCollection, resetLibraryCollectionStore } from "./libraryCollectionStore";
import { findCatalogGame } from "./gameCatalog";
import { savePlayedGame } from "./playedGameStore";
import { playedGameOf } from "./playedGames";
import { parsePgnGame, parsePgnTree } from "./pgn";
import {
  ANALYSIS_REFERENCE_KEY,
  isReferenceRead,
  LIBRARY_REFERENCE_KEY,
  libraryGameReference,
  loadReferencedGames,
  PLAY_REFERENCE_KEY,
  resolveGameReference,
} from "./gameReference";

/**
 * The `?game=` carrier: a key, a store's catalog path and an id, resolved
 * against that store. The two producers' own tests
 * (`savedAnalysisStore.test.ts`, `playedGames.test.ts`) cover their round
 * trips; this covers what the carrier refuses.
 */

beforeEach(() => localStorage.clear());

describe("resolveGameReference", () => {
  it("knows exactly the three stores' keys", () => {
    expect(ANALYSIS_REFERENCE_KEY).toBe("analysis");
    expect(PLAY_REFERENCE_KEY).toBe("play");
    expect(LIBRARY_REFERENCE_KEY).toBe("library");
  });

  it("tolerates the empty segments a stray slash leaves", async () => {
    await savePlayedGame(
      playedGameOf("a", parsePgnTree("1. e4 e5 *"), [], DEFAULT_ENGINE_SETTINGS),
    );
    expect(resolveGameReference("/play/games/a/")?.id).toBe("a");
  });

  it.each([
    ["nothing at all", null],
    ["an empty string", ""],
    ["a key with no path after it", "play"],
    ["an unregistered key", "endgames/pawn-endgames/opposition"],
    // The pre-CTA-75 Library's links name no collection and number now.
    ["the old Library's key", "library/queen-vs-rook/chapter-1"],
    ["a Library game number that is not one", "library/morphy/0"],
    ["the pre-CTA-38 key", "pgn/queen-vs-rook/chapter-1"],
    ["a path the store does not have", "play/nope/a"],
    ["an id the store does not have", "play/games/missing"],
  ])("comes back undefined for %s", (_name, reference) => {
    expect(resolveGameReference(reference)).toBeUndefined();
  });
});

describe("a Library game (CTA-77)", () => {
  beforeEach(() => resetLibraryCollectionStore());

  it("resolves an upload's game", async () => {
    const pgn = '[White "Kim"]\n[Black "Lee"]\n\n1. e4 e5 *';
    const added = await addCollection("Mine", [pgn], [indexedRowOf(pgn)]);
    if (!("collection" in added)) throw new Error("not added");
    const reference = libraryGameReference(added.collection.id, 1);
    await loadReferencedGames(reference);
    expect(isReferenceRead(reference)).toBe(true);
    expect(resolveGameReference(reference)).toMatchObject({ id: "1", name: "Kim – Lee", pgn });
    expect(resolveGameReference(libraryGameReference(added.collection.id, 2))).toBeUndefined();
  });

  it("resolves a shipped collection's game after its PGN chunk is fetched", async () => {
    const reference = libraryGameReference("morphy", 1);
    expect(isReferenceRead(reference)).toBe(false);
    expect(resolveGameReference(reference)).toBeUndefined();
    await loadReferencedGames(reference);
    expect(isReferenceRead(reference)).toBe(true);
    expect(resolveGameReference(reference)?.name).toBe("Morphy, Paul – Morphy, Alonzo");
  });

  it("waits for the played games' first read, like a Library game", async () => {
    expect(isReferenceRead("play/games/a")).toBe(false);
    await loadReferencedGames("play/games/a");
    expect(isReferenceRead("play/games/a")).toBe(true);
  });

  it("is read at once for no reference", () => {
    expect(isReferenceRead(null)).toBe(true);
  });
});

describe("findCatalogGame", () => {
  const catalog = {
    path: "games",
    games: [{ id: "a", name: "A – B", pgn: "1. e4 *", game: parsePgnGame("1. e4 *") }],
  };

  it("finds [path, id] and nothing longer or shorter", () => {
    expect(findCatalogGame(["games", "a"], catalog)?.id).toBe("a");
    expect(findCatalogGame(["games"], catalog)).toBeUndefined();
    expect(findCatalogGame(["games", "a", "b"], catalog)).toBeUndefined();
    expect(findCatalogGame(["other", "a"], catalog)).toBeUndefined();
  });
});
