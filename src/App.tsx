

import { useEffect, useMemo } from 'react';
//import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as BaseMainPage } from './views/main/Main'
import { default as BaseMainPage2 } from './views/main/Main2'
import { default as AnalisysBoard  } from './views/main/Main3'
import { BoardWidgetContext } from './views/main/service'




const routes = createBrowserRouter(

  [
    {
      path: "/",
      //  errorElement: <NotFoundPage />,  
      element:
        <BoardWidgetContext.Provider>
          <DefaultLayout />
        </BoardWidgetContext.Provider>
      ,
      children: [
        {
          index: true, element: <BaseMainPage />

        },
        {
          path: "/board2",
          element: <BaseMainPage2 />
        },
         {
          path: "/anal1",
          element: <AnalisysBoard />
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
