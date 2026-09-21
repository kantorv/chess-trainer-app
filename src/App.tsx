//import * as Sentry from "@sentry/react";
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation, type RouteObject } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as HomeScreen  } from './views/home/Main'
import { default as LoadPgnScreen  } from './views/games/load_pgn/Main'
import { default as PlayWithEngineScreen  } from './views/engine/play/Main'
import { default as SavedGamesScreen  } from './views/engine/saved/Main'
import { default as MaskedPlayScreen  } from './views/masked/play/Main'
import { default as AnalysisBoardScreen  } from './views/tools/analysis/Main'
import { default as SavedAnalysesScreen  } from './views/tools/analysis/saved/Main'
import { default as AnalysisSettingsScreen  } from './views/tools/analysis/saved/AnalysisSettingsScreenMain'
import { default as BoardEditorScreen  } from './views/tools/editor/Main'
import { default as OpeningsScreen  } from './views/tools/openings/Main'
import { default as SavedOpeningsScreen  } from './views/tools/openings/saved/Main'
import { default as UserPgnsScreen  } from './views/pgn/Main'
import { default as RepertoiresScreen  } from './views/repertoires/RepertoiresMain'
import { default as RepertoireUploadScreen  } from './views/repertoires/RepertoireUploadMain'
import { default as RepertoireBoardScreen  } from './views/repertoires/RepertoireBoardMain'
import { default as RepertoireSettingsScreen  } from './views/repertoires/RepertoireSettingsScreenMain'
import { default as RepertoireGameScreen  } from './views/repertoires/RepertoireGameMain'


/**
 * Back-compat for the pre-CTA-38 `/pgn/*` URLs. The section is "Library" now
 * and lives at `/library/*`; a bookmarked or shared `/pgn/...` link (with its
 * query string, e.g. `?move=`) redirects to the same path under `/library`.
 * `replace` so it does not leave the dead URL in history.
 */
export function LegacyPgnRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/pgn(?=\/|$)/, "");
  return <Navigate to={`/library${rest}${location.search}${location.hash}`} replace />;
}

/**
 * Back-compat for the pre-CTA-39 `/tools/openings` URL. The Openings screen now
 * lives at `/openings` (a top-level folder of its own), so a bookmarked or
 * shared `/tools/openings` link (with its query string, e.g. `?fen=`) redirects
 * there. `replace` so it does not leave the dead URL in history.
 */
export function ToolsOpeningsRedirect() {
  const location = useLocation();
  return <Navigate to={`/openings${location.search}${location.hash}`} replace />;
}

/**
 * The **Development** section's routes (CTA-60) — the five boards composed from
 * the unified board core (`.claude/rules/chessboard-v2.md`).
 *
 * Dev-only, and this array is the whole of the gate. Two things make it
 * provable rather than hopeful:
 *
 * - `import.meta.env.DEV` is replaced by the literal `false` in a production
 *   build, so the conditional below is dead code;
 * - every screen is reached through `lazy(() => import(…))` rather than a
 *   static import at the top of this file, so with the branch dead there is no
 *   reference to `views/dev/` left for rollup to keep — no dev chunk is
 *   emitted at all, where a static import would have been bundled whether the
 *   route existed or not.
 *
 * `Suspense` is required by `lazy`, and a board screen resolves from the same
 * dev server in a frame, so the fallback is deliberately nothing.
 */
const devScreen = (load: Parameters<typeof lazy>[0]): ReactNode => {
  const Screen = lazy(load);
  return (
    <Suspense fallback={null}>
      <Screen />
    </Suspense>
  );
};

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      { path: "/dev/play", element: devScreen(() => import("./views/dev/play/Main")) },
      { path: "/dev/masked", element: devScreen(() => import("./views/dev/masked/Main")) },
      { path: "/dev/openings", element: devScreen(() => import("./views/dev/openings/Main")) },
      { path: "/dev/repertoire", element: devScreen(() => import("./views/dev/repertoire/Main")) },
    ]
  : [];

const routes = createBrowserRouter(

  [
    {
      path: "/",
      //  errorElement: <NotFoundPage />,
      element:
          <DefaultLayout />
      ,
      children: [
        {
          index: true, element: <HomeScreen />

        },
        {
          path: "/engine/play",
          element: <PlayWithEngineScreen />
        },
        // The reader's own games against the engine, kept in `localStorage`
        // (`lib/savedGameStore.ts`). A screen rather than a library section: the
        // games are this app's own output, so there is no catalog to nest and no
        // splat to resolve.
        {
          path: "/engine/saved",
          element: <SavedGamesScreen />
        },
        {
          path: "/masked/play",
          element: <MaskedPlayScreen />
        },
        {
          path: "/games/load-pgn",
          element: <LoadPgnScreen />
        },
        {
          path: "/tools/analysis",
          element: <AnalysisBoardScreen />
        },
        // The reader's own analysis boards, kept in `localStorage`
        // (`lib/savedAnalysisStore.ts`). The Saved games screen's counterpart,
        // and a screen rather than a library section for the same reason: these
        // are this app's own output, so there is no catalog to nest.
        {
          path: "/tools/analysis/saved",
          element: <SavedAnalysesScreen />
        },
        // A saved analysis' title, description, side, arrows and folder (CTA-73).
        {
          path: "/tools/analysis/saved/:id/settings",
          element: <AnalysisSettingsScreen />
        },
        {
          path: "/tools/editor",
          element: <BoardEditorScreen />
        },
        {
          path: "/openings",
          element: <OpeningsScreen />
        },
        // The reader's own saved openings, kept in `localStorage`
        // (`lib/savedOpeningStore.ts`). The Saved analyses screen's counterpart,
        // and a screen rather than a library section for the same reason: these
        // are this app's own output, so there is no catalog to nest.
        {
          path: "/openings/saved",
          element: <SavedOpeningsScreen />
        },
        // The reader's own repertoires (CTA-61), kept in `localStorage`
        // (`lib/savedRepertoireStore.ts`): the list, the screen one is brought
        // in on, and the v2 board one is read on. `new` is a static segment, so
        // it ranks above `:id` whatever the order here.
        {
          path: "/repertoires",
          element: <RepertoiresScreen />
        },
        {
          path: "/repertoires/new",
          element: <RepertoireUploadScreen />
        },
        {
          path: "/repertoires/:id",
          element: <RepertoireBoardScreen />
        },
        // A repertoire's title, description and main color (and what comes next).
        {
          path: "/repertoires/:id/settings",
          element: <RepertoireSettingsScreen />
        },
        // Its games (CTA-63): `end` (Get to the end) and `backtrack`. The
        // same player the repertoire's own view is, with a game's rules; an
        // unknown game is the view's own miss.
        {
          path: "/repertoires/:id/games/:game",
          element: <RepertoireGameScreen />
        },
        // Pre-CTA-39 the Openings screen lived under `/tools`. Old links redirect.
        {
          path: "/tools/openings",
          element: <ToolsOpeningsRedirect />
        },
        // The Library section. One splat route, over content that is not a JSON
        // file at all: the folders are the `.pgn` files under `src/data/pgn/`
        // and the items are the games inside them (`lib/pgnCatalog.ts`).
        // Dropping a file in adds a folder and its games at `/library/<folder>`
        // and `/library/<folder>/<game>` with no edit here. (The `src/data/pgn/`
        // directory keeps its name — internal.)
        {
          path: "/library/*",
          element: <UserPgnsScreen />
        },
        // Pre-CTA-38 the section was "User PGNs" at `/pgn/*`. Old links redirect.
        {
          path: "/pgn/*",
          element: <LegacyPgnRedirect />
        },
        // The Development section — dev-only; see `devRoutes` above.
        ...devRoutes

      ]
    }
  ],
  {
    // In a GitHub Pages project-site build this is "/chess-trainer-app/"
    // (Vite's `base`); in dev and under Vitest it is "/". Keeps route
    // matching and generated links under the deployed sub-path.
    basename: import.meta.env.BASE_URL,
  })

function App() {
  //const [count, setCount] = useState(0)

  return (
    <RouterProvider
      router={routes}

    />
  )
}

export default App
