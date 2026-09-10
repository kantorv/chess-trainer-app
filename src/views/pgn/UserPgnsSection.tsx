import { useParams } from "react-router";

import {
  findLibraryCategory,
  resolveLibraryPath,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import { userPgnsLibrary } from "../../lib/pgnCatalog";
import { pgnKindOf } from "../../lib/pgnKind";
import LibraryDetail from "../library/LibraryDetail";
import LibraryList from "../library/LibraryList";
import { userPgnsSection } from "../library/section";
import PgnCollection from "./PgnCollection";
import PgnCollectionNav from "./PgnCollectionNav";
import PgnUploads from "./PgnUploads";

/**
 * The Library section — **one component behind every `/library/*` URL**, at
 * every depth, and **the one place a PGN kind is turned into a screen**.
 * (Called "User PGNs" and served at `/pgn/*` before CTA-38; old URLs redirect,
 * and `App.tsx` keeps the file path `views/pgn/` for the same internal reason
 * `src/data/pgn/` keeps its name.)
 *
 * It reads the URL as a splat resolved through the catalog by
 * `resolveLibraryPath`, which takes the longest prefix of the segments that
 * names a category and reads whatever is left over as an item id. `App.tsx`
 * therefore never learns how the `.pgn` files are organised —
 * `/library/chess-com-games-2026-08-30`,
 * `/library/queen-vs-rook-rosettes/chapter-1` and
 * `/library/methurst-public-studies/queen-vs-rook-lightning/chapter-3` are all
 * this one route, and dropping a file in changes none of it.
 *
 * The last step is this section's own. A `.pgn` file is a container, not a
 * genre, so the loader labels every folder with a {@link PgnKind} and this
 * component dispatches on it:
 *
 * | Kind | Screen | Sidebar |
 * | --- | --- | --- |
 * | `uploads` — the folder the reader's own files land in | `PgnUploads` — the upload button, and what has been uploaded | the app's own |
 * | `collection` — one file, several studies | `PgnCollection` — an index of the studies, with the file's authored notes | the app's own |
 * | `repertoire` — one file, an opening repertoire | `LibraryList` — chapter folder-cards, then a card per line | the app's own |
 * | `study` **inside** a collection | `LibraryList` — a card per chapter | `PgnCollectionNav` — the collection's other studies |
 * | `study`, `games`, `shelf` | `LibraryList` | the app's own |
 * | an item, whatever its folder | `LibraryDetail` (`variationMode` for a repertoire line) | `LibrarySiblingNav` (its own doing) |
 *
 * **Adding a kind is a row in that table** plus a recognition rule in
 * `lib/pgnLibrary.ts` — see `lib/pgnKind.ts`, which is where the taxonomy and
 * the one kind still expected (`variations`) are written down. Nothing in
 * `views/library/` or `lib/libraryCatalog.ts` learns about any of it: those
 * are section-agnostic, and only this section has files.
 */

/**
 * The collection a study sits in, or `undefined` for a study that is its own
 * file. A folder's parent is its path minus the last segment — the catalog has
 * no upward link, and a path is exactly that link written down.
 */
const collectionOf = (category: LibraryCategory): LibraryCategory | undefined => {
  const parentPath = category.path.split("/").slice(0, -1).join("/");
  if (parentPath === "") return undefined;

  const parent = findLibraryCategory(parentPath, userPgnsSection.catalog);
  return parent !== undefined &&
    pgnKindOf(parent.path, userPgnsLibrary().kinds) === "collection"
    ? parent
    : undefined;
};

function UserPgnsSection() {
  const params = useParams();
  // `filter(Boolean)` drops the empty segments a trailing or doubled slash
  // leaves behind, so `/pgn/queen-vs-rook-rosettes/` is the category, not a miss.
  const segments = (params["*"] ?? "").split("/").filter(Boolean);
  const location = resolveLibraryPath(segments, userPgnsSection.catalog);

  if (location.kind === "item") {
    /*
      A repertoire line opens with its variation tree beside the board rather
      than as a linear replay. The flag is computed here — in the section, which
      is the only place that knows a `PgnKind` — and handed to the shared detail
      screen as a prop, so `views/library/` stays kind-blind.
    */
    const variationMode =
      pgnKindOf(location.category.path, userPgnsLibrary().kinds) === "repertoire";
    return (
      <LibraryDetail
        section={userPgnsSection}
        categoryPath={location.category.path}
        positionId={location.item.id}
        variationMode={variationMode}
      />
    );
  }

  /*
    A category that exists with an id under it that does not — including the
    `/a/b/c` shape, where the extra segments cannot be an item id either. The
    detail screen renders that miss, and points back at the category.
  */
  if (location.kind === "unknown-position") {
    return (
      <LibraryDetail
        section={userPgnsSection}
        categoryPath={location.category.path}
        positionId={undefined}
      />
    );
  }

  // No such folder: the list screen renders that miss as its own message.
  if (location.kind !== "category") {
    return <LibraryList section={userPgnsSection} categoryPath={undefined} />;
  }

  const category = location.category;
  const kind = pgnKindOf(category.path, userPgnsLibrary().kinds);

  if (kind === "uploads") {
    return <PgnUploads section={userPgnsSection} />;
  }

  if (kind === "collection") {
    return <PgnCollection section={userPgnsSection} category={category} />;
  }

  /*
    A `repertoire` folder is collection-shaped — the root holds chapter
    sub-folders, a chapter holds line items — and `LibraryList` already renders
    child folders as cards ahead of items, so one list screen serves both
    levels: chapter folder-cards at the root, a card per line inside a chapter.
    No collection nav: a repertoire chapter's parent is the repertoire, not a
    `collection`.
  */
  if (kind === "repertoire") {
    return <LibraryList section={userPgnsSection} categoryPath={category.path} />;
  }

  /*
    An ordinary folder of games — and, when it is one study of a collection,
    the collection's own nav in place of the app sidebar, so the reader can
    step between studies without going back to the index first. The list screen
    is the same one either way: a study is a study, wherever it was filed.
  */
  const collection = collectionOf(category);

  return (
    <>
      {collection !== undefined && (
        <PgnCollectionNav
          section={userPgnsSection}
          collection={collection}
          activePath={category.path}
        />
      )}
      <LibraryList section={userPgnsSection} categoryPath={category.path} />
    </>
  );
}

export default UserPgnsSection;
