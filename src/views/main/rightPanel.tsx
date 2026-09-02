/**
 * The app shell's right-hand panel slot.
 *
 * `Layout.tsx` renders one aside next to the board square. It used to hold a
 * hardcoded Analysis placeholder; this module turns it into a slot a route can
 * fill with its own content — a move list, an evaluation panel — while every
 * route that fills nothing keeps seeing the placeholder.
 *
 * Three components, and nothing else, make up the API:
 *
 * | Export | Rendered by | Purpose |
 * | --- | --- | --- |
 * | `RightPanelProvider` | the shell, above the router `<Outlet />` | owns the slot |
 * | `RightPanelOutlet`   | the shell, inside its aside | renders whatever a route registered, or `fallback` |
 * | `RightPanel`         | **a route/screen** | registers its children into the aside |
 *
 * A screen uses it like this — no props to thread, no shell edit:
 *
 * ```tsx
 * import { RightPanel } from '../main/rightPanel';
 *
 * function LoadPgnScreen() {
 *   const [moves, setMoves] = useState<Move[]>([]);
 *   return (
 *     <>
 *       <Chessboard options={…} />
 *       <RightPanel>
 *         <MoveList moves={moves} />   // shares this screen's state by closure
 *       </RightPanel>
 *     </>
 *   );
 * }
 * ```
 *
 * ### How it works, and why it is built this way
 *
 * The registered content is **portalled** into a host element the outlet
 * renders, rather than lifted into shell state. A screen sits *below* the
 * shell in the tree, so pushing an element upwards would mean writing shell
 * state from a child effect on every render — and since a shell re-render
 * re-renders the screen, which mints a fresh element, that is a render loop.
 * With a portal the content stays part of the screen's own tree: it re-renders
 * with the screen, and React unmounts it (restoring the fallback) when the
 * route changes. Nothing is written to shell state on a content change.
 *
 * What the shell *does* need to know is whether anyone is registered at all,
 * so it can choose between the panel and the fallback. That single bit lives
 * in a small external store read through `useSyncExternalStore` — React's own
 * escape hatch for state that changes outside render — instead of a `useState`
 * written from an effect, which `react-hooks/set-state-in-effect` rejects and
 * which would cascade an extra render on every screen re-render.
 */

import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * The slot's mutable state, kept outside React: how many panels are currently
 * registered, and the host element the outlet is rendering (`null` while the
 * fallback is up). Both are read with `useSyncExternalStore`.
 */
type PanelSlot = {
    subscribe: (onStoreChange: () => void) => () => void;
    getOccupants: () => number;
    getHost: () => HTMLElement | null;
    setHost: (element: HTMLElement | null) => void;
    acquire: () => void;
    release: () => void;
};

const createPanelSlot = (): PanelSlot => {
    let occupants = 0;
    let host: HTMLElement | null = null;
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((listener) => listener());

    return {
        subscribe: (onStoreChange) => {
            listeners.add(onStoreChange);
            return () => {
                listeners.delete(onStoreChange);
            };
        },
        getOccupants: () => occupants,
        getHost: () => host,
        setHost: (element) => {
            if (host === element) return;
            host = element;
            emit();
        },
        acquire: () => {
            occupants += 1;
            emit();
        },
        release: () => {
            occupants -= 1;
            emit();
        },
    };
};

const PanelSlotContext = createContext<PanelSlot | null>(null);

const usePanelSlot = (who: string): PanelSlot => {
    const slot = useContext(PanelSlotContext);
    if (slot === null) {
        throw new Error(
            `<${who}> must be rendered inside <RightPanelProvider> — the app shell provides one.`,
        );
    }
    return slot;
};

/**
 * Owns one slot for the subtree below it. The shell mounts this above its
 * `<Outlet />` so the outlet and every route share the same slot.
 */
export function RightPanelProvider({ children }: { children: ReactNode }) {
    /*
      A lazy `useState` initializer, never written again: one slot per mounted
      shell, created on the first render and stable for its lifetime. A ref
      would hold it just as well, but the whole slot is *read* during render —
      by the outlet and by every panel — and `react-hooks/refs` rejects reading
      a ref's value there.
    */
    const [slot] = useState(createPanelSlot);

    return (
        <PanelSlotContext.Provider value={slot}>
            {children}
        </PanelSlotContext.Provider>
    );
}

/**
 * The slot's rendering end, for the shell's aside: the host element a
 * registered panel portals into, or `fallback` when no route has registered
 * one. The host element only exists while the slot is occupied, so an
 * unoccupied aside contains the fallback and nothing else.
 */
export function RightPanelOutlet({ fallback }: { fallback?: ReactNode }) {
    const slot = usePanelSlot('RightPanelOutlet');
    const occupied =
        useSyncExternalStore(slot.subscribe, slot.getOccupants) > 0;

    /*
      Stable for the life of the slot, and deliberately not `slot.setHost`
      itself. Two reasons, in that order:

      - A ref callback with a fresh identity is detached (called with `null`)
        and reattached on every render, so the host would be cleared and re-set
        each time the shell re-renders. React coalesces both writes into one
        commit, so the panel does not actually flicker — but it is pointless
        churn through the store, and it only stays harmless by accident.
      - Passing `slot.setHost` into `ref` makes `react-hooks/refs` treat the
        whole slot as a ref, and then every read of it during render — the two
        `useSyncExternalStore` calls included — is reported.
    */
    const attachHost = useCallback(
        (element: HTMLElement | null) => slot.setHost(element),
        [slot],
    );

    if (!occupied) return <>{fallback}</>;

    /*
      `display: contents` keeps the host out of the layout: the panel's own
      elements lay out as direct children of the aside, so registering content
      cannot change the aside's box model. A plain element rather than a `Box`
      — there is no theme token in that one declaration.
    */
    return (
        <div
            ref={attachHost}
            data-testid="layout-right-panel"
            style={{ display: 'contents' }}
        />
    );
}

/**
 * The slot's authoring end, for a route: renders `children` into the shell's
 * aside for as long as this component is mounted. Navigating away unmounts it
 * and the shell falls back on its own.
 *
 * One panel at a time — if two mounted routes register at once the later host
 * wins and both sets of content land in it. Render one `<RightPanel>` per
 * screen.
 */
export function RightPanel({ children }: { children: ReactNode }) {
    const slot = usePanelSlot('RightPanel');

    /*
      A layout effect, not `useEffect`: the shell has to swap the fallback for
      the host before the browser paints, otherwise the placeholder flashes for
      a frame on every navigation into a panel-owning route. `slot` is stable
      for the life of the provider, so this runs on mount and unmount only —
      never per content change, which the portal handles by itself.
    */
    useLayoutEffect(() => {
        slot.acquire();
        return () => slot.release();
    }, [slot]);

    const host = useSyncExternalStore(slot.subscribe, slot.getHost);

    // `null` on the very first render — `acquire()` above is what makes the
    // outlet render a host at all. The next render, in the same commit, has it.
    return host === null ? null : createPortal(children, host);
}
