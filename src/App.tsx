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
