import { gameTag, type Game } from "../../lib/gameModel";

/**
 * What a game's tag pairs say about it in a line or two — the content of a
 * library card's footer.
 *
 * Pure, and separate from the component that renders it, because the two rules
 * worth getting right here are both about *data* rather than about layout:
 *
 * - **A placeholder is not information.** `gameTag` already reports the values
 *   the PGN spec uses for "unknown" (`"?"`, `"????.??.??"`, and `"*"` for an
 *   unfinished result) as absent, so a study chapter with no players and no
 *   result contributes no line rather than a row of question marks.
 * - **Never repeat the title.** A lichess study writes `Event` as
 *   `"<study>: <chapter>"`, so for a chapter named "Chapter 1" the event *is*
 *   the title with a prefix — printing it would fill the footer with the words
 *   already in bold above it. A real game's event ("New York") is unrelated to
 *   its title ("Capablanca - Tartakower") and is worth the line.
 *
 * The upshot is that the footer is rich for a study of annotated master games
 * and quietly collapses to the name and the length for a chapter that is a
 * position and a comment — which is exactly as much as each one knows.
 */
export type GameSummary = {
  /** `"1-0"`, `"1/2-1/2"` — absent for a game that was never finished. */
  result?: string;
  /** Half-moves, for the "N moves" line. */
  moves: number;
  /** Where and when — `"New York, 1924"`. */
  occasion?: string;
  /** The opening's name — `"Horwitz Defense"`. */
  opening?: string;
  /** Its ECO code — `"A40"`. */
  eco?: string;
};

/** A four-digit year off a PGN `Date` tag (`"1924.03.23"`), if it has one. */
const yearOf = (date: string | undefined): string | undefined => {
  const year = date?.slice(0, 4);
  return year !== undefined && /^\d{4}$/.test(year) ? year : undefined;
};

/** Whether either string contains the other — see "never repeat the title". */
const echoes = (title: string, text: string): boolean =>
  title !== "" && (text.includes(title) || title.includes(text));

export const gameSummaryOf = (game: Game, title: string): GameSummary => {
  const event = gameTag(game.headers, "Event");
  const year = yearOf(gameTag(game.headers, "Date"));

  const occasion =
    event !== undefined && !echoes(title, event)
      ? [event, year].filter((part) => part !== undefined).join(", ")
      : undefined;

  return {
    result: gameTag(game.headers, "Result"),
    moves: game.moves.length,
    ...(occasion !== undefined ? { occasion } : {}),
    ...(gameTag(game.headers, "Opening") !== undefined
      ? { opening: gameTag(game.headers, "Opening") }
      : {}),
    ...(gameTag(game.headers, "ECO") !== undefined
      ? { eco: gameTag(game.headers, "ECO") }
      : {}),
  };
};
