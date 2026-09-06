import { useParams } from "react-router";

import LibraryDetail from "../../library/LibraryDetail";
import { matesSection } from "../../library/section";

/**
 * One mate from the library, on a board, with the three hand-offs.
 *
 * All of the rendering is `views/library/LibraryDetail` — the section-agnostic
 * detail screen that Positions also drives, down to the read-only board facing
 * the side to move, the FEN `CopyableValue` and the three `?fen=` hand-offs.
 * What is left here is Mates' own route shape: `/mates/:category/:id`, one
 * segment of category, which is what shipped and what stays bookmarkable.
 */
function MateDetail() {
  const { category, id } = useParams<{ category: string; id: string }>();

  return (
    <LibraryDetail section={matesSection} categoryPath={category} positionId={id} />
  );
}

export default MateDetail;
