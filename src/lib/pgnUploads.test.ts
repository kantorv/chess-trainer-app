import { beforeEach, describe, expect, it } from "vitest";

import { findLibraryCategory, itemsInLibraryCategory } from "./libraryCatalog";
import { pgnKindOf } from "./pgnKind";
import { pgnCatalog, userPgnsLibrary } from "./pgnCatalog";
import {
  checkUploadPgn,
  MAX_UPLOAD_CHARS,
  mergePgnLibraries,
  uploadFolderPath,
  uploadsLibraryOf,
  UPLOADS_PATH,
  type PgnUpload,
} from "./pgnUploads";
import {
  addUpload,
  clearUploads,
  removeUpload,
  subscribeUploads,
  uploadsSnapshot,
  UPLOADS_STORAGE_KEY,
} from "./pgnUploadStore";

/**
 * The reader's own `.pgn` files: what an upload becomes, and how it is kept.
 *
 * The point asserted throughout is that an upload is **not a special kind of
 * content**. It goes through the same loader a shipped file does, so it is
 * recognised the same way (`lib/pgnKind.ts`), addressed the same way, and shows
 * up in the same catalog — which is what lets every screen, the splat route and
 * the `?game=` references treat it as ordinary.
 */

const STUDY = `[Event "My Study: Chapter 1"]
[Result "*"]
[StudyName "My Study"]
[ChapterName "Chapter 1"]

1. e4 *

[Event "My Study: Chapter 2"]
[Result "*"]
[StudyName "My Study"]
[ChapterName "Chapter 2"]

1. d4 *

`;

const TWO_STUDIES = `${STUDY}[Event "Other: Chapter 1"]
[Result "*"]
[StudyName "Other"]
[ChapterName "Chapter 1"]

1. c4 *

`;

const uploadOf = (name: string, text: string): PgnUpload => ({
  name,
  text,
  addedAt: "2026-09-04T10:00:00.000Z",
});

beforeEach(() => {
  clearUploads();
});

describe("checkUploadPgn", () => {
  it("accepts a study, and says what it holds", () => {
    expect(checkUploadPgn("my_study.pgn", STUDY)).toEqual({
      ok: true,
      games: 2,
      kind: "study",
    });
  });

  it("recognises a multi-study export as a collection, before it is stored", () => {
    // The same recognition the loader does — which is what lets the Uploads
    // screen tell the reader what they just added.
    expect(checkUploadPgn("all.pgn", TWO_STUDIES)).toMatchObject({
      ok: true,
      kind: "collection",
    });
  });

  it("refuses an empty file, and a file with no readable game", () => {
    expect(checkUploadPgn("blank.pgn", "   \n\n")).toEqual({
      ok: false,
      problem: "empty",
    });

    const broken = checkUploadPgn("broken.pgn", '[Event "x"]\n\n1. e4 Qxh8 *\n');
    expect(broken).toMatchObject({ ok: false, problem: "unreadable" });
    // With the loader's own words about it, for the developer console.
    expect(broken).toHaveProperty("detail");
  });

  it("refuses a file too large to keep in a browser", () => {
    const huge = `${STUDY}${" ".repeat(MAX_UPLOAD_CHARS)}`;

    expect(checkUploadPgn("huge.pgn", huge)).toEqual({
      ok: false,
      problem: "too-large",
    });
  });
});

describe("uploadsLibraryOf", () => {
  it("gives the Uploads folder a locale key, and has it with nothing in it", () => {
    // It is a *place to put files*, so it is there before there are any — and
    // it ships with the app, so unlike the folders inside it, it is chrome.
    const empty = uploadsLibraryOf([]);

    expect(empty.categories).toHaveLength(1);
    expect(empty.categories[0]).toMatchObject({
      path: UPLOADS_PATH,
      labelKey: "userPgns.uploads.title",
      children: [],
    });
    expect(empty.categories[0].label).toBeUndefined();
    expect(empty.kinds[UPLOADS_PATH]).toBe("uploads");
  });

  it("makes each file a folder under it, named and recognised by the loader", () => {
    const library = uploadsLibraryOf([
      uploadOf("my_study.pgn", STUDY),
      uploadOf("all.pgn", TWO_STUDIES),
    ]);

    const study = findLibraryCategory(`${UPLOADS_PATH}/my-study`, library);
    expect(study?.label).toEqual({ en: "My Study" });
    expect(pgnKindOf(study?.path, library.kinds)).toBe("study");
    expect(itemsInLibraryCategory(study?.path, library)).toHaveLength(2);

    // And a multi-study upload splits exactly as a shipped one does.
    const collection = findLibraryCategory(`${UPLOADS_PATH}/all`, library);
    expect(pgnKindOf(collection?.path, library.kinds)).toBe("collection");
    expect(collection?.children.map((child) => child.path)).toEqual([
      `${UPLOADS_PATH}/all/my-study`,
      `${UPLOADS_PATH}/all/other`,
    ]);
  });

  it("keeps the stored order, so the sidebar and the screens agree", () => {
    const library = uploadsLibraryOf([
      uploadOf("b.pgn", STUDY),
      uploadOf("a.pgn", STUDY),
    ]);

    expect(library.categories[0].children.map((child) => child.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("agrees with the loader about where a file lands, for awkward names", () => {
    /*
      `uploadFolderPath` is what the Uploads screen links a row to, and the
      loader is what decides the path. Two copies of one rule is how a row comes
      to point at a folder that is not there, so the two are asserted together.
    */
    const names = [
      "my_study.pgn",
      "Queen vs Rook — all studies.pgn",
      "lichess_study_x_by_y_2021.07.08.pgn",
      "מטים.pgn",
    ];
    const library = uploadsLibraryOf(names.map((name) => uploadOf(name, STUDY)));

    for (const name of names) {
      expect(findLibraryCategory(uploadFolderPath(name), library)).toBeDefined();
    }
  });
});

describe("mergePgnLibraries", () => {
  it("puts the uploads after the shipped files, keeping both whole", () => {
    const merged = mergePgnLibraries(
      pgnCatalog,
      uploadsLibraryOf([uploadOf("my_study.pgn", STUDY)]),
    );

    expect(merged.categories.at(-1)?.path).toBe(UPLOADS_PATH);
    expect(merged.categories.length).toBe(pgnCatalog.categories.length + 1);
    expect(merged.items.length).toBe(pgnCatalog.items.length + 2);
    // Both sides' kinds, in one map.
    expect(merged.kinds[UPLOADS_PATH]).toBe("uploads");
    expect(merged.kinds["methurst-public-studies"]).toBe("collection");
  });
});

describe("the store", () => {
  it("starts empty, and hands back the same array until something changes", () => {
    expect(uploadsSnapshot()).toEqual([]);
    // `useSyncExternalStore` requires this: a new array each call would render
    // for ever.
    expect(uploadsSnapshot()).toBe(uploadsSnapshot());
  });

  it("keeps a file, newest first, and notifies", () => {
    let notified = 0;
    const unsubscribe = subscribeUploads(() => {
      notified += 1;
    });

    expect(addUpload("first.pgn", STUDY)).toBeUndefined();
    expect(addUpload("second.pgn", STUDY)).toBeUndefined();

    expect(uploadsSnapshot().map((upload) => upload.name)).toEqual([
      "second.pgn",
      "first.pgn",
    ]);
    expect(notified).toBe(2);
    unsubscribe();
  });

  it("replaces a file uploaded again under the same name", () => {
    // Picking the same export again is how a reader updates a study; two
    // folders with one name would be worse than either outcome.
    addUpload("study.pgn", STUDY);
    addUpload("other.pgn", STUDY);
    addUpload("study.pgn", TWO_STUDIES);

    const stored = uploadsSnapshot();
    expect(stored.map((upload) => upload.name)).toEqual([
      "study.pgn",
      "other.pgn",
    ]);
    expect(stored[0].text).toBe(TWO_STUDIES);
  });

  it("forgets one, and all of them", () => {
    addUpload("a.pgn", STUDY);
    addUpload("b.pgn", STUDY);

    removeUpload("a.pgn");
    expect(uploadsSnapshot().map((upload) => upload.name)).toEqual(["b.pgn"]);

    // An unknown name is a no-op rather than an error.
    removeUpload("nope.pgn");
    expect(uploadsSnapshot()).toHaveLength(1);

    clearUploads();
    expect(uploadsSnapshot()).toEqual([]);
  });

  it("survives whatever is under the key", () => {
    // Another tab, an older version, a hand-edited value: an unreadable store
    // is an empty one, never a crash at module scope.
    localStorage.setItem(UPLOADS_STORAGE_KEY, "{not json");
    localStorage.setItem(`${UPLOADS_STORAGE_KEY}.rev`, "forced-1");
    expect(uploadsSnapshot()).toEqual([]);

    localStorage.setItem(UPLOADS_STORAGE_KEY, '[{"name":"x.pgn"},{"nope":1}]');
    localStorage.setItem(`${UPLOADS_STORAGE_KEY}.rev`, "forced-2");
    // A row missing `text` is not an upload, and is dropped rather than shown.
    expect(uploadsSnapshot()).toEqual([]);
  });
});

describe("userPgnsLibrary", () => {
  it("is the shipped catalog until something is uploaded", () => {
    expect(userPgnsLibrary().categories).toHaveLength(
      pgnCatalog.categories.length + 1,
    );
    // Only the (empty) Uploads folder is added.
    expect(userPgnsLibrary().items).toHaveLength(pgnCatalog.items.length);
  });

  it("grows the uploaded file's folder, and is memoised between changes", () => {
    const before = userPgnsLibrary();
    expect(userPgnsLibrary()).toBe(before);

    addUpload("my_study.pgn", STUDY);

    const after = userPgnsLibrary();
    expect(after).not.toBe(before);
    expect(after.items).toHaveLength(pgnCatalog.items.length + 2);
    expect(
      itemsInLibraryCategory(`${UPLOADS_PATH}/my-study`, after).map((i) => i.id),
    ).toEqual(["chapter-1", "chapter-2"]);
    // ...and no re-parse until the next change.
    expect(userPgnsLibrary()).toBe(after);
  });

  it("leaves the shipped catalog alone", () => {
    addUpload("my_study.pgn", STUDY);

    expect(findLibraryCategory(UPLOADS_PATH, pgnCatalog)).toBeUndefined();
  });
});
