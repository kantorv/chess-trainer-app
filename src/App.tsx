

import { useEffect, useMemo } from 'react';
//import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as BasicExampe } from './views/demos/basic/Main'
import { default as MovingPieceExample } from './views/demos/move/Main2'
import { default as EngineEvaluationExample  } from './views/demos/engine/Main3'

import { default as EnginePlayer1  } from './views/player/engine_basic/Main'
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
          index: true, element: <BasicExampe />

        },
        {
          path: "/move",
          element: <MovingPieceExample />
        },
        {
          path: "/analyze",
          element: <EngineEvaluationExample />
        },
        {
          path: "/player1",
          element: <EnginePlayer1 />
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
