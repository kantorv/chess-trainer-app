import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Engine, { parseEngineOption, type EngineMessage } from "./engine";

/**
 * A stand-in for the Stockfish worker: jsdom has no `Worker`, and even with one
 * the real engine is an async search we would have to wait on. This records what
 * the wrapper posts and lets a test push UCI lines back, which is exactly the
 * surface `Engine` is written against.
 */
class FakeWorker implements Partial<Worker> {
  static last: FakeWorker | null = null;

  readonly posted: string[] = [];
  terminated = false;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor() {
    FakeWorker.last = this;
  }

  postMessage(message: string) {
    this.posted.push(message);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  terminate() {
    this.terminated = true;
  }

  /** Push one UCI line back, the way the real worker would. */
  say(data: string) {
    this.listeners.get("message")?.forEach((listener) => listener({ data }));
  }

  /**
   * The `uci` handshake of the build actually shipped in `public/stockfish/`,
   * copied from what the running worker answers. Threads and Hash are declared
   * but pinned (`min` equals `max`) — a single-threaded WASM build.
   */
  completeHandshake() {
    this.say("option name Threads type spin default 1 min 1 max 1");
    this.say("option name Hash type spin default 16 min 16 max 16");
    this.say("option name MultiPV type spin default 1 min 1 max 500");
    this.say("option name Skill Level type spin default 20 min 0 max 20");
    this.say("option name Ponder type check default false");
    this.say("uciok");
  }
}

beforeEach(() => {
  FakeWorker.last = null;
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The engine under test, plus the worker it built. */
const build = () => {
  const engine = new Engine();
  const worker = FakeWorker.last;
  if (!worker) throw new Error("Engine did not construct a worker");
  return { engine, worker };
};

/**
 * An engine past its handshake and idle, with the log cleared — the state most
 * of these tests are actually about. Nothing goes on the wire before `uciok`
 * (see the protocol tests below), so a search test that skipped this would be
 * asserting on an engine that is still starting up.
 */
const ready = () => {
  const { engine, worker } = build();
  worker.completeHandshake();
  worker.posted.length = 0;
  return { engine, worker };
};

describe("parseEngineOption", () => {
  it("keeps a multi-word option name together", () => {
    // The reason this is tokenised rather than one regex: "Skill Level" and
    // "Debug Log File" are single option names with spaces in them.
    expect(parseEngineOption("option name Skill Level type spin default 20 min 0 max 20"))
      .toMatchObject({ name: "Skill Level", type: "spin", min: 0, max: 20 });
  });

  it("reads a spin's bounds and default", () => {
    expect(
      parseEngineOption("option name Threads type spin default 1 min 1 max 128"),
    ).toMatchObject({ name: "Threads", defaultValue: "1", min: 1, max: 128 });
  });

  it("collects a combo's permitted values", () => {
    expect(
      parseEngineOption(
        "option name Analysis Contempt type combo default Both var Off var White var Black var Both",
      ),
    ).toMatchObject({
      name: "Analysis Contempt",
      type: "combo",
      vars: ["Off", "White", "Black", "Both"],
    });
  });

  it("leaves bounds undefined when the engine gave none", () => {
    const option = parseEngineOption("option name Ponder type check default false");
    expect(option?.min).toBeUndefined();
    expect(option?.max).toBeUndefined();
  });

  it("ignores every line that is not an option declaration", () => {
    expect(parseEngineOption("uciok")).toBeNull();
    expect(parseEngineOption("info depth 12 score cp 30")).toBeNull();
    expect(parseEngineOption("option name Broken")).toBeNull();
  });
});

describe("Engine option discovery", () => {
  it("collects what the running worker declares, and reports it ready", () => {
    const { engine, worker } = build();
    const onReady = vi.fn();
    engine.whenOptionsReady(onReady);

    expect(onReady).not.toHaveBeenCalled();
    expect(engine.supportsOption("MultiPV")).toBe(false);

    worker.completeHandshake();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(engine.supportsOption("MultiPV")).toBe(true);
    expect(engine.options.get("Skill Level")).toMatchObject({ max: 20 });
  });

  it("runs a late subscriber immediately", () => {
    const { engine, worker } = build();
    worker.completeHandshake();

    const onReady = vi.fn();
    engine.whenOptionsReady(onReady);

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("refuses to post an option this build does not have", () => {
    const { engine, worker } = ready();

    expect(engine.setOption("MultiPV", 3)).toBe(true);
    // Not in this build's roster at all — nothing goes on the wire.
    expect(engine.setOption("UCI_Elo", 1800)).toBe(false);

    expect(worker.posted).toEqual(["setoption name MultiPV value 3"]);
  });

  it("refuses to post an option the build has pinned", () => {
    /*
      Not tidiness — survival. This worker declares
      `Threads type spin default 1 min 1 max 1`, and `setoption name Threads
      value 1`, its own default, makes it stop answering entirely: no bestmove,
      no further info, the board never evaluates again. A pinned option has one
      legal value, so refusing to send it costs nothing.
    */
    const { engine, worker } = ready();

    expect(engine.setOption("Threads", 1)).toBe(false);
    expect(engine.setOption("Hash", 16)).toBe(false);

    expect(worker.posted).toEqual([]);
  });

  it("holds pre-handshake options back, then sends only the supported ones", () => {
    const { engine, worker } = build();

    engine.setOption("MultiPV", 3);
    engine.setOption("UCI_Elo", 1800);
    expect(worker.posted.filter((line) => line.startsWith("setoption"))).toEqual([]);

    worker.completeHandshake();

    expect(worker.posted.filter((line) => line.startsWith("setoption"))).toEqual([
      "setoption name MultiPV value 3",
    ]);
  });

  it("reports a pinned option as declared, bounds and all", () => {
    // Declared but immovable is a different answer from absent, and the
    // settings tab tells the two apart by these bounds.
    const { engine, worker } = build();
    worker.completeHandshake();

    expect(engine.supportsOption("Hash")).toBe(true);
    expect(engine.options.get("Hash")).toMatchObject({ min: 16, max: 16 });
    expect(engine.options.get("Threads")).toMatchObject({ min: 1, max: 1 });
  });
});

describe("Engine searching", () => {
  it("posts the position and a depth-limited go", () => {
    const { engine, worker } = ready();

    engine.search("some-fen", { depth: 16 });

    expect(worker.posted).toEqual(["position fen some-fen", "go depth 16"]);
  });

  it("adds a movetime only when one was asked for", () => {
    const { engine, worker } = ready();

    engine.search("fen-a", { depth: 10, movetime: 1500 });
    expect(worker.posted.at(-1)).toBe("go depth 10 movetime 1500");

    worker.say("bestmove e2e4");
    engine.search("fen-b", { depth: 10, movetime: 0 });
    expect(worker.posted.at(-1)).toBe("go depth 10");
  });

  it("clamps the depth to what the wrapper will run", () => {
    const { engine, worker } = ready();

    engine.search("fen", { depth: 99 });

    expect(worker.posted.at(-1)).toBe("go depth 24");
  });

  it("stops a running search, and starts the next one only once it has ended", () => {
    const { engine, worker } = ready();

    engine.search("fen-a");
    engine.search("fen-b");

    // A `go` sent into a busy engine is not a second search, so the new position
    // waits behind a `stop`.
    expect(worker.posted).toContain("stop");
    expect(worker.posted).not.toContain("position fen fen-b");

    worker.say("bestmove e2e4");

    expect(worker.posted).toContain("position fen fen-b");
  });

  it("keeps only the newest of several superseded searches", () => {
    const { engine, worker } = ready();

    engine.search("fen-a");
    engine.search("fen-b");
    engine.search("fen-c");
    worker.say("bestmove e2e4");

    // Nobody is looking at fen-b any more; running it would only delay fen-c.
    expect(worker.posted).not.toContain("position fen fen-b");
    expect(worker.posted).toContain("position fen fen-c");
  });
});

describe("Engine protocol discipline", () => {
  /*
    The bug these exist for, found by driving the real worker: this build does
    not merely ignore a `setoption` sent while it is searching — it abandons the
    search. No error, no bestmove, no further info, and the board silently never
    evaluates again. Both orderings below produced exactly that.
  */

  it("sends nothing at all before the handshake has finished", () => {
    const { engine, worker } = build();
    worker.posted.length = 0;

    engine.setOption("MultiPV", 3);
    engine.search("fen-a", { depth: 12 });

    expect(worker.posted).toEqual([]);
  });

  it("applies the options first, then starts the search that was waiting", () => {
    const { engine, worker } = build();
    worker.posted.length = 0;

    engine.setOption("MultiPV", 3);
    engine.search("fen-a", { depth: 12 });
    worker.completeHandshake();

    expect(worker.posted).toEqual([
      "setoption name MultiPV value 3",
      "position fen fen-a",
      "go depth 12",
    ]);
  });

  it("never posts an option into a running search", () => {
    const { engine, worker } = ready();
    engine.search("fen-a");
    worker.posted.length = 0;

    engine.setOption("Skill Level", 5);

    // Stopped and held, not sent.
    expect(worker.posted).toEqual(["stop"]);

    worker.say("bestmove e2e4");
    expect(worker.posted).toContain("setoption name Skill Level value 5");
  });

  it("starts the search even when every pending option was dropped", () => {
    // Nothing settable is left after the pinned options are filtered out; the
    // search behind them must still run.
    const { engine, worker } = ready();

    engine.setOption("Threads", 1);
    engine.search("fen-a", { depth: 8 });

    expect(worker.posted).toEqual(["position fen fen-a", "go depth 8"]);
  });

  it("re-runs the search under the new setting once the option has landed", () => {
    const { engine, worker } = ready();
    engine.search("fen-a", { depth: 12 });
    worker.posted.length = 0;

    engine.setOption("MultiPV", 3);
    engine.search("fen-a", { depth: 12 });
    worker.say("bestmove e2e4");

    // The option must be in place before the `go` that is supposed to honour it.
    expect(worker.posted.indexOf("setoption name MultiPV value 3")).toBeLessThan(
      worker.posted.indexOf("go depth 12"),
    );
  });
});

describe("Engine message stamping", () => {
  const collect = (engine: Engine) => {
    const seen: EngineMessage[] = [];
    engine.onMessage((message) => seen.push(message));
    return seen;
  };

  it("stamps results with the position they were searched for", () => {
    const { engine, worker } = ready();
    const seen = collect(engine);

    engine.search("fen-a");
    worker.say("info depth 12 score cp 40 pv e2e4 e7e5");

    expect(seen.at(-1)).toMatchObject({
      fen: "fen-a",
      depth: 12,
      positionEvaluation: "40",
      pv: "e2e4 e7e5",
    });
  });

  it("keeps stamping the old position while its search drains", () => {
    /*
      The case the stamp exists for. A newer position has already been asked for,
      but the engine is still finishing the previous search — those lines belong
      to the *previous* position, and labelling them with the new one is how a
      screen ends up playing a move computed for a position nobody is on.
    */
    const { engine, worker } = ready();
    const seen = collect(engine);

    engine.search("fen-a");
    engine.search("fen-b");

    worker.say("info depth 9 score cp 10 pv d2d4");
    expect(seen.at(-1)?.fen).toBe("fen-a");

    // The old search ends; from here on the engine is working on fen-b.
    worker.say("bestmove d2d4");

    worker.say("info depth 9 score cp 20 pv g1f3");
    expect(seen.at(-1)?.fen).toBe("fen-b");
  });

  it("reads a mate and a centipawn score as alternatives, never both", () => {
    const { engine, worker } = ready();
    const seen = collect(engine);

    engine.search("fen");
    worker.say("info depth 20 score mate 3 pv e2e4");

    expect(seen.at(-1)?.possibleMate).toBe("3");
    expect(seen.at(-1)?.positionEvaluation).toBeUndefined();

    worker.say("info depth 21 score cp 250 pv d2d4");
    expect(seen.at(-1)?.positionEvaluation).toBe("250");
    // A stale mate left standing under a centipawn line is the bug this avoids.
    expect(seen.at(-1)?.possibleMate).toBeUndefined();
  });

  it("reads the MultiPV rank, and leaves it out of a single-PV line", () => {
    const { engine, worker } = ready();
    const seen = collect(engine);

    engine.search("fen");

    worker.say("info depth 14 multipv 2 score cp -15 pv c2c4 e7e5");
    expect(seen.at(-1)?.multipv).toBe(2);

    worker.say("info depth 14 score cp 30 pv e2e4");
    expect(seen.at(-1)?.multipv).toBeUndefined();
  });

  it("reads depth, not seldepth", () => {
    const { engine, worker } = ready();
    const seen = collect(engine);

    engine.search("fen");
    worker.say("info depth 12 seldepth 21 score cp 5 pv e2e4");

    expect(seen.at(-1)?.depth).toBe(12);
  });

  it("unsubscribes cleanly", () => {
    const { engine, worker } = ready();
    const listener = vi.fn();
    const unsubscribe = engine.onMessage(listener);

    worker.say("info depth 1 score cp 0 pv e2e4");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    worker.say("info depth 2 score cp 0 pv e2e4");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("Engine teardown", () => {
  it("quits the worker and drops every listener", () => {
    const { engine, worker } = ready();
    const listener = vi.fn();
    engine.onMessage(listener);

    engine.terminate();

    expect(worker.posted).toContain("quit");
    expect(worker.terminated).toBe(true);

    worker.say("info depth 1 score cp 0 pv e2e4");
    expect(listener).not.toHaveBeenCalled();
  });
});
