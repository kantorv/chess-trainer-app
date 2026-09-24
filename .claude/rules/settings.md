---
paths:
  - "src/views/settings/**"
---

# Settings — `/settings/<tab>`

The app's own settings (CTA-86): one screen, **one tab per concern**, each tab
a route segment. Three tabs today — **Export** and **Import** (the reader's
data out as one zip and back in — everything about them, the zip, the
manifest, the layers, conflicts, caps, migrations, is
[`import-export.md`](./import-export.md)) and **Storage** (how much space the
app's data takes, CTA-94). This file is the section.

## 1. The section

| Piece | File | What it is |
| --- | --- | --- |
| Route | `App.tsx` — `/settings` and `/settings/:tab` | Both render `SettingsMain.tsx`; `/settings` and an unknown tab redirect to the first tab (Export). |
| Screen | `views/settings/SettingsScreen.tsx` | The title, a tab strip (each `Tab` a `RouterLink` to `/settings/<id>`), the active tab's content scrolling under it. |
| Tabs | `SETTINGS_TABS` in `SettingsScreen.tsx` | `export` → `ExportTab.tsx`, `import` → `ImportTab.tsx` (with `ImportDialog.tsx` and `IncompatibleImportDialog.tsx`), `storage` → `StorageTab.tsx`. |
| Nav | `navFolders()` — `settings` (`nav.folders.settings`, `pinToBottom`); `navItems()` — one entry per tab (`nav.settingsExport`, `nav.settingsImport`, `nav.settingsStorage`) | A folder, **not** `singleEntry`, so a tab is one more entry in it. Pinned to the sidebar's foot, under a divider, apart from the screens (`Sidebar.tsx`). |
| Locale | `settings.*` in `en.ts` / `he.ts` | `settings.title`, `settings.tabs.<id>`, then each tab's own block (`settings.export.*`, `settings.import.*`, `settings.storage.*`). |

**Adding a tab**: an entry in `SETTINGS_TABS` (`SettingsScreen.tsx`), a
`navItems()` entry in the `settings` folder at `/settings/<id>`, and
`settings.tabs.<id>` plus its `nav.*` label in both catalogs. A tab's content
is a flex column in the scrolling tab panel, and its words for the right-hand
panel go in a `RightPanel`.

## 2. The Storage tab

`/settings/storage` (CTA-94) — how much space the app's data takes on this
device, per the research in `docs/indexed-db.md`:

- **Browser storage**: the origin's usage and, where the browser reports it,
  the IndexedDB portion — all `navigator.storage.estimate()` figures, every
  label marked as an estimate. A number the browser does not report reads
  "not available", never zero. The quota is not shown; a note says it is in
  the browser's developer tools.
- **The reader's data, four sections** — one per database's heavy store:
  Engine games, Analyses, Repertoires, Library games — separated by a bolder
  line, each with its exact record count and its **estimated payload**
  (`lib/storageDiagnostics.ts`), never presented as a disk or IndexedDB
  size: the browser may compress, deduplicate and add index overhead, so
  payloads do not sum to what it reports. The folders and the collections'
  summaries are tiny beside what they file, and the shipped collections are
  fetched over HTTP, not stored: none of them is listed — the origin
  estimate's business only.

The counts and payloads are the stores' snapshots (the Export tab's pattern —
a subscription starts each read) and the Library's summaries, so nothing is
read twice. The Library's games are the bulk case and are **never read**: each
collection's games are estimated from its index rows (`loadUploadedRows`), a
game's PGN sized from its row (`estimatedGamePgnBytes`). Reads only: nothing
is written, and nothing throws.

## 3. Testing

- `views/settings/Settings.test.tsx` — the section (the landing redirect, the
  tabs' links) and the Export tab.
- `views/settings/ImportTab.test.tsx` — the Import tab.
- `views/settings/StorageTab.test.tsx` — the Storage tab.
- `src/lib/storageDiagnostics.test.ts` — the payload rules, the byte
  formatter, the browser estimate, the per-game estimate.
- `views/main/navTree.test.ts` — the Settings folder and its entries.

Both tab tests run over the real stores (fake-indexeddb); what the Import and
Export ones cover is [`import-export.md`](./import-export.md) §10. jsdom has
no `navigator.storage`, so the Storage tests stub `estimate()` themselves.
