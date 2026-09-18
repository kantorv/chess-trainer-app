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

import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import Repertoires from "./Repertoires";
import RepertoireBoard from "./RepertoireBoard";
import RepertoireUpload from "./RepertoireUpload";
import RepertoireSettingsScreen from "./RepertoireSettingsScreen";

/** A small two-chapter repertoire: a side line in the first line, none in the second. */
export const CARO = [
  '[Event "My Caro"]',
  '[White "1) Advance"]',
  '[Black "3...Bf5"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *",
  "",
  '[Event "My Caro"]',
  '[White "2) Exchange"]',
  '[Black "3...cxd5"]',
  "",
  "1. e4 c6 2. d4 d5 3. exd5 cxd5 *",
].join("\n");

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
