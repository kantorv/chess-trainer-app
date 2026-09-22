import {
  ENGINE_SETTING_BOUNDS,
  type EngineSettings,
} from "./engineSettings";

/**
 * **A new game against the engine, as a link** (CTA-82) — the Lobby's Start
 * button writes it, `/engine/play`'s `arrivalOf` reads it. The `?fen=`
 * pattern again: a query string survives a bookmark, a share and a reload; the
 * destination validates it; and it is read once, as initial state.
 *
 * | Param | Setting | Values |
 * | --- | --- | --- |
 * | `side` | the reader's side | `white`, `black`, or `random` (drawn once, on arrival) |
 * | `skill` | `skillLevel` | 0–20 |
 * | `depth` | `depth` | 1–24 |
 * | `movetime` | `moveTimeMs` | 0–10000 (ms; 0 is no limit) |
 * | `lines` | `multiPv` | 1–10 |
 * | `threads` | `threads` | 1–4 |
 * | `hash` | `hashMb` | 1–256 |
 * | `evalbar` | the eval bar | `1` / `0` |
 * | `fen` | the starting position | a FEN — written only for a position other than the standard start (CTA-83: the Lobby's Board editor tab) |
 *
 * **Each field on its own**, as `engineSettingsFrom` reads a stored record: an
 * absent or unreadable one is left out (the game takes its default), a number
 * out of range is clamped into `ENGINE_SETTING_BOUNDS` and a fraction rounded.
 * The engine module then re-clamps the UCI options to whatever the running
 * build declared — these bounds are the offer, not the authority.
 *
 * `fen` is not read here: it is the ordinary `?fen=` arrival, which
 * `arrivalOf` validates with `parseFen` as it always has.
 *
 * Precedence on `/engine/play` (`usePlayGame`): `?saved=` beats all of it; a
 * `side` beats the side to move of a `?fen=`; with no `side`, a `?fen=` with
 * Black to move still sets the reader to Black. No params, today's game.
 */

/** The reader's side as the Lobby offers it — `random` is drawn on arrival. */
export type NewGameSide = "white" | "black" | "random";

/** The numeric settings a link carries — everything but the side. */
export type NewGameSettings = Omit<EngineSettings, "playAs">;

/** What a link asked for; a field it did not carry (or carried unreadably) is absent. */
export type NewGameRequest = {
  settings: Partial<NewGameSettings>;
  side?: "white" | "black";
  evalBar?: boolean;
};

/** Each numeric setting's query parameter. */
export const NEW_GAME_PARAM = {
  skillLevel: "skill",
  depth: "depth",
  moveTimeMs: "movetime",
  multiPv: "lines",
  threads: "threads",
  hashMb: "hash",
} as const satisfies Record<keyof NewGameSettings, string>;

const SETTING_KEYS = Object.keys(NEW_GAME_PARAM) as (keyof NewGameSettings)[];

/**
 * The query string the Lobby's Start button carries — every field, so the link
 * says it all — and the starting position, when the caller passes one (the
 * caller leaves the standard start out, so an ordinary game's link is unchanged).
 */
export const newGameParams = (
  settings: NewGameSettings,
  side: NewGameSide,
  evalBar: boolean,
  fen?: string,
): URLSearchParams => {
  const params = new URLSearchParams({ side });
  for (const key of SETTING_KEYS) params.set(NEW_GAME_PARAM[key], String(settings[key]));
  params.set("evalbar", evalBar ? "1" : "0");
  if (fen !== undefined) params.set("fen", fen);
  return params;
};

/** A number in range, or `undefined` for text that is not one. */
const numberParam = (
  text: string | null,
  { min, max }: { min: number; max: number },
): number | undefined => {
  if (text === null || text.trim() === "") return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), min), max);
};

/**
 * What a link asks of a new game. Never throws. `random` decides a
 * `side=random` (injectable, so a test is deterministic).
 */
export const newGameRequestOf = (
  params: URLSearchParams,
  random: () => number = Math.random,
): NewGameRequest => {
  const settings: Partial<NewGameSettings> = {};
  for (const key of SETTING_KEYS) {
    const value = numberParam(params.get(NEW_GAME_PARAM[key]), ENGINE_SETTING_BOUNDS[key]);
    if (value !== undefined) settings[key] = value;
  }

  const sideParam = params.get("side");
  const side =
    sideParam === "white" || sideParam === "black"
      ? sideParam
      : sideParam === "random"
        ? random() < 0.5
          ? "white"
          : "black"
        : undefined;

  const evalBarParam = params.get("evalbar");
  const evalBar = evalBarParam === "1" ? true : evalBarParam === "0" ? false : undefined;

  return {
    settings,
    ...(side === undefined ? {} : { side }),
    ...(evalBar === undefined ? {} : { evalBar }),
  };
};
