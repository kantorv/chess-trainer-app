/**
 * The app shell's left-hand slot — the sidebar's screen position.
 *
 * `Layout.tsx` renders one fixed-width box at the start of its body row,
 * holding the nav-tree `<SideBar/>`. This module turns that box into a slot a
 * route can claim with its own content — a sibling-item list, while browsing a
 * library detail screen — while every route that claims nothing keeps seeing
 * the ordinary sidebar.
 *
 * It is `rightPanel.tsx`'s trio, verbatim, aimed at the other side of the
 * shell: `LeftPanelProvider` (the shell, above the router `<Outlet />`),
 * `LeftPanelOutlet` (the shell, inside the sidebar box, with `<SideBar/>` as
 * its `fallback`) and `LeftPanel` (a route/screen, to register content). See
 * `rightPanel.tsx`'s own comment for why a portal into an externally-tracked
 * host is the shape of both, rather than lifting the content into shell state.
 *
 * ```tsx
 * import { LeftPanel } from '../main/leftPanel';
 *
 * function LibraryPositionDetail() {
 *   return (
 *     <>
 *       <Chessboard options={…} />
 *       <LeftPanel>
 *         <SiblingList … />   // shares this screen's props/state by closure
 *       </LeftPanel>
 *     </>
 *   );
 * }
 * ```
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
            `<${who}> must be rendered inside <LeftPanelProvider> — the app shell provides one.`,
        );
    }
    return slot;
};

/**
 * Owns one slot for the subtree below it. The shell mounts this above its
 * `<Outlet />` so the outlet and every route share the same slot.
 */
export function LeftPanelProvider({ children }: { children: ReactNode }) {
    const [slot] = useState(createPanelSlot);

    return (
        <PanelSlotContext.Provider value={slot}>
            {children}
        </PanelSlotContext.Provider>
    );
}

/**
 * The slot's rendering end, for the shell's sidebar box: the host element a
 * registered panel portals into, or `fallback` — `<SideBar/>` — when no route
 * has claimed the slot.
 */
export function LeftPanelOutlet({ fallback }: { fallback?: ReactNode }) {
    const slot = usePanelSlot('LeftPanelOutlet');
    const occupied =
        useSyncExternalStore(slot.subscribe, slot.getOccupants) > 0;

    // Stable for the life of the slot — see `rightPanel.tsx` for why this is
    // not `slot.setHost` passed directly as the ref.
    const attachHost = useCallback(
        (element: HTMLElement | null) => slot.setHost(element),
        [slot],
    );

    if (!occupied) return <>{fallback}</>;

    return (
        <div
            ref={attachHost}
            data-testid="layout-left-panel"
            style={{ display: 'contents' }}
        />
    );
}

/**
 * The slot's authoring end, for a route: renders `children` in place of the
 * sidebar for as long as this component is mounted. Navigating away unmounts
 * it and the shell falls back to `<SideBar/>` on its own.
 *
 * One panel at a time — see `rightPanel.tsx`'s `RightPanel` for the same rule.
 */
export function LeftPanel({ children }: { children: ReactNode }) {
    const slot = usePanelSlot('LeftPanel');

    // A layout effect, not `useEffect` — see `rightPanel.tsx` for why: the
    // shell has to swap the fallback for the host before the browser paints.
    useLayoutEffect(() => {
        slot.acquire();
        return () => slot.release();
    }, [slot]);

    const host = useSyncExternalStore(slot.subscribe, slot.getHost);

    return host === null ? null : createPortal(children, host);
}
