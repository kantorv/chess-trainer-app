import { describe, expect, it, vi } from "vitest";

import type { Score } from "../../lib/engineAnalysis";
import { createMoveSelection } from "./moveSelection";

/*
  The property the move lists' speed rests on (CTA-61): a change reaches the
  tokens it concerns and **no others**. If it regressed to one flat listener
  set, every step through a 9,146-node repertoire would ask every token again —
  nothing would render wrongly, it would only be slow, which is exactly the
  kind of regression no rendering test would catch.
*/

const cp = (value: number): Score => ({ kind: "cp", value });

describe("the move-selection store", () => {
  it("notifies only the node losing the highlight and the node gaining it", () => {
    const store = createMoveSelection({ nodeId: "n1", ply: 1, evalsByFen: undefined });
    const listeners = Object.fromEntries(
      ["n1", "n2", "n3"].map((id) => {
        const listener = vi.fn();
        store.subscribeNode(id, listener);
        return [id, listener];
      }),
    );

    store.write({ nodeId: "n2", ply: 1, evalsByFen: undefined });

    expect(listeners.n1).toHaveBeenCalledOnce();
    expect(listeners.n2).toHaveBeenCalledOnce();
    expect(listeners.n3).not.toHaveBeenCalled();
    expect(store.read().nodeId).toBe("n2");
  });

  it("notifies only the two plies that change", () => {
    const store = createMoveSelection({ nodeId: null, ply: 0, evalsByFen: undefined });
    const listeners = [0, 1, 2].map((ply) => {
      const listener = vi.fn();
      store.subscribePly(ply, listener);
      return listener;
    });

    store.write({ nodeId: null, ply: 1, evalsByFen: undefined });
    expect(listeners.map((listener) => listener.mock.calls.length)).toEqual([1, 1, 0]);
  });

  it("notifies only the positions whose eval changed when a search lands", () => {
    const a = cp(20);
    const first = new Map([["fen-a", a]]);
    const store = createMoveSelection({ nodeId: null, ply: 0, evalsByFen: first });
    const onA = vi.fn();
    const onB = vi.fn();
    const onC = vi.fn();
    store.subscribeFen("fen-a", onA);
    store.subscribeFen("fen-b", onB);
    store.subscribeFen("fen-c", onC);

    // A new map (the engine module's way), same score for a, a new one for b.
    store.write({ nodeId: null, ply: 0, evalsByFen: new Map([["fen-a", a], ["fen-b", cp(-5)]]) });

    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledOnce();
    expect(onC).not.toHaveBeenCalled();
  });

  it("says nothing at all for a write that changes nothing, and stops after unsubscribe", () => {
    const store = createMoveSelection({ nodeId: "n1", ply: 1, evalsByFen: undefined });
    const listener = vi.fn();
    const unsubscribe = store.subscribeNode("n1", listener);

    store.write({ nodeId: "n1", ply: 1, evalsByFen: undefined });
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    store.write({ nodeId: "n2", ply: 2, evalsByFen: undefined });
    expect(listener).not.toHaveBeenCalled();
  });
});
