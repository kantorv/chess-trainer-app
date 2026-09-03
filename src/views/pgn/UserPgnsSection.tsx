import { useParams } from "react-router";

import { resolveLibraryPath } from "../../lib/libraryCatalog";
import LibraryDetail from "../library/LibraryDetail";
import LibraryList from "../library/LibraryList";
import { userPgnsSection } from "../library/section";

/**
 * The User PGNs section — **one component behind every `/pgn/*` URL**, at every
 * depth.
 *
 * Structurally identical to `views/positions/PositionsSection.tsx`, and
 * deliberately so: a splat resolved through the catalog by `resolveLibraryPath`,
 * which takes the longest prefix of the segments that names a category and reads
 * whatever is left over as an item id. `App.tsx` therefore never learns how the
 * `.pgn` files are organised — `/pgn/chess-com-games-2026-08-30`,
 * `/pgn/studies/queen-vs-rook-rosettes` and
 * `/pgn/studies/queen-vs-rook-rosettes/chapter-1` are all this one route, and
 * dropping a file in (or nesting it through `src/data/pgn.json`) changes none of
 * it.
 *
 * The four outcomes are the four a library can have, and each is one of the two
 * shared screens: a category listed, one item shown, an unknown category, or a
 * category that has no such item.
 */
function UserPgnsSection() {
  const params = useParams();
  // `filter(Boolean)` drops the empty segments a trailing or doubled slash
  // leaves behind, so `/pgn/studies/` is the category, not a miss.
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

  // A category (`kind: "category"`), or none at all — the list screen renders
  // both, the second as its own "no such folder" message.
  return (
    <LibraryList
      section={userPgnsSection}
      categoryPath={location.kind === "category" ? location.category.path : undefined}
    />
  );
}

export default UserPgnsSection;
