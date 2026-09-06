import { useParams } from "react-router";

import LibraryList from "../../library/LibraryList";
import { matesSection } from "../../library/section";

/**
 * One mates category's positions, as cards.
 *
 * **One component, three routes.** `/mates/basic`, `/mates/advanced` and
 * `/mates/complex` all render this; the category is a route parameter, so
 * adding a fourth category is a data entry plus a folder/screen registration
 * and no work here at all.
 *
 * All of the rendering is `views/library/LibraryList` — the section-agnostic
 * list screen that Positions also drives. What is left here is the one thing
 * that *is* specific to Mates: its routes name the category with a `:category`
 * parameter, one segment deep, because its URLs shipped that way and are
 * bookmarkable. A nested library addresses a category by a path instead, which
 * is why `/positions/*` reads its own segments (`views/positions/`).
 */
function MatesList() {
  const { category } = useParams<{ category: string }>();

  return <LibraryList section={matesSection} categoryPath={category} />;
}

export default MatesList;
