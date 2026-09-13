import { useEffect, useRef, useState } from "react";
import { bestBookImageUrl, bookImageUrl, faceCssMatrix, normalizeFaceQuad } from "./lib/book3dGeometry.js";
import "./LibraryBook3D.css";

export default function BookFaceTexture({ src, quad, alt = "", blurred = false, crop }) {
  const nodeRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failedImages, setFailedImages] = useState([]);
  const [originalSize, setOriginalSize] = useState({ src: "", width: 0, height: 0 });
  const quadKey = JSON.stringify(normalizeFaceQuad(quad));
  const validQuad = JSON.parse(quadKey);
  const image = [bestBookImageUrl(src), bookImageUrl(src)].find((url) => url && !failedImages.includes(url)) || "";
  const natural = originalSize.src === image ? originalSize : { width: 0, height: 0 };

  useEffect(() => {
    if (quadKey === "null" || !nodeRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((old) => old.width === width && old.height === height ? old : { width, height });
    });
    observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, [quadKey]);

  const style = validQuad ? {
    width: natural.width || undefined,
    height: natural.height || undefined,
    transform: faceCssMatrix(validQuad, size.width, size.height, natural.width, natural.height),
    visibility: size.width && natural.width ? "visible" : "hidden",
  } : crop ? {
    objectPosition: `${crop.x ?? 50}% ${crop.y ?? 50}%`,
    transform: `scale(${crop.zoom || 1})`,
    transformOrigin: "center",
  } : undefined;

  return <span ref={nodeRef} className={`book-face-texture ${validQuad ? "is-rectified" : ""} ${blurred ? "is-blurred" : ""}`}>
    {image ? <img src={image} alt={alt} loading="lazy" decoding="async" draggable="false" style={style} onLoad={(event) => setOriginalSize({ src: image, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailedImages((old) => old.includes(image) ? old : [...old, image])} /> : <span className="book-face-empty" aria-label={alt || undefined}>✦</span>}
  </span>;
}
