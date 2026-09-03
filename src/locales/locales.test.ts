import { describe, expect, it } from "vitest";
import { navLabelKeys } from "../views/main/navTree";
import en from "./en";
import he from "./he";

/** Every leaf key, as dotted paths, so two catalogs can be compared directly. */
const leafKeys = (value: unknown, prefix = ""): string[] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) =>
        leafKeys(child, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];

const read = (catalog: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node as never)[part], catalog);

describe("translation catalogs", () => {
  it("ship the same keys in both languages", () => {
    // `he: typeof en` already makes a missing key a compile error. This catches
    // the other direction — a key added to `he` alone — and keeps the failure
    // legible when someone runs the suite before `tsc`.
    expect(leafKeys(he).sort()).toEqual(leafKeys(en).sort());
  });

  it("leaves no string untranslated in Hebrew", () => {
    // Identical by design: the brand mark and the file-format and opening-code
    // initialisms are written the same way in both languages, and language
    // names are always written in their own language.
    const identicalOnPurpose = new Set([
      "app.brandMark",
      "language.en",
      "language.he",
      "gamePanel.info.eco",
      "editor.tabs.fen",
      "editor.tabs.pgn",
    ]);

    const untranslated = leafKeys(en).filter(
      (key) =>
        !identicalOnPurpose.has(key) && read(en, key) === read(he, key),
    );

    expect(untranslated).toEqual([]);
  });

  it("covers every nav entry in both languages", () => {
    /*
      Read off the nav tree rather than listed by hand: the assertion is that
      the catalogs cover the navigation, and a hardcoded list only ever says
      they covered it on the day it was written. A screen *or a folder* added
      without its label still fails here, which is the point.
    */
    const keys = navLabelKeys();
    expect(keys.length).toBeGreaterThan(0);

    for (const labelKey of keys) {
      expect(read(en, labelKey), `en is missing ${labelKey}`).toBeTypeOf("string");
      expect(read(he, labelKey), `he is missing ${labelKey}`).toBeTypeOf("string");
    }
  });
});
