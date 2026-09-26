import { strFromU8, unzipSync } from "fflate";

import { MAX_COLLECTION_CHARS } from "./libraryCollections";

/** Why a zip is not a collection: unreadable, no `.pgn` in it, several, or one too large. */
export type CollectionZipProblem = "zip" | "zip-empty" | "zip-many" | "too-large";

export type CollectionZipReading =
  | { ok: true; text: string; stem: string }
  | { ok: false; problem: CollectionZipProblem };

/** Whether a picked file is a zip — by its name, or the type the browser gave it. */
export const isZipFile = (file: { name: string; type?: string }): boolean =>
  /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";

/** A `.pgn` entry worth counting: not a directory, not a `__MACOSX/` resource fork or a dot-file. */
const isPgnEntry = (path: string): boolean => {
  if (path.endsWith("/")) return false;
  const segments = path.split("/");
  if (segments[0] === "__MACOSX") return false;
  const base = segments[segments.length - 1] ?? "";
  return !base.startsWith(".") && /\.pgn$/i.test(base);
};

/**
 * A zip of exactly one `.pgn`, read as that file's text — what a picked `.pgn`
 * would have given `readCollectionText`. Directory entries and `__MACOSX/`
 * files are not counted; none, or several, is refused. `stem` is the entry's
 * name without its folders and `.pgn`.
 *
 * Bounded: the directory is read first (`filter` never accepts, so nothing is
 * inflated), and the one entry is inflated only if its declared size is within
 * {@link MAX_COLLECTION_CHARS}. Never throws.
 */
export const readCollectionZip = (bytes: Uint8Array): CollectionZipReading => {
  const entries: { name: string; size: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        if (isPgnEntry(file.name)) entries.push({ name: file.name, size: file.originalSize });
        return false;
      },
    });
  } catch {
    return { ok: false, problem: "zip" };
  }
  if (entries.length === 0) return { ok: false, problem: "zip-empty" };
  const [entry] = entries;
  if (entries.length > 1 || entry === undefined) return { ok: false, problem: "zip-many" };
  // Bytes are at least characters, so a declared size past the cap is past it decoded too.
  if (entry.size > MAX_COLLECTION_CHARS) return { ok: false, problem: "too-large" };

  let data: Uint8Array | undefined;
  try {
    data = unzipSync(bytes, { filter: (file) => file.name === entry.name })[entry.name];
  } catch {
    return { ok: false, problem: "zip" };
  }
  if (data === undefined) return { ok: false, problem: "zip" };
  const base = entry.name.split("/").pop() ?? entry.name;
  return { ok: true, text: strFromU8(data), stem: base.replace(/\.pgn$/i, "") };
};
