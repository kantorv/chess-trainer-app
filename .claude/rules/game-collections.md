---
paths:
  - "src/views/library/**"
  - "src/lib/libraryCollections*"
  - "src/lib/libraryCollectionStore*"
  - "src/lib/libraryDb.ts"
  - "src/lib/libraryFolderStore*"
  - "src/lib/folderTreeRows*"
  - "src/views/shared/folders/FolderTreeTable.tsx"
  - "src/lib/libraryGameCatalog*"
  - "src/lib/shippedCollections*"
  - "src/lib/collectionIndex*"
  - "src/lib/openingTree*"
  - "src/lib/wirepgn.test.ts"
  - "src/data/library/**"
  - "scripts/wirepgn.js"
---

# Game collections — the Library

The Library (`/library`) holds **game collections**. This file is the whole
reference for the module: what a collection is, where each part lives, the
rules that keep it fast and correct, and how to extend it. It is meant for
people and for LLM sessions alike. It loads automatically when you work on
the files in its `paths:` list. Anything outside the module that touches it
(the `?game=` registry, the Analysis Board, Saved analyses) points back here.

This file is the authority for the Library; the board rules
([`chessboard.md`](./chessboard.md), [`tree-views.md`](./tree-views.md)) are
the authority for the game board, and [`analysis-board.md`](./analysis-board.md)
for the Analysis Board and Saved analyses it hands games to.

> **"Game" collections, deliberately.** Everything here is a collection of
> **games**: PGN text with moves, a table of players and results, and an
> analysis board for each row. A **positions collection** (FENs, puzzles,
> studies of one position) is planned. It is **not built**, and nothing here
> should assume a collection is always games *by accident*. §10.5 says how the
> second kind should fit in. Until then, "collection" in code and in this
> file means a game collection.

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/lib/libraryCollections.ts` | **The model, pure**: `CollectionSource`, `CollectionSummary`, `LibraryCollection`, `CollectionRow`, `COLLECTION_COLUMNS`, `collectionRowOf` (the tag half of a row, no `chess.js`), `sortedRows`, `RowFilter` / `filteredRows`, `CollectionFilterValues` / `COLLECTION_FILTER_PARAMS`, `collectionFacetsOf`, `openingLabelOf`, `dateBounds`, `activeFilterSummary` / `batchFolderNameOf` (the Analyse folder name), `collectionNameOfStem` / `collectionIdOfStem`, `collectionGamesOf` (**the one rule for cutting a text into games**), `readCollectionText` (a file or a paste), `MAX_COLLECTION_CHARS`. |
| `src/lib/collectionIndex.ts` | **The index**: `IndexedRow`, `indexedRowOf` (tags + a `parsePgnTree` pass), `indexGame` (one game, with the app's book), `buildCollectionIndex` / `buildCollectionIndexAsync`, `numberedRows`, `textHash`, `OpeningLookup` / `loadOpeningLookup`, and the file format: `encodeCollectionIndex` / `decodeCollectionIndex`, `COLLECTION_INDEX_FORMAT` / `COLLECTION_INDEX_VERSION`. |
| `src/lib/collectionIndex.worker.ts` | The index pass for an upload, off the main thread. |
| `src/lib/openingTree.ts` | **The opening tree**: `openingTreeOf` (rows' `line`s merged by SAN, **cut where the games stop branching**, CTA-92), `openingNodeAt` / `openingNodeOn`, `OPENING_LINE_PARAM` (`line`), `openingLineParamOf` / `openingLineOfParam`. Pure, with no `chess.js`. |
| `src/lib/shippedCollections.ts` | **Shipped collections**: the manifest (a static import) and two lazy globs (`*.pgn`, `*.index.json`, `?raw`). `shippedCollectionsOf` (takes its inputs as parameters, for tests), `shippedCollections`, `findShippedCollection`, `peekShippedRows` / `peekShippedGames`, `subscribeShipped`. |
| `src/lib/libraryDb.ts` | **The database**, `chessapp.library` (version 2): its four object store names, the channel, `openLibraryDb` and `deleteLibraryDb`. Both stores below open it. |
| `src/lib/libraryCollectionStore.ts` | **Uploaded collections, in IndexedDB** (`chessapp.library`). Reads: `uploadedCollectionsSnapshot`, `subscribeUploadedCollections`, `loadUploadedCollections`, `peekUploadedRows` / `loadUploadedRows`, `peekUploadedGames` / `loadUploadedGames`. Writes: `addCollection` (into a folder, optionally), `removeCollection`, `moveCollection` (Move to…), `refileCollectionsIn` (a folder deleted), `replaceCollectionGame` (Update), `insertCollectionGame` (Save as copy), `appendCollectionGames` (Add games), `removeCollectionGames` (delete picked). Also `newCollectionId` and `resetLibraryCollectionStore` (for tests). |
| `src/lib/libraryFolderStore.ts` | **The reader's folders** (CTA-88), the `folders` object store over `idbRecordStore`: `libraryFoldersSnapshot`, `subscribeLibraryFolders`, `loadLibraryFolders`, `createLibraryFolder`, `renameLibraryFolder`, `moveLibraryFolder` (never into its own subtree), `removeLibraryFolder` (keeps the contents), `BUILT_IN_FOLDER_ID`, `MAX_LIBRARY_FOLDERS` (100). A folder is the app's one nested-folder model, `GameFolder` (`lib/savedGameFolders.ts`). |
| `src/lib/folderTreeRows.ts` | **A folder tree as table rows**, pure and generic over anything with a `folderId`: folders first, a pinned folder first, sizes over subtrees, closed folders' contents left out, the filter that opens the way to a match. |
| `src/lib/libraryGameCatalog.ts` | **A Library game as a `?game=` reference**: `library/<collection>/<n>`. `findLibraryGame`, `libraryReferenceRead`, `loadLibraryReferenceGames`, `libraryReferencePathOf`. Registered in `lib/gameReference.ts`. |
| `src/data/library/` | The shipped files: `<Stem>.pgn`, `<Stem>.index.json`, `manifest.json`, and a `README.md` for whoever adds a file. |
| `scripts/wirepgn.js` | **The wiring CLI** (`yarn wirepgn`): wire, `--list`, `--check`, `--rebuild`, `--remove`, `--dir`. |
| `src/views/library/LibraryHome.tsx` | `/library`: the folder tree table (Built-in and the reader's folders), the name filter, the sort, each row's actions and the folder dialogs. |
| `src/views/shared/folders/FolderTreeTable.tsx` | The details view itself — sticky header, sortable columns, indented rows with chevrons, hover actions. Presentational and reusable; the Library is its one consumer. |
| `src/views/library/LibraryUpload.tsx` | `/library/new`: a new collection (file, paste, or empty), filed in a folder (`?folder=<id>`, the picker), and `?into=<id>` to add games to an existing one. |
| `src/views/library/CollectionScreen.tsx` | `/library/<collection>`: the table, the picks, the export bar, Analyse, Add games, and deleting games. |
| `src/views/library/CollectionFilters.tsx` | The table's right-hand panel: player and side, the opening board, then opening, event, dates and result. |
| `src/views/library/OpeningFilterBoard.tsx` | The opening-moves board (`options.id` `library-filter-board`). |
| `src/views/library/LibraryGameScreen.tsx` → `LibraryGameBoard.tsx` | `/library/<collection>/<n>`: resolve and parse the game, then the analysis board. |
| `src/views/library/useLibraryCollections.ts` | The React bindings: `useUploadedCollections`, `useLibraryFolders`, `useCollectionSummary`, `useCollectionRows`, `useCollectionGames`, `loadCollectionGames`. |
| `src/views/library/indexCollection.ts` | Runs the worker with progress and cancel, with a jsdom fallback. |
| `src/views/library/LibraryMiss.tsx` | The "no such collection / game" screen. |
| `src/views/library/*Main.tsx` | Layout-only wrappers that `App.tsx` routes to. |
| Tests | `src/lib/libraryCollections.test.ts`, `collectionIndex.test.ts`, `openingTree.test.ts`, `shippedCollections.test.ts`, `libraryCollectionStore.test.ts`, `libraryFolderStore.test.ts` (folder CRUD, `folderId`, the v1 → v2 upgrade), `folderTreeRows.test.ts`, `wirepgn.test.ts`, `gameReference.test.ts` (the `library` key), `src/views/library/Library.test.tsx` (every screen), and `views/tools/analysis/AnalysisBoard.test.tsx` (a `?game=library/…` arrival). |

Locale keys all live under `library.*` in `src/locales/en.ts` / `he.ts`
(`he` is typed `typeof en`, so a missing key is a compile error). The only
exceptions are the shared pieces a screen passes a `labelKey` to (the export
bar reads `library.table.picks.*`, the changes strip reads `library.changes.*` /
`library.shippedChanges.*`, the folder dialogs read `library.folder.*`).

---

## 1. The model

```
                     ┌─────────────── CollectionSummary ───────────────────────┐
                     │ id · name · source ("shipped"|"uploaded") · count        │  ← the list (/library)
                     │ addedAt · folderId (uploads; null = the top level)       │
                     └─────────────────────────────────────────────────────────┘
a collection =   ──▶ rows:  CollectionRow[]  (its INDEX, one per game)      ← the table (/library/<id>)
                 ──▶ games: string[]         (one PGN chunk per game)        ← a board, a download
```

- **A collection is one PGN text of many games**, such as a tournament or one
  player's games, held as **one PGN chunk per game, in file order**. It is not
  a single game (that goes to the Analysis Board) and not a position.
- **Folders over collections, never inside them** (CTA-88). The Library is a
  tree of folders holding collections; each collection is a table, and each
  row is a game. A collection is not a folder: it holds games, not folders or
  other collections. The shipped collections sit in the fixed, read-only
  **Built-in** folder; the reader's uploads sit at the top level or in the
  reader's own folders, nested to any depth (§4.4). The sidebar has no entry
  per folder or collection; they are rows of `/library`.
- **Three parts, each read only when a screen needs it.** The **summary**
  (list), the **rows** (table) and the **games** (board and download). Opening
  `/library` reads summaries only. For shipped collections that is the
  manifest, so there is no fetch at all. Opening a table reads the index. Only
  a game or a download reads the PGN.
- **A game is addressed by its place**: `/library/<collection>/<1-based n>`,
  the table's `#` column. Nothing inside a PGN is an id (two games of one
  round can share every tag), and a number is what a reader says. So **any
  write that inserts or removes games renumbers the ones after them**. That is
  expected, and it is why picks are cleared after a delete (§6.5).
- **`source` decides what may be written.** A **shipped** collection is
  read-only everywhere: no Update, no Add games, no delete, and its game's
  "Save as copy" goes to Saved analyses. An **uploaded** collection (made from
  a file, a paste, or empty) is the reader's own and takes every write.
- **Sizing target: 5,000–10,000 games per collection.** A 10,000-game index is
  about 4.8 MB (one JSON parse; 3.7 MB measured over the 7,818-game fixture,
  whose `line`s are whole games since CTA-92), and its PGN is about 9.5 MB.
  One text read in is capped at `MAX_COLLECTION_CHARS` = 100,000,000
  characters (about 100,000 games). The cap protects the tab's memory, not
  storage. The real 7,818-game fixture `src/test/fixtures/pgn/Carlsen.pgn` is
  the scale every performance claim below was measured at.

### 1.1 A row — `CollectionRow`

| Field | From | Notes |
| --- | --- | --- |
| `number` | its place | 1-based. **Not stored** in the index: `numberedRows` adds it on read. |
| `white`, `black`, `whiteElo`, `blackElo`, `round`, `event`, `eco` | tags | Elo only if a positive integer. |
| `result` | `Result` tag | As PGN writes it (`1-0` `0-1` `1/2-1/2` `*`), `*` if missing. |
| `date` | `Date` tag | Unknown `.??` parts dropped: `1848.??.??` → `1848`; `????.??.??` → none. |
| `opening` | `Opening` + `, Variation` | Or, **only when the tags lack it**, from eco.json (the index pass). |
| `eco` | `ECO` tag | Or, when the tags lack it, from eco.json. **A tag always wins.** |
| `moves` | parsed mainline | Full moves: 41 plies → 21. (`collectionRowOf` counts it from the text; the index replaces that with the parsed count.) |
| `unreadable` | index pass | `parsePgnTree` threw. The table marks it; Analyse skips it. |
| `line` | index pass | The parsed mainline **in full**, as SAN (CTA-92; CTA-76's first cut stopped at 30 plies). **Absent** for unreadable games, games not from the standard start, and indexes from before the column; an index from between the two holds only each game's first 30 plies, which the tree follows as far as they go. |

**The table never parses a game.** A row is built **once**, when the
collection comes in, and read afterwards.

---

## 2. The architecture

```
 SHIPPED                                                     UPLOADED
 node scripts/wirepgn.js x.pgn                               /library/new  (file · paste · empty)      /library/new?into=<id>
   collectionGamesOf + buildCollectionIndex                    readCollectionText                         (same reading)
   (src/lib via Vite runnerImport)                             indexCollection → worker: buildCollectionIndex
        │                                                               │
        ▼                                                               ▼
 src/data/library/                                           IndexedDB chessapp.library
   manifest.json ── static import ─┐                           collections (summary) ─┐
   x.index.json ── lazy chunk ─────┤                           indexes (rows)        ├─ one record each per collection
   x.pgn ───────── lazy chunk ─────┤                           games (PGN chunks)    ─┘
                                   │                           folders (the reader's, lib/libraryFolderStore.ts)
                                   ▼                                    ▼
                    lib/shippedCollections.ts             lib/libraryCollectionStore.ts
                    (fetched once, kept, peekable)        (read once, kept, peekable, BroadcastChannel)
                                   └──────────────┬─────────────────────┘
                                                  ▼
                              views/library/useLibraryCollections.ts
                         useCollectionSummary · useCollectionRows · useCollectionGames
                              (useSyncExternalStore over the peeks + an effect that loads)
                                                  │
        ┌─────────────────────────┬───────────────┴──────────────┬─────────────────────────────┐
        ▼                         ▼                              ▼                             ▼
   /library                 /library/<id>                  /library/<id>/<n>             /tools/analysis?game=library/<id>/<n>
   LibraryHome              CollectionScreen               LibraryGameScreen →           (lib/libraryGameCatalog.ts via
   (summaries only)         + CollectionFilters            LibraryGameBoard              lib/gameReference.ts)
                            + OpeningFilterBoard           (useAnalysisSession + explorer)
                            (rows only)                    (games)
```

Both sources end in the same three hooks, so **every screen treats shipped
and uploaded collections alike**. A screen branches on `source` only to decide
what it may write.

### 2.1 Reading pattern: peek, subscribe, load

Both stores work the same way, and the hooks depend on it:

- **`peek*(id)`** returns what has been read, synchronously: `undefined`
  means *not read yet*, `null` means *not there / failed*, and anything else
  is the value. It is **stable between changes**, which `useSyncExternalStore`
  requires.
- **`subscribe*`** tells listeners when a read lands or a write settles.
- **`load*`** starts the read (once, and concurrent calls share it) and
  resolves when it lands.

`useCollectionPart` renders from the peek and runs an effect that calls
`load` while the peek is `undefined`. So a second visit renders on its first
frame, and a write made on a board (Update) is in the table on the way back.
**A new consumer uses the hooks, never the stores directly**, apart from
one-off actions (a download: `loadCollectionGames`).

---

## 3. Shipped collections

### 3.1 Wiring a file — `scripts/wirepgn.js`

```sh
node scripts/wirepgn.js path/to/Candidates2024.pgn [--name "…"] [--id slug]   # wire or re-wire
node scripts/wirepgn.js --list | --check | --rebuild | --remove <id>
```

1. Copies the file to `src/data/library/<Stem>.pgn`, with line endings
   normalised.
2. Cuts it with **`collectionGamesOf`** and indexes it with
   **`buildCollectionIndex`**, which is the app's own code, loaded through
   Vite's `runnerImport`. So a wired file and the same file uploaded produce
   identical rows. The opening book is read from `src/data/openings/` on disk,
   because `loadOpeningBook`'s dynamic imports come back empty under the
   runner.
3. Writes `<Stem>.index.json` and registers the collection in
   `manifest.json`: `{ id, name, pgn, index, games, hash }`, where `hash` is
   `textHash` (FNV-1a, line endings normalised) of the PGN.

The name defaults to `collectionNameOfStem` (`WorldCup2023` → "World Cup
2023"). The id defaults to `collectionIdOfStem` (the slug, `worldcup2023`),
which is the route segment. Wiring again over a taken id or file name
**replaces** that collection. Indexing costs about 8–12 ms a game: two
minutes for 10,000 games.

**Never drop a `.pgn` in by hand or edit one in place.**
`shippedCollections.test.ts` fails on an unwired `.pgn`, and on a PGN whose
hash no longer matches its entry. `wirepgn --check` exits 1 for the same
reasons, so it can run in CI. After adding a collection, add its name and
count to `shippedCollections.test.ts` (it asserts the shipped set).

Three collections ship: `WorldCup2023` (674 games), `Bucharest2023` (45) and
`Morphy` (211).

### 3.2 Loading — `lib/shippedCollections.ts`

| Cost | When | Size (World Cup / 10k games) |
| --- | --- | --- |
| manifest | static import, in the bundle | a few hundred bytes |
| index | lazy chunk, when the table opens | ~350 KB / ~4.8 MB |
| PGN | lazy chunk, when a game opens or the collection downloads | ~620 KB / ~9.5 MB |

Each is fetched **once** and kept. A failed fetch is kept as `null`, which
reads as "missing". The index is checked on load (`decodeCollectionIndex`,
with a row count equal to the manifest's `games`), so a broken index rejects
rather than showing a wrong table. `shippedCollectionsOf(manifest, pgnLoaders,
indexLoaders)` takes its inputs as parameters so a test can pass its own
files. Malformed, duplicate or file-less entries are left out.

---

## 4. Uploaded collections — `lib/libraryCollectionStore.ts`

### 4.1 Why IndexedDB

A 10,000-game collection is about 10 million characters. `localStorage` holds
about 5 million for the **whole origin**, shared with every other store.
IndexedDB's quota is a share of the disk. Every store of the reader's data is
IndexedDB now — the Library (`chessapp.library`), the saved analyses
(`chessapp.analyses`), the engine games and the repertoires; the whole
map is [`database.md`](./database.md). The connection is opened through the
shared `lib/idb.ts`.

### 4.2 Schema — three object stores per collection, and the folders

| Object store | Record | Read by |
| --- | --- | --- |
| `collections` | `{ id, name, addedAt, count, folderId }` | the list, which stays small |
| `indexes` | `{ id, rows: IndexedRow[] }` | the table |
| `games` | `{ id, games: string[] }` | a board, a download |
| `folders` | `{ id, seq, value: GameFolder }` (an `idbRecordStore` row) | the list |

Splitting them means the list never loads games, and an edit rewrites one
collection, not all of them. The database is opened in `lib/libraryDb.ts` at
**version 2**: version 1 had the first three stores, and CTA-88's upgrade only
created `folders` (`onupgradeneeded` creates any missing store), so no
reader's collection was touched. **`folderId` needed no migration**: a summary
from before it has none, and an absent `folderId` — or one naming a folder that
is not there — reads as the top level. A future schema change bumps the
version again (§10.4).

### 4.3 Writes

Every write that touches the games goes through **`editGames(id, change)`**:
one `readwrite` transaction over all three stores. It reads the summary, the
index and the games, lets `change(games, rows)` edit copies **in place**
(returning `false` to refuse, which answers `"missing"`), then writes the
games, the rows and `count: games.length`. After it commits, `settle` updates
the caches, re-reads the summaries and announces the change to other tabs.

| Write | Used by | Behaviour |
| --- | --- | --- |
| `addCollection(name, games, rows, now?, id?, folderId?)` | upload, empty collection | New id (`u` + `newRecordId`, so it can never collide with a shipped slug). Empty `games` is allowed. Filed in `folderId` (default `null`, the top level). |
| `removeCollection(id)` | `/library` row delete | Deletes all three records. An unknown id is a no-op. |
| `moveCollection(id, folderId)` | `/library` row's Move to… | Rewrites the summary's `folderId` only. An unknown id answers `"missing"`; the same folder is a no-op. |
| `refileCollectionsIn(folderId, parentId)` | `removeLibraryFolder` | Every collection filed directly in the folder moves to its parent, in one transaction. |
| `replaceCollectionGame(id, n, pgn, row)` | game board Update | Rewrites in place. |
| `insertCollectionGame(id, n, pgn, row)` | game board Save as copy | Inserts at `n`; later games move down. |
| `appendCollectionGames(id, games, rows)` | Add games (`?into=`) | Appends at the end. |
| `removeCollectionGames(id, numbers)` | table delete of picked games | All or nothing: any number out of range refuses the whole delete. Later games move up. |

**Rules for writing:**

- **One row per game, always, in the same order.** Every write takes the
  game's `IndexedRow` with it (`indexGame(pgn)` for one game, the worker's
  rows for many). A write that changed games without rows would leave the
  table wrong until a re-index, and there is no re-index for uploads.
- **Non-throwing.** Reads answer empty or `null`. Writes answer
  `LibraryCollectionProblem` (`"storage"` for a quota or unavailable
  IndexedDB, `"missing"` for a gone collection or a bad game number). The one
  exception is a programming error: rows and games of different lengths throw.
- **No spread over big arrays** (`push(...xs)`, `splice(0, n, ...xs)`). A
  collection can hold tens of thousands of games, and argument-count limits
  are engine-specific (about 65k in JavaScriptCore). Use loops, as
  `appendCollectionGames` and `removeCollectionGames` do.
- **Other tabs** hear about a change through a `BroadcastChannel`
  (`chessapp.library`, message `{ id }`). The listener drops that id's caches
  and re-reads the summaries. The folder store's writes share the channel
  (message `{ store: "folders" }`); the collections' listener ignores them,
  and the folder store's own re-reads the folders.

### 4.4 Folders — `lib/libraryFolderStore.ts` (CTA-88)

The reader's folders are **the app's one nested-folder model**: a folder is a
`GameFolder` (`{ id, name, parentId, savedAt, updatedAt }`) and every read over
the tree is `lib/savedGameFolders.ts`'s, cycle-safe, with a parent that is not
there read as the top level. The store is an `idbRecordStore` (non-throwing,
queued writes, idempotent no-ops, the channel) over the `folders` object store.

| Write | Behaviour |
| --- | --- |
| `createLibraryFolder(name, parentId)` | At the top level or inside any folder, to any depth. Hands the folder back, or `undefined` for an empty name, a parent that is not there, or the cap (100). Names are trimmed to 100 characters. |
| `renameLibraryFolder(id, name)` | In place; an empty or unchanged name is a no-op. |
| `moveLibraryFolder(id, parentId)` | Refuses the folder's own subtree and a parent that is not there. |
| `removeLibraryFolder(id)` | **Keeps the contents**: its sub-folders and the collections filed directly in it move up to its parent (the top level for a top-level folder). This differs from Saved analyses, where the analyses become Unfiled, because the Library has no Unfiled — the parent is the nearest place. |

**Built-in is not a record.** `BUILT_IN_FOLDER_ID` (`"builtin"`, which
`newRecordId` — always starting `g` — can never mint) is a folder the list
makes up to hold the shipped collections. It is never stored, so it cannot be
renamed, moved or deleted, no picker offers it, and a collection naming it is
read as the top level.

**The export keeps the tree.** Settings' Export (`lib/dataExport.ts`,
[`import-export.md`](./import-export.md) §1) writes each collection into a directory
per folder under `collections/` (the shipped ones in `collections/built-in/`),
and its manifest carries each upload's `folderPath` and the whole folder tree
(`folders.collections`), so an empty folder survives. Settings' Import
(CTA-89, `lib/dataImport.ts`) puts it back: folders matched by their path of
names (created when not here, `addLibraryFolders`), each upload indexed with
`indexCollection` and written with `addCollection` under its own id and
folder, the shipped ones never — [`import-export.md`](./import-export.md) §4–5.

---

## 5. The index — `lib/collectionIndex.ts`

A row starts as `collectionRowOf` (tags only, no `chess.js`). The index adds
what **only a real parse** can say, through `parsePgnTree`, the exact parser
the game's board opens it with:

- `moves` from the parsed mainline;
- `unreadable` when the parse throws;
- `eco` / `opening` from eco.json (`OpeningLookup`: the deepest named
  position along the mainline, `openingOfLine`), but only where the tags are
  missing. This is how Morphy's games, which have no `Opening` tag, get one;
- `line`: the whole mainline as SAN, only from the standard start — stored
  deep (a game averages about 90 plies) and cut at view time by
  `openingTreeOf`, where the collection's branching is known.

The cost is about 8 ms a game (`chess.js` matching SAN). It is **paid once**,
when a collection is wired, uploaded or added to, and **never when the table
is viewed**.

**Where it runs:**

| Caller | Function |
| --- | --- |
| `wirepgn` | `buildCollectionIndex` (sync), book shards from disk |
| upload / Add games | `indexCollection` → `collectionIndex.worker.ts` (a **module** worker, `worker: { format: 'es' }` in `vite.config.ts`, because it loads the book's chunks with dynamic `import()`), with progress about 10 times a second and cancel by `terminate()`. Under jsdom (no `Worker`) it falls back to `buildCollectionIndexAsync` in yielding batches. |
| Update / Save as copy on a game | `indexGame(pgn)` (one row, with the app's book) |

**The file format** (`<Stem>.index.json`): a JSON head
`{ format: "chessapp.collectionIndex", version: 1, hash, count, columns }`,
then `rows` as **tuples under the column list**, one row per line (so a
re-wired file diffs by game). `decodeCollectionIndex` finds cells **by column
name**, so a newer column in an older file reads as absent, and an unknown
column is ignored. `line` is stored as its SAN joined by spaces. `unreadable`
is `1` or `null`. Decoding is non-throwing: a wrong format, a wrong version,
or a count mismatch gives `undefined`.

---

## 6. The screens

### 6.1 Routes

| Route | Screen | Reads |
| --- | --- | --- |
| `/library` | `LibraryHome` | summaries |
| `/library/new` | `LibraryUpload` (new collection) | the folders (for the picker) |
| `/library/new?folder=<id>` | `LibraryUpload`, the picker starting at that folder (a folder row's *Add a collection here*); an unknown or Built-in id is the top level | the folders, waited for |
| `/library/new?into=<id>` | `LibraryUpload` (add games; uploaded collections only, otherwise the miss) | that summary |
| `/library/<collection>` | `CollectionScreen` | summary + rows |
| `/library/<collection>/<n>` | `LibraryGameScreen` → `LibraryGameBoard` | summary + games |

`new` is a static segment, so it ranks above `:collectionId`. **Never give a
collection the id `new`**; minted ids start with `u`, and slugs come from file
names.

### 6.2 `/library` — the folder tree table

A file manager's **details view** (CTA-88): `FolderTreeTable` over rows from
`folderTreeRows`, in the screen's flex column under the header bar and the
words box, **the table the one region that scrolls**, its header sticky.

- **Rows.** One per folder or collection, indented by depth
  (`paddingInlineStart`, so it mirrors), a chevron button on each folder
  (`library-folder-<id>-toggle`, `aria-expanded`; a closed chevron points the
  way the text runs, set as an inline style so the RTL stylis plugin leaves it
  alone). Clicking a folder row (`library-folder-<id>`) or its chevron opens or
  closes it in place; which folders are open is the screen's state, not the
  URL's. Clicking a collection row (`library-row-<id>`) opens its table, and
  its name is a **real link** (`library-collection-<id>`) for the keyboard and
  a middle click. Names take `dir="auto"`.
- **Built-in** (`library-folder-builtin`) is always the first row and open at
  the start; it holds the shipped collections, and is read-only (§4.4): its
  one action is the download, and its collections' only action is theirs.
- **Columns**: Name, **Games** (a collection's count; a folder's is the total
  of its whole subtree), **Added** (an upload's date, a folder's creation, a
  dash for Built-in and the shipped collections), then the actions. Name,
  Games and Added sort from their headers (`library-collections-sort-<column>`):
  `?sort=` (`games` / `added`; absent is Name) and `?dir=` (absent is the
  column's default — Name A to Z, Games and Added high first), written with
  history replace, keeping only what differs from the default, as the
  collection table does (§6.4). **Folders always come before collections at
  every level**, and Built-in before every other folder. Missing values go
  last either way; ties go by name.
- **Row actions** (icon-only, with tooltips), shown on hover and on keyboard
  focus (always on a device that cannot hover), in a cell of their own — a
  click there never reaches the row:
  - a reader's folder (`library-folder-actions-<id>`): *Add a collection here*
    (`library-folder-upload-<id>`, a link to `/library/new?folder=<id>`), *New
    sub-folder* (`-new-`), *Download* (`-download-`: the whole subtree as one
    `.pgn`, its collections by name), *Rename* (`-rename-`), *Move to…*
    (`-move-`, the shared `FolderMoveDialog`, which leaves out the folder's own
    subtree) and *Delete* (`-delete-`: an empty folder goes at once; otherwise
    the shared `FolderDeleteDialog` says the contents move up to its parent);
  - an upload (`library-collection-actions-<id>`): *Download*
    (`library-collection-download-<id>`), *Move to…* (`-move-`, the shared
    `FolderPicker` in `library-collection-move-dialog`, the top level its
    "none") and *Delete* (`-delete-`, confirmed in `library-delete-dialog`);
  - a shipped collection: *Download* only.
- **New folder** (`library-new-folder`) in the header makes a top-level
  folder; *New sub-folder* opens its parent so the new one is in view. The
  name dialog is the shared `FolderNameDialog` (`library-folder-name-*`).
- **The words box** (`library-filter`, `?q=`, history replace) keeps the
  collections whose name holds the words (any case), the folders whose name
  does (with everything under them, closed until opened), and the folders on
  the way down to either — **the folders above a match open by themselves**,
  and the reader can still close or open any of them while the words stay.
  The count reads "N of M collections" while the filter is on; nothing left
  is `library-no-matches`.
- **Listing still fetches nothing** (§7): the rows are summaries, the folders
  and the manifest. Downloads read games only when clicked.

### 6.3 `/library/new` — upload, empty, add games

- **A file or a paste goes through one reading**, `readCollectionText`: line
  endings normalised, refused when empty or over `MAX_COLLECTION_CHARS`, cut
  by `collectionGamesOf` (split where `[Event …]` follows a blank line; a
  chunk with no tag and no SAN move is dropped), `unreadable` when no game is
  left. The file name is never read except to suggest a collection name. So
  the two routes cannot drift apart.
- **Checked before it is kept**: the worker's index pass under a progress bar
  (`library-upload-indexing`), with Cancel (`library-upload-cancel`). Leaving
  the screen cancels too. Nothing is written until the pass succeeds.
- **The name**: as typed, else the `Event` every game shares, else the file
  name's words, else "Pasted collection".
- **The folder** (CTA-88): a `FolderPicker` (`library-upload-folder-picker`,
  shown once the reader has a folder) files the new collection — the top
  level by default, or the `?folder=<id>` the upload was started from. The
  route waits for the folders' first read before it decides; an unknown or
  Built-in id is the top level. The empty collection is filed the same way.
- **Empty** (`library-upload-empty`): `addCollection(name || "New collection",
  [], [])`, then its table. An empty table says "no games yet"
  (`library.table.noGames`).
- **`?into=<id>`** (the table's **Add games**, `library-table-add-games`): the
  same screen without the name field or the empty button, a title "Add games
  to ‹name›", the same reading and check, then `appendCollectionGames`, then
  back to the table. A shipped or missing `into` is `LibraryMiss`.

### 6.4 `/library/<collection>` — the table

**Layout.** A flex column: the header bar (back, name + count, Add games, the
export bar, Analyse), the words box, then the `TableContainer` (the one
region that scrolls, both directions, with a sticky header), then the
pagination pinned under it. The right-hand panel (`RightPanel`) holds the
filters and, at its foot, the shipped/uploaded note.

**Columns** (`COLLECTION_COLUMNS`): `#`, White, Elo, Black, Elo, Result, Date,
Round, Event, ECO, Opening, Moves. The `#` cell carries the unreadable mark
(`library-table-unreadable-<n>`). The row click and a real link in the White
cell (for the keyboard and middle-click) open the game, passing
`state.from` so the board's back button returns to the same filtered view.

**Sort** (`sortedRows`). The default is **Date, descending** (newest first).
A new column opens in its default direction: Date and the numeric columns
(Elo, Moves) descending, everything else (including `#`) ascending. A second
click reverses it. Numbers sort numerically, and text uses a numeric-aware
collator (round `1.10` after `1.9`). **Missing values go last in either
direction.** Ties are broken by `#`, **following the direction**, so with
newest first a day's later games come first. The URL keeps only what differs
from the default: `?sort=` (absent means date) and `?dir=` (absent means that
column's default).

**Filters.** The words box `?q=` requires every word to appear in some text
column. The panel (`CollectionFilters`) holds, **in this order**:

1. **player** (`?player=`, part of a name, suggested from the games) and the
   **side** they had (`?color=white|black`, enabled once a player is typed);
2. the **opening-moves board** (§6.4.1), `?line=`;
3. **opening** (`?opening=`, matched against `openingLabelOf` =
   "`ECO` name", so `B9` or `najdorf` both work; listed in ECO order),
   **event** (`?event=`, exact), a **date range** (`?from=` / `?to=`, as
   `YYYY-MM-DD`; a partial PGN date is in range if **any** day it could be is
   in range, `dateBounds`), and **result** (`?result=`).

**A filter is shown only where some game carries its field**
(`collectionFacetsOf`): no dates, no date range; one event, no event picker.
**The suggestion lists are complete**, never a first page: the Carlsen
fixture offers 3,040 openings, 1,338 players and 622 events, which open in
about 100–170 ms in Chrome without virtualization. Clear
(`library-filter-clear`) removes every `COLLECTION_FILTER_PARAMS` value
(including `line`) and leaves the words box alone.

**Pages**: 50 / 100 / 250 (`?rows=`, default 50) and `?page=`. **All table
state is in the URL, written with history replace**, so coming back from a
game finds the table as it was, and a filtered table can be shared as a link.
A new filter or sort resets the page. **Picks are not in the URL**: a link
carries the filter, not a hand-made selection.

#### 6.4.1 The opening-moves board — `OpeningFilterBoard.tsx`, `lib/openingTree.ts`

- The tree is merged **from the rows the other filters leave**
  (`openingTreeOf(narrowed)`), so filtering by a player and side shows that
  player's openings. It is rebuilt whenever those filters change — about
  150 ms for 10,000 full-length rows (§7), with no `chess.js`.
- A node keeps only its counts (`count`, and `results` for White / draw /
  Black). **Which games pass through a node is not stored**: they are the
  rows whose `line` starts with the path, which is exactly `filteredRows`'
  `line` filter. So edits to a collection can never leave the tree stale.
- **The tree is cut where the games stop branching** (CTA-92): a node a
  single game passed keeps no children, so the walk ends exactly where there
  is nothing to choose, and a lone game's tail draws no lone arrow. The cut
  node is marked (`continues`), and the board's caption there says one game
  goes on — not the games' own-end wording. A tree holding one game (a
  one-game collection, or filters narrowed to a single game) is kept whole,
  so the board stays walkable to its end.
- From the position shown: the continuations as **play-chance arrows** over
  the board (`ChanceArrows`, white with a magenta border, the wider the more
  of the position's games played the move, the hovered one red — the
  repertoires' own encoding, CTA-92) and a lichess-explorer-style list (each
  move's games, share and W/D/B bar; click to play it, hover to draw its
  arrow). **Only moves some game played are accepted**; any other drop snaps
  back. A promotion the games made in more than one way asks for the piece.
  There are back, reset and flip controls. The board is pinned LTR.
- `?line=e4,c5,Nf3` uses the `?at=` encoding. It is cut back **where no game
  in the whole collection follows it** (a stale link) **and where the tree's
  cut stops** — a line past the cut lands on the last shared position. When
  only the other filters leave no game on it, it stays as written, the table
  is empty, and the board says so.
- No game has a `line` (an index from before the column) → no board.
- The board's `chess.js` replay of the line runs up to a game's full length
  (once at most 30 plies), memoized on the line and the node.

### 6.5 Picks, export, delete, Analyse

- A checkbox per row (`library-picks-row-<n>`) and the shared
  `SavedListExportBar` (prefix `library-picks`, `labelKey`
  `library.table.picks`). **Select-all takes every row the filters leave, on
  every page**, and adds them to the picks. Unticking removes only the rows
  shown. The chip counts every pick.
- **Download** (`library-picks-download`): one `.pgn` of the picked games in
  collection order, each game exactly as stored,
  `<collection>-<N>-games.pgn`. The whole collection downloads from its
  `/library` row, so a table has only this one download.
- **Delete** (`library-picks-delete`, **uploaded only**): confirmed in
  `library-picks-delete-dialog` ("Delete N games?"), then
  `removeCollectionGames`. **The picks are cleared afterwards**, because the
  numbers have shifted and a kept pick would name a different game. A failed
  write shows its problem in the dialog. The whole collection is deleted
  from `/library`, never from its table.
- **Analyse** (`library-picks-analyse`, shipped and uploaded alike): saves the
  picks to **Saved analyses** as one new top-level folder, named by
  `batchFolderNameOf` (`World Cup 2023 — 12 games (Carlsen, white, B90, 1.e4
  c5)`, within the folder name's 100 characters, the filter summary cut
  first), with one analysis per game in collection order, **all or nothing**.
  It creates the folder first, then `addAnalyses(batchAnalysesOf(…))` with
  each PGN **as stored**, not re-parsed (a re-write through a tree would take
  over a minute on a 7,818-game pick). If the write fails, the folder is
  removed again. **Unreadable games are left out** and the notice says how
  many. A snackbar (`library-picks-analyse-notice`) links to
  `/tools/analysis/saved?folder=<id>`, and the picks stay.

### 6.6 `/library/<collection>/<n>` — the game board

`LibraryGameScreen` resolves the games, checks the number (otherwise the
miss) and parses the game **with its side lines** (`parsePgnTree`). An
unreadable game says so. The board is keyed by collection and number, so
previous / next mounts a fresh session.

`LibraryGameBoard` is a **board with no behaviour hook of its own** (the
authority is [`chessboard.md`](./chessboard.md) §9.4):
`useAnalysisSession` (core, engine, Play, baseline, shared with the Analysis
Board), `useVariationsExplorer` (editing on, *Play chances…* off), and
`BoardShell` / `BoardPanel` with `options.id` `library-game`.

- **Tabs**: Moves (the **next-move arrows switch** `library-game-arrows` at
  its top) · Map · Info (the tags, `GameInfo`) · Export · Engine.
- **Header**: back (to `state.from`, else the table), players, "Game n of m"
  and event/round/date/result, the current opening, previous / next, Save,
  Play and the engine switch.
- **Opens at** `?at=`, else its `StartPly` tag, else the start. `?at=` is
  written back on every step (history replace, keeping `location.state`).
- **Nothing is written unless the reader asks.** Save lights up while
  `tree !== baseline` and opens the changes strip. **Uploaded**: Update
  (`replaceCollectionGame` + `indexGame`), Save as copy
  (`insertCollectionGame` right after it, and the board moves to the copy
  with the same `?at=`) or Discard. **Shipped** (`readOnly`): Save as copy
  into **Saved analyses** ("‹players› (copy)"), then open it on the Analysis
  Board; or Discard. Leaving with unsaved changes triggers `beforeunload`.
- **Export tab → Analysis Board** (`library-game-open-analysis`): a
  link to `/tools/analysis?game=library/<collection>/<n>&at=<position>`. It
  opens **the game as the collection holds it**. Unsaved session changes stay
  behind, and the caption under the button says so while there are any.

### 6.7 The `?game=library/…` reference — `lib/libraryGameCatalog.ts`

`catalogsByKey` in `lib/gameReference.ts` maps `library` to
`findLibraryGame(segments)`, where `segments` is `[collectionId, n]`. It
answers from what has been read (`peekShippedGames` / `peekUploadedGames`),
parses the one game's mainline (`parsePgnGame`), and returns `undefined` for
anything unread, missing, non-numeric or out of range. Because games load
lazily, **`AnalysisBoardRoute` waits**: `isReferenceRead(game)` decides whether
to show "reading…", and `loadReferencedGames(game)` fetches the shipped PGN or
reads the upload. It waits the same way for the saved analyses.

---

## 7. Performance budgets (measured; keep them)

| What | Budget | Why it holds |
| --- | --- | --- |
| Opening `/library` | no fetch | the manifest is in the bundle; uploads read summaries only |
| Opening a 10k table | one JSON parse (~4.8 MB) | the index; no game parsed |
| Rebuilding the opening tree | ~150 ms / 10k rows | SAN merge of whole-game lines, no `chess.js`; the cut prunes as it finishes |
| Filter lists (7.8k games) | ~100–170 ms to open, no virtualization | plain sets |
| Indexing | ~8–12 ms / game, off the main thread | worker; paid once |
| Analyse 7.8k picks | no re-parse | PGN stored as is |

A change that parses games on view, fetches the PGN to draw a table, or runs
`chess.js` per row per render breaks this module's premise. Put the work in
the index instead (§10.1).

---

## 8. Invariants — never break these

1. **One cutting rule.** Only `collectionGamesOf` turns text into games (CLI,
   upload, Add games, shipped loading). A second splitter would make a wired
   file and the same file uploaded differ.
2. **One indexer.** Only `indexedRowOf` / `buildCollectionIndex` make rows,
   and the CLI loads them from `src/lib`, never a copy.
3. **Games and rows move together**, in one IndexedDB transaction, always the
   same length and order (§4.3).
4. **Shipped is read-only.** No write path may take a shipped id. Screens
   gate on `source === "uploaded"`, and `?into=` refuses shipped collections.
   Their **Built-in** folder is not a record: it is never renamed, moved or
   deleted, no picker offers it, and nothing is filed in it (§4.4).
5. **The table never parses or fetches games.** Download, Analyse and a board
   read the games; the table reads rows.
6. **State in the URL, with history replace**, for everything but the picks.
7. **Stores are non-throwing** and report problems. Screens show them and
   never crash.
8. **The boards never mirror.** The filter board is in `ForceLTR`, and SAN or
   notation tokens take `dir="ltr"` (root `CLAUDE.md`, *Theming*).
9. **Unique `options.id`**: `library-filter-board`, `library-game`.
10. **The game board is composed from the core.** No behaviour hook of its
    own, no second panel. It stays under `boards.test.tsx` and
    `panelPropagation.test.tsx`.
11. **Folders hold collections; collections hold games.** One folder model
    (`GameFolder`, `lib/savedGameFolders.ts`), a folder never moved into its
    own subtree, a `folderId` that does not resolve read as the top level, and
    **deleting a folder keeps its contents** — they move up to its parent.

---

## 9. Testing

- **Where**: pure logic in `src/lib/*.test.ts` (listed in §0). Screens in
  `src/views/library/Library.test.tsx`, one file that mounts every Library
  route in a `MemoryRouter` with `RightPanelProvider` and a `Where` probe
  (`where()` returns the current path and search).
- **Stubs**: `react-chessboard` → `reactChessboardMock()`, `lib/engine` →
  `FakeEngine`, `lib/openings` → `openingsMock` (all from
  `views/board/boardTestHarness.tsx`). `downloadPgn` is mocked to capture what it
  was given. `boardOptions()` reads the last board's options, which is how the
  tests drive drops (`onPieceDrop`) and assert arrows and positions.
- **IndexedDB** is `fake-indexeddb` (`src/test/setup.ts`). Call
  `resetLibraryFolderStore()` and `resetLibraryCollectionStore()` (which
  deletes the database) in `beforeEach`; the teardown also waits for and
  forgets the folder store, as it does every record store. Seed folders with
  `createLibraryFolder` and a filed collection with `keep(name, games,
  folderId)`. A dialog left closing still `aria-hidden`s the page, so reading
  the list's rows by role takes `{ hidden: true }`. Helpers in the test file:
  `keep(name, games)` and `upload()` (the three `GAMES`) add a collection;
  `keepCarlsen()` adds the 7,818-game fixture with **tag-only rows** (the
  full index pass would take a minute); `mountTable` / `mountGame` wait for
  their screen.
- **jsdom has no `Worker`**, so `indexCollection` uses the in-thread path.
  Uploads in tests are real index passes, so keep pasted texts small.
- **Shipped data** is real in tests (the globs resolve). `peekShipped*` stay
  `undefined` until a test loads them, which is how "lists without fetching"
  is asserted.
- **Order-sensitive assertions**: the table opens newest first. A fixture
  with dates comes back reversed. Mount with `?sort=number` when a test needs
  collection order (for example, picking game 1 of Morphy).
- Commands: `npx vitest run src/views/library/Library.test.tsx`,
  `npx vitest run src/lib/libraryCollectionStore.test.ts`,
  `npx vitest run src/lib/libraryFolderStore.test.ts`, then `yarn test:run`.

---

## 10. Extending — recipes

### 10.1 A new table column, or anything else that needs a parse

1. Add the field to `CollectionRow` (optional, so older indexes read as
   absent).
2. Compute it in `indexedRowOf` (it has the parsed tree), or in
   `collectionRowOf` if the tags alone are enough.
3. Add it to `INDEX_COLUMNS` in `collectionIndex.ts`, with its encode and
   decode (texts and numbers are generic; anything else is handled explicitly,
   as `line` is). **Do not bump `COLLECTION_INDEX_VERSION`** for an added
   column: decoding by name already reads old files. Bump it only for an
   incompatible change, which makes every old index unreadable.
4. Re-index the shipped files: `node scripts/wirepgn.js --rebuild`, then
   commit the `.index.json` diffs. Uploads keep their old rows (the field
   absent) until a game is updated. Make the UI tolerate absence (the opening
   board hides when no row has a `line`).
5. If it is a visible column: add it to `COLLECTION_COLUMNS` (the order is the
   table's), a cell in `CollectionScreen`, and `library.table.columns.<id>`
   in both locales. If it is numeric, add it to `NUMERIC` (it then sorts high
   first).

### 10.2 A new filter

1. Add the field to `RowFilter` and `CollectionFilterValues`, the URL param
   to `COLLECTION_FILTER_PARAMS` (so Clear removes it), and the test to
   `filteredRows`.
2. If it offers suggestions, add them to `collectionFacetsOf`, and **show the
   control only when the facet is non-empty**.
3. Read the param in `CollectionTable` (validate it; an unreadable value
   reads as `""`), pass it into both the `narrowed` rows (so the opening board
   reflects it) and the `batchFolderNameOf` call, and add it to
   `activeFilterSummary` so an Analyse folder is named by it.
4. Put the control in `CollectionFilters`: under the board, unless it is
   about the player.

### 10.3 A new write on uploaded collections

Write it as an `editGames` change: edit `games` and `rows` in place, return
`false` to refuse. Avoid spreads over large arrays. Keep it all or nothing.
Give it a store test (both lists, renumbered rows, `count`, and the refusal),
and gate its UI on `source === "uploaded"`. If it renumbers games, clear any
per-number UI state (picks) afterwards.

### 10.4 A schema change in IndexedDB

Bump the version in `lib/libraryDb.ts`, migrate in `onupgradeneeded` (create
stores, never drop a reader's data silently), and keep reads tolerant of old
records (`isStoredSummary`-style guards). A changed record shape needs a
normaliser on read, not a crash. CTA-88 is the worked example: version 2 added
the `folders` store, and `folderId` reads as the top level when absent, so no
record was rewritten (`libraryFolderStore.test.ts` opens a version-1 database
and upgrades it).

### 10.5 A positions collection (planned — not built)

The Library is built around **game** collections: a chunk is a PGN game, a
row is players/result/date, the board is an analysis board. A positions
collection (a list of FENs with a name, a comment and maybe a solution line)
should arrive as a **second kind beside it, not as special cases inside it**:

- **Model**: add a `kind` (`"games"` | `"positions"`) to `CollectionSummary`
  and the stored summary, with an absent value read as `"games"` (so no
  migration is needed for existing records). Keep `CollectionRow` for games,
  and give positions their own row type and their own index builder, with no
  `chess.js` game parse (a FEN is validated with `lib/fen.ts`'s `parseFen`).
- **Storage**: the same `chessapp.library` database and three-store layout
  work (summary / rows / items). Do not reuse the `games` store's meaning for
  FEN lists without the `kind` on the summary.
- **Screens**: `/library` lists both kinds (a chip or an icon). The table and
  the "game n" route are per-kind: a positions table has its own columns and
  filters (side to move, material, tags), and a position opens as a
  **position**, which turns the board to the side to move (root `CLAUDE.md`:
  *a position turns the board; a game does not*). The opening-moves board
  does not apply.
- **Reuse, don't fork**: the peek/subscribe/load pattern (§2.1), the URL
  state rules, the picks/export bar, `useCollectionSummary`, and the
  non-throwing store contract. Name new things `positionCollection…` /
  `…Positions…`, and keep this file's `Game`-prefixed names for games.
- When it is built, add its paths to this file's frontmatter (or give it its
  own rule file) and update §0.

### 10.6 Shipping another collection

`node scripts/wirepgn.js path/to/File.pgn` (§3.1), add its name and count to
`shippedCollections.test.ts` and the table in `src/data/library/README.md`,
and commit the `.pgn`, the `.index.json` and `manifest.json`. No TypeScript,
no route and no locale key are needed.
