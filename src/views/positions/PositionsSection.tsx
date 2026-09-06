import { useParams } from "react-router";

import { resolveLibraryPath } from "../../lib/libraryCatalog";
import LibraryDetail from "../library/LibraryDetail";
import LibraryList from "../library/LibraryList";
import { positionsSection } from "../library/section";

/**
 * The endgame Positions section — **one component behind every `/positions/*`
 * URL**, at every depth.
 *
 * `/positions/queen-vs-rook`, `/positions/queen-vs-rook/rosettes` and
 * `/positions/rook-and-pawn-vs-rook/lucena-position` are the same route: a
 * splat, resolved through the catalog by `resolveLibraryPath`, which takes the
 * longest prefix of the segments that names a category and reads whatever is
 * left over as a position id. The router therefore never learns how deep the
 * data goes — nesting a category is a JSON edit and `App.tsx` is untouched by
 * it, which is the whole reason the section is addressed by path rather than by
 * a `:category` parameter the way Mates is.
 *
 * The four outcomes are the four a library can have, and each is one of the two
 * shared screens: a category listed, one position shown, an unknown category,
 * or a category that has no such position.
 */
function PositionsSection() {
  const params = useParams();
  // `filter(Boolean)` drops the empty segments a trailing or doubled slash
  // leaves behind, so `/positions/pawn-endgames/` is the category, not a miss.
  const segments = (params["*"] ?? "").split("/").filter(Boolean);
  const location = resolveLibraryPath(segments, positionsSection.catalog);

  if (location.kind === "item") {
    return (
      <LibraryDetail
        section={positionsSection}
        categoryPath={location.category.path}
        positionId={location.item.id}
      />
    );
  }

  /*
    A category that exists with an id under it that does not — including the
    `/a/b/c` shape, where the extra segments cannot be a position id either.
    The detail screen renders that miss, and points back at the category.
  */
  if (location.kind === "unknown-position") {
    return (
      <LibraryDetail
        section={positionsSection}
        categoryPath={location.category.path}
        positionId={undefined}
      />
    );
  }

  // A category (`kind: "category"`), or none at all — the list screen renders
  // both, the second as its own "no such category" message.
  return (
    <LibraryList
      section={positionsSection}
      categoryPath={location.kind === "category" ? location.category.path : undefined}
    />
  );
}

export default PositionsSection;
