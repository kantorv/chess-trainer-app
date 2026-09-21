import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { findCatalogGame } from "./gameCatalog";
import { savePlayedGame } from "./playedGameStore";
import { playedGameOf } from "./playedGames";
import { parsePgnGame, parsePgnTree } from "./pgn";
import {
  ANALYSIS_REFERENCE_KEY,
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
  it("knows exactly the two stores' keys", () => {
    expect(ANALYSIS_REFERENCE_KEY).toBe("analysis");
    expect(PLAY_REFERENCE_KEY).toBe("play");
  });

  it("tolerates the empty segments a stray slash leaves", () => {
    savePlayedGame(
      playedGameOf("a", parsePgnTree("1. e4 e5 *"), [], DEFAULT_ENGINE_SETTINGS),
    );
    expect(resolveGameReference("/play/games/a/")?.id).toBe("a");
  });

  it.each([
    ["nothing at all", null],
    ["an empty string", ""],
    ["a key with no path after it", "play"],
    ["an unregistered key", "endgames/pawn-endgames/opposition"],
    // The pre-CTA-75 Library's keys went with it (CTA-75).
    ["the old Library's key", "library/queen-vs-rook/chapter-1"],
    ["the pre-CTA-38 key", "pgn/queen-vs-rook/chapter-1"],
    ["a path the store does not have", "play/nope/a"],
    ["an id the store does not have", "play/games/missing"],
  ])("comes back undefined for %s", (_name, reference) => {
    expect(resolveGameReference(reference)).toBeUndefined();
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
