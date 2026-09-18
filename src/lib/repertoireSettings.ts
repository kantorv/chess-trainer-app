/**
 * **A saved repertoire's settings** — what the reader can say about a
 * repertoire beyond its text: a description, the side it is played from, and
 * whether its board draws the next-move arrows.
 *
 * One object on the record (`SavedRepertoire.settings`), read back through
 * {@link repertoireSettingsFrom}, which fills **each field on its own** from
 * {@link DEFAULT_REPERTOIRE_SETTINGS}. That is what makes the object
 * extendable without a version bump: a record written before an option
 * existed reads as that option's default, and a record with one unreadable
 * field keeps the others.
 *
 * ## Adding an option
 *
 * 1. A field on {@link RepertoireSettings}, with its doc comment.
 * 2. Its default in {@link DEFAULT_REPERTOIRE_SETTINGS}.
 * 3. One line in {@link repertoireSettingsFrom} — how an untrusted stored
 *    value becomes a usable one.
 * 4. A control in a section of the settings screen
 *    (`views/repertoires/RepertoireSettingsSections.tsx`), or a new section.
 * 5. Its labels in `en.ts` and `he.ts`, under `repertoires.settings`.
 *
 * Nothing else: the store's idempotent compare ({@link sameRepertoireSettings})
 * walks the defaults' keys, so a new field is compared without being named
 * there, and the settings screen edits the whole object as one draft.
 *
 * The title is **not** here: it is the record's `name`, which the list, the
 * board and the tags-derived default already speak. The settings screen edits
 * it beside these.
 */

/** A side of the board. */
export type RepertoireColor = "white" | "black";

export type RepertoireSettings = {
  /** The reader's own notes on the repertoire — what it is, what it is for. */
  description: string;
  /**
   * The side this repertoire is played from. The board opens facing it and a
   * preview card shows it, because a repertoire for Black read from White's
   * side is every position upside down.
   */
  color: RepertoireColor;
  /**
   * Whether the repertoire's own view opens drawing the next-move arrows —
   * every continuation from the position on screen (CTA-63). The player's
   * Settings tab can still switch them for a session; the games open without
   * them whatever this says, since a drill must not show the answer.
   */
  showArrows: boolean;
};

export const DEFAULT_REPERTOIRE_SETTINGS: RepertoireSettings = {
  description: "",
  color: "white",
  showArrows: true,
};

/** The most a description may hold — a paragraph or two, not a file. */
export const MAX_REPERTOIRE_DESCRIPTION_CHARS = 2000;

/**
 * A stored settings object, normalised: every field the value does not carry
 * usably is its default, one field at a time. Never throws.
 */
export const repertoireSettingsFrom = (value: unknown): RepertoireSettings => {
  const row: Record<string, unknown> =
    typeof value === "object" && value !== null ? { ...value } : {};
  return {
    description:
      typeof row.description === "string"
        ? row.description.slice(0, MAX_REPERTOIRE_DESCRIPTION_CHARS)
        : DEFAULT_REPERTOIRE_SETTINGS.description,
    color: row.color === "black" ? "black" : DEFAULT_REPERTOIRE_SETTINGS.color,
    showArrows:
      typeof row.showArrows === "boolean"
        ? row.showArrows
        : DEFAULT_REPERTOIRE_SETTINGS.showArrows,
  };
};

/**
 * Whether two settings objects say the same thing — over every field the
 * defaults name, so an option added later is compared without an edit here.
 */
export const sameRepertoireSettings = (
  a: RepertoireSettings,
  b: RepertoireSettings,
): boolean =>
  (Object.keys(DEFAULT_REPERTOIRE_SETTINGS) as (keyof RepertoireSettings)[]).every(
    (key) => a[key] === b[key],
  );
