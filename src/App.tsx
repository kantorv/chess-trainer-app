//import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider } from "react-router";

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
import { default as UserPgnsScreen  } from './views/pgn/Main'



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
        // The User PGNs library. One splat route, over content that is
        // not a JSON file at all: the folders are the `.pgn` files under
        // `src/data/pgn/` and the items are the games inside them
        // (`lib/pgnCatalog.ts`). Dropping a file in adds a folder and its games
        // at `/pgn/<folder>` and `/pgn/<folder>/<game>` with no edit here.
        {
          path: "/pgn/*",
          element: <UserPgnsScreen />
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
