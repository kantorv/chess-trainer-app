import { useState } from "react";
import { createSearchParams, Navigate, useSearchParams } from "react-router";

import { PlayedGameRead } from "./PlayedGameRead";
import PlayScreen from "./PlayScreen";
import { arrivalOf } from "./usePlayGame";

/**
 * **Play with Engine** (`/engine/play`, v2 since CTA-74) — a game against
 * Stockfish. The screen is `PlayScreen.tsx`, with no costume; this is the
 * route: the arrival, read once.
 *
 * A `?saved=` naming a **masked** game (CTA-79) is not opened here: a game
 * belongs to the screen it was begun on, and a costume dropped on the way
 * would be written back without it. It goes on at `/engine/masked`, in its
 * disguise — the Saved games list links there itself; this covers an old
 * bookmark.
 *
 * A `?saved=` arrival waits for the played games' first read (IndexedDB —
 * `PlayedGameRead`) before the arrival is read.
 */
function PlayWithEngine() {
  return (
    <PlayedGameRead testId="play-with-engine">
      <PlayWithEngineArrival />
    </PlayedGameRead>
  );
}

function PlayWithEngineArrival() {
  const [searchParams] = useSearchParams();
  const [arrival] = useState(() => arrivalOf(searchParams));

  if (arrival.resume?.mask !== undefined) {
    return (
      <Navigate
        to={`/engine/masked?${createSearchParams({ saved: arrival.resume.id })}`}
        replace
      />
    );
  }
  return <PlayScreen id="play-with-engine" arrival={arrival} />;
}

export default PlayWithEngine;
