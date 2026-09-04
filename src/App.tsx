//import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as HomeScreen  } from './views/home/Main'
import { default as LoadPgnScreen  } from './views/games/load_pgn/Main'
import { default as PlayWithEngineScreen  } from './views/engine/play/Main'
import { default as MaskedPlayScreen  } from './views/masked/play/Main'
import { default as AnalysisBoardScreen  } from './views/tools/analysis/Main'
import { default as BoardEditorScreen  } from './views/tools/editor/Main'
import { default as MatesListScreen  } from './views/mates/list/Main'
import { default as MateDetailScreen  } from './views/mates/detail/Main'
import { default as PositionsScreen  } from './views/positions/Main'
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
        {
          path: "/tools/editor",
          element: <BoardEditorScreen />
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
        // The User PGNs library. The same one splat route, over content that is
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
