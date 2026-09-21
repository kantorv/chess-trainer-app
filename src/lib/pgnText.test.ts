import { describe, expect, it } from "vitest";

import { chapterPrefix, slugify } from "./pgnText";

describe("slugify", () => {
  it("keeps letters and digits and joins the rest with one dash", () => {
    expect(slugify("Chapter 1")).toBe("chapter-1");
    expect(slugify("Alice – Bob (1-0)")).toBe("alice-bob-1-0");
    expect(slugify("  --World Cup 2023--  ")).toBe("world-cup-2023");
  });

  it("slugs a name with no ASCII letters to the empty string", () => {
    expect(slugify("מטים")).toBe("");
  });
});

describe("chapterPrefix", () => {
  it("takes a chapter's \"N) \" prefix apart for order and label", () => {
    expect(chapterPrefix("12) 2...d5 3.exd5 Qxd5 4.d4 - ...Bf5 Setups")).toEqual({
      order: 12,
      label: "2...d5 3.exd5 Qxd5 4.d4 - ...Bf5 Setups",
    });
    expect(chapterPrefix("Introduction")).toEqual({ label: "Introduction" });
  });
});
