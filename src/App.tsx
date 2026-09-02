

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
          path: "/games/load-pgn",
          element: <LoadPgnScreen />
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
