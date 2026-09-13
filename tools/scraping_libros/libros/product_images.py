"""Keep original product images, without classifying hidden faces or downloading them."""
import json
from urllib.parse import urljoin, urlsplit, urlunsplit


def best_srcset_image(srcset):
    choices = []
    for entry in str(srcset or "").split(","):
        pieces = entry.strip().split()
        if not pieces:
            continue
        try:
            rank = float(pieces[1][:-1]) if len(pieces) > 1 and pieces[1][-1:] in ("w", "x") else 1
        except ValueError:
            continue
        choices.append((rank, pieces[0]))
    return max(choices, default=(0, None))[1]


def product_image_gallery(base_url, candidates, json_documents=()):
    images = list(candidates)

    def walk(value):
        if isinstance(value, list):
            for child in value:
                walk(child)
        elif isinstance(value, dict):
            kinds = value.get("@type", [])
            kinds = [kinds] if isinstance(kinds, str) else kinds
            if "Product" in kinds or "Book" in kinds:
                raw = value.get("image", [])
                raw = raw if isinstance(raw, list) else [raw]
                images.extend(v.get("url") or v.get("contentUrl") if isinstance(v, dict) else v for v in raw)
            # Only traverse JSON-LD graph nodes, not author/logo/recommendation images.
            if "@graph" in value:
                walk(value["@graph"])

    for document in json_documents:
        try:
            walk(json.loads(document))
        except (ValueError, TypeError):
            continue

    result = []
    for image in images:
        if not isinstance(image, str) or not image.strip() or any(c.isspace() for c in image.strip()):
            continue
        absolute = urljoin(base_url, image.strip())
        parts = urlsplit(absolute)
        if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
            continue
        secure = urlunsplit(("https", parts.netloc, parts.path, parts.query, ""))
        if secure not in result:
            result.append(secure)
    return result[:8]
