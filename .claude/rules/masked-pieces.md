---
paths:
  - "src/views/engine/masked/**"
  - "src/views/engine/play/PlayScreen.tsx"
  - "src/views/engine/play/usePlayGame.ts"
  - "src/views/engine/games/**"
  - "src/lib/pieceMask*"
  - "src/lib/playedGames*"
  - "src/lib/playedGameStore*"
  - "docs/chess_piece_masking_technique.docx.md"
---

# Masked Pieces — `/engine/masked`

`/engine/masked` is **Play with Engine with the pieces in disguise**: the
reader picks which piece types are drawn as which (every queen, rook, bishop
and knight as a pawn, say), and plays an ordinary game against Stockfish
while the board — and, optionally, every printed move — refuses to say which
man is which. The exercise is specified in
[`docs/chess_piece_masking_technique.docx.md`](../../docs/chess_piece_masking_technique.docx.md);
this file is the whole reference for how it is built here: what it is made
of, where the mask is applied and why, the stored record and resuming, the
URL, the rules that keep it correct, how to test it, how to debug it and how
to extend it. It is written for people and for LLM sessions alike, and loads
automatically when you work on the files in its `paths:` list.

This file is the authority for Masked Pieces and for `lib/pieceMask.ts`.
Everything the screen shares is elsewhere: Play with Engine's screen, session
and record in [`play-with-engine.md`](./play-with-engine.md), the board and
its core in [`chessboard.md`](./chessboard.md), the variations explorer in
[`tree-views.md`](./tree-views.md).

> **A mask is a costume, never a rule.** Nothing in `chess.js`,
> `lib/engine.ts`, `lib/gameTree.ts`, the PGN path, the engine module or the
> core knows the mask exists. It lives between the state and the pixels, on
> the surfaces listed in §4, and **nowhere else**. A change that needs the
> mask below that line is the wrong change.

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/views/engine/masked/MaskedPlay.tsx` | **The screen's route.** The arrival (`arrivalOf`, read once), the costume's state — the mask, the notation switch, the engine-lines switch — the Masking tab's content, and the redirect of an unmasked `?saved=` to `/engine/play`. Renders `PlayScreen` with `masking`. |
| `src/views/engine/masked/MaskEditor.tsx` | **The mask editor**: the three presets, the twelve per-type selects (each row offers only its own colour's six types), the notation switch. Presentational. |
| `src/views/engine/masked/Main.tsx` | Layout-only wrapper that `App.tsx` routes to (`masked-play-wrapper`). |
| `src/views/engine/play/PlayScreen.tsx` | **The screen itself**, shared with Play with Engine: `usePlayGame` + `BoardShell` / `BoardPanel` + `useVariationsExplorer`, the header, the tabs, the dialogs, the URL write-back. Its optional `masking` prop (`PlayScreenMasking`) is the whole of what Masked Pieces adds (§2). |
| `src/views/engine/play/usePlayGame.ts` | **The session**, shared: core + engine + `usePlayToggle` + the autosave. Its second argument, `mask`, is written on the record and read nowhere (§5). Also `arrivalOf`. |
| `src/views/engine/play/PlayWithEngine.tsx` | Play with Engine's route — `PlayScreen` without a costume, and the redirect of a **masked** `?saved=` here. |
| `src/lib/pieceMask.ts` | **The mask**, pure (§3): `PieceMask`, `MASK_PRESETS`, `isMasked` / `isAnyMasked`, `maskedPieces` (the board's renderers), `maskSan` / `maskSanLine` / `maskNodeSan` (the notation), `pieceMaskFrom` / `samePieceMask` (storage). |
| `src/lib/playedGames.ts` + `playedGameStore.ts` | **The record** (§5): `PlayedGame.mask` (`PlayedGameMask`), read back non-throwing; the store's idempotency compares it (`samePlayedGameMask`). |
| `src/views/engine/games/PlayedGames.tsx` | **The Lobby** — the *Masked* chip, and Continue to `/engine/masked` for a masked game. |
| `src/views/explorer/useVariationsExplorer.tsx` and its parts | The notation surfaces (§4): the option `mask`, threaded to `TreeMoveList` → `MoveList` → `VariationLine`, `TreeMap`, `NextMovesBar`, `MoveContextMenu`, the comment block's label. |
| `src/views/board/core/BoardPanel.tsx` | The pinned engine lines: `mask` (masked notation) and `showVariations` (off on Masked Pieces until the switch). |
| `src/views/board/core/BoardShell.tsx` | `capturedPieces` (the strips' icons in costume) and `hideMaterialDiff`. |
| Tests | `src/views/engine/masked/MaskedPlay.test.tsx` (the screen), `src/lib/pieceMask.test.ts`, the costume in `src/lib/playedGames.test.ts`, the marker in `src/views/engine/games/PlayedGames.test.tsx`, the notation in `src/views/explorer/useVariationsExplorer.test.tsx`, and the two propagation tests (`src/views/board/boards.test.tsx`, `panelPropagation.test.tsx`), where Masked Pieces is one of the boards. |

Routes and nav: `App.tsx` routes `/engine/masked` to
`views/engine/masked/Main`. The sidebar entry is in the **Engine** folder,
after the Lobby (`navItems.ts`, `nav.maskedPlay` —
"Masked Pieces").

Locale keys: `masking.*` in `src/locales/en.ts` / `he.ts` (the tab, the
presets, the piece names, the notation switch, the lines switch — `lines`,
`linesHint` — and the Lobby's `marker`). Everything else the screen says
is Play with Engine's `playEngine.*` / `playedGames.*`. `he` is typed
`typeof en`, so a missing key is a compile error.

---

## 1. What the screen is

- **Play with Engine, every feature of it** (`/engine/play`): a new
  board with **Play on**, the engine playing the side not at the bottom;
  the header's back button to the Lobby (CTA-91), side toggle, Play,
  Replay, Resign and the engine switch; the tabs **Moves · Engine** (no
  Map, CTA-91); side lines from an
  earlier position; the variations explorer (move menu, comments, next-moves
  bar, arrows); the autosave to the played-games store; `?fen=` and
  `?saved=`.
- **Plus a costume** — a fourth tab, **Masking**: the mask (the presets and
  the twelve selects), the **notation** switch (on) and the **engine lines**
  switch (off).
- **It opens masked**, on the doc's canonical exercise (§4 there):
  *Non-pawns as pawns* — every queen, rook, bishop and knight drawn as a
  pawn, the kings as themselves. An unmasked opening would make it
  indistinguishable from `/engine/play`.
- **The engine's best lines are off by default.** The pinned
  best-variations block (`BoardPanel`) is hidden until the Masking tab's
  switch is on, because a line of engine moves is a list of the pieces the
  mask hides — even in coordinates, "the thing on g1 goes to f3, then
  e5…" gives shapes away. The **eval bar stays**: a number says nothing
  about identity. The **score chip hides with the lines** (CTA-91): while
  the block is withheld, the panel's chip is too — a behaviour of every
  board (`BoardPanel`), not a costume decision.
- **Its games are the engine games.** Saved to `lib/playedGameStore.ts`
  with Play with Engine's, listed in the Lobby with a *Masked* chip, and
  resumed here in the same disguise.

---

## 2. The composition — one screen, a costume

```
MaskedPlay.tsx (route)                      PlayWithEngine.tsx (route)
  arrival = arrivalOf(?fen, ?saved)           arrival = arrivalOf(?fen, ?saved)
  mask · notation · showLines  (state)        (no costume)
  Masking tab = MaskEditor + lines switch
        │                                           │
        └──────────── PlayScreen({ id, arrival, masking? }) ───┘
                        │
                        ├─ usePlayGame(arrival, masking?.costume)   core · engine · Play · autosave
                        ├─ useVariationsExplorer({ …, mask: notationMask })
                        └─ BoardShell
                             boardOptions.pieces   = maskedPieces(mask)
                             capturedPieces        = maskedPieces(mask)
                             hideMaterialDiff      = isAnyMasked(mask)
                             panel.mask            = notationMask
                             panel.showVariations  = showLines
                             panel.tabs            = Moves · Engine · Masking
```

- **No mode flag, no fork.** `PlayScreen` renders the same JSX for both
  routes; `masking` is an optional prop whose absence *is* Play with Engine.
  Every value it feeds is one the shared pieces already took optionally
  (`pieces`, `capturedPieces`, `hideMaterialDiff`, `mask`) or a
  backward-compatible default (`showVariations = true`).
- **The test ids follow the id**: `play-with-engine-*` and `masked-play-*`
  — `masked-play-side`, `masked-play-play`, `masked-play-replay`,
  `masked-play-panel-tab-masking`, `masked-play-captured-white` and so on.
  `options.id` is `masked-play`.
- **`notationMask`** is `costume.pieces` while the notation switch is on,
  `undefined` otherwise. That one value is what every notation surface is
  handed — the switch is not a second code path, it is the mask withheld.
- **The session never reads the mask.** `usePlayGame` takes it only to put
  it on the record. Legality, captures, check, castling, en passant,
  promotion, the engine's search and its reply, Play, Replay, Resign — all
  of it is the true position's, identical to `/engine/play`.

---

## 3. The mask — `lib/pieceMask.ts`

- **`PieceMask`** is a twelve-entry map, true type → drawn type (`wQ → wP`).
  Keyed on the **type**, never the individual piece: `chess.js` gives a
  piece no stable identity, so a per-piece mask would need a square →
  identity map kept through every move, capture, castle, en passant and
  promotion — a second source of truth that can desync (doc §13). A type
  map has no state; a promoted pawn is drawn as whatever a queen is drawn
  as.
- **Same colour only.** Colour is visible information (doc §3.1). The
  editor offers each row only its own colour's six types, the presets obey
  it, and `pieceMaskFrom` refuses a stored mask that breaks it.
- **`MASK_PRESETS`** — `identity` (*Show real pieces*, the way out without
  leaving the screen), `nonPawns` (the default), `allIdentical` (kings too).
  `MASK_PRESET_IDS` is the editor's order; `maskPresetOf` tells which preset
  a mask *is* (entry by entry), `null` for a custom one.
- **`isMasked(mask, type)`** — the rule every notation decision is made
  by: a type is hidden when it is drawn as something else **or something
  else of its colour is drawn as it**. Under *All pieces identical* the pawn
  is drawn as a pawn and is still the most hidden piece on the board; `e4`
  would be the one thing saying which man was a pawn. `mask[t] !== t` is
  **not** the rule. `isAnyMasked` is "does this mask hide anything".
- **`maskedPieces(mask)`** — `options.pieces`: per true type, the library's
  own `defaultPieces` renderer of the type it is drawn as, so a masked rook
  is pixel-identical to a real pawn.
- **`maskSan(mask, move)`** — one move as printed: SAN when nothing about it
  is hidden; plain coordinates (`g1f3`, `e7e8q`) when the moving piece — or
  the piece a pawn promoted to — is hidden. `+` / `#` are kept.
- **`maskSanLine(mask, fen, sans)`** — a whole line (the mainline, an engine
  PV), replayed from `fen` for the squares; stops rewriting at a move that
  will not play.
- **`maskNodeSan(mask | undefined, node)`** — a tree's move, which
  carries its squares and the FEN after it (the side that moved is the one
  not to move there), so nothing is replayed. `undefined` prints the SAN:
  this is the one call every optional-mask surface makes.
- **`pieceMaskFrom(value)` / `samePieceMask(a, b)`** — storage: a mask read
  back strictly (all twelve, each its own colour, else `undefined`), and an
  entry-by-entry comparison.

---

## 4. Where the mask is applied — and where it is not

### 4.1 The surfaces

| Surface | Mechanism | Wired in |
| --- | --- | --- |
| **The board's pieces** | `options.pieces = maskedPieces(mask)` — the only honest place to disguise a piece; the board still reports true squares | `PlayScreen` → `BoardShell` `boardOptions` |
| **The captured strips' icons** | `capturedPieces = maskedPieces(mask)` — the same costumes | `BoardShell` → `EngineBoardSquare` → `CapturedPieces` |
| **The material diff** | hidden (`materialDiff: 0`) **while `isAnyMasked`** — it is derived from the true types, so "+9" beside a board of pawns names a queen | `BoardShell` `hideMaterialDiff` |
| **The move list, mainline** | `maskSanLine` over the game | `useVariationsExplorer` `mask` → `TreeMoveList` → `MoveList` |
| **The side lines** | `maskNodeSan` per token | `MoveList` → `VariationBlock` / `VariationLine` → `MoveToken` |
| **The map's labels** (and each dot's "Go to …" tooltip) | `maskNodeSan` via the drawing's `labelOf` | `TreeMap` `mask` |
| **The next-moves bar** | `maskNodeSan` per token | `NextMovesBar` `mask` |
| **The move menu** (its header, the delete dialog, the comment dialog's label) | `maskNodeSan` | `MoveContextMenu` `mask`, from `TreeMoveList` and `TreeMap` |
| **The comment block's move label** | `maskNodeSan` | `useVariationsExplorer` (`annotatedLabel`) |
| **The pinned engine lines** | `maskSanLine` from the analysed FEN — and the block **hidden by default** (`showVariations`) | `BoardPanel` `mask` / `showVariations` → `BestVariations` |

Every notation surface takes the mask **only while the notation switch is
on** (`notationMask`). The board, the strips and the diff follow the mask
whatever the switch says — the switch is about the notation.

### 4.2 Deliberately not masked

- **The promotion picker.** It is the reader's own choice of a real piece;
  four identical pawns there would hide a decision being made, not one to
  remember. The promoted piece is drawn masked from the next render on.
- **The squares.** The last-move highlight, the next-move arrows, a drag's
  source and target — they say *where*, never *what*. The reader watched it
  happen.
- **The evaluation.** The eval bar, the score chip, the evals on the move
  list's cells: numbers, not identities.
- **The opening line** (`CurrentOpening`) names the true opening — a known,
  accepted leak of the *game*, not of a piece. A reader who wants it gone
  is a recipe (§10.4).
- **The reader's own comments** — prose the reader wrote; a `[%cal]`
  arrow or an eval chip in them is theirs.
- **Leaving the costume on purpose**: *Copy variation PGN* in the move menu,
  and the Lobby's **Analysis** (`?game=play/games/<id>`), give the **true
  PGN** — the record *is* the true game — and the Analysis Board opens it
  unmasked. That is the reveal, not a leak.
- **The DOM.** `data-san` attributes carry true SAN for tests; they are not
  rendered. Masking is a training aid, not a security boundary.

---

## 5. The stored record and resuming

- **`PlayedGame.mask?: PlayedGameMask`** — `{ pieces: PieceMask; notation:
  boolean }`. Present **only** on a game played on Masked Pieces — whatever
  the mask, the identity one included, since that is still the screen it
  continues on. The engine-lines switch is the session's and is not stored.
- **Written by `usePlayGame(start, mask)`**, which passes it to
  `playedGameOf(…, mask)`; the record memo depends on it, so a change of
  the mask or the switch rebuilds the record.
- **The store writes a costume change in place** — `samePlayedGameMask` is
  part of `savePlayedGame`'s "unchanged" test, and like a new eval or new
  settings it keeps the stored `updatedAt`: only a change of the moves
  re-orders the list.
- **Read back non-throwing** (`playedGameFrom` → `playedGameMaskFrom`): a
  `pieces` that `pieceMaskFrom` refuses drops the whole costume (the game
  reads as unmasked); a missing `notation` reads as on (the screen's
  default). **A record with no `mask`** reads as an unmasked game.
- **The PGN is the true game.** Nothing about the mask is in it (no tag):
  an export, the Analysis Board and any other PGN reader get ordinary chess.
- **Resuming** — `/engine/masked?saved=<id>` seeds the mask and the switch
  from the record (`useState` initialisers, read once) and the game from the
  session as on Play with Engine (the node, the side, the evals, a
  resignation).
- **A game belongs to the screen it was begun on**:
  `/engine/play?saved=<masked id>` redirects (replace) to
  `/engine/masked?saved=<id>`, and `/engine/masked?saved=<unmasked id>` to
  `/engine/play?saved=<id>`. Without the first, Play with Engine would write
  the game back without its costume; without the second, an ordinary game
  would silently acquire one.
- **The Lobby** (`/engine/games`): a masked row carries the *Masked* chip
  (`played-games-masked-<id>`, `masking.marker`), its **Continue** goes to
  `/engine/masked?saved=`, its **Analysis** to the Analysis Board unmasked.
  `playedGameSummary(…).masked` is the flag.

---

## 6. The URL

- **In** (`arrivalOf`, `usePlayGame.ts`, read once by the route):
  `?fen=` — a position, validated by `parseFen`; Black to move sets the
  reader to Black and turns the board, as on Play with Engine — and
  `?saved=<id>`, which beats it.
- **Out**: once the game is written, `?saved=<id>` (history replace), so a
  reload goes on with it, costume and all; Replay clears it (back to the
  start position's `?fen=`, or nothing). The mask is **not** in the URL — it
  is on the record.

---

## 7. Invariants — never break these

1. **The mask never reaches the rules.** No `chess.js`, engine, core, tree
   or PGN code takes a mask. The board reports true squares; the record's
   PGN is the true game.
2. **`isMasked` is the notation rule**, not `mask[t] !== t` (§3).
3. **Every notation surface goes through `maskSan` / `maskSanLine` /
   `maskNodeSan`** — a new place that prints a move on this screen takes
   the optional `mask` and calls `maskNodeSan(mask, node)`; it never
   rewrites SAN by hand.
4. **The switch withholds the mask; it is not a flag.** Notation surfaces
   get `notationMask` (`undefined` when off) and nothing else.
5. **Absent mask = today's behaviour** on every shared piece. Every screen
   but this one passes none, and must render exactly as before.
6. **The material diff is hidden while anything is masked**; the captured
   lists keep rendering, in costume.
7. **The engine lines are off until asked for**; the eval bar is never hidden
   by the mask, and the score chip hides with the lines (CTA-91) — the
   panel's shared behaviour on every board, not the mask's.
8. **A game belongs to its screen** — the two `?saved=` redirects (§5).
9. **The costume is read back non-throwing and strictly** — a bad one is
   "unmasked", never a crash, never a cross-colour mask.
10. **One screen.** Masked Pieces renders `PlayScreen`; it does not grow a
    panel, a hook or a copy of Play with Engine's header. The propagation
    tests (`panelPropagation.test.tsx`) include it.

---

## 8. Testing

- **The screen** — `MaskedPlay.test.tsx`, over the shared harness
  (`views/board/boardTestHarness.tsx`: `FakeEngine`, `reactChessboardMock`,
  `openingsMock`). The board stub keeps the `options` it was handed, so
  `boardOptions().pieces.wQ === defaultPieces.wP` *is* "a queen is drawn as a
  pawn" (import `defaultPieces` from the mocked `react-chessboard`). It covers
  the default mask, a preset change, the strips in costume and the hidden
  diff (and the diff back under the identity mask), the `?fen=` arrival, the
  mainline and side lines and the next-moves bar in coordinates, the switch
  off, a move the mask does not hide, the costume on the record and a change
  of it in place, resuming in the same disguise, and both redirects.
- **The pure layer** — `pieceMask.test.ts` (`maskNodeSan`, `pieceMaskFrom`,
  `samePieceMask` beside the older rules) and the costume block of
  `playedGames.test.ts` (round trip, absent, unreadable, written in place).
- **The explorer** — `useVariationsExplorer.test.tsx` asserts the side
  lines, the next-moves bar and the map's labels in coordinates with a
  `mask`, and SAN without.
- **The Lobby** — `PlayedGames.test.tsx`: the chip, Continue's target,
  Analysis unmasked.
- **The shared skeleton** — `boards.test.tsx` renders Masked Pieces with
  the other boards (its lines are behind the switch, so it is excluded
  from "pins the engine's lines" and has its own test), and
  `panelPropagation.test.tsx` counts its sentinel.
- jsdom renders the map's labels at the initial zoom, so a label assertion
  works without a browser; the board's actual drawing does not — check the
  pixels in a browser.

---

## 9. Debugging — symptoms and where they come from

| Symptom | Look at |
| --- | --- |
| A move prints SAN where it should be coordinates | Is `notationMask` reaching that surface (`PlayScreen` → `useVariationsExplorer` `mask` → the part)? Is the part calling `maskNodeSan`? Is the type actually hidden by `isMasked` (a king under *Non-pawns* is not)? |
| The mainline is masked, the side lines are not | `MoveList` must pass `mask` to `VariationBlock`; `VariationLine` threads it to every `MoveToken` and nested block. |
| The board is masked but the strips show real pieces | `capturedPieces` not passed to `BoardShell`. |
| "+N" beside a masked board | `hideMaterialDiff` — `isAnyMasked(costume.pieces)`. |
| Engine lines visible on arrival | `showVariations` should be `masking.showLines` (false) — `BoardPanel` defaults it to `true`. |
| A resumed game comes back unmasked | The record has no `mask` (written by `/engine/play`?), or `pieceMaskFrom` refused it (a cross-colour or missing entry). |
| Opening a masked game from the Lobby lands on Play with Engine | `playedGameSummary(…).masked` / the Continue link; the redirect in `PlayWithEngine.tsx` should then bounce it back. |
| The list re-orders when the mask changes | `samePlayedGameMask` must be in `savePlayedGame`'s unchanged test (it is written in place). |
| A white piece drawn as a black one | An editor or preset change broke the same-colour rule; `pieceMaskFrom` would refuse it on read. |

---

## 10. Extending — recipes

### 10.1 A new preset

Add it to `MASK_PRESETS` (same-colour entries, built with `maskOf`), its id
to `MASK_PRESET_IDS` in the order the editor lists them, and
`masking.presets.<id>` to both catalogs. `maskPresetOf` recognises it, the
editor renders it, `pieceMaskFrom` stores and reads it with no change. Add
its row to the doc's §15.6.

### 10.2 A new surface that prints a move

Give the component an optional `mask?: PieceMask`, print
`maskNodeSan(mask, node)` (a tree's node) or `maskSanLine(mask, fen, sans)`
(a SAN line from a position) instead of the SAN, and thread the mask from
`useVariationsExplorer`'s `mask` (or `BoardPanel`'s) to it. Absent must
print exactly what it printed before. Add a row to §4.1 and a test beside
the component's.

### 10.3 A new piece of costume state (e.g. persisting the lines switch)

Add the field to `PlayedGameMask`, read it back field by field in
`playedGameMaskFrom` (a missing field reads as the screen's default), compare
it in `samePlayedGameMask`, seed it in `MaskedPlay.tsx` from
`arrival.resume?.mask`. No version bump.

### 10.4 Hiding the opening line

`PlayScreen`'s header renders `CurrentOpening` unconditionally. Hide it
while `masking !== undefined && isAnyMasked(costume.pieces)` — a costume
decision, made in `PlayScreen`, not in `CurrentOpening`.

### 10.5 Masking on another board

The shared pieces take the mask already (the explorer, `BoardPanel`,
`BoardShell`), so a board that wants a costume passes `boardOptions.pieces`,
`capturedPieces`, `hideMaterialDiff` and the explorer's / panel's `mask`,
exactly as `PlayScreen` does. Decide first whether the board *plays* a game
(the doc's §15.7 keeps masking to play: the study boards read a game rather
than play one).

### 10.6 An adaptive policy (progressive, temporary, random — doc §8, §10) or a reveal mode (§9)

Build it on `PieceMask`: the policy computes the mask the screen holds
(`setMask`), so every surface follows it with no change. A reveal is a
temporary `notationMask` of `undefined` (or the identity mask for the
board). Neither touches the session or the record's shape beyond §10.3.
