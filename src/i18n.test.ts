import { describe, expect, it } from "vitest";
import {
  asAppLanguage,
  defaultLanguage,
  rtlLanguages,
  supportedLanguages,
} from "./i18n";

describe("asAppLanguage", () => {
  it("passes through a language this app ships", () => {
    expect(asAppLanguage("he")).toBe("he");
    expect(asAppLanguage("en")).toBe("en");
  });

  it("strips a region", () => {
    // `load: "languageOnly"` collapses `he-IL` inside i18next; this keeps the
    // direction lookup correct even when a caller hands over the raw tag.
    expect(asAppLanguage("he-IL")).toBe("he");
    expect(asAppLanguage("en-US")).toBe("en");
  });

  it("falls back to the default for anything else", () => {
    expect(asAppLanguage("fr")).toBe(defaultLanguage);
    expect(asAppLanguage("")).toBe(defaultLanguage);
    expect(asAppLanguage(undefined)).toBe(defaultLanguage);
  });
});

describe("language declarations", () => {
  it("declares a default that is actually supported", () => {
    expect(supportedLanguages).toContain(defaultLanguage);
  });

  it("declares only supported languages as RTL", () => {
    for (const language of rtlLanguages) {
      expect(supportedLanguages).toContain(language);
    }
  });

  it("keeps the default language LTR", () => {
    // AppThemeWithLang derives direction from this list, so an RTL default
    // would mirror the shell for a user who never chose a language.
    expect(rtlLanguages).not.toContain(defaultLanguage);
  });
});
