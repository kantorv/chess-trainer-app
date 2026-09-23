---
paths:
  - "src/views/engine/play/**"
  - "src/views/engine/games/**"
  - "src/lib/playedGames*"
  - "src/lib/playedGameStore*"
  - "src/lib/engineSettings*"
  - "src/lib/newGameLink*"
  - "src/views/board/core/usePlayToggle.ts"
  - "src/views/board/core/useAutosave.ts"
---

# Play with Engine and the Lobby — `/engine/play`, `/engine/games`

A game against Stockfish, played on a full analysis board, saved as it goes,
and listed in the **Lobby** with the form that starts the next one. Masked
Pieces is this screen in a costume — [`masked-pieces.md`](./masked-pieces.md)
covers what it adds. The board core, the engine protocol and testing are
[`chessboard.md`](./chessboard.md); the move list, map and arrows are
[`tree-views.md`](./tree-views.md); the store is [`database.md`](./database.md).

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/views/engine/play/PlayScreen.tsx` | **The screen**, shared with Masked Pieces through its optional `masking` prop: the slots, the header, the tabs, the dialogs, the URL write-back (`?saved=<id>`). |
| `src/views/engine/play/usePlayGame.ts` | **The session**: `useBoardCore` + `useEngineModule` + `usePlayToggle` (on from the start) + `useAutosave` to the played-games store; Replay and Resign. Also `arrivalOf` — the URL read once. |
| `src/views/engine/play/PlayWithEngine.tsx` | The route: the arrival, and a **masked** `?saved=` sent on to `/engine/masked`. |
| `src/views/engine/play/PlayedGameRead.tsx` | The play routes' wait for the store's first read before `arrivalOf` (`?saved=`). |
| `src/views/engine/play/EngineSettings.tsx` | The Engine tab — strength (Skill Level, the Elo estimate), depth, move time, lines, threads, hash, the eval bar — rendered from what the running engine declared (absent / pinned / adjustable). Also the body of the Lobby's Game tab. |
| `src/views/engine/games/PlayedGames.tsx` | **The Lobby** (board square): the games, flat and newest first, with the colour and opening filters. |
| `src/views/engine/games/NewGameForm.tsx` | The Lobby's right-hand panel: **Game** and **Board editor** tabs, and **Start**. |
| `src/views/engine/games/usePlayedGames.ts` | The `useSyncExternalStore` binding (`undefined` until read). |
| `src/lib/playedGames.ts` | **The record**, pure: `PlayedGame`, `playedGameOf`, `playedGameFrom` (the normaliser), `playedGameSummary`, `playedGameResult`, `resultOfFen`, `playedGameHeaders` (the PGN tags), `playedGameCatalogOf` (`?game=play/games/<id>`). |
| `src/lib/playedGameStore.ts` | **The store** — `chessapp.engine`, object store `games`, over `idbRecordStore`; capped at `MAX_PLAYED_GAMES` (100). |
| `src/lib/engineSettings.ts` | `EngineSettings`, the defaults, `ENGINE_SETTING_BOUNDS`, `SETTING_UCI_OPTION` / `uciOptionsOf` / `withClampedUciOptions`, `approximateElo`, the non-throwing `engineSettingsFrom`. |
| `src/lib/newGameLink.ts` | The new-game link: `newGameParams` (the form → query) and its reader (query → options, each field validated and clamped on its own). |
| `src/views/board/core/usePlayToggle.ts` | **Play** (`chessboard.md` §9.2.6), shared with the Analysis Board. |
| Tests | `PlayWithEngine.test.tsx`, `EngineSettings.test.tsx`, `views/engine/games/PlayedGames.test.tsx` (the Lobby, the form, the Board editor tab), `src/lib/playedGames.test.ts` (the record and the store), `newGameLink.test.ts`, and the two propagation tests in `src/views/board/`. |

Routes and nav: `/engine/play` has **no nav entry** — it is reached from the
Lobby's Start and Continue and from `?fen=` hand-offs (Openings' *Play from
here*). The **Engine** folder holds the Lobby (`/engine/games`, `nav.lobby`)
and Masked Pieces. `options.id` is `play-with-engine`; every test id is
prefixed `play-with-engine-`. Locale keys: `playEngine.*` (the screen) and
`playedGames.*` (the Lobby and its form, `playedGames.newGame.*`).

---

## 1. The screen

- **A new board with Play on.** The standard start, or the arrival's position;
  the reader plays the side at the bottom and the engine answers — the shared
  `usePlayToggle`, which plays only the side **not** at the bottom and pauses
  on a step that is not one move forward, on a **change of side** (the flip,
  or the header's White / Black toggle — the reader's side *is* the
  orientation), with the engine off and when the game is over. Pressing Play
  goes on from where the reader stands.
- **The game is a tree.** A move by hand from an earlier position is a side
  line there, and Play resumes from it. The explorer shows it all — Moves,
  Map, the next-moves bar, the arrows, the move menu (editing on, *Play
  chances…* off), the comment block.
- **The header holds the game's controls**: the side toggle, **Play**,
  **Replay** (start over from the position the game began at; the saved
  progress is **discarded**, its record removed; asked first when there is
  anything to lose), **Resign** (asked first; the reader's side loses —
  `resigned` on the record, the PGN's `Result` and `Termination` — Play stays
  off, the board takes no more moves but can still be stepped through), the
  games list and the engine switch.
- **Tabs: Moves · Map · Engine.** The engine's lines are pinned above every
  tab (`BoardPanel`), so there is no Variations tab.
- **It saves itself** — no Save button. `useAutosave` writes on every change;
  the id is stable for the life of a game; once written, the URL is
  `?saved=<id>` (history replace), so a reload goes on with it.

---

## 2. Arriving — `arrivalOf` (read once)

| Parameter | Meaning |
| --- | --- |
| `?saved=<id>` | Resume a stored game: the tree, the node the reader was on, the side, the settings, the evals, a resignation. **Beats everything else.** Waits for the store's first read (`PlayedGameRead`). |
| `?fen=` | A start position (`parseFen`; ignored if it does not pass). With no `side`, Black to move sets the reader to Black and turns the board — otherwise the engine would move the instant the screen opened. It is also what Replay returns to. |
| `side` | `white` / `black`. **Beats the side to move of a `?fen=`.** |
| `skill` (0–20), `depth` (1–24), `movetime` (ms, 0–10000), `lines` (1–10), `threads` (1–4), `hash` (1–256), `evalbar` (`1`/`0`), `variations` (`1`/`0`) | The Lobby's engine options. **Each field on its own**: absent or unreadable is its default, out of range is clamped (and the engine module re-clamps the UCI options to what the build declares). `variations` is the pinned lines' start (CTA-90): `0`, the game opens with them hidden — the block's own header checkbox is the live control from there. |

No parameters is the plain game with the defaults. A masked `?saved=` here is
sent to `/engine/masked` (history replace) — a game belongs to the screen it
was begun on.

---

## 3. The Lobby — `/engine/games`

- **The square: the games**, flat and newest first, no folders. Each row is
  titled by its pairing, White first ("Human - Stockfish level 10"), with its
  length, side lines, result as PGN writes it (`1-0`, `0-1`, `1/2-1/2`, `*`)
  and date; **Continue** (`?saved=<id>` — on `/engine/masked` for a masked
  game, which carries a *Masked* chip; **only while the game is still on** —
  a row whose result is decided, a resignation or the mainline's final
  position through `playedGameResult`, shows none, CTA-90), **Analysis**
  (`/tools/analysis?game=play/games/<id>`, the true PGN, unmasked) and a
  delete that asks first.
- **Filters**, combined and in the URL: **colour** (`?color=`, the side the
  reader played) and **opening** (`?opening=`, the deepest eco.json match
  along each mainline — `openingOfLine`, the book loaded lazily).
- **The panel: the new-game form** (`NewGameForm.tsx`), from the defaults on
  every visit, in two tabs:
  - **Game** — the side (White / Black, since CTA-90) over `EngineSettings`
    itself, fed by a `useEngineModule` with `enabled: false`: it handshakes
    for the options and never searches. Under the eval bar, a **Variations**
    checkbox (CTA-90) — the same choice as the pinned block's own header
    checkbox, deciding what the game starts with; the block's checkbox is
    the live control on the game view.
  - **Board editor** — the shared position editor
    ([`position-editor.md`](./position-editor.md)), its state the form's and
    its orientation pinned to the chosen side.
  - **Start**, full width below both tabs: `/engine/play?` +
    `newGameParams(settings, side, evalBar, fen?)`. A position other than the
    standard start rides along as `fen` (the Game tab says so, with *Edit* and
    *Use the standard start*); Start is **off**, saying why, while that
    position cannot be played from.

---

## 4. The record and the store

- **A game is a tree** (`treeToPgn` / `parsePgnTree`), with the
  `EngineSettings` it is played under (`playAs` the reader's side), where the
  reader stands (SAN from the start), the evals **keyed by FEN** (a ply cannot
  say which line), once resigned `resigned` (the side that did —
  `playedGameResult` reads it before the board), and a Masked Pieces game its
  `mask`.
- **The write is idempotent**, because the writer is an effect: mounting a
  resumed game, the settings clamp landing and an engine score arriving all
  rebuild the record. `savePlayedGame` does nothing when it is the one stored.
- **Only a change of the moves re-orders the list.** A new place in the tree,
  a new eval, new settings, a mask or a resignation without new moves are
  written in place with the stored `updatedAt`.
- **The start date is carried, not re-derived**: `usePlayGame` keeps
  `startedAt` and passes it as `savedAt`. It is the PGN's `Date`, and a new
  date would read as a change of the moves on every resume.
- **Writes are promises**; a save answering after a Replay is ignored
  (`currentId`).
- **Non-throwing throughout** — a record the normaliser refuses is dropped.

---

## 5. Invariants

1. **One screen for both routes.** `PlayScreen` renders Play with Engine and
   Masked Pieces; a new feature goes there, with an optional prop if only one
   of them wants it.
2. **The engine's move comes only through `usePlayToggle`** — never a second
   `onBestMove` guard in the screen.
3. **Search the position on screen**, play the engine's move only for it.
4. **The arrival is read once**; a field that fails validation is its default,
   never an error.
5. **The store's writes are idempotent and in place** unless the moves change.
6. **A game belongs to its screen** (the two `?saved=` redirects).

---

## 6. Testing

- `PlayWithEngine.test.tsx` mounts the route in a `MemoryRouter` with
  `RightPanelProvider`, `lib/engine` → `FakeEngine` and `react-chessboard` →
  `reactChessboardMock()` (`views/board/boardTestHarness.tsx`). The fake engine
  is driven by hand: emit a `bestmove` for the searched FEN and assert the
  reply, the pause on a step back, Replay, Resign, and the record in the store.
- Seed a stored game with `await savePlayedGame(record)` before mounting to
  test `?saved=`; wait on a write with `waitFor` (or `settledPlayedGames` under
  fake timers — [`database.md`](./database.md) §7).
- The Lobby and its form: `PlayedGames.test.tsx` (the list, the filters,
  Continue / Analysis / delete, Start's link from both tabs, Start off and
  why).

---

## 7. Recipes

- **A new engine option**: add it to `EngineSettings`, its default and
  `ENGINE_SETTING_BOUNDS`, map it in `SETTING_UCI_OPTION` if it is a UCI
  option, read it back in `engineSettingsFrom`, render it in
  `EngineSettings.tsx` by the three-state rule (`chessboard.md` §4.1), and add
  it to `newGameParams` and its reader with a clamp. An older record reads it
  as its default.
- **A new header control**: in `PlayScreen`'s header slot; if it changes the
  game's state, the action is `usePlayGame`'s, and if it changes the record,
  add the field to `PlayedGame`, `playedGameFrom` and the store's unchanged
  test.
- **A new Lobby filter**: a URL param read in `PlayedGames.tsx`, applied in
  memory over the summaries (the store is read whole).
