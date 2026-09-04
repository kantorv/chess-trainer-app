import { useParams } from "react-router";

import {
  findLibraryCategory,
  resolveLibraryPath,
  type LibraryCategory,
} from "../../lib/libraryCatalog";
import { pgnKinds } from "../../lib/pgnCatalog";
import { pgnKindOf } from "../../lib/pgnKind";
import LibraryDetail from "../library/LibraryDetail";
import LibraryList from "../library/LibraryList";
import { userPgnsSection } from "../library/section";
import PgnCollection from "./PgnCollection";
import PgnCollectionNav from "./PgnCollectionNav";

/**
 * The User PGNs section — **one component behind every `/pgn/*` URL**, at every
 * depth, and **the one place a PGN kind is turned into a screen**.
 *
 * Structurally identical to `views/positions/PositionsSection.tsx` in how it
 * reads the URL: a splat resolved through the catalog by `resolveLibraryPath`,
 * which takes the longest prefix of the segments that names a category and
 * reads whatever is left over as an item id. `App.tsx` therefore never learns
 * how the `.pgn` files are organised — `/pgn/chess-com-games-2026-08-30`,
 * `/pgn/queen-vs-rook-rosettes/chapter-1` and
 * `/pgn/methurst-public-studies/queen-vs-rook-lightning/chapter-3` are all this
 * one route, and dropping a file in changes none of it.
 *
 * Where it goes further than the Positions section is the last step. A `.pgn`
 * file is a container, not a genre, so the loader labels every folder with a
 * {@link PgnKind} and this component dispatches on it:
 *
 * | Kind | Screen | Sidebar |
 * | --- | --- | --- |
 * | `collection` — one file, several studies | `PgnCollection` — an index of the studies, with the file's authored notes | the app's own |
 * | `study` **inside** a collection | `LibraryList` — a card per chapter | `PgnCollectionNav` — the collection's other studies |
 * | `study`, `games`, `shelf` | `LibraryList` | the app's own |
 * | an item, whatever its folder | `LibraryDetail` | `LibrarySiblingNav` (its own doing) |
 *
 * **Adding a kind is a row in that table** plus a recognition rule in
 * `lib/pgnLibrary.ts` — see `lib/pgnKind.ts`, which is where the taxonomy and
 * the two kinds this project expects next (`repertoire`, `variations`) are
 * written down. Nothing in `views/library/` or `lib/libraryCatalog.ts` learns
 * about any of it: those serve three sections, and only this one has files.
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
  return parent !== undefined && pgnKindOf(parent.path, pgnKinds) === "collection"
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
    return (
      <LibraryDetail
        section={userPgnsSection}
        categoryPath={location.category.path}
        positionId={location.item.id}
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

  if (pgnKindOf(category.path, pgnKinds) === "collection") {
    return <PgnCollection section={userPgnsSection} category={category} />;
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
