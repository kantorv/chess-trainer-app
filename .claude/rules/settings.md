---
paths:
  - "src/views/settings/**"
---

# Settings — `/settings/<tab>`

The app's own settings (CTA-86): one screen, **one tab per concern**, each tab
a route segment. Two tabs today, **Export** and **Import** — the reader's data
out as one zip and back in. Everything about them (the zip, the manifest, the
layers, conflicts, caps, migrations) is
[`import-export.md`](./import-export.md); this file is the section.

## 1. The section

| Piece | File | What it is |
| --- | --- | --- |
| Route | `App.tsx` — `/settings` and `/settings/:tab` | Both render `SettingsMain.tsx`; `/settings` and an unknown tab redirect to the first tab (Export). |
| Screen | `views/settings/SettingsScreen.tsx` | The title, a tab strip (each `Tab` a `RouterLink` to `/settings/<id>`), the active tab's content scrolling under it. |
| Tabs | `SETTINGS_TABS` in `SettingsScreen.tsx` | `export` → `ExportTab.tsx`, `import` → `ImportTab.tsx` (with `ImportDialog.tsx` and `IncompatibleImportDialog.tsx`). |
| Nav | `navFolders()` — `settings` (`nav.folders.settings`, `pinToBottom`); `navItems()` — one entry per tab (`nav.settingsExport`, `nav.settingsImport`) | A folder, **not** `singleEntry`, so a tab is one more entry in it. Pinned to the sidebar's foot, under a divider, apart from the screens (`Sidebar.tsx`). |
| Locale | `settings.*` in `en.ts` / `he.ts` | `settings.title`, `settings.tabs.<id>`, then each tab's own block (`settings.export.*`, `settings.import.*`). |

**Adding a tab**: an entry in `SETTINGS_TABS` (`SettingsScreen.tsx`), a
`navItems()` entry in the `settings` folder at `/settings/<id>`, and
`settings.tabs.<id>` plus its `nav.*` label in both catalogs. A tab's content
is a flex column in the scrolling tab panel, and its words for the right-hand
panel go in a `RightPanel`.

## 2. Testing

- `views/settings/Settings.test.tsx` — the section (the landing redirect, the
  tabs' links) and the Export tab.
- `views/settings/ImportTab.test.tsx` — the Import tab.
- `views/main/navTree.test.ts` — the Settings folder and its entries.

Both tab tests run over the real stores (fake-indexeddb); what they cover is
[`import-export.md`](./import-export.md) §10.
