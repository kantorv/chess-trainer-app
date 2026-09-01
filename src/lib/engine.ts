/*!
 * Stockfish.js (http://github.com/nmrugg/stockfish.js)
 * License: GPL
 */

/*
 * Description of the universal chess interface (UCI)  https://gist.github.com/aliostad/f4470274f39d29b788c1b09519e67372/
 */

/**
 * Path to the Stockfish worker script. The `stockfish.wasm.js` + `stockfish.wasm`
 * pair lives in `public/stockfish/`, so Vite serves it from the site root.
 */
const STOCKFISH_WORKER_URL = '/stockfish/stockfish.wasm.js';

/** Callback registered with {@link Engine.onMessage}; returns an unsubscribe fn. */
type EngineMessageCallback = (messageData: EngineMessage) => void;

type EngineMessage = {
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
};

export default class Engine {
  stockfish: Worker;
  /**
   * Subscribe to engine output. Returns an unsubscribe function — always call it
   * on React unmount so listeners don't accumulate across position changes / re-renders.
   */
  onMessage: (callback: EngineMessageCallback) => () => void;
  isReady: boolean;

  constructor() {
    // One dedicated worker per Engine instance. Do NOT hoist this to module
    // scope: a shared worker leaks across route changes and cannot be torn down.
    this.stockfish = new Worker(STOCKFISH_WORKER_URL);
    this.isReady = false;
    this.onMessage = (callback) => {
      const listener = (e: MessageEvent<string>) => {
        callback(this.transformSFMessageData(e));
      };
      this.stockfish.addEventListener('message', listener);
      return () => this.stockfish.removeEventListener('message', listener);
    };
    this.init();
  }

  private transformSFMessageData(e: MessageEvent<string>) {
    const uciMessage = e?.data ?? e;

    return {
      uciMessage,
      bestMove: uciMessage.match(/bestmove\s+(\S+)/)?.[1],
      ponder: uciMessage.match(/ponder\s+(\S+)/)?.[1],
      positionEvaluation: uciMessage.match(/cp\s+(\S+)/)?.[1],
      possibleMate: uciMessage.match(/mate\s+(\S+)/)?.[1],
      pv: uciMessage.match(/ pv\s+(.*)/)?.[1],
      depth: Number(uciMessage.match(/ depth\s+(\S+)/)?.[1] ?? 0),
    };
  }

  init() {
    this.stockfish.postMessage('uci');
    this.stockfish.postMessage('isready');
    this.onMessage(({ uciMessage }) => {
      if (uciMessage === 'readyok') {
        this.isReady = true;
      }
    });
  }

  onReady(callback: () => void) {
    this.onMessage(({ uciMessage }) => {
      if (uciMessage === 'readyok') {
        callback();
      }
    });
  }

  evaluatePosition(fen: string, depth = 12) {
    if (depth > 24) depth = 24;

    this.stockfish.postMessage(`position fen ${fen}`);
    this.stockfish.postMessage(`go depth ${depth}`);
  }

  stop() {
    this.stockfish.postMessage('stop'); // Run when searching takes too long time and stockfish will return you the bestmove of the deep it has reached
  }

  terminate() {
    this.isReady = false;
    this.stockfish.postMessage('quit'); // ask Stockfish to shut down cleanly
    this.stockfish.terminate(); // then kill the worker thread. Run this on chessboard unmount.
  }
}
