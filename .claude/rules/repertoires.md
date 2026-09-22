---
paths:
  - "src/views/repertoires/**"
  - "src/lib/savedRepertoires*"
  - "src/lib/savedRepertoireStore*"
  - "src/lib/savedRepertoireFolders*"
  - "src/lib/savedRepertoireFolderStore*"
  - "src/lib/savedRepertoireDb*"
  - "src/lib/repertoireSettings*"
  - "src/lib/repertoireTrainer*"
  - "src/lib/repertoireGames*"
  - "src/lib/repertoireLink*"
  - "src/lib/playChance*"
  - "src/lib/pgnRepertoireExamples*"
  - "src/views/board/core/useTrainerModule.ts"
  - "src/views/shared/MergeSplitChoice.tsx"
---

# Repertoires — `/repertoires`

The reader's own opening repertoires: brought in from a PGN, filed into
folders, and read, drilled and played on one board — the **player** — with a
scripted opponent that answers only from the file. The board core and the
trainer module are [`chessboard.md`](./chessboard.md) §9 (§9.2.5 for the
trainer); the move list, map, comment block and arrows are the shared
explorer, [`tree-views.md`](./tree-views.md); the stores
[`database.md`](./database.md).

> **A repertoire is one game**: a mainline with its side lines — the shape the
> board reads.

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/views/repertoires/Repertoires.tsx` | `/repertoires`: the list over the saved-list machinery, as rows or preview cards (where the repertoire first branches, `repertoires-preview-<id>`), the folders (`?folder=<id>`), checkboxes and the export bar with bulk delete. |
| `RepertoireFolderViews.tsx`, `RepertoireFolderDialogs.tsx`, `useRepertoireFolders.ts` | Folder rows and cards; the name / delete dialogs and the bulk delete's confirm; the folder store's binding. |
| `RepertoireUpload.tsx` | `/repertoires/new`: a `.pgn` file or pasted text, through **one** function. |
| `RepertoireMergeSplit.tsx` (over `views/shared/MergeSplitChoice.tsx`) | The merge-or-split choice a text of several games gets — on upload, and on the route of a record saved before the one-game rule. |
| `RepertoireBoard.tsx` | `/repertoires/<id>`: the miss, the legacy choice, else the player. |
| `RepertoireGame.tsx` | `/repertoires/<id>/games/<end\|backtrack>`: a game over the same player. |
| **`RepertoirePlayer.tsx`** | **The screen**: the core, the engine module, `useTrainerModule`, `useRepertoireGame` and the explorer, in `BoardShell` / `BoardPanel`. |
| `useRepertoireGame.ts` | A game's session state: the rules, the score, lines finished, coverage. |
| `RepertoireChangesBar.tsx` | The strip: Update / Save as copy / Discard (also the Analysis Board's and the Library's, under their `labelKey`). |
| `RepertoireGamesMenu.tsx` | The Games menu, on the player and on every list row and card. |
| `RepertoireSettingsScreen.tsx` + `RepertoireSettingsSections.tsx` | `/repertoires/<id>/settings`: one draft, written on Save. |
| `useSavedRepertoires.ts` | The store binding (`undefined` until read). |
| `repertoireTestKit.tsx` | The tests' shared mount, fixtures and `FAKE_TIMERS`. |
| `src/lib/savedRepertoires.ts` | **The record**, pure: `readRepertoireText`, `savedRepertoireOf`, `mergedRepertoireOf`, `splitRepertoiresOf`, `isMultiGameRepertoire`, `withRepertoireTree` (Update), `repertoireCopyOf` (Save as copy), `savedRepertoireFrom` (the normaliser). |
| `src/lib/savedRepertoireStore.ts` + `savedRepertoireDb.ts` | **The store** — `chessapp.repertoires`, object store `repertoires`, over `idbRecordStore`; `addRepertoires` (a split, all or nothing, in a replaced record's place when given one), `updateRepertoireSettings`, `fileRepertoire`, `removeSavedRepertoires`; cap `MAX_SAVED_REPERTOIRES` (500). |
| `src/lib/savedRepertoireFolders.ts` + `savedRepertoireFolderStore.ts` | **The folders — one level** (the `folders` object store beside it; cap 100): create / rename / delete; a delete keeps its repertoires (`unfileRepertoiresIn`). |
| `src/lib/repertoireSettings.ts` | The settings, read back field by field; **its header is the recipe for adding one**. |
| `src/lib/repertoireTrainer.ts` | The trainer's policy and the session model: `TrainerPolicy`, `pickTrainerMove`, `playChancePolicy`, `repertoireMovesAt`, `nodeIdsOf` / `extensionIdsOf`, `judgeDrop`, the `DrillScore` tally. Pure. |
| `src/lib/repertoireGames.ts` | The games: `RepertoireGameId` (`end`, `backtrack`), the menu order, `repertoireGamePath`, and Backtracking's `coverageOf`, `backtrackingPolicy`, `requiredMovesAt`, `backtrackTarget`. Pure. |
| `src/lib/playChance.ts` | **Play chances** (lichess-tools' `prc:N`); its header is the reference for the rules (§4). Pure. |
| `src/lib/repertoireLink.ts` | `?at=`: `atParamOf` / `nodeAtParam` — also used by the Analysis Board, the Library and the Openings explorer. |
| `src/test/fixtures/pgn/` | The repertoire fixtures: `sicilian-2c3-sampler.pgn` (a Chessable-style export: 14 games, no side lines), `d2d4Variations.pgn` (a lichess study, 13 chapters) and `live-chess-2026-09-18.pgn` (one tree of 7,859 nodes). |
| Tests | `Repertoires.test.tsx`, `RepertoireFolders.test.tsx`, `RepertoireUpload.test.tsx`, `RepertoireBoard.test.tsx`, `RepertoirePlayer.test.tsx`, `RepertoireGames.test.tsx`, `RepertoireAnnotations.test.tsx`, `RepertoirePlayChance.test.tsx`, `RepertoireSettings.test.tsx`, `RepertoirePropagation.test.tsx`; `src/lib/savedRepertoires.test.ts`, `savedRepertoireStore.test.ts`, `savedRepertoireFolders.test.ts`, `repertoireSettings.test.ts`, `repertoireTrainer.test.ts`, `repertoireGames.test.ts`, `repertoireLink.test.ts`, `playChance.test.ts`, `pgnRepertoireExamples.test.ts`. |

Routes and nav: the **Repertoires** folder is `singleEntry` and renders as one
row to `/repertoires`, whose own *Add repertoire* link reaches
`/repertoires/new`. `options.id` is `repertoire-board` (the player) or
`repertoire-game`. Locale keys: `repertoires.*`.

---

## 1. Bringing one in

- **A file and a paste are one record.** Both go through `readRepertoireText`
  (the `MAX_UPLOAD_CHARS` size rule, an emptiness check, line endings
  normalised, every game parsed as a tree, games with no moves skipped and
  counted). A file name is never read, so the two routes cannot drift apart.
- **A text of several games is not a repertoire as it stands.** A
  Chessable-style export writes each line as its own game; a lichess study
  writes each chapter as one. The reader picks:
  - **merge** — one tree (`mergedRepertoireOf`, over `mergeTrees`): the first
    game's line is the mainline, each later divergence a side line; offered
    only when every game shares a start. The sampler becomes one 230-node tree
    with 13 side lines.
  - **split** — one repertoire per game, each keeping its own text and named by
    the game, **all filed into a new folder** named after the text; the reader
    lands inside it.
  A record saved before the rule, still holding several games
  (`isMultiGameRepertoire`), opens on the same choice, and the result takes its
  place (a merge keeps its id).
- **Annotations survive.** `parsePgnTree` keeps `{ comments }` (and `;` ones),
  `$N` NAGs and `!`/`?` marks (read as NAGs 1–6) on the tree, and `treeToPgn`
  writes them back, so a merge, Update and Save as copy lose none. `mergeTrees`
  keeps a text said twice about one move once — whitespace aside (a course
  wraps one sentence differently in different chapters) — joins different ones
  in file order, unions NAGs, and hangs each later game's opening comment
  before its first new move (a 310-game Alapin course merges with all ~4,450
  comments, 2,511 once duplicates are dropped).
- **A big tree is parsed after a paint** (`setTimeout(0)`), and the screen
  says it is reading. `parsePgnTree` builds in place (a ~9,000-node tree in
  ~1 s, most of it `chess.js` matching SANs).

A record carries its name (typed, else the tags' `StudyName` / `Event`),
`previewFen` (where it first branches), `stats` (moves and side lines, for a
caption without a parse), its `settings` and its `folderId` (`null` Unfiled).

---

## 2. The list

- **Folders are one level deep**: a folder holds repertoires, never another
  folder. The top level shows the folders, then the Unfiled repertoires;
  `?folder=<id>` opens one, with its rename and delete beside its name. A
  repertoire moves between folders from its settings. Each folder downloads as
  one `.pgn`; a deleted folder keeps its repertoires (back to Unfiled).
- **Deleting is in bulk.** No row or card deletes itself: each carries a
  checkbox, and the export bar — select-all, the count, the download and a
  delete — works in every view, the picks kept across a view switch. The
  delete asks first ("Delete N repertoires?") and goes in one write.

---

## 3. The player — `/repertoires/<id>`

```
lib/repertoireTrainer.ts ─policy · judgeDrop─┐                    ┌─ lib/repertoireGames.ts (coverage, required, backtrack)
                                             ▼                    ▼
                           useTrainerModule (views/board/core) ◀── useRepertoireGame (views/repertoires)
                             reply guard · timer · game mode        score · lines finished · coverage
                                             │ playVariation
                                             ▼
RepertoireBoard.tsx ─┐                 useBoardCore ──▶ BoardShell / BoardPanel ── useVariationsExplorer
RepertoireGame.tsx ──┴─▶ RepertoirePlayer.tsx ── download: treeToPgn(session tree) ──▶ downloadPgn
```

- **The trainer answers only from the repertoire as it arrived**, behind
  **Autoplay** — **off by default**, so the reader moves both sides. On, it
  plays one of the file's moves at its turn **by its play chance** (§4), and
  only in reply to a move: stepping back to its turn never moves a piece. It
  asks the *original* tree, so it never moves inside a line the reader added.
  The header's **Play** button is a second control over Autoplay (switching on
  answers at once when it is the trainer's turn).
- **↑ / ↓ cycle the sibling moves** of the move on screen: with Autoplay on,
  that is how the reader swaps the trainer's reply for another of the file's —
  a navigation owes no reply, so the trainer waits for the reader's next move.
- **Every move the file does not have is an extension** — added under the
  node on screen and tinted (`success.main`) in the list and ringed on the
  map: `extensionIdsOf(sessionTree, nodeIdsOf(original))` is the whole of the
  tracking. Past a line's end the reader moves both colours.
- **Tabs: Moves · (Score) · Map · Settings · Engine** (a game adds Score; Get
  to the end has no Map). Settings holds the side (default the main colour; a
  change restarts), Autoplay, the next-move arrows, the play-chance arrows and
  the engine's switch. The Engine tab is **disabled while the engine is off**.
  Moves stays mounted (`keepMounted`), so a 9,000-move list never re-mounts.
- **The header**: the opening line, the description, the Games menu, Play,
  Restart (back to the start, extensions kept), the download (the session tree
  as PGN) and the settings link.
- **Arrows are the reader's call**: the player opens as `showArrows` says (on
  by default), a game without them; Settings switches them for the session.
  With `chanceArrows` on (off by default, never in a game) and a branch that
  carries `prc` marks, the chance overlay draws the fork instead and the
  next-moves bar prints each move's percentage. With Autoplay off the footer
  is the next-moves bar; on, the trainer's status line.
- **The engine is off by default and never an opponent**: on, the pinned best
  lines and the eval bar, no `onBestMove`. A line clicked there is
  exploration; the trainer does not answer it. The Engine tab's Clear drops
  the session's additions.
- **The comment block** (the explorer's `AnnotationsBar`) shows what is
  written at the position on screen — the move with its marks, the comment
  opening its line, the comments after it, and their attributes as chips
  (`[%eval]`, `[%clk]`, `[%cal]`, an engine's trailing `+/= +1.31 (21 ply)`).
  The block adds, edits and deletes comments (`setComments` through
  `replaceTree` — a session change like a move added), and the move menu's
  *Add comment* adds one to any move. The stored comment is never rewritten.
  A game shows no block: a comment would give its answer away.
- **The move menu** (right-click, list or map — [`tree-views.md`](./tree-views.md)
  §2): promote variation, make main line, delete from here, copy variation
  PGN, add comment, play chances…. The edits are pure and id-preserving
  (`lib/gameTree.ts`); an edit is `replaceTree`, so the reader stays where
  they are (or on the nearest surviving ancestor).
- **The map** (the explorer's `TreeMap`) draws the **session's** tree — the
  repertoire and the moves added this session as they are added, "N added" in
  its header — every written dot a link, the menu on a right-click.

### 3.1 Keeping changes — Update, or copy

Nothing is written unasked. While `core.tree !== repertoire` (every edit makes
a new tree; replaying a move does not), the header's **Save** takes the
primary colour and opens `RepertoireChangesBar` above the footer:

- **Update repertoire** — `withRepertoireTree` writes the tree into the record
  (preview and size re-read) and the session becomes the new baseline. On a
  **protected** repertoire (`settings.protected`, on by default) there is no
  Update: the strip says so and links to its settings, where leaving drops the
  unsaved changes. The screen parses the record it *opened* once, so the write
  coming back does not re-parse it and reset the reader.
- **Save as copy** — `repertoireCopyOf`: "‹name› (copy)", the original's
  settings and folder, **unprotected**; the screen navigates to it at the
  position on screen. How a shipped or borrowed repertoire becomes one's own.
- **Discard** — back to the record, on the last repertoire position.

A reload or closed tab with changes unsaved asks first (`beforeunload`). The
summary says "Lines reordered or deleted" when nothing was added.

### 3.2 The link — `?at=`

`/repertoires/<id>?at=e4,c6,d4` is the position on screen as SAN from the
start, comma-joined (`lib/repertoireLink.ts`; node ids are minted per parse).
Read once when the tree lands, written back on every step with history
replace. A stale link goes as far as it still matches. A game ignores it.

### 3.3 Settings — `/repertoires/<id>/settings`

The title (`name`), a description, the **main colour** (the side the board and
the preview card face), `showArrows` (on), `chanceArrows` (off), `protected`
(on; copies are never protected) and, beside them, the **folder**. One
`settings` object normalised field by field, so an option added later reads as
its default on every older record — the recipe is `lib/repertoireSettings.ts`'s
header. Written in place, keeping the list order.

---

## 4. Play chances

How often the trainer plays each move at a branch — the **lichess-tools**
extension's rules, so a study prepared for one behaves the same in the other.
`lib/playChance.ts` is the whole of the logic and its header the reference.

- **Written as `prc:N` in the comment of the move it is about** — the
  branch's own move, never the move before the branch. `N` is 0–100 (a decimal
  allowed, above 100 read as 100); `[%prc N]` is read too; the first mark on a
  move wins.
- **The rules at one branch** (`playChances`):
  1. *No move marked* — each move weighs **its lines within the next 8 plies**
     (`linesWithin`).
  2. *Every move marked* — the marks **scaled** to 100%.
  3. *Some marked* — the marked take their percentages, the unmarked share
     what is left in proportion to their lines; nothing left, they get 0 and
     the marks are scaled.
  4. *`prc:0`* — never played; if every move comes to 0, rule 1 decides.
- **Who follows them**: Autoplay and *Get to the end* (`playChancePolicy`).
  Backtracking steers to uncovered lines. The moves come from the repertoire
  as saved, but the **marks are read off the session's tree** (`marksFrom`),
  so a chance just changed counts before it is saved.
- **Set per branch**: the move menu's *Play chances…* opens
  `PlayChanceDialog` over that move's branch — a % field per move (empty:
  automatic), its line count and its live chance. Saving is `setPlayChances`
  through `replaceTree`. The comment block shows a mark as a **Play chance**
  chip.

---

## 5. The games — `/repertoires/<id>/games/<game>`

A game is the player with rules (`lib/repertoireGames.ts`, state in
`useRepertoireGame`): the trainer always plays, Autoplay is gone, a **Score**
tab opens first, and the trainer runs in **game mode** (`drill`): each of the
reader's moves inside the repertoire is judged *before* it is made — a
repertoire move is right; any other legal move is wrong and **taken back**
(never an extension), the status saying "try again". **One verdict per
position**, the first try's; Restart judges afresh. A line is *finished* when
play — not navigation — reaches a leaf (the module's `arrival`). The score is
session-only. A game never writes, shows no comment block and no move menu.

- **Get to the end** (`end`) — the trainer picks by play chance; reaching a
  line's end finishes it ("N lines finished"), and Restart starts another.
  Past the end play is free.
- **Backtracking** (`backtrack`) — every line is to be covered. The trainer
  steers to uncovered lines (`backtrackingPolicy`). Where only some of the
  reader's moves still lead to an uncovered line, those are **required**
  (`requiredMovesAt`): a purple arrow and the status line say so, and a
  finished line's move is refused (not a failure). When a line ends it is
  covered, and play goes **back** to the deepest position with an uncovered
  line under it (`backtrackTarget`). "Lines covered: X of N", and "Start over".
  Its **Map** draws the repertoire (not the session) with coverage: covered
  lines green, a progress bar, "N lines left"; its dots are not links.

---

## 6. Testing

- `repertoireTestKit.tsx` is the shared mount: `renderSection` awaits both
  stores' first read, `renderSectionNow` mounts before it (to assert the
  reading line), `storeMultiGameRepertoire` seeds a pre-rule record, and
  **`FAKE_TIMERS`** fakes `setTimeout`, `setInterval` and `Date` only —
  fake-indexeddb needs a real `setImmediate` ([`database.md`](./database.md) §7).
- The player's tests use `lib/engine` → `FakeEngine` and `react-chessboard` →
  `reactChessboardMock()` (`views/board/boardTestHarness.tsx`), and drive the
  trainer's timer with fake timers; the `random` option makes a policy's pick
  deterministic.
- The two tests that walk the 7,859-node fixture carry longer timeouts, in
  place.

---

## 7. Recipes

- **A new game**: an id in `REPERTOIRE_GAMES`, its rules in
  `lib/repertoireGames.ts`, its state in `useRepertoireGame`, a title key.
- **A new trainer policy** (mainline-first, spaced repetition): a
  `TrainerPolicy` in `lib/repertoireTrainer.ts`, passed as `policy`
  (`chessboard.md` §9.2.5). What a verdict is worth is the screen's
  `onJudged`.
- **A new setting**: the header of `lib/repertoireSettings.ts`, a section in
  `RepertoireSettingsSections.tsx`, and where the player reads it.
- **Designed for, not built**: saving extensions back, a persisted score or
  coverage per position (what spaced repetition needs — it goes where
  `useRepertoireGame` keeps them today).
