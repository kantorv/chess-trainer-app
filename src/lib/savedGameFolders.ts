import type { SavedGame } from "./savedGames";

/**
 * **The reader's saved-game folders** — what one is, and the tree it nests
 * into.
 *
 * The Saved games screen's flat list grew into a folder system (CTA-46), and
 * this is the pure half of it: the {@link GameFolder} entity and the reads over
 * a list of them. It is
 * [`savedOpeningFolders.ts`](./savedOpeningFolders.ts) again, and for the same
 * reason — the same deliberate near-copy the saved analyses are of the saved
 * games. The storage half is
 * [`savedGameFolderStore.ts`](./savedGameFolderStore.ts) — a versioned
 * `localStorage` key beside the games' own
 * ([`savedGameStore.ts`](./savedGameStore.ts)) — and the React binding is
 * `views/engine/saved/useGameFolders.ts`. A folder is **not** a game, which is
 * the whole reason it is a separate record in a separate store: a game carries
 * a PGN and the settings it was played under; a folder carries only a name and
 * a parent. What joins them is {@link SavedGame.folderId}, a plain id — no join
 * table, no `children` array on the folder, because a folder's children are
 * derivable from the list and a second copy of them could desync.
 *
 * What the openings' version has that this does not: nothing — the entity is
 * the same shape, and so are the reads. What this has that the openings' does
 * not is the **autosave trap**: a game is written by an effect on every move
 * (`usePlayWithEngine`), so the record that effect writes must carry the stored
 * `folderId` forward — the stores and the effect own that rule, not these
 * reads.
 *
 * ## A parent is an id, not a position in a list
 *
 * Nesting is `parentId: string | null` — `null` is the top level. Two rules
 * every helper below applies:
 *
 * - **A `parentId` that does not resolve is treated as `null`.** A hand-edited
 *   or half-deleted store can name a parent that is not there; a folder whose
 *   parent is gone still belongs somewhere, so it reads as top level rather
 *   than vanishing from every list.
 * - **A cycle is a fact about the data, not an error.** `parentId` is plain
 *   JSON; a hand-edited `a → b → a` would send a naive walk into an infinite
 *   loop. Every walk here carries a visited set and stops rather than
 *   recurring — {@link gameFolderPath} starts the cycle's own chain at the
 *   folder it entered it on, and {@link gameFolderSubtree} just stops. The
 *   store's write side prevents cycles from forming in the first place
 *   (`moveGameFolder` refuses a folder's own subtree), so these reads are
 *   defence in depth, not the rule.
 */
/** One folder in the reader's saved-game tree. Plain JSON. */
export type GameFolder = {
  /** Stable for the life of the record, and the join to {@link SavedGame.folderId}. */
  id: string;
  /** The reader's own name for the folder. Not unique — ids are. */
  name: string;
  /** The parent folder's id, or `null` for the top level. */
  parentId: string | null;
  /** ISO 8601, when it was created. */
  savedAt: string;
  /** ISO 8601, when it was last changed (renamed, moved, or re-parented). */
  updatedAt: string;
};

/**
 * Whether a value parsed out of storage has a folder's **identity** — the one
 * field that cannot be normalised, because a folder without an id is nothing to
 * file other records under. Structural, on purpose, and deliberately minimal:
 * everything else a row gets wrong is {@link gameFolderFrom}'s to normalise,
 * not a reason to drop the record.
 */
export const isGameFolder = (value: unknown): value is GameFolder => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id !== "";
};

/**
 * One stored row, normalised — a `parentId` that is neither `null` nor a
 * non-empty string reads as `null`, and a `name` that is not a string reads as
 * empty rather than dropping the whole folder. Dropping is the openings'
 * answer to a broken row, and this is that answer again: a folder has nothing
 * irreplaceable behind its fields, but it does have *position* in the reader's
 * tree, and a half-broken record that still renders one folder is better than
 * a tree with a hole in it. A row without an id is dropped — there is nothing
 * to file anything under.
 */
export const gameFolderFrom = (value: unknown): GameFolder | undefined => {
  if (!isGameFolder(value)) return undefined;
  // The guard has the identity; what is left is normalising the rest. The
  // runtime `typeof` checks are not dead even though `value` is typed — a row
  // out of storage may say `name: null` where the type says `string`.
  const row = value as GameFolder & Record<string, unknown>;

  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
    parentId:
      typeof row.parentId === "string" && row.parentId !== ""
        ? row.parentId
        : null,
    savedAt: typeof row.savedAt === "string" ? row.savedAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
};

/**
 * The id a folder is filed under, resolved — the one place a `parentId` is
 * checked against the list it names into. A parent that is not there is the top
 * level, and a folder is never its own parent.
 */
const resolvedParentOf = (
  folders: readonly GameFolder[],
  folder: GameFolder,
): string | null =>
  folder.parentId !== null &&
  folder.parentId !== folder.id &&
  folders.some((candidate) => candidate.id === folder.parentId)
    ? folder.parentId
    : null;

/**
 * The direct children of a folder, sorted by name — what drilling in shows,
 * and what the pickers nest by. A folder whose parent does not resolve counts
 * as a child of `null`, so a half-broken store still renders every folder.
 *
 * Sorted by name rather than by when each was created: a folder list is
 * browsed, not appended to, and two folders created in the same millisecond
 * would otherwise have no order at all. `localeCompare` rather than `<` —
 * names are reader's words, and a Hebrew list should sort in Hebrew order.
 */
export const gameFolderChildren = (
  folders: readonly GameFolder[],
  parentId: string | null,
): GameFolder[] =>
  folders
    .filter((folder) => resolvedParentOf(folders, folder) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * The chain from the top level down *to and including* one folder — what a
 * breadcrumb is. A folder whose parent does not resolve starts its own chain,
 * and a cycle is cut at the folder it was entered on: the chain shows the
 * loop's first lap rather than never finishing.
 */
export const gameFolderPath = (
  folders: readonly GameFolder[],
  id: string,
): GameFolder[] => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const start = byId.get(id);
  if (start === undefined) return [];

  const chain: GameFolder[] = [];
  const seen = new Set<string>();
  let current: GameFolder | undefined = start;

  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current =
      current.parentId === null
        ? undefined
        : byId.get(current.parentId);
  }

  // The chain was built folder-first; a breadcrumb reads top down.
  return chain.reverse();
};

/**
 * One folder and everything under it, as ids — the set a move is checked
 * against (a folder may not be moved into its own subtree) and what "a
 * non-empty folder" means for the delete confirmation. Includes the folder's
 * own id.
 */
export const gameFolderSubtree = (
  folders: readonly GameFolder[],
  id: string,
): Set<string> => {
  const subtree = new Set<string>([id]);

  // Breadth-first over resolved parents, so a cycle adds nothing the second
  // time it is reached.
  let frontier = [id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const folder of folders) {
      if (
        folder.parentId !== null &&
        !subtree.has(folder.id) &&
        frontier.includes(folder.parentId)
      ) {
        subtree.add(folder.id);
        next.push(folder.id);
      }
    }
    frontier = next;
  }

  return subtree;
};

/**
 * The games behind a click — everything under the folder, directly and not:
 * a folder card opens onto its whole subtree, so the rows that stand behind it
 * are the same set its count counts. Games that name a folder no longer there
 * are nobody's to return here; they render as Unfiled at the top level. The
 * order is the caller's (the store's, which is newest first) — the filter does
 * not sort.
 */
export const gamesInFolder = (
  games: readonly SavedGame[],
  folders: readonly GameFolder[],
  id: string,
): SavedGame[] => {
  const subtree = gameFolderSubtree(folders, id);
  return games.filter(
    (game) => game.folderId !== null && subtree.has(game.folderId),
  );
};

/**
 * How many games {@link gamesInFolder} returns — the count a folder card
 * stands for. The same filter, counted, because a card's caption and the
 * subtree export behind it name the same set by construction.
 */
export const gamesUnderFolder = (
  games: readonly SavedGame[],
  folders: readonly GameFolder[],
  id: string,
): number => gamesInFolder(games, folders, id).length;

/** One folder in a picker, at its depth below the top level. */
export type FlattenedGameFolder = {
  folder: GameFolder;
  /** 0 at the top level, 1 under a root folder, and so on. */
  depth: number;
};

/**
 * The whole tree, depth-annotated, parents before children — what a picker
 * renders as one indented list. Children are name-sorted at every level, the
 * same rule {@link gameFolderChildren} applies, and cycles are cut the same
 * way every other walk cuts them.
 */
export const flattenGameFolders = (
  folders: readonly GameFolder[],
): FlattenedGameFolder[] => {
  const flat: FlattenedGameFolder[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const folder of gameFolderChildren(folders, parentId)) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      flat.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };

  walk(null, 0);
  return flat;
};
