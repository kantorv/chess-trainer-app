---
paths:
  - "src/lib/idb.ts"
  - "src/lib/idbRecordStore*"
  - "src/lib/*Db.ts"
  - "src/lib/*Store.ts"
  - "src/lib/*Store.test.ts"
  - "src/lib/playedGames*"
  - "src/lib/savedAnalyses*"
  - "src/lib/savedAnalysisFolders*"
  - "src/lib/savedRepertoires*"
  - "src/lib/savedRepertoireFolders*"
  - "src/lib/gameReference*"
  - "src/test/setup.ts"
  - "src/views/shared/useStoreRead.ts"
  - "src/views/engine/play/PlayedGameRead.tsx"
  - "src/views/engine/games/usePlayedGames.ts"
  - "src/views/repertoires/useSavedRepertoires.ts"
  - "src/views/repertoires/useRepertoireFolders.ts"
  - "src/views/repertoires/repertoireTestKit.tsx"
  - "src/views/tools/analysis/saved/useSavedAnalyses.ts"
  - "src/views/tools/analysis/saved/useAnalysisFolders.ts"
---

# The database — where the reader's data lives

Everything the reader makes in this app — games against the engine,
analyses, repertoires, their folders, uploaded Library collections — is kept
in the browser's **IndexedDB**, written through a small layer of our own. This
file is the whole reference for that layer: every database and who uses it,
how a store behaves, how screens wait for it, the rules that keep it
correct, how to test it, how to debug it, how to extend it, and when to
replace the hand-written layer with Dexie. It is written for people and for
LLM sessions alike, and loads automatically when you work on the files in its
`paths:` list.

> **The rule: data is IndexedDB; only preferences are `localStorage`.**
> Anything a reader would want to keep, move to another browser or (later)
> export belongs in IndexedDB. `localStorage` holds only UI preferences (§2).
> A new store never uses `localStorage`.

There is **no wrapper library** (no Dexie, no idb, no RxDB). That was
decided on purpose: nothing here queries the database — every store is read
whole into memory, and filtering, sorting and paging happen there — so a
wrapper's main features would go unused. §10 says when that changes.

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/lib/idb.ts` | **The connection helper**: `idbDatabase(name, version, stores)` → `{ name, open, remove }` (open once, upgrade by adding missing object stores, step aside on `versionchange`, reconnect after a failure; `remove` is the tests' delete), plus `done` (a request as a promise) and `committed` (a transaction's commit as a promise). Every database is opened through it. |
| `src/lib/idbRecordStore.ts` | **The record-store factory**: a list of rows kept as one IndexedDB record per row, handed out synchronously once read, written through a queue (§3). Every store but the Library's collections is one of these. |
| `src/lib/savedAnalysisDb.ts` | The `chessapp.analyses` database (object stores `analyses`, `folders`). |
| `src/lib/savedRepertoireDb.ts` | The `chessapp.repertoires` database (object stores `repertoires`, `folders`). |
| `src/lib/playedGameStore.ts` | The `chessapp.engine` database (object store `games`) and its store, in one file (one store, one database). |
| `src/lib/libraryDb.ts` | The `chessapp.library` database (object stores `collections`, `indexes`, `games`, `folders`), version 2. |
| `src/lib/libraryCollectionStore.ts` | The Library's hand-written collection store (§1.4) — not an `idbRecordStore`, because it reads a collection's rows and games lazily. |
| `src/lib/savedAnalysisStore.ts`, `savedAnalysisFolderStore.ts`, `savedRepertoireStore.ts`, `savedRepertoireFolderStore.ts`, `libraryFolderStore.ts` | The other record stores: each one's caps, idempotency comparison and operations, over the factory. |
| `src/lib/playedGames.ts`, `savedAnalyses.ts`, `savedAnalysisFolders.ts`, `savedRepertoires.ts`, `savedRepertoireFolders.ts`, `libraryCollections.ts` | **The records** — what each row is, and its **normaliser** (`playedGameFrom`, `savedAnalysisFrom`, `savedRepertoireFrom`, `analysisFolderFrom`, `repertoireFolderFrom`): the schema, read back leniently. Pure. |
| `src/views/engine/games/usePlayedGames.ts`, `views/repertoires/useSavedRepertoires.ts` / `useRepertoireFolders.ts`, `views/tools/analysis/saved/useSavedAnalyses.ts` / `useAnalysisFolders.ts` | The `useSyncExternalStore` bindings — `undefined` until the store's first read lands. |
| `src/views/shared/useStoreRead.ts` | "Can this route mount yet?" — a URL naming a record waits for its store's first read. |
| `src/views/engine/play/PlayedGameRead.tsx` | The play routes' wait (`?saved=`), over `useStoreRead`. |
| `src/lib/gameReference.ts` | `isReferenceRead` / `loadReferencedGames` — the Analysis Board's wait for a `?game=` whose store has not been read. |
| `src/test/setup.ts` | `fake-indexeddb`, and the teardown that lets writes land, resets every store and deletes every database (§7). |

---

## 1. The map — four modules, four databases

| Module | Database | Object store | Store module | Row | Order | Cap |
| --- | --- | --- | --- | --- | --- | --- |
| **Engine** (Play with Engine, Masked Pieces) | `chessapp.engine` | `games` | `playedGameStore.ts` | `PlayedGame` | newest first | 100 (oldest dropped) |
| **Analyses** | `chessapp.analyses` | `analyses` | `savedAnalysisStore.ts` | `SavedAnalysis` | newest first | 20,000 (a batch past it refused) |
| | | `folders` | `savedAnalysisFolderStore.ts` | `AnalysisFolder` | oldest first | 100 |
| **Repertoires** | `chessapp.repertoires` | `repertoires` | `savedRepertoireStore.ts` | `SavedRepertoire` | newest first | 500 (a split past it refused) |
| | | `folders` | `savedRepertoireFolderStore.ts` | `RepertoireFolder` | oldest first | 100 |
| **Library** | `chessapp.library` | `collections`, `indexes`, `games` | `libraryCollectionStore.ts` | a summary / index rows / PGN chunks per collection | newest first | 30M characters a collection |
| | | `folders` | `libraryFolderStore.ts` | `GameFolder` | oldest first | 100 |

Every database is at **version 1** but the Library's, at **version 2** (CTA-88
added its `folders` store; the upgrade only created it). Every object store is
keyed by `keyPath: "id"`, and **none has an index**. Each database is also the
name of its `BroadcastChannel` (the analyses' two stores share one channel, and
so do the repertoires' and the Library's — the Library's collection listener
ignores the folder store's `{ store }` messages).

### 1.1 Why one database per module

A module's lists are read by the same screens (a folder and what is filed in
it), so they share a connection; different modules share nothing, so a
database each keeps them independent — a new store in one never bumps
another's version, and a test or a reader can drop one module's data alone.
Consolidating into a single `chessapp` database would buy one thing,
transactions across modules, which nothing needs.

### 1.2 A row is JSON, and its schema is its normaliser

A row is plain JSON: PGN text plus a few fields. What a row *must* look like
is not declared to IndexedDB; it is the module's **normaliser**
(`…From(value: unknown) => Row | undefined`), which every read goes through:

- a row it refuses is **dropped**, never rendered;
- a field a newer build added and an older record lacks reads as its
  **default** (the repertoire settings, an analysis' name and folder, a
  played game's mask) — so a shape change **never needs a version bump**;
- the same normalisers are what a future import or sync would run incoming
  rows through.

### 1.3 The record stores (`idbRecordStore`)

The engine games, the analyses and their folders, the repertoires and their
folders. Each store file exposes the same surface — `…Snapshot` (the kept
list, `undefined` until read), `subscribe…`, `load…`, `settled…` (tests),
`reset…` (tests) — and its own operations, every one a promise of
`undefined` or a named problem (`"storage"`, `"too-many"`).

### 1.4 The Library (`libraryCollectionStore`)

A collection is too big to hold every game of every collection in memory, so
the Library keeps its own store: the `collections` summaries are read whole
(the list), and a collection's `indexes` and `games` records are read when
its table or a game opens, then kept (`peekUploadedRows` / `peekUploadedGames`
synchronously, `loadUploaded…` to read). Its writes go in one transaction
over the three object stores. A summary carries its `folderId`; the folders
are a record store of their own in the same database
(`libraryFolderStore.ts`), and deleting one re-files its collections into its
parent through the collection store (`refileCollectionsIn`). The connection is
`lib/libraryDb.ts`'s, over `lib/idb.ts` like every other; everything else about
it is in [`game-collections.md`](./game-collections.md) §4.

---

## 2. What stays in `localStorage`

Only preferences, written by libraries rather than by us:

| Key | Written by | What |
| --- | --- | --- |
| `mui-mode` (and MUI's other colour-scheme keys) | MUI's `ThemeProvider` with `colorSchemes` (`theme/AppThemeWithLang.tsx`) | light / dark / system |
| `i18nextLng` | `i18next-browser-languagedetector` (`i18n.ts`) | the language picked |

Nothing else in `src/` touches `localStorage`, and nothing reads the old
`chessapp.*.v1` keys — do not reuse those names.
`grep -rn localStorage src --include=*.ts --include=*.tsx | grep -v test`
should show only comments.

---

## 3. How a record store behaves — `lib/idbRecordStore.ts`

```
 screen ──useSyncExternalStore──▶ hook ──snapshot/subscribe──▶ store module ──write(rows → rows)──▶ idbRecordStore
                                                                  (caps, idempotency,                  │ queue · seq · commit
                                                                   operations)                         ▼
                                                                                          lib/idb.ts ─▶ IndexedDB
```

### 3.1 Reads are one promise; what was read is kept

The first subscriber (or `load()`) reads every row once (`getAll`). From then
on the list lives in memory and `snapshot()` hands it out **synchronously** —
`undefined` only until that first read lands. A second visit to a screen
therefore renders on its first frame. The snapshot is **the same array**
until a write changes it (`useSyncExternalStore` requires that).

### 3.2 Writes are queued updates, answered once committed

`write(update)` takes the current rows and returns the next ones. It runs
after every earlier write, so two writes issued back to back see each other
(a folder removed, then its records unfiled), and a **burst of autosaves**
stays one record. It resolves once the transaction has **committed** —
`undefined`, or `"storage"` if IndexedDB refused it (quota, disabled). The
kept list changes only after the commit, so a refused write leaves the screen
as it was. **Nothing throws.**

`update` returning **the same array** is "nothing to do": no transaction, no
emit — which is how every store keeps its idempotency (an identical re-save,
an unknown id, a no-op rename).

### 3.3 One record per row, and a `seq` for the order

Each row is stored as `{ id, seq, value }`. `seq` is the list's order (high =
the top of a newest-first list); a row keeps its own `seq` whenever the new
order allows, so an edit in place rewrites one record and a new row at the
top writes one more. Only rows whose object or `seq` changed are `put`; rows
gone are `delete`d.

### 3.4 Other tabs

Each write is announced on the store's `BroadcastChannel`; a tab that hears
one re-reads the store (queued behind its own writes) and re-renders.

### 3.5 `settled()` and `reset()`

`settled()` resolves once every write issued so far has landed — the tests'
way to wait for a screen's write. `reset()` forgets what was read (a
"reload"); it does not touch the database.

---

## 4. Screens wait for the first read

A read is a promise, so a screen that arrives **by URL naming a record** must
not decide "missing" (or "start a new game") before the store has been read:

| Arrival | Waits in | How |
| --- | --- | --- |
| `/engine/play?saved=`, `/engine/masked?saved=` | `PlayedGameRead` | `useStoreRead` over the played games, before `arrivalOf` is read once |
| `/tools/analysis?analysis=`, `?game=analysis/…`, `?game=play/…`, `?game=library/…` | `AnalysisBoardRoute` | `loadSavedAnalyses` and `isReferenceRead` / `loadReferencedGames` |
| `/repertoires`, `/repertoires/<id>`, `/…/settings`, `/…/games/<game>` | the route components | the hooks' `undefined` → `ReadingRepertoires` (`repertoires-loading`) |
| `/engine/games` | `PlayedGames` | the hook's `undefined` → `played-games-loading` |
| `/tools/analysis/saved` | `SavedAnalyses` | `saved-analyses-loading` |

A screen that reads **every** store at once — Settings' Export and Import
(`lib/dataExportSource.ts`, `lib/dataImportTarget.ts`,
[`import-export.md`](./import-export.md)) — calls each store's `load()`
before it plans, rather than trusting a snapshot a subscription may not have
filled yet. The Import then writes through each store's own operations — the
bulk ones added for it (`importPlayedGames`, `importAnalyses`,
`importRepertoires`: removals and additions in one write, merged by date with
`mergedNewestFirst`; `addAnalysisFolders`, `addRepertoireFolders`,
`addLibraryFolders`: all or nothing under the cap) — and never IndexedDB
directly.

The reading line's words are the catalog's `*.loading` keys
(`playedGames.loading`, `repertoires.loading`, `savedAnalyses.loading`).

A screen that **writes** treats the write as a promise: `await` it before
navigating to the record it made (Save as copy, a split, the upload), and
ignore an answer that is no longer about the record on screen
(`usePlayGame`'s save after a Replay — `currentId`).

---

## 5. Invariants — never break these

1. **Data never goes to `localStorage`.** A new store is an `idbRecordStore`
   (or, for data too big to hold whole, a Library-style store) in a module's
   database.
2. **Every database is opened through `lib/idb.ts`.** No second copy of the
   open / upgrade / `versionchange` code.
3. **An upgrade only adds.** A new object store is a new name in the
   database's list and a version bump; nothing is dropped or reshaped in
   `onupgradeneeded`.
4. **The schema is the normaliser.** Every read goes through it; a new field
   reads as its default on an older record; no version bump for a field.
5. **Nothing throws.** Reads answer empty or `undefined`, writes a named
   problem.
6. **Idempotent writes.** A write that changes nothing returns the same
   array (no transaction, no emit, no re-order).
7. **The kept list changes only after the commit.**
8. **A route naming a record waits for the read** (§4) rather than calling it
   missing.

---

## 6. Performance, measured

Measured under the tests' `fake-indexeddb` and jsdom (the Carlsen
fixture's games as analyses): 7,818 records ≈ 8 MB, written in one batch in
~80 ms, read back in ~60 ms; 20,000 ≈ 20 MB, ~0.6 s and ~0.1 s. A real
browser is faster. The engine games (100) and the repertoires (500, but a
course can be most of a megabyte each) are far below that.

---

## 7. Testing

- **`fake-indexeddb/auto`** (`src/test/setup.ts`) gives jsdom a real
  IndexedDB in memory, so the stores' own code is what runs.
- **Teardown** (`setup.ts`, after every test): unmount, clear
  `localStorage`, then — for every record store — wait for its writes to land
  (`settled…`, twice: a folder delete queues its records' unfiling behind
  it), `reset…`, and delete the three databases (`deleteAnalysisDb`,
  `deleteEngineDb`, `deleteRepertoireDb`). The Library's folder store is
  settled and reset there with the others; its database is deleted by the
  Library's own tests (`resetLibraryCollectionStore`, in their `beforeEach`).
  Without the wait, a write a screen left in flight lands in the next test's
  fresh database.
- **The store modules are imported lazily in the teardown**, never at the top
  of `setup.ts`: a setup file's static imports load before a test file's
  `vi.mock`s, and the played games reach `lib/pieceMask.ts`, which would then
  hold the real `react-chessboard` instead of the test's stand-in.
- **Fake timers must leave `setImmediate` real** — fake-indexeddb runs every
  request on it, so a faked one means no read or write ever lands (a hang,
  not a failure). Use `vi.useFakeTimers(FAKE_TIMERS)` from
  `views/repertoires/repertoireTestKit.tsx` (it fakes `setTimeout`,
  `setInterval` and `Date` only).
- **Waiting on a write the screen made**: `await waitFor(() => …)` with real
  timers; under fake timers, `await act(async () => { await settled…(); })`
  (the player's `landed()`), since `waitFor` polls on a faked timer.
- **Seeding**: `await save…(record)` before mounting — the store then already
  holds the rows, so the screen renders on its first frame. The repertoire
  kit's `renderSection` awaits both stores' first read; `renderSectionNow`
  mounts before it, to assert the reading line.
- **A reload** is `reset…()` then a mount (or `load…()`): the rows must come
  back from IndexedDB itself.
- **A raw stored row** (a malformed one, or a record from before a rule, such as
  a multi-game repertoire) is seeded by `put`ting `{ id, seq, value }` into
  the object store (`savedRepertoireStore.test.ts`'s malformed-row test), or
  by passing it through the normaliser and saving it (`storeMultiGameRepertoire`
  in `views/repertoires/repertoireTestKit.tsx`).
- **A refused write**: `vi.spyOn(IDBObjectStore.prototype, "put")` throwing a
  `QuotaExceededError` → the operation answers `"storage"` and the list is
  unchanged; `vi.spyOn(indexedDB, "open")` for IndexedDB missing altogether.
- **"Nothing was written"**: the snapshot is the same array (`toBe`), not a
  `localStorage` comparison.

---

## 8. Debugging — symptoms and where they come from

| Symptom | Look at |
| --- | --- |
| A reload of `?saved=` / a repertoire link shows "missing" or a new game | The route is not waiting for the read (§4) — `useStoreRead` / the hook's `undefined` branch. |
| A screen shows "Reading…" forever | The first read never resolved: IndexedDB blocked (another tab holding an old version open — `onversionchange` should close it), or, in a test, fake timers faking `setImmediate`. |
| Saved data gone after an upgrade | The normaliser refuses the stored rows (every row dropped). Check DevTools → Application → IndexedDB → the module's database. |
| The list re-orders on a mere view | The idempotency comparison misses a field: the store's `unchanged` / `same…` must return the same array. |
| Two tabs disagree | The `BroadcastChannel` name (§1) — both stores of a module share their database's name. |
| A test passes alone and fails in the suite | A write from the previous test landing late — the teardown's `settled…` must cover the store. |
| A mocked module is real in one test file | Something statically imported by `setup.ts` loaded it before `vi.mock` (§7). |
| `"storage"` on every write | Quota, private mode, or IndexedDB disabled; `navigator.storage.estimate()` in the console. |

In a browser, DevTools → Application → IndexedDB shows each `chessapp.*`
database; a row is `{ id, seq, value }`.

---

## 9. Extending — recipes

### 9.1 A new list in an existing module (e.g. repertoire tags)

1. Add its object store name to the module's `…Db.ts` list and **bump
   `DB_VERSION`** (the upgrade creates missing stores only).
2. A record type and its normaliser in the module's pure file.
3. A store file over `idbRecordStore({ db, store, normalise, order, channel })`
   — the module's channel — with its caps and operations, each returning the
   write's promise; export `…Snapshot`, `subscribe…`, `load…`, `settled…`,
   `reset…`.
4. A `useSyncExternalStore` hook returning `| undefined`, and the screens'
   reading state.
5. Add its `settled…` and `reset…` to `setup.ts`'s `recordStores()`.
6. A row in §1 of this file.

### 9.2 A new module (a new database)

`idbDatabase("chessapp.<module>", 1, [stores])` in a `…Db.ts` (or inside the
store file, if it is the module's only store, as `playedGameStore.ts` is),
then §9.1 from step 2, plus its `remove` in `setup.ts`'s teardown.

### 9.3 A new field on a record

Only the normaliser (read it back with a default) and the writer; the
idempotency comparison if it should count as a change. No version bump, no
migration.

### 9.4 A store that needs to query (a filter, a sort, paging in the database)

Read §10 first: this is the case a wrapper is for.

---

## 10. A future migration to Dexie — and when to consider it

### 10.1 Why not now

Dexie's strengths are **queries over indexes** (`where`, range scans,
`orderBy`, compound indexes), **versioned schema migrations**, `liveQuery`,
and add-ons (export/import, Dexie Cloud sync). This layer uses none of them:
every store is read whole and kept in memory; the only upgrade is "create a
missing store"; reactivity and cross-tab updates are `idbRecordStore`'s own
(`useSyncExternalStore` + `BroadcastChannel`); export is planned as PGN files
(the records *are* PGN), not a database dump; and there is no sync. What
Dexie would remove — the connection boilerplate — is `lib/idb.ts`, about
forty lines.

### 10.2 When to consider it — any one of these

- **A store is too big to load whole.** Memory or the first read's time
  becomes the problem — e.g. saved analyses well past the 20,000 cap, or a
  wish to hold every Library game as its own row — and screens need to read
  **a page from the database** (`orderBy("seq").offset().limit()`) instead
  of slicing an in-memory list.
- **A screen needs an indexed query.** Filtering or sorting by a field
  (date, opening, player, folder) in the database rather than in memory, or
  looking rows up by something other than `id`.
- **Real schema migrations.** Reshaping stored rows (not just adding a field
  the normaliser defaults), chained over several versions.
- **Transactions across several stores become common** (today only the
  Library's three-store writes need one, hand-written).
- **Sync or a raw database export comes back as a requirement** — Dexie
  Cloud, or `dexie-export-import` (rows must still go through the
  normalisers on the way in).

### 10.3 How to migrate, when the time comes

The layering is what makes it cheap: screens see hooks, hooks see store
modules, and only `lib/idb.ts`, `lib/idbRecordStore.ts` and
`lib/libraryCollectionStore.ts` touch IndexedDB.

1. **Keep every store module's API** (`…Snapshot`, `subscribe…`, `load…`,
   operations as promises) — the screens and hooks do not change.
2. **Replace `lib/idb.ts`'s internals** with one Dexie instance per database,
   keeping the names: `new Dexie("chessapp.analyses")` with
   `version(n).stores({ analyses: "id", folders: "id" })`. The primary key
   stays `id` (inbound), so the existing rows are read as they are. Check
   Dexie's version numbering against the existing native version 1 at the
   time (Dexie has historically mapped its version *n* to native *n × 10*, so
   declare a version that upgrades rather than downgrades).
3. **Rewrite `idbRecordStore`'s read and write** over the Dexie table
   (`toArray`, `bulkPut`, `bulkDelete` in a `transaction("rw", …)`), keeping
   the queue, the kept snapshot, the idempotent no-op, the `seq` and the
   channel. Add an index (`"id, seq"`) only when a query
   needs it.
4. **The Library's store** moves to a Dexie transaction over its three
   tables.
5. **Tests**: Dexie runs over `fake-indexeddb/auto` unchanged; the teardown
   deletes the databases by the same names.
6. **Measure bundle size** (Dexie is tens of KB minified and gzipped — check
   the current figure) against what it removes.

RxDB (JSON-Schema collections, replication plugins) is the heavier option;
it replaces this layer rather than sitting under it and would duplicate the
normalisers as JSON Schemas. Consider it only if live multi-device
replication becomes a requirement.
