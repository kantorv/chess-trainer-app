import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { newGameParams, newGameRequestOf } from "./newGameLink";

const params = (query: string) => new URLSearchParams(query);

describe("newGameParams — the Lobby's Start link (CTA-82)", () => {
  it("writes every field, the side and the eval bar", () => {
    const written = newGameParams(
      { ...DEFAULT_ENGINE_SETTINGS, skillLevel: 5, depth: 8, moveTimeMs: 2500 },
      "black",
      false,
    );
    expect(Object.fromEntries(written)).toEqual({
      side: "black",
      skill: "5",
      depth: "8",
      movetime: "2500",
      lines: "3",
      threads: "1",
      hash: "16",
      evalbar: "0",
    });
  });

  it("reads back what it wrote", () => {
    const settings = { ...DEFAULT_ENGINE_SETTINGS, skillLevel: 3, multiPv: 5, threads: 2, hashMb: 64 };
    expect(newGameRequestOf(newGameParams(settings, "white", true))).toEqual({
      settings: { skillLevel: 3, depth: 14, moveTimeMs: 1000, multiPv: 5, threads: 2, hashMb: 64 },
      side: "white",
      evalBar: true,
    });
  });
});

describe("newGameRequestOf — reading a link", () => {
  it("asks for nothing when the link carries nothing", () => {
    expect(newGameRequestOf(params(""))).toEqual({ settings: {} });
    expect(newGameRequestOf(params("fen=whatever&saved=x"))).toEqual({ settings: {} });
  });

  it("drops an unreadable field and keeps the others", () => {
    expect(newGameRequestOf(params("skill=abc&depth=12&movetime=&lines=NaN&side=purple&evalbar=yes"))).toEqual({
      settings: { depth: 12 },
    });
  });

  it("clamps a number out of range and rounds a fraction", () => {
    expect(
      newGameRequestOf(params("skill=99&depth=0&movetime=-5&lines=50&threads=9&hash=1e6")).settings,
    ).toEqual({ skillLevel: 20, depth: 1, moveTimeMs: 0, multiPv: 10, threads: 4, hashMb: 256 });
    expect(newGameRequestOf(params("skill=7.6")).settings).toEqual({ skillLevel: 8 });
  });

  it("draws a random side once, from the source it is given", () => {
    expect(newGameRequestOf(params("side=random"), () => 0.2).side).toBe("white");
    expect(newGameRequestOf(params("side=random"), () => 0.7).side).toBe("black");
  });

  it("reads the eval bar as 1 or 0", () => {
    expect(newGameRequestOf(params("evalbar=0")).evalBar).toBe(false);
    expect(newGameRequestOf(params("evalbar=1")).evalBar).toBe(true);
  });
});
