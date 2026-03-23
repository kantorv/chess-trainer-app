

import { useEffect, useMemo } from 'react';
//import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as BasicExampe } from './views/demos/basic/Main'
import { default as MovingPieceExample } from './views/demos/move/Main2'
import { default as EngineEvaluationExample  } from './views/demos/engine/Main3'





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
        }

      ]
    }
  ])

function App() {
  //const [count, setCount] = useState(0)

  return (
    <RouterProvider
      router={routes}

    />
  )
}

export default App
