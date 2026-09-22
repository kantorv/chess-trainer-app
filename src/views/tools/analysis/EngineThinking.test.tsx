import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import i18n from "../../../i18n";
import EngineThinking, { THINKING_DOTS_MS } from "./EngineThinking";

/* Play's status line (CTA-73): dots that move while the engine thinks. */

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const text = () => screen.getByTestId("analysis-play-status").textContent ?? "";

describe("EngineThinking", () => {
  it("moves its dots on while thinking, one to three and round again", () => {
    render(<EngineThinking thinking depth={0} />);
    expect(text()).toBe("Engine is thinking.");
    act(() => vi.advanceTimersByTime(THINKING_DOTS_MS));
    expect(text()).toBe("Engine is thinking..");
    act(() => vi.advanceTimersByTime(THINKING_DOTS_MS));
    expect(text()).toBe("Engine is thinking...");
    act(() => vi.advanceTimersByTime(THINKING_DOTS_MS));
    expect(text()).toBe("Engine is thinking.");
  });

  it("says it is the reader's move, with no dots, when not thinking", () => {
    render(<EngineThinking thinking={false} depth={12} />);
    expect(text()).toBe("Your move");
    expect(screen.queryByTestId("analysis-play-depth")).toBeNull();
  });
});
