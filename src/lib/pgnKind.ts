/**
 * **What kind of thing a PGN folder is** — the taxonomy of the User PGNs
 * section, and the one place a new kind of `.pgn` content is registered.
 *
 * A `.pgn` file is a container, not a genre. The same syntax carries a lichess
 * study, an author's whole shelf of studies, a month of blitz games and (soon)
 * an opening repertoire, and those want different screens: a list of chapters is
 * right for one study and useless as the front page of twenty-eight of them. So
 * `loadPgnLibrary` labels every folder it creates with a kind, and the section
 * binding (`views/pgn/UserPgnsSection.tsx`) dispatches on it.
 *
 * ## The kinds, and the view each gets
 *
 * | Kind | What it is | Recognised by | Screen |
 * | --- | --- | --- | --- |
 * | `study` | one study — its chapters are the items | a file with exactly one `StudyName`, or one study of a `collection` | `LibraryList` — a card per chapter |
 * | `collection` | one file holding **several** studies | a file with two or more `StudyName`s | `PgnCollection` — an index of its studies, with the collection's own left-hand nav |
 * | `shelf` | a folder of several **files** | a `src/data/pgn.json` `under` path | `LibraryList` — a card per sub-folder |
 * | `games` | played games, not a study at all | a file with no `StudyName` (a chess.com export) | `LibraryList` — a card per game |
 *
 * ## Adding a kind
 *
 * The two the project expects next are `repertoire` (a tree of lines to learn,
 * where the *variations* are the content and a chapter list says nothing) and
 * `variations` (one position's branches). Adding one is three edits and no
 * changes to the shared library layer:
 *
 * 1. **Name it here**, in {@link PgnKind}, with a row in the table above.
 * 2. **Recognise it** where the folder is created — `lib/pgnLibrary.ts` decides
 *    a file's kind from its tags, so the rule is written next to the tags it
 *    reads. A rule that cannot be read off the PGN goes in `src/data/pgn.json`
 *    instead, as a manifest field, and is applied in the same place.
 * 3. **Give it a screen**, and add one line to the dispatcher in
 *    `views/pgn/UserPgnsSection.tsx`.
 *
 * What must *not* happen is a kind leaking into `lib/libraryCatalog.ts` or into
 * `views/library/`: those serve three sections, and only this one has `.pgn`
 * files behind it. A kind is therefore a **lookup keyed by category path**,
 * carried beside the catalog rather than inside `LibraryCategory` — the same
 * shape, and for the same reason, as the folder notes in
 * `views/library/folderNotes.ts`.
 */

/** What a User PGNs folder is. See the table above. */
export type PgnKind = "study" | "collection" | "shelf" | "games";

/** Category path → what that folder is. Every folder the loader made is in it. */
export type PgnKinds = Record<string, PgnKind>;

/**
 * The kind of the folder at this path.
 *
 * A path the map has nothing for is a `"shelf"`: the only folders that can be
 * missing are ones no file claimed, which is what a grouping folder is. Falling
 * back rather than returning `undefined` is what keeps every caller free of a
 * "what if it has no kind" branch that could not happen.
 */
export const pgnKindOf = (
  path: string | undefined,
  kinds: PgnKinds,
): PgnKind => (path === undefined ? "shelf" : (kinds[path] ?? "shelf"));
