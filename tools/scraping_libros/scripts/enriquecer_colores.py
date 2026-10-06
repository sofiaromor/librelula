"""Calcula hero_color antes de importar, sin depender del CORS del navegador.

Entrada/salida: JSON normalizado por preparar_importacion.py. No escribe en DB.
"""
import argparse
from collections import defaultdict, deque
import colorsys
import io
import json
from pathlib import Path
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from PIL import Image


def dominant_color(image):
    image = image.convert("RGBA")
    image.thumbnail((96, 96))
    pixels = image.load()
    # El margen de una foto del libro puede quedar dentro de su bounding box
    # cuando está inclinado. Elimina solo el fondo claro conectado al borde.
    background = set()
    pending = deque()
    def is_background(x, y):
        r, g, b, a = pixels[x, y]
        return a < 125 or (min(r, g, b) >= 235 and max(r, g, b) - min(r, g, b) < 20)
    for x in range(image.width):
        pending.extend(((x, 0), (x, image.height - 1)))
    for y in range(image.height):
        pending.extend(((0, y), (image.width - 1, y)))
    while pending:
        x, y = pending.popleft()
        if (x, y) in background or not is_background(x, y):
            continue
        background.add((x, y))
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < image.width and 0 <= ny < image.height and (nx, ny) not in background:
                pending.append((nx, ny))
    bounds = [image.width, image.height, -1, -1]
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if (x, y) in background:
                continue
            bounds = [min(bounds[0], x), min(bounds[1], y), max(bounds[2], x), max(bounds[3], y)]
    if bounds[2] < bounds[0]:
        bounds = [0, 0, image.width - 1, image.height - 1]
    buckets = defaultdict(lambda: [0, 0, 0, 0])
    for y in range(bounds[1], bounds[3] + 1):
        for x in range(bounds[0], bounds[2] + 1):
            r, g, b, a = pixels[x, y]
            if a < 125 or (x, y) in background:
                continue
            hue, saturation, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            # Agrupa las sombras del mismo tono. Una sombra gris uniforme de
            # la foto no debe ganar a una portada púrpura dividida en muchos RGB.
            key = ("hue", int(hue * 24)) if saturation >= .2 and max(r, g, b) - min(r, g, b) >= 20 else ("neutral", r >> 5, g >> 5, b >> 5)
            bucket = buckets[key]
            bucket[0] += 1
            for i, channel in enumerate((r, g, b), 1):
                bucket[i] += channel
    if not buckets and image.getchannel("A").getextrema()[0] >= 125:
        # Una portada totalmente blanca sigue siendo una imagen válida.
        return "#FFFFFF"
    if not buckets:
        raise ValueError("La portada no contiene píxeles opacos")
    winner = max(buckets.values(), key=lambda b: b[0])
    rgb = [int(channel / winner[0] + .5) for channel in winner[1:]]
    return "#" + "".join(f"{channel:02X}" for channel in rgb)


def readable_hero(color):
    rgb = [int(color[i:i+2], 16) for i in (1, 3, 5)]
    # Mantiene la familia cromática y el umbral del panel existente.
    while .299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2] > 140:
        rgb = [int(channel * .65 + .5) for channel in rgb]
    return "#" + "".join(f"{channel:02X}" for channel in rgb)


def enrich(item, cache_dir):
    source = next((url for url in item.get("image_gallery", []) if "/s5/" in url), item["cover"])
    host = urlsplit(source).hostname or ""
    if not (host == "casadellibro.com" or host.endswith(".casadellibro.com")):
        raise ValueError("La portada no procede de Casa del Libro")
    cache = cache_dir / f'{item["isbn"]}.image'
    cache_dir.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        with urlopen(Request(source, headers={"User-Agent":"LibrelulaCatalogResearch/1.0"}), timeout=30) as response:
            data = response.read(10 * 1024 * 1024 + 1)
        if len(data) > 10 * 1024 * 1024:
            raise ValueError("Portada demasiado grande")
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        cache.write_bytes(data)
        time.sleep(3)
    with Image.open(cache) as image:
        color = dominant_color(image)
        item["hero_color"] = readable_hero(color)
        item["color_evidence"] = {"source_url": source, "dominant_color": color, "width":image.width, "height":image.height}
    return item


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("entrada", type=Path)
    parser.add_argument("salida", type=Path)
    parser.add_argument("--cache-dir", type=Path, default=Path("salidas/portadas"))
    args = parser.parse_args()
    items = json.loads(args.entrada.read_text(encoding="utf-8"))
    for i, item in enumerate(items, 1):
        enrich(item, args.cache_dir)
        print(f'{i}/{len(items)} {item["isbn"]}: {item["hero_color"]}', flush=True)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
