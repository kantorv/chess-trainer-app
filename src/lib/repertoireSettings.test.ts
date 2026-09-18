import { describe, expect, it } from "vitest";

import {
  DEFAULT_REPERTOIRE_SETTINGS,
  MAX_REPERTOIRE_DESCRIPTION_CHARS,
  repertoireSettingsFrom,
  sameRepertoireSettings,
} from "./repertoireSettings";

describe("a repertoire's settings", () => {
  it("read as the defaults when a record has none — no version bump", () => {
    expect(repertoireSettingsFrom(undefined)).toEqual(DEFAULT_REPERTOIRE_SETTINGS);
    expect(repertoireSettingsFrom("junk")).toEqual(DEFAULT_REPERTOIRE_SETTINGS);
  });

  it("fill each field on its own, keeping what is readable", () => {
    expect(repertoireSettingsFrom({ description: "Mine", color: 7 })).toEqual({
      description: "Mine",
      color: "white",
      showArrows: true,
    });
    expect(repertoireSettingsFrom({ color: "black", showArrows: "no" })).toEqual({
      description: "",
      color: "black",
      showArrows: true,
    });
  });

  it("draw the next-move arrows by default, and keep a reader's no", () => {
    expect(DEFAULT_REPERTOIRE_SETTINGS.showArrows).toBe(true);
    // A record from before the option reads as on.
    expect(repertoireSettingsFrom({ description: "Old", color: "white" }).showArrows).toBe(true);
    expect(repertoireSettingsFrom({ showArrows: false }).showArrows).toBe(false);
  });

  it("cap a description", () => {
    const long = "x".repeat(MAX_REPERTOIRE_DESCRIPTION_CHARS + 10);
    expect(repertoireSettingsFrom({ description: long }).description).toHaveLength(
      MAX_REPERTOIRE_DESCRIPTION_CHARS,
    );
  });

  it("compare over every field the defaults name", () => {
    const base = { description: "a", color: "white" as const, showArrows: true };
    expect(sameRepertoireSettings(base, { ...base })).toBe(true);
    expect(sameRepertoireSettings(base, { ...base, showArrows: false })).toBe(false);
    expect(sameRepertoireSettings(base, { ...base, color: "black" })).toBe(false);
    expect(sameRepertoireSettings(base, { ...base, description: "b" })).toBe(false);
  });
});
