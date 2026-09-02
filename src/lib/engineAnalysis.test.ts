import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import {
  EVAL_BAR_MARGIN,
  evalBarFraction,
  formatScore,
  numberedVariation,
  pvToSan,
  scoreFromUci,
  type Score,
} from "./engineAnalysis";

describe("scoreFromUci", () => {
  /*
    The single rule this module exists for: Stockfish scores from the side to
    move's perspective, every display in the app says "up is White", so the same
    raw number has to come out with opposite signs for the two turns.
  */
  it("keeps a White-to-move score as it is", () => {
    expect(scoreFromUci({ positionEvaluation: "40" }, "w")).toEqual({
      kind: "cp",
      value: 40,
    });
  });

  it("flips a Black-to-move score into White's perspective", () => {
    expect(scoreFromUci({ positionEvaluation: "40" }, "b")).toEqual({
      kind: "cp",
      value: -40,
    });
    expect(scoreFromUci({ positionEvaluation: "-150" }, "b")).toEqual({
      kind: "cp",
      value: 150,
    });
  });

  it("flips a mate the same way", () => {
    expect(scoreFromUci({ possibleMate: "3" }, "b")).toEqual({
      kind: "mate",
      value: -3,
    });
    expect(scoreFromUci({ possibleMate: "-2" }, "w")).toEqual({
      kind: "mate",
      value: -2,
    });
  });

  it("prefers a mate over a centipawn number on the same line", () => {
    expect(
      scoreFromUci({ positionEvaluation: "900", possibleMate: "4" }, "w"),
    ).toEqual({ kind: "mate", value: 4 });
  });

  it("returns null when the line carried no score", () => {
    expect(scoreFromUci({}, "w")).toBeNull();
    expect(scoreFromUci({ positionEvaluation: "" }, "w")).toBeNull();
    expect(scoreFromUci({ positionEvaluation: "nonsense" }, "w")).toBeNull();
  });
});

describe("formatScore", () => {
  it("signs a centipawn score and writes it in pawns", () => {
    expect(formatScore({ kind: "cp", value: 124 })).toBe("+1.24");
    expect(formatScore({ kind: "cp", value: -35 })).toBe("−0.35");
  });

  it("writes a level position as a plain zero", () => {
    expect(formatScore({ kind: "cp", value: 0 })).toBe("0.00");
    // Would be "-0.00" straight out of toFixed.
    expect(formatScore({ kind: "cp", value: -0.4 })).toBe("0.00");
  });

  it("writes a mate as a mate, not as a huge centipawn number", () => {
    expect(formatScore({ kind: "mate", value: 5 })).toBe("M5");
    expect(formatScore({ kind: "mate", value: -3 })).toBe("-M3");
  });

  it("says nothing when there is nothing to say", () => {
    expect(formatScore(null)).toBe("—");
  });
});

describe("evalBarFraction", () => {
  const at = (score: Score) => evalBarFraction(score);

  it("centres an unknown or level position", () => {
    expect(evalBarFraction(null)).toBe(0.5);
    expect(at({ kind: "cp", value: 0 })).toBeCloseTo(0.5, 5);
  });

  it("moves towards White as White's score grows", () => {
    expect(at({ kind: "cp", value: 100 })).toBeGreaterThan(0.5);
    expect(at({ kind: "cp", value: 300 })).toBeGreaterThan(
      at({ kind: "cp", value: 100 }),
    );
    expect(at({ kind: "cp", value: -100 })).toBeLessThan(0.5);
  });

  it("is symmetric about the centre", () => {
    expect(at({ kind: "cp", value: 250 }) + at({ kind: "cp", value: -250 })).toBeCloseTo(1, 5);
  });

  it("flattens out where the game is decided either way", () => {
    // The whole point of the logistic curve: +8 to +12 is not four more pawns
    // of bar travel, it is a rounding error.
    const eight = at({ kind: "cp", value: 800 });
    const twelve = at({ kind: "cp", value: 1200 });
    expect(twelve - eight).toBeLessThan(0.05);
  });

  it("pins a mate to the end, leaving the loser a visible sliver", () => {
    expect(at({ kind: "mate", value: 1 })).toBe(1 - EVAL_BAR_MARGIN);
    expect(at({ kind: "mate", value: 9 })).toBe(1 - EVAL_BAR_MARGIN);
    expect(at({ kind: "mate", value: -2 })).toBe(EVAL_BAR_MARGIN);
    expect(EVAL_BAR_MARGIN).toBeGreaterThan(0);
  });

  it("never leaves [0, 1]", () => {
    for (const value of [-100000, -5000, 0, 5000, 100000]) {
      const fraction = at({ kind: "cp", value });
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
  });
});

describe("pvToSan", () => {
  it("rewrites the engine's long algebraic into SAN", () => {
    expect(pvToSan(DEFAULT_POSITION, "e2e4 e7e5 g1f3")).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("reads a promotion off the fifth character", () => {
    expect(pvToSan("8/P6k/8/8/8/8/8/K7 w - - 0 1", "a7a8q")).toEqual(["a8=Q"]);
  });

  it("stops at the first move that will not play", () => {
    // A line left over from another position: take what is legal, drop the rest
    // rather than throwing in the middle of a render.
    expect(pvToSan(DEFAULT_POSITION, "e2e4 e7e5 e2e4")).toEqual(["e4", "e5"]);
  });

  it("handles an empty line and an unreadable position", () => {
    expect(pvToSan(DEFAULT_POSITION, "")).toEqual([]);
    expect(pvToSan(DEFAULT_POSITION, "   ")).toEqual([]);
    expect(pvToSan("not a fen", "e2e4")).toEqual([]);
  });
});

describe("numberedVariation", () => {
  it("numbers a line that starts on White's move", () => {
    expect(numberedVariation(DEFAULT_POSITION, ["e4", "e5", "Nf3"])).toBe(
      "1. e4 e5 2. Nf3",
    );
  });

  it("opens with an ellipsis when the line starts on Black's move", () => {
    const blackToMove =
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(numberedVariation(blackToMove, ["e5", "Nf3"])).toBe("1... e5 2. Nf3");
  });

  it("starts from the position's own move number, not from 1", () => {
    const late = "8/5k2/8/8/8/6K1/6P1/8 w - - 0 24";
    expect(numberedVariation(late, ["Kf3", "Ke6"])).toBe("24. Kf3 Ke6");
  });

  it("is empty for an empty line", () => {
    expect(numberedVariation(DEFAULT_POSITION, [])).toBe("");
  });
});
