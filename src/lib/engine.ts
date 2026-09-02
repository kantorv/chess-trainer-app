/*!
 * Stockfish.js (http://github.com/nmrugg/stockfish.js)
 * License: GPL
 */

/*
 * Description of the universal chess interface (UCI)  https://gist.github.com/aliostad/f4470274f39d29b788c1b09519e67372/
 */

/**
 * Path to the Stockfish worker script. The `stockfish.wasm.js` + `stockfish.wasm`
 * pair lives in `public/stockfish/`, which Vite serves under the configured
 * `base` — `/chess-trainer-app/` for the GitHub Pages project site, `/` under
 * Vitest. It must be built from `BASE_URL` (which always ends in a slash) and
 * never hardcoded to the site root: a bare `/stockfish/...` 404s under a
 * sub-path deployment, and `new Worker()` reports that only as an async error
 * event, so the board goes quiet instead of throwing.
 */
const STOCKFISH_WORKER_URL = `${import.meta.env.BASE_URL}stockfish/stockfish.wasm.js`;

/** Callback registered with {@link Engine.onMessage}; returns an unsubscribe fn. */
type EngineMessageCallback = (messageData: EngineMessage) => void;

/**
 * One option the running worker declared during the `uci` handshake.
 *
 * Read, never assumed. Which options exist — and which of them will take a
 * value — is a property of the *binary* in `public/stockfish/`, not of the UCI
 * spec. Asked `uci`, the build shipped here answers with, among others:
 *
 * ```
 * option name Threads type spin default 1 min 1 max 1
 * option name Hash type spin default 16 min 16 max 16
 * option name MultiPV type spin default 1 min 1 max 500
 * option name Skill Level type spin default 20 min 0 max 20
 * ```
 *
 * So `Threads` and `Hash` are declared but **pinned** — `min` equals `max`, one
 * legal value each — while `MultiPV` and `Skill Level` are genuinely
 * adjustable, and there is no `UCI_Elo` or `UCI_LimitStrength` at all. Three
 * states, not two. A settings UI that hardcoded the usual list would show knobs
 * that silently do nothing, so it reads {@link Engine.options} instead and can
 * say honestly which ones this engine does not have and which ones it has
 * already made up its mind about. {@link Engine.setOption} enforces the same
 * distinction on the wire — see {@link Engine.isSettable}, where the pinned case
 * turns out not to be mere tidiness.
 */
export type EngineOption = {
  name: string;
  /** `spin`, `check`, `combo`, `button`, `string` — as the engine reported it. */
  type: string;
  /** The engine's own default, verbatim; absent for a `button`. */
  defaultValue?: string;
  /** Bounds of a `spin`, when it gave them. */
  min?: number;
  max?: number;
  /** The permitted values of a `combo`. */
  vars?: string[];
};

/** What one `go` search should do. */
export type SearchOptions = {
  /** Plies to search. Clamped to 24 — the worker shares the tab with the UI. */
  depth?: number;
  /** Milliseconds to spend, on top of the depth limit. 0 or absent means no time limit. */
  movetime?: number;
};

export type EngineMessage = {
  /** stockfish engine message in UCI format*/
  uciMessage: string;
  /** found best move for current position in format `e2e4`*/
  bestMove?: string;
  /** found best move for opponent in format `e7e5` */
  ponder?: string;
  /**  material balance's difference in centipawns(IMPORTANT! stockfish gives the cp score in terms of whose turn it is)*/
  positionEvaluation?: string;
  /** count of moves until mate */
  possibleMate?: string;
  /** the best line found */
  pv?: string;
  /** number of halfmoves the engine looks ahead */
  depth?: number;
  /**
   * Which of the `MultiPV` lines this `info` describes, 1-based. Absent on a
   * single-PV search and on every non-`info` message.
   */
  multipv?: number;
  /**
   * The FEN this message is about.
   *
   * UCI carries no such tag, so the wrapper supplies one: it tracks which
   * searches are still running and stamps each message with the position of the
   * one that produced it. Without it a consumer cannot tell a result for the
   * position on screen from one still draining out of the search it replaced —
   * and the Play with Engine screen must never play a move that was computed
   * for a position the player has navigated away from.
   */
  fen?: string;
};

/**
 * Parse one `option name ... type ...` line from the `uci` handshake.
 *
 * Tokenised rather than matched with one regex, because an option *name* may
 * contain spaces (`Skill Level`, `Debug Log File`) and so may a `default` — the
 * keywords are the only reliable delimiters. Returns `null` for any other line.
 */
export const parseEngineOption = (line: string): EngineOption | null => {
  if (!line.startsWith("option name ")) return null;

  const KEYWORDS = new Set(["name", "type", "default", "min", "max", "var"]);
  const parts: Record<string, string> = {};
  const vars: string[] = [];

  let key: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (key === "var") {
      vars.push(buffer.join(" "));
    } else if (key !== null) {
      parts[key] = buffer.join(" ");
    }
    buffer = [];
  };

  // `slice(1)` drops the leading "option"; every following keyword opens a field.
  for (const token of line.trim().split(/\s+/).slice(1)) {
    if (KEYWORDS.has(token)) {
      flush();
      key = token;
    } else {
      buffer.push(token);
    }
  }
  flush();

  if (!parts.name || !parts.type) return null;

  const bound = (raw: string | undefined) => {
    const value = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(value)
      ? value
      : undefined;
  };

  return {
    name: parts.name,
    type: parts.type,
    defaultValue: parts.default,
    min: bound(parts.min),
    max: bound(parts.max),
    vars: vars.length > 0 ? vars : undefined,
  };
};

export default class Engine {
  stockfish: Worker;
  isReady: boolean;

  /**
   * What the running worker said it supports, filled in during the handshake and
   * complete at `uciok`. Empty until then — read it through
   * {@link whenOptionsReady} rather than at an arbitrary moment.
   */
  readonly options = new Map<string, EngineOption>();

  /** Every live subscriber. One worker listener fans out to all of them. */
  private callbacks = new Set<EngineMessageCallback>();

  /** True once `uciok` has arrived and {@link options} is complete. */
  private optionsReady = false;
  private optionsReadyCallbacks = new Set<() => void>();

  /**
   * Option values waiting to go out. Never posted the moment they are set — see
   * {@link flush} for the two reasons, both of which are ways to lose a search.
   */
  private pendingOptions = new Map<string, string>();

  /**
   * The search the caller wants running, if it is not running yet. Only ever one:
   * a newer position supersedes an older one outright, and a queue of searches
   * nobody is looking at any more is exactly what we do not want.
   */
  private pendingSearch: { fen: string; options: SearchOptions } | null = null;

  /**
   * The position of the search the engine is actually working on, or `undefined`
   * when it is idle. UCI answers every `go` with exactly one `bestmove`, which is
   * what keeps this in step — and it is what every `info` line is stamped with,
   * including lines that arrive after a newer position has been requested.
   */
  private searching: string | undefined;

  constructor() {
    // One dedicated worker per Engine instance. Do NOT hoist this to module
    // scope: a shared worker leaks across route changes and cannot be torn down.
    this.stockfish = new Worker(STOCKFISH_WORKER_URL);
    this.isReady = false;
    // A worker that fails to load (wrong path, bad MIME type) never throws —
    // it just never answers. Say so, so the next silent board is one search away.
    this.stockfish.addEventListener('error', (event) => {
      console.error(
        `Stockfish worker failed to load from ${STOCKFISH_WORKER_URL}`,
        event.message || event,
      );
    });

    /*
      A single listener on the worker, fanning out to the subscribers: the UCI
      line is parsed once per message rather than once per subscriber, and — the
      reason it has to be this way — the search bookkeeping below runs exactly
      once per message however many components are listening.
    */
    this.stockfish.addEventListener('message', (e: MessageEvent<string>) => {
      const message = this.transformSFMessageData(e);
      if (message.bestMove) {
        // The search is over and the engine is idle again, which is the moment
        // anything that has been waiting for it can go out.
        this.searching = undefined;
      }
      this.handshake(message);
      this.callbacks.forEach((callback) => callback(message));
      if (message.bestMove) this.flush();
    });

    this.init();
  }

  /**
   * Subscribe to engine output. Returns an unsubscribe function — always call it
   * on React unmount so listeners don't accumulate across position changes /
   * re-renders.
   */
  onMessage = (callback: EngineMessageCallback): (() => void) => {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  };

  private transformSFMessageData(e: MessageEvent<string>): EngineMessage {
    const uciMessage = e?.data ?? e;

    /*
      `score cp N` and `score mate N` are alternatives on one `info` line, and a
      line only ever carries one of them. Matching them together rather than with
      two independent searches is what lets a consumer clear a stale mate when
      the engine goes back to reporting centipawns — two loose regexes would
      leave the previous mate standing.
    */
    const score = uciMessage.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    const multipv = uciMessage.match(/\bmultipv\s+(\d+)/)?.[1];

    return {
      uciMessage,
      bestMove: uciMessage.match(/bestmove\s+(\S+)/)?.[1],
      ponder: uciMessage.match(/ponder\s+(\S+)/)?.[1],
      positionEvaluation: score?.[1] === 'cp' ? score[2] : undefined,
      possibleMate: score?.[1] === 'mate' ? score[2] : undefined,
      pv: uciMessage.match(/ pv\s+(.*)/)?.[1],
      // The leading space keeps this off `seldepth`.
      depth: Number(uciMessage.match(/ depth\s+(\S+)/)?.[1] ?? 0),
      multipv: multipv === undefined ? undefined : Number(multipv),
      fen: this.searching,
    };
  }

  /** The handshake half of the message handling: readiness and option discovery. */
  private handshake({ uciMessage }: EngineMessage) {
    if (uciMessage === 'readyok') {
      this.isReady = true;
      return;
    }

    const option = parseEngineOption(uciMessage);
    if (option) {
      this.options.set(option.name, option);
      return;
    }

    if (uciMessage === 'uciok') {
      this.optionsReady = true;

      const waiting = [...this.optionsReadyCallbacks];
      this.optionsReadyCallbacks.clear();
      waiting.forEach((callback) => callback());

      // Everything held back during the handshake can now go out.
      this.flush();
    }
  }

  /**
   * Send whatever is waiting, if the engine is in a state to receive it.
   *
   * **This is the whole of the wrapper's protocol discipline, and it exists
   * because getting it wrong fails silently.** UCI only permits `setoption`
   * while the engine is idle, and the build in `public/stockfish/` does not
   * merely ignore one sent mid-search: it abandons the search. No error, no
   * `bestmove`, no further `info` — the board simply never evaluates again.
   *
   * Two conditions therefore gate everything:
   *
   * - **before `uciok`** nothing goes out at all, because until the engine has
   *   listed its options there is no way to tell a real option from a name this
   *   build has never heard of;
   * - **while a search is running** nothing goes out either. A `stop` is posted
   *   instead, and the `bestmove` that ends the search calls back in here.
   *
   * Only with the engine idle and the handshake done are the options posted, and
   * only then does a waiting search start — so a search always runs under the
   * settings the caller asked for.
   */
  private flush() {
    if (!this.optionsReady) return;

    if (this.searching !== undefined) {
      // Come back when the engine says it has finished.
      if (this.pendingOptions.size > 0 || this.pendingSearch) this.stop();
      return;
    }

    for (const [name, value] of this.pendingOptions) {
      // An option this build does not have — or has pinned — never reaches the
      // wire. See `isSettable` for why the pinned case is not merely tidiness.
      if (this.isSettable(name)) {
        this.stockfish.postMessage(`setoption name ${name} value ${value}`);
      }
    }
    this.pendingOptions.clear();

    const next = this.pendingSearch;
    if (!next) return;
    this.pendingSearch = null;

    const depth = Math.min(next.options.depth ?? 12, 24);
    const { movetime } = next.options;

    this.searching = next.fen;
    this.stockfish.postMessage(`position fen ${next.fen}`);
    this.stockfish.postMessage(
      movetime && movetime > 0
        ? `go depth ${depth} movetime ${movetime}`
        : `go depth ${depth}`,
    );
  }

  init() {
    this.stockfish.postMessage('uci');
    this.stockfish.postMessage('isready');
  }

  onReady(callback: () => void) {
    return this.onMessage(({ uciMessage }) => {
      if (uciMessage === 'readyok') {
        callback();
      }
    });
  }

  /**
   * Run `callback` once {@link options} is complete — immediately if the
   * handshake already finished. Returns an unsubscribe fn.
   *
   * Both halves matter in React: a component that subscribes on mount may well
   * be mounting *after* `uciok` (the engine outlives a tab switch), and one that
   * unmounts first must not leave a callback behind.
   */
  whenOptionsReady(callback: () => void): () => void {
    if (this.optionsReady) {
      callback();
      return () => {};
    }
    this.optionsReadyCallbacks.add(callback);
    return () => {
      this.optionsReadyCallbacks.delete(callback);
    };
  }

  /** Whether the running worker declared this option. False until the handshake lands. */
  supportsOption(name: string): boolean {
    return this.options.has(name);
  }

  /**
   * Whether an option can actually be *set* — declared, and with more than one
   * legal value.
   *
   * An option whose `min` equals its `max` is pinned by the build, so posting it
   * could at best be a no-op. It is not always a no-op: the WASM worker in
   * `public/stockfish/` declares `Threads type spin default 1 min 1 max 1`, and
   * `setoption name Threads value 1` — its own default — makes it stop answering
   * altogether. No error, no `bestmove`, no further `info`; the board simply
   * never evaluates again. `Hash`, pinned the same way, is harmless; `Threads` is
   * not, and there is nothing on the wire to tell the two apart beforehand.
   *
   * So a pinned option is never sent. That costs nothing — there was only ever
   * one value it could take — and the settings tab already renders it as fixed.
   */
  private isSettable(name: string): boolean {
    const option = this.options.get(name);
    if (option === undefined) return false;
    return option.min === undefined || option.min !== option.max;
  }

  /**
   * Send `setoption name <name> value <value>`, if this build has that option.
   *
   * Returns whether this engine will take the value — `false` when the build has
   * no such option, or has pinned it to a single value ({@link isSettable}). In
   * both cases nothing is posted, which is what keeps the settings tab from
   * showing a knob that does nothing. Calls made before the handshake are held
   * and re-checked at `uciok`, and report `true` optimistically because the
   * answer does not exist yet.
   */
  setOption(name: string, value: string | number): boolean {
    // Buffered rather than posted: {@link flush} decides when it is safe to
    // send, and drops the names this build cannot take.
    this.pendingOptions.set(name, String(value));
    this.flush();
    return this.optionsReady ? this.isSettable(name) : true;
  }

  /**
   * Ask for `fen` to be searched.
   *
   * It may not start immediately: {@link flush} holds it until the handshake is
   * done and any running search has ended, so that pending option changes go out
   * first. A second call before the first has started replaces it — the newer
   * position is the one anybody is looking at.
   */
  search(fen: string, options: SearchOptions = {}) {
    this.pendingSearch = { fen, options };
    this.flush();
  }

  /** The depth-only search the two demo boards use. */
  evaluatePosition(fen: string, depth = 12) {
    this.search(fen, { depth });
  }

  stop() {
    this.stockfish.postMessage('stop'); // Run when searching takes too long time and stockfish will return you the bestmove of the deep it has reached
  }

  terminate() {
    this.isReady = false;
    this.callbacks.clear();
    this.optionsReadyCallbacks.clear();
    this.pendingOptions.clear();
    this.pendingSearch = null;
    this.searching = undefined;
    this.stockfish.postMessage('quit'); // ask Stockfish to shut down cleanly
    this.stockfish.terminate(); // then kill the worker thread. Run this on chessboard unmount.
  }
}
