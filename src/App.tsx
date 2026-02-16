import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

import  { useEffect, useMemo } from 'react'; 
//import * as Sentry from "@sentry/react";
import { createBrowserRouter, RouterProvider} from "react-router";

import { DefaultLayout } from './views/main/Layout';
import {default as BaseMainPage} from './views/main/Main'





const routes = createBrowserRouter(
  
  [
    {
      path: "/",
    //  errorElement: <NotFoundPage />,  
      element:  <DefaultLayout />,
      children: [
        { 
            index: true, element: <BaseMainPage />
          
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
