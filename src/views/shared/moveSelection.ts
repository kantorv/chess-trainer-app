import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatScore, type Score } from "../../lib/engineAnalysis";

/**
 * **What a move list highlights, kept out of its props** — the reason a step
 * through a 9,146-node repertoire re-renders two tokens rather than all of
 * them (CTA-61).
 *
 * A move list's *structure* — which tokens exist, in what order, under which
 * side line — changes only when the game does. What changes on every step is
 * which one token is current; what changes on every finished search is one
 * token's eval. Passed down as props, either one re-rendered the whole list,
 * and with the engine streaming a line several times a second that was the
 * list being redrawn faster than the reader could click past it.
 *
 * So the list renders its structure **once per game** (memoised), and each
 * token subscribes to the one fact about itself that can change: "am I the
 * current move" ({@link useIsCurrentNode} / {@link useIsCurrentPly}) and "what
 * is my eval" ({@link useEvalText}). `useSyncExternalStore` re-renders a token
 * only when its own answer changes, so a step touches the token losing the
 * highlight and the token gaining it, and an engine message touches none.
 *
 * The store is owned by the list component (`MoveList`, `VariationTree`) and
 * handed down by context; the list writes its props into it in a layout
 * effect, so the tokens have caught up before the browser paints. A token
 * rendered with no list around it reads a store that never selects anything.
 */

type Selection = {
  /** The selected node; `null` is the start position, which no token matches. */
  nodeId: string | null;
  /** The selected mainline ply — `-1` inside a side line, where none is. */
  ply: number;
  /** The engine's scores by the FEN they describe, if the list prints any. */
  evalsByFen: ReadonlyMap<string, Score> | undefined;
};

export type MoveSelection = {
  read: () => Selection;
  /** Called when *this node's* "am I current" may have changed — no other. */
  subscribeNode: (id: string, onChange: () => void) => () => void;
  /** Called when *this ply's* "am I current" may have changed. */
  subscribePly: (ply: number, onChange: () => void) => () => void;
  /** Called when *this position's* eval may have changed. */
  subscribeFen: (fen: string, onChange: () => void) => () => void;
  write: (next: Selection) => void;
};

/** Listeners by key, so a change reaches the tokens it concerns and no others. */
const keyedListeners = <K>() => {
  const byKey = new Map<K, Set<() => void>>();
  return {
    add: (key: K, onChange: () => void) => {
      let set = byKey.get(key);
      if (set === undefined) byKey.set(key, (set = new Set()));
      set.add(onChange);
      return () => {
        set.delete(onChange);
        if (set.size === 0) byKey.delete(key);
      };
    },
    notify: (key: K) => byKey.get(key)?.forEach((listener) => listener()),
  };
};

/**
 * The store. **Subscriptions are keyed** — by node id, by ply, by FEN — so a
 * step notifies the token losing the highlight and the token gaining it, and a
 * finished search notifies the tokens of the positions whose eval changed.
 * One flat listener set would ask all nine thousand tokens of a big repertoire
 * whether *they* had changed, on every step, which is its own O(n) per step.
 */
export const createMoveSelection = (initial: Selection): MoveSelection => {
  let current = initial;
  const nodes = keyedListeners<string>();
  const plies = keyedListeners<number>();
  const fens = keyedListeners<string>();

  return {
    read: () => current,
    subscribeNode: nodes.add,
    subscribePly: plies.add,
    subscribeFen: fens.add,
    write: (next) => {
      const previous = current;
      current = next;

      if (next.nodeId !== previous.nodeId) {
        if (previous.nodeId !== null) nodes.notify(previous.nodeId);
        if (next.nodeId !== null) nodes.notify(next.nodeId);
      }
      if (next.ply !== previous.ply) {
        plies.notify(previous.ply);
        plies.notify(next.ply);
      }
      if (next.evalsByFen !== previous.evalsByFen) {
        // Every position either map scores, notified once, and only if its
        // score is actually different — the maps grow one entry per search.
        const changed = new Set<string>();
        for (const [fen, score] of next.evalsByFen ?? []) {
          if (previous.evalsByFen?.get(fen) !== score) changed.add(fen);
        }
        for (const [fen, score] of previous.evalsByFen ?? []) {
          if (next.evalsByFen?.get(fen) !== score) changed.add(fen);
        }
        changed.forEach(fens.notify);
      }
    },
  };
};

/** Selects nothing and never changes — what a token reads outside a list. */
const NOWHERE = createMoveSelection({ nodeId: null, ply: -1, evalsByFen: undefined });

export const MoveSelectionContext = createContext<MoveSelection>(NOWHERE);

/**
 * The store a list owns: created once, and brought up to date with the list's
 * props before paint. What a list component calls, and wraps its tokens in
 * {@link MoveSelectionContext} with.
 */
export const useMoveSelectionStore = (selection: Selection): MoveSelection => {
  const [store] = useState(() => createMoveSelection(selection));
  const { nodeId, ply, evalsByFen } = selection;
  useLayoutEffect(() => {
    store.write({ nodeId, ply, evalsByFen });
  }, [store, nodeId, ply, evalsByFen]);
  return store;
};

/** Whether this side-line (or flowing-tree) token is the selected node. */
export const useIsCurrentNode = (id: string): boolean => {
  const store = useContext(MoveSelectionContext);
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribeNode(id, onChange),
    [store, id],
  );
  const read = () => store.read().nodeId === id;
  return useSyncExternalStore(subscribe, read, read);
};

/** Whether this numbered-row cell is the selected mainline ply. */
export const useIsCurrentPly = (ply: number): boolean => {
  const store = useContext(MoveSelectionContext);
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribePly(ply, onChange),
    [store, ply],
  );
  const read = () => store.read().ply === ply;
  return useSyncExternalStore(subscribe, read, read);
};

/**
 * The eval printed beside a move, or `undefined` for a position the engine has
 * not finished — which prints nothing, not the no-data dash.
 */
export const useEvalText = (fen: string): string | undefined => {
  const store = useContext(MoveSelectionContext);
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribeFen(fen, onChange),
    [store, fen],
  );
  const read = () => {
    const score = store.read().evalsByFen?.get(fen);
    return score === undefined ? undefined : formatScore(score);
  };
  return useSyncExternalStore(subscribe, read, read);
};

/**
 * Scroll a token into view when it becomes the current one — the per-token
 * version of the list-wide effect the lists used to run. `block: "nearest"`
 * scrolls the nearest scrolling ancestor and stops there. Optional call:
 * jsdom implements no scrolling and leaves `scrollIntoView` undefined.
 */
export const useScrollWhenCurrent = <E extends HTMLElement>(isCurrent: boolean) => {
  const ref = useRef<E | null>(null);
  useLayoutEffect(() => {
    if (isCurrent) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [isCurrent]);
  return ref;
};
