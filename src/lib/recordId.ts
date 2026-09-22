/**
 * **A fresh record id** — the one minter every store in `src/lib/` shares:
 * the played games, the saved analyses and their folders, the repertoires'
 * folders, the Library's collections.
 *
 * The clock plus a little randomness: two records made in the same
 * millisecond in two tabs must not collide, and the value travels in a URL
 * (`?saved=`, `?analysis=`, `?game=`), so it stays in `[0-9a-z]`. It is not a
 * hash of the record — an id has to be stable while a game is still growing.
 *
 * It lived in the pre-CTA-74 `savedGames.ts` as `newSavedGameId`, whose
 * store went with Masked Pieces' old hook (CTA-79); the ids it minted keep
 * their shape, so every record already written stays addressable.
 */
export const newRecordId = (
  now: Date = new Date(),
  entropy: number = Math.random(),
): string =>
  `g${now.getTime().toString(36)}${Math.floor(entropy * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
