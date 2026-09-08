/**
 * **Taking games out of the app** — several PGN records joined into one file,
 * and that file handed to the browser to save.
 *
 * The two halves are here together because they are one feature and neither is
 * large, but they are not the same kind of thing and the split is worth seeing:
 * {@link pgnFileOf} is pure text and knows nothing about a browser;
 * {@link downloadTextFile} is the DOM, and is the only part that cannot run
 * anywhere else. The same line `pgnUploadStore.ts` draws — `src/lib/` is free of
 * React, not of the platform.
 *
 * ## Why a join rather than a re-write
 *
 * A saved game and a saved analysis are already stored *as PGN* — that is the
 * whole point of the storage format (`lib/savedGames.ts`). So exporting is
 * concatenation, not serialisation: nothing is re-parsed, nothing can be lost in
 * a second pass through the writer, and a record this build cannot read still
 * exports byte for byte. The separator is one blank line, which is what the PGN
 * export format uses between games and what `splitPgnGames` (`lib/pgn.ts`) reads
 * back — so a file written here loads into this app's own Load PGN screen, and
 * into anything else that reads PGN.
 */

/** One PGN file out of several single-game records, in the order given. */
export const pgnFileOf = (pgns: readonly string[]): string =>
  pgns
    .map((pgn) => pgn.trim())
    .filter((pgn) => pgn !== "")
    .join("\n\n")
    // A trailing newline: a text file that does not end in one is a file some
    // tools quietly truncate the last line of.
    .concat("\n");

/** `YYYY-MM-DD`, for a file name. The reader's own timezone, as a date is. */
const isoDate = (when: Date): string =>
  [
    when.getFullYear(),
    `${when.getMonth() + 1}`.padStart(2, "0"),
    `${when.getDate()}`.padStart(2, "0"),
  ].join("-");

/**
 * What a downloaded file is called: the stem, the date, and `.pgn`.
 *
 * Dated rather than numbered because the browser is what resolves a collision —
 * a second download on the same day lands as `… (1).pgn` — and a date is the
 * one thing that makes a folder of these sortable.
 */
export const pgnFileName = (stem: string, now: Date = new Date()): string =>
  `${stem}-${isoDate(now)}.pgn`;

/**
 * Hand a string to the browser to save.
 *
 * A blob URL and a synthetic click on an `<a download>`: the only way to save a
 * file the app generated rather than fetched. The anchor is never in the
 * document long enough to be seen, and the URL is revoked afterwards — a blob
 * URL holds its data alive for the lifetime of the document otherwise, and a
 * reader who exports a few dozen games over an evening would keep every one of
 * them in memory.
 *
 * Non-throwing, like everything else that touches the platform here: a browser
 * that refuses the download reports it rather than taking the screen down.
 */
export const downloadTextFile = (
  fileName: string,
  text: string,
  type = "application/x-chess-pgn",
): boolean => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // A tick later: Safari has been known to cancel a download whose URL is
    // revoked in the same task as the click.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
};

/** Save several PGN records as one file. `false` if the browser refused. */
export const downloadPgn = (
  stem: string,
  pgns: readonly string[],
  now: Date = new Date(),
): boolean => downloadTextFile(pgnFileName(stem, now), pgnFileOf(pgns));
