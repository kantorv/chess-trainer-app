import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import type { EngineOption } from "../../../lib/engine";
import EngineSettings from "./EngineSettings";
import {
  approximateElo,
  DEFAULT_ENGINE_SETTINGS,
  type EngineSettings as EngineSettingsValues,
} from "./usePlayWithEngine";

/*
  The tab is presentational, so nothing here builds an `Engine` — the map of
  declared options is exactly what the real one hands over, and passing it
  directly is what lets the "unsupported knob" behaviour be tested at all.
*/

const spin = (
  name: string,
  min: number,
  max: number,
): [string, EngineOption] => [name, { name, type: "spin", min, max }];

/**
 * Exactly what the build in `public/stockfish/` answers `uci` with — read off
 * the running worker, not guessed. Threads and Hash are *declared but pinned*:
 * a single-threaded WASM worker with a fixed table.
 */
const SHIPPED_OPTIONS = new Map<string, EngineOption>([
  spin("Threads", 1, 1),
  spin("Hash", 16, 16),
  spin("MultiPV", 1, 500),
  spin("Skill Level", 0, 20),
]);

const renderSettings = (
  overrides: Partial<{
    settings: Partial<EngineSettingsValues>;
    engineOptions: ReadonlyMap<string, EngineOption>;
    showEvalBar: boolean;
  }> = {},
) => {
  const onChange = vi.fn();
  const onShowEvalBarChange = vi.fn();
  const onNewGame = vi.fn();

  render(
    <AppThemeWithLang>
      <EngineSettings
        settings={{ ...DEFAULT_ENGINE_SETTINGS, ...overrides.settings }}
        onChange={onChange}
        engineOptions={overrides.engineOptions ?? SHIPPED_OPTIONS}
        showEvalBar={overrides.showEvalBar ?? true}
        onShowEvalBarChange={onShowEvalBarChange}
        onNewGame={onNewGame}
      />
    </AppThemeWithLang>,
  );

  return { onChange, onShowEvalBarChange, onNewGame };
};

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the engine settings tab", () => {
  it("offers every knob the issue asked for", () => {
    renderSettings();

    for (const testId of [
      "engine-setting-skill-level",
      "engine-setting-depth",
      "engine-setting-multipv",
      "engine-setting-movetime",
      "engine-setting-threads",
      "engine-setting-hash",
      "engine-setting-playas",
      "engine-setting-evalbar",
      "engine-new-game",
    ]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  /*
    The honesty requirement, and the case that actually occurs: this build
    declares Threads and Hash but pins each to a single value, so a slider that
    slid would move and change nothing — and the reader would believe it.
  */
  it("disables an option the engine pins to one value, and says what it is", () => {
    renderSettings();

    for (const [testId, message] of [
      ["engine-setting-threads", "This engine build fixes Threads at 1."],
      ["engine-setting-hash", "This engine build fixes Hash at 16."],
    ]) {
      expect(
        screen.getByTestId(testId).querySelector("input"),
      ).toBeDisabled();
      expect(screen.getByTestId(`${testId}-fixed`)).toHaveTextContent(message);
    }

    // A pinned option is not a missing one, and must not be described as one.
    expect(
      screen.queryByTestId("engine-setting-threads-unsupported"),
    ).not.toBeInTheDocument();
  });

  it("leaves an option with a real range alone", () => {
    renderSettings();

    const multipv = screen.getByTestId("engine-setting-multipv");
    expect(multipv.querySelector("input")).toBeEnabled();
    expect(
      screen.queryByTestId("engine-setting-multipv-fixed"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("engine-setting-multipv-unsupported"),
    ).not.toBeInTheDocument();
  });

  it("disables an option this engine build does not have, and says why", () => {
    // A hypothetical build with no Hash at all — a different state from a
    // pinned one, and it has to read differently.
    renderSettings({
      engineOptions: new Map([spin("MultiPV", 1, 500), spin("Skill Level", 0, 20)]),
    });

    expect(
      screen.getByTestId("engine-setting-hash").querySelector("input"),
    ).toBeDisabled();
    expect(
      screen.getByTestId("engine-setting-hash-unsupported"),
    ).toHaveTextContent('This engine build has no "Hash" option.');
    expect(
      screen.queryByTestId("engine-setting-hash-fixed"),
    ).not.toBeInTheDocument();
  });

  it("calls nothing unsupported before the handshake has landed", () => {
    // An empty map means "not asked yet", not "this engine has nothing".
    renderSettings({ engineOptions: new Map() });

    expect(
      screen.queryByTestId("engine-setting-hash-unsupported"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("engine-setting-hash-fixed"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("engine-setting-hash").querySelector("input"),
    ).toBeEnabled();
  });

  it("takes a slider's range from the engine rather than from a guess", () => {
    renderSettings({
      engineOptions: new Map([spin("Skill Level", 0, 8)]),
    });

    const input = screen
      .getByTestId("engine-setting-skill-level")
      .querySelector("input");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "8");
  });

  it("labels strength as a level with an estimated Elo, not as an Elo setting", () => {
    // This build has no UCI_Elo, so the figure is an estimate of what the skill
    // level plays like and is worded that way.
    renderSettings({ settings: { skillLevel: 10 } });

    expect(
      screen.getByTestId("engine-setting-skill-level-value"),
    ).toHaveTextContent(`Level 10 (≈${approximateElo(10)} Elo)`);
  });

  it("caps the depth slider at what the engine wrapper will actually run", () => {
    renderSettings();

    const input = screen
      .getByTestId("engine-setting-depth")
      .querySelector("input");
    expect(input).toHaveAttribute("max", "24");
  });

  it("reports a move time in seconds, and no limit at zero", () => {
    renderSettings({ settings: { moveTimeMs: 2500 } });
    expect(screen.getByTestId("engine-setting-movetime-value")).toHaveTextContent(
      "2.5s",
    );

    renderSettings({ settings: { moveTimeMs: 0 } });
    expect(
      screen.getAllByTestId("engine-setting-movetime-value").at(-1),
    ).toHaveTextContent("No limit");
  });

  it("reports a colour change", async () => {
    const { onChange } = renderSettings();

    await userEvent.click(screen.getByTestId("engine-setting-playas-black"));

    expect(onChange).toHaveBeenCalledWith({ playAs: "black" });
  });

  it("toggles the evaluation bar", async () => {
    const { onShowEvalBarChange } = renderSettings({ showEvalBar: true });

    await userEvent.click(
      screen.getByTestId("engine-setting-evalbar").querySelector("input")!,
    );

    expect(onShowEvalBarChange).toHaveBeenCalledWith(false);
  });

  it("starts a new game", async () => {
    const { onNewGame } = renderSettings();

    await userEvent.click(screen.getByTestId("engine-new-game"));

    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});

describe("approximateElo", () => {
  it("spans the skill-level range and rises with it", () => {
    expect(approximateElo(0)).toBe(1350);
    expect(approximateElo(20)).toBe(2850);
    expect(approximateElo(10)).toBeGreaterThan(approximateElo(5));
  });
});
