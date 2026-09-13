import { useEffect, useState } from "react";
import { bookClothColor, bestBookImageUrl } from "./lib/book3dGeometry.js";
import { bookInkColor, loadDominantCoverColor } from "./lib/book3dPalette.js";

export default function useBook3DColor(book, edition, visual) {
  const source = bestBookImageUrl(visual.front_quad ? visual.product_image_url : edition?.cover || book?.cover);
  const quadKey = JSON.stringify(visual.front_quad);
  const key = `${source}|${quadKey}`;
  const [palette, setPalette] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadDominantCoverColor(source, JSON.parse(quadKey)).then((color) => {
      if (!cancelled && color) setPalette({ key, color });
    });
    return () => { cancelled = true; };
  }, [source, quadKey, key]);
  const cloth = palette?.key === key ? palette.color : bookClothColor(book);
  return { cloth, ink: bookInkColor(cloth) };
}
