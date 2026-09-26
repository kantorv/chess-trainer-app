import { strFromU8, unzipSync } from "fflate";

import { MAX_COLLECTION_CHARS } from "./libraryCollections";

/** Why a zip is not a collection: unreadable, no `.pgn` in it, or too large. */
export type CollectionZipProblem = "zip" | "zip-empty" | "too-large";

/**
 * One `.pgn` inside a zip: its path there, its name without folders and
 * `.pgn`, its size in bytes (unpacked), and its text.
 */
export type CollectionZipEntry = { path: string; stem: string; size: number; text: string };

export type CollectionZipReading =
  | { ok: true; entries: CollectionZipEntry[] }
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
 * A zip's `.pgn` files, each read as its text — what each, picked on its own,
 * would have given `readCollectionText` — in the zip's order. Directory
 * entries, `__MACOSX/` files, dot-files and other files are not counted; a zip
 * with none is refused. Several are one collection each (CTA-103, replacing
 * CTA-102's one-file rule), so the screen decides what they become.
 *
 * Bounded: the directory is read first (`filter` never accepts, so nothing is
 * inflated), and the entries are inflated only if every declared size — and
 * their sum, since the texts are held together — is within
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
  // Bytes are at least characters, so a declared size past the cap is past it decoded too.
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (entries.some((entry) => entry.size > MAX_COLLECTION_CHARS) || total > MAX_COLLECTION_CHARS) {
    return { ok: false, problem: "too-large" };
  }

  const wanted = new Set(entries.map((entry) => entry.name));
  let data: Record<string, Uint8Array>;
  try {
    data = unzipSync(bytes, { filter: (file) => wanted.has(file.name) });
  } catch {
    return { ok: false, problem: "zip" };
  }
  const read: CollectionZipEntry[] = [];
  for (const { name, size } of entries) {
    const inflated = data[name];
    if (inflated === undefined) return { ok: false, problem: "zip" };
    const base = name.split("/").pop() ?? name;
    read.push({ path: name, stem: base.replace(/\.pgn$/i, ""), size, text: strFromU8(inflated) });
  }
  return { ok: true, entries: read };
};
