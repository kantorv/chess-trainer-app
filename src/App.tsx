//import * as Sentry from "@sentry/react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router";

import { DefaultLayout } from './views/main/Layout';
import { default as HomeScreen  } from './views/home/Main'
import { default as PlayWithEngineScreen  } from './views/engine/play/Main'
import { default as PlayedGamesScreen  } from './views/engine/games/Main'
import { default as MaskedPlayScreen  } from './views/engine/masked/Main'
import { default as AnalysisBoardScreen  } from './views/tools/analysis/Main'
import { default as SavedAnalysesScreen  } from './views/tools/analysis/saved/Main'
import { default as AnalysisSettingsScreen  } from './views/tools/analysis/saved/AnalysisSettingsScreenMain'
import { default as OpeningsScreen  } from './views/openings/Main'
import { default as LibraryScreen  } from './views/library/LibraryHomeMain'
import { default as LibraryUploadScreen  } from './views/library/LibraryUploadMain'
import { default as LibraryCollectionScreen  } from './views/library/CollectionScreenMain'
import { default as LibraryGameScreen  } from './views/library/LibraryGameScreenMain'
import { default as RepertoiresScreen  } from './views/repertoires/RepertoiresMain'
import { default as RepertoireUploadScreen  } from './views/repertoires/RepertoireUploadMain'
import { default as RepertoireBoardScreen  } from './views/repertoires/RepertoireBoardMain'
import { default as RepertoireSettingsScreen  } from './views/repertoires/RepertoireSettingsScreenMain'
import { default as RepertoireGameScreen  } from './views/repertoires/RepertoireGameMain'


/**
 * Back-compat for the pre-CTA-38 `/pgn/*` URLs. The Library that lived there
 * was replaced in CTA-75 and none of its paths mean anything to the new one,
 * so an old link lands on the Library's root. `replace` so it does not leave
 * the dead URL in history. (A pre-CTA-75 `/library/<folder>/<id>` link reaches
 * the new routes and gets their miss, which links back to the root.)
 */
export function LegacyPgnRedirect() {
  return <Navigate to="/library" replace />;
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
        // Play with Engine v2's games (CTA-74, `lib/playedGameStore.ts`): the
        // flat, newest-first list.
        {
          path: "/engine/games",
          element: <PlayedGamesScreen />
        },
        // Masked Pieces (CTA-79): Play with Engine's screen in a costume; its
        // games are kept with the engine games above. The pre-CTA-79
        // `/masked/play` route is gone, with no redirect.
        {
          path: "/engine/masked",
          element: <MaskedPlayScreen />
        },
        {
          path: "/tools/analysis",
          element: <AnalysisBoardScreen />
        },
        // The reader's own analysis boards, kept in IndexedDB since CTA-77
        // (`lib/savedAnalysisStore.ts`). The Saved games screen's counterpart,
        // and a screen of its own for the same reason: these
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
        // The Openings explorer (CTA-78): a v2 board with the opening book.
        // It keeps nothing — its Analysis button hands the tree on.
        {
          path: "/openings",
          element: <OpeningsScreen />
        },
        // The reader's own repertoires (CTA-61), kept in IndexedDB
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
        // The Library (CTA-75): the collections, the screen one is added on, a
        // collection's table and a game's analysis board. A `.pgn` dropped into
        // `src/data/library/` is a collection with no edit here. `new` is a
        // static segment, so it ranks above `:collectionId`.
        {
          path: "/library",
          element: <LibraryScreen />
        },
        {
          path: "/library/new",
          element: <LibraryUploadScreen />
        },
        {
          path: "/library/:collectionId",
          element: <LibraryCollectionScreen />
        },
        {
          path: "/library/:collectionId/:game",
          element: <LibraryGameScreen />
        },
        // Before CTA-38 the old Library lived at `/pgn/*`. Old links go to the Library.
        {
          path: "/pgn/*",
          element: <LegacyPgnRedirect />
        },

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
