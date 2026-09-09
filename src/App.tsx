//import * as Sentry from "@sentry/react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as HomeScreen  } from './views/home/Main'
import { default as LoadPgnScreen  } from './views/games/load_pgn/Main'
import { default as PlayWithEngineScreen  } from './views/engine/play/Main'
import { default as SavedGamesScreen  } from './views/engine/saved/Main'
import { default as MaskedPlayScreen  } from './views/masked/play/Main'
import { default as AnalysisBoardScreen  } from './views/tools/analysis/Main'
import { default as SavedAnalysesScreen  } from './views/tools/analysis/saved/Main'
import { default as BoardEditorScreen  } from './views/tools/editor/Main'
import { default as OpeningsScreen  } from './views/tools/openings/Main'
import { default as MatesListScreen  } from './views/mates/list/Main'
import { default as MateDetailScreen  } from './views/mates/detail/Main'
import { default as PositionsScreen  } from './views/positions/Main'
import { default as UserPgnsScreen  } from './views/pgn/Main'



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
        {
          path: "/tools/editor",
          element: <BoardEditorScreen />
        },
        {
          path: "/tools/openings",
          element: <OpeningsScreen />
        },
        // The Mates library. Two patterns, however many categories and
        // positions the data grows to: the category is a parameter, so
        // `/mates/basic`, `/mates/advanced` and `/mates/complex` — and whatever
        // comes next — are all the same screen. The sidebar's three entries
        // point at these; folders never appear in a URL.
        {
          path: "/mates/:category",
          element: <MatesListScreen />
        },
        {
          path: "/mates/:category/:id",
          element: <MateDetailScreen />
        },
        // The endgame Positions library. **One** route, however deep the data
        // nests: the segments are resolved against the catalog
        // (`resolveLibraryPath`), which takes the longest prefix that names a
        // category and reads whatever is left as a position id. So
        // `/positions/queen-vs-rook`, `/positions/queen-vs-rook/rosettes` and
        // `/positions/pawn-endgames/reti-study` all land here, and adding a
        // category at any depth is a `src/data/positions.json` edit that this
        // file never sees.
        {
          path: "/positions/*",
          element: <PositionsScreen />
        },
        // The Library section. The same one splat route, over content that is
        // not a JSON file at all: the folders are the `.pgn` files under
        // `src/data/pgn/` and the items are the games inside them
        // (`lib/pgnCatalog.ts`). Dropping a file in adds a folder and its games
        // at `/library/<folder>` and `/library/<folder>/<game>` with no edit
        // here. (The `src/data/pgn/` directory keeps its name — internal.)
        {
          path: "/library/*",
          element: <UserPgnsScreen />
        },
        // Pre-CTA-38 the section was "User PGNs" at `/pgn/*`. Old links redirect.
        {
          path: "/pgn/*",
          element: <LegacyPgnRedirect />
        }

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
