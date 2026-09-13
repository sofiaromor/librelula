import { useEffect, useRef, useState } from "react";
import { bookImageUrl, faceCssMatrix, normalizeFaceQuad } from "./lib/book3dGeometry.js";
import "./LibraryBook3D.css";

export default function BookFaceTexture({ src, quad, alt = "", blurred = false, crop }) {
  const nodeRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failedSrc, setFailedSrc] = useState("");
  const quadKey = JSON.stringify(normalizeFaceQuad(quad));
  const validQuad = JSON.parse(quadKey);
  const image = bookImageUrl(src);

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
    transform: faceCssMatrix(validQuad, size.width, size.height),
    visibility: size.width ? "visible" : "hidden",
  } : crop ? {
    objectPosition: `${crop.x ?? 50}% ${crop.y ?? 50}%`,
    transform: `scale(${crop.zoom || 1})`,
    transformOrigin: "center",
  } : undefined;

  return <span ref={nodeRef} className={`book-face-texture ${validQuad ? "is-rectified" : ""} ${blurred ? "is-blurred" : ""}`}>
    {image && failedSrc !== image ? <img src={image} alt={alt} loading="lazy" draggable="false" style={style} onError={() => setFailedSrc(image)} /> : <span className="book-face-empty" aria-label={alt || undefined}>✦</span>}
  </span>;
}
