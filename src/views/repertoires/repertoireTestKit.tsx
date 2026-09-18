/**
 * What the Repertoires section's tests share — not a test file itself.
 *
 * The section's screens render inside the app shell's right-panel slot and
 * under the router, so every test mounts them the same way; the board screen
 * is composed from the v2 core, so its tests take the stand-ins the
 * Development section already wrote for exactly that
 * (`views/dev/devTestHarness.tsx`) rather than a second copy of them.
 */
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";

import { DEFAULT_POSITION } from "chess.js";

import { readRepertoireText, savedRepertoireOf } from "../../lib/savedRepertoires";
import {
  SAVED_REPERTOIRES_STORAGE_KEY,
  saveRepertoire,
  savedRepertoiresSnapshot,
} from "../../lib/savedRepertoireStore";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import Repertoires from "./Repertoires";
import RepertoireBoard from "./RepertoireBoard";
import RepertoireUpload from "./RepertoireUpload";
import RepertoireSettingsScreen from "./RepertoireSettingsScreen";

/**
 * A repertoire as the one-game rule wants it: one game, a mainline with a
 * side line (`3... c5 4. dxc5` off `3... Bf5`).
 */
export const CARO = [
  '[Event "My Caro"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *",
].join("\n");

/** A text of two games — Chessable-style, one line each — to merge or split. */
export const CARO_TWO_GAMES = [
  '[Event "My Caro"]',
  '[White "1) Advance"]',
  '[Black "3...Bf5"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 *",
  "",
  '[Event "My Caro"]',
  '[White "2) Exchange"]',
  '[Black "3...cxd5"]',
  "",
  "1. e4 c6 2. d4 d5 3. exd5 cxd5 *",
].join("\n");

/** Store a one-game text as the upload screen would, under a known id. */
export const storeRepertoire = (id: string, text: string = CARO, name = "") => {
  const reading = readRepertoireText(text);
  if (!reading.ok || reading.games.length !== 1) {
    throw new Error("fixture is not one readable game");
  }
  const problem = saveRepertoire(savedRepertoireOf(id, reading.games[0], name, reading.name));
  if (problem !== undefined) throw new Error(`fixture did not save: ${problem}`);
  return id;
};

/**
 * Store a record the way one was written **before** the one-game rule — the
 * whole multi-game text in one row — to exercise the choice it opens on.
 */
export const storeLegacyRepertoire = (id: string, text: string, name = "") => {
  const now = new Date().toISOString();
  localStorage.setItem(
    SAVED_REPERTOIRES_STORAGE_KEY,
    JSON.stringify([
      ...savedRepertoiresSnapshot(),
      { id, name, pgn: text, previewFen: DEFAULT_POSITION, savedAt: now, updatedAt: now },
    ]),
  );
  localStorage.setItem(`${SAVED_REPERTOIRES_STORAGE_KEY}.rev`, `${Date.now()}-${id}`);
  return id;
};

/** The section's four routes, mounted at `path`, as `App.tsx` mounts them. */
export const renderSection = (path: string, extra?: ReactNode) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/repertoires" element={<Repertoires />} />
            <Route path="/repertoires/new" element={<RepertoireUpload />} />
            <Route path="/repertoires/:id" element={<RepertoireBoard />} />
            <Route path="/repertoires/:id/settings" element={<RepertoireSettingsScreen />} />
          </Routes>
          <RightPanelOutlet />
          {extra}
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );
