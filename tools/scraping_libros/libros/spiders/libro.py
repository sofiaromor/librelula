from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

import scrapy

from libros.items import LibroItem
from libros.product_images import best_srcset_image, product_image_gallery
from libros.painted_edges import detect_painted_edges


ESPACIOS = re.compile(r"\s+")
SOLO_DIGITOS = re.compile(r"\D+")
ISBN_VALIDO = re.compile(r"^(?:\d{9}[\dX]|\d{13})$")

TERMINOS_EDICION = re.compile(
    r"\b(?:"
    r"ed\.?|edici[oó]n|tapa\s+dura|tapa\s+blanda|encuadernaci[oó]n|"
    r"formato\s+bolsillo|libro\s+de\s+bolsillo|coleccionista|"
    r"especial|limitada|ilustrada|cantos?\s+(?:tintados?|pintados?|decorados?|metalizados?|teñidos?)"
    r")\b",
    re.IGNORECASE,
)


def texto_limpio(value: object) -> str:
    return ESPACIOS.sub(" ", str(value or "").replace("\xa0", " ")).strip()


def isbn_limpio(value: object) -> str | None:
    value = re.sub(r"[^0-9Xx]", "", str(value or "")).upper()
    return value if ISBN_VALIDO.fullmatch(value) else None


def texto_fuente_limpio(value: object) -> str:
    # Ejemplo real detectado: Mindf\*ck -> Mindf*ck.
    raw = re.sub(r"\\([*_#])", r"\1", str(value or ""))
    return texto_limpio(raw)


def isbn_desde_url(url: str) -> str | None:
    # Casa del Libro suele incluir el ISBN antes del source_id.
    ruta = urlsplit(url).path
    for candidato in re.findall(
        r"(?<!\d)(?:97[89]\d{10}|\d{9}[\dXx])(?!\d)",
        ruta,
    ):
        limpio = isbn_limpio(candidato)
        if limpio:
            return limpio
    return None


def entero_limpio(value: object) -> int | None:
    digits = SOLO_DIGITOS.sub("", str(value or ""))
    return int(digits) if digits else None


def separar_edicion(titulo: str) -> tuple[str, str | None]:
    """Conserva el título original y ofrece una versión base no destructiva."""
    ediciones: list[str] = []

    def quitar_grupo(match: re.Match[str]) -> str:
        contenido = texto_limpio(match.group(1))
        if TERMINOS_EDICION.search(contenido):
            ediciones.append(contenido)
            return ""
        return match.group(0)

    base = re.sub(r"[\(\[]([^\)\]]+)[\)\]]", quitar_grupo, titulo)
    base = texto_limpio(base).strip(" -–—,:")

    return base or titulo, " · ".join(ediciones) or None


class LibroSpider(scrapy.Spider):
    name = "libro"
    allowed_domains = ["casadellibro.com"]

    categoria_predeterminada = (
        "https://www.casadellibro.com/libros/"
        "literatura/narrativa-fantastica/121012000"
    )

    def __init__(
        self,
        categoria_url: str | None = None,
        max_paginas: str | int = 1,
        pagina_inicial: str | int = 1,
        cantidad_paginas: str | int | None = None,
        *args,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        self.categoria_url = self.normalizar_categoria_url(
            texto_limpio(categoria_url or self.categoria_predeterminada)
        )

        try:
            inicio = int(pagina_inicial)
        except (TypeError, ValueError):
            inicio = 1

        self.pagina_inicial = max(1, inicio)

        if cantidad_paginas is None:
            # Compatibilidad con los comandos antiguos:
            # max_paginas=2 sigue recorriendo las páginas 1 y 2.
            try:
                pagina_final = int(max_paginas)
            except (TypeError, ValueError):
                pagina_final = 1

            pagina_final = max(1, min(pagina_final, 10))
            self.pagina_inicial = 1
            self.pagina_final = pagina_final
        else:
            try:
                cantidad = int(cantidad_paginas)
            except (TypeError, ValueError):
                cantidad = 1

            # Limita el tamaño del lote, no el número absoluto de página.
            cantidad = max(1, min(cantidad, 10))
            self.pagina_final = self.pagina_inicial + cantidad - 1

        self.logger.info(
            "Se recopilarán las páginas %s a %s (%s página(s)).",
            self.pagina_inicial,
            self.pagina_final,
            self.pagina_final - self.pagina_inicial + 1,
        )

    async def start(self):
        yield scrapy.Request(
            self.url_pagina(self.pagina_inicial),
            callback=self.parse,
            meta={"pagina": self.pagina_inicial},
        )

    @staticmethod
    def normalizar_categoria_url(url: str) -> str:
        """Devuelve la URL base de categoria, aunque se reciba una /pN."""
        partes = urlsplit(url)
        ruta = re.sub(r"/p\d+/?$", "", partes.path.rstrip("/"), flags=re.I)
        return urlunsplit(
            (partes.scheme, partes.netloc, ruta, partes.query, partes.fragment)
        )

    def url_pagina(self, pagina: int) -> str:
        """Construye la paginacion real: pagina 2 -> /p2."""
        partes = urlsplit(self.categoria_url)
        numero = max(1, int(pagina))
        ruta_base = re.sub(
            r"/p\d+/?$", "", partes.path.rstrip("/"), flags=re.I
        )
        ruta = ruta_base if numero == 1 else f"{ruta_base}/p{numero}"

        return urlunsplit(
            (partes.scheme, partes.netloc, ruta, partes.query, partes.fragment)
        )

    def parse(self, response):
        # Prioriza los resultados paginados y evita carruseles promocionales
        # repetidos. Si Casa del Libro cambia el contenedor, usa respaldo.
        tarjetas = response.css("div.results div.products div.product-card")

        if not tarjetas:
            self.logger.warning(
                "No se encontro el listado principal en %s; se usa el selector "
                "de respaldo.",
                response.url,
            )
            tarjetas = response.css("div.product-card")

        if not tarjetas:
            self.logger.warning(
                "No se encontraron tarjetas en %s. Puede haber cambiado la web.",
                response.url,
            )

        for tarjeta in tarjetas:
            enlace = (
                tarjeta.css('a[href^="/libro-"]::attr(href)').get()
                or tarjeta.css('a[href*="/libro-"]::attr(href)').get()
            )

            if enlace:
                yield response.follow(enlace, callback=self.parse_libro)

        pagina_actual = int(response.meta.get("pagina", 1))

        if pagina_actual < self.pagina_final:
            pagina_siguiente = pagina_actual + 1
            yield scrapy.Request(
                self.url_pagina(pagina_siguiente),
                callback=self.parse,
                meta={"pagina": pagina_siguiente},
            )

    def parse_libro(self, response):
        url_original = texto_limpio(response.meta.get("url_original") or response.url)

        def extraer_campo(*nombres: str) -> str | None:
            for nombre in nombres:
                texto = response.xpath(
                    "normalize-space(string("
                    f'//h3[@data-campo="{nombre}"]'
                    "))"
                ).get()

                texto = texto_limpio(texto)

                if not texto:
                    continue

                if ":" in texto:
                    texto = texto.split(":", 1)[1]

                return texto_limpio(texto) or None

            return None

        titulo_documento = texto_limpio(response.css("title::text").get())
        partes_titulo_documento = [
            texto_limpio(parte)
            for parte in titulo_documento.split("|")
            if texto_limpio(parte)
        ]

        titulo_meta = texto_limpio(
            response.css('meta[property="og:title"]::attr(content)').get()
        )
        if "|" in titulo_meta:
            titulo_meta = texto_limpio(titulo_meta.split("|", 1)[0])

        titulo_original = texto_limpio(
            response.css("h1.balance-title::text").get()
            or response.css("h1::text").get()
            or titulo_meta
            or (partes_titulo_documento[0] if partes_titulo_documento else "")
        )
        titulo_base, edicion = separar_edicion(titulo_original)

        autora = texto_limpio(
            response.xpath(
                'normalize-space(string('
                '//h3[contains(normalize-space(.), "Escrito por")]'
                "))"
            ).get()
        )
        if autora.lower().startswith("escrito por"):
            autora = texto_limpio(autora[len("escrito por") :])

        if not autora:
            autora = texto_limpio(
                response.css('meta[name="author"]::attr(content)').get()
            )

        if (
            not autora
            and len(partes_titulo_documento) >= 2
            and "casa del libro" not in partes_titulo_documento[1].lower()
        ):
            autora = partes_titulo_documento[1]

        textos_sinopsis = response.xpath(
            '//div[contains(@class, "resumen-content")]//p//text()'
        ).getall()
        sinopsis = texto_limpio(" ".join(textos_sinopsis))

        if not sinopsis:
            sinopsis_meta = texto_limpio(
                response.css('meta[property="og:description"]::attr(content)').get()
                or response.css('meta[name="description"]::attr(content)').get()
            )
            meta_lower = sinopsis_meta.lower()
            meta_generica = (
                "casa del libro" in meta_lower
                and any(
                    termino in meta_lower
                    for termino in (
                        "compra",
                        "envío",
                        "envio",
                        "precio",
                        "librería",
                        "libreria",
                    )
                )
            )
            if len(sinopsis_meta) >= 100 and not meta_generica:
                sinopsis = sinopsis_meta

        generos = [
            texto_limpio(genero)
            for genero in response.xpath(
                '//a[contains(@href, "/libros/literatura/") and @title]/@title'
            ).getall()
            if texto_limpio(genero)
        ]
        generos = list(dict.fromkeys(generos))

        isbn = isbn_limpio(extraer_campo("ISBN")) or isbn_desde_url(url_original)
        numero_paginas = entero_limpio(
            extraer_campo("Número de páginas", "Numero de paginas")
        )
        editorial = extraer_campo("Editorial")
        idioma = extraer_campo("Idioma")
        fecha_publicacion = extraer_campo(
            "Fecha de lanzamiento",
            "Fecha de publicación",
            "Fecha de publicacion",
        )
        anio = entero_limpio(extraer_campo("Año de edición", "Ano de edicion"))

        if not anio and fecha_publicacion:
            coincidencia_anio = re.search(r"\b(?:19|20)\d{2}\b", fecha_publicacion)
            anio = int(coincidencia_anio.group(0)) if coincidencia_anio else None

        encuadernacion = extraer_campo("Encuadernación", "Encuadernacion")
        saga = texto_fuente_limpio(
            extraer_campo("Serie/Saga", "Saga", "Serie")
        ) or None
        saga_numero = (
            entero_limpio(extraer_campo("Número", "Numero"))
            if saga
            else None
        )

        imagen_portada = (
            best_srcset_image(response.css('img[style*="--p-ficha-"]::attr(srcset)').get())
            or response.css('img[style*="--p-ficha-"]::attr(src)').get()
            or response.css('meta[property="og:image"]::attr(content)').get()
        )
        imagen_portada = (
            response.urljoin(imagen_portada) if imagen_portada else None
        )
        imagenes_producto = product_image_gallery(
            response.url,
            [imagen_portada] + response.css(
                'img[style*="--p-ficha-"]::attr(data-src), '
                'img[style*="--p-ficha-"]::attr(src), '
                '[class*="p-ficha"] a[href$=".jpg"]::attr(href), '
                '[class*="p-ficha"] a[href$=".webp"]::attr(href)'
            ).getall(),
            response.css('script[type="application/ld+json"]::text').getall(),
        )

        ficha_incompleta = (
            not titulo_original
            or not autora
            or not isbn
            or not sinopsis
            or not numero_paginas
        )

        # Fase 1: repetir una vez la ficha española sin caché.
        if ficha_incompleta and not response.meta.get("reintento_ficha"):
            self.logger.warning(
                "Ficha incompleta; reintento único en www: %s",
                response.url,
            )
            meta_reintento = dict(response.meta)
            meta_reintento["reintento_ficha"] = True
            meta_reintento["url_original"] = url_original
            yield scrapy.Request(
                url_original,
                callback=self.parse_libro,
                dont_filter=True,
                meta=meta_reintento,
                headers={
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                },
            )
            return

        # Fase 2: si www sigue devolviendo una carcasa parcial, consultar la
        # misma ficha/ISBN/source_id en el dominio LATAM de Casa del Libro.
        if (
            ficha_incompleta
            and response.meta.get("reintento_ficha")
            and not response.meta.get("fallback_latam")
        ):
            partes = urlsplit(url_original)
            url_latam = urlunsplit(
                (
                    partes.scheme or "https",
                    "latam.casadellibro.com",
                    partes.path,
                    partes.query,
                    partes.fragment,
                )
            )
            self.logger.warning(
                "Ficha aún incompleta; fallback Casa del Libro LATAM: %s",
                url_latam,
            )
            meta_latam = dict(response.meta)
            meta_latam["fallback_latam"] = True
            meta_latam["url_original"] = url_original
            yield scrapy.Request(
                url_latam,
                callback=self.parse_libro,
                dont_filter=True,
                meta=meta_latam,
                headers={
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                },
            )
            return

        avisos: list[str] = []
        if ficha_incompleta:
            if response.meta.get("fallback_latam"):
                avisos.append(
                    "Ficha incompleta tras reintento y fallback Casa del Libro LATAM"
                )
            else:
                avisos.append("Ficha incompleta tras un reintento")
        elif response.meta.get("fallback_latam"):
            self.logger.info(
                "Ficha completada mediante fallback Casa del Libro LATAM: %s",
                url_original,
            )

        if not titulo_original:
            avisos.append("Falta el título")
        if not autora:
            avisos.append("Falta el autor")
        if not isbn:
            avisos.append("Falta un ISBN válido")
        if not sinopsis:
            avisos.append("Falta la sinopsis")
        if not numero_paginas:
            avisos.append("Falta el número de páginas")

        source_id = isbn or url_original.rstrip("/").rsplit("/", 1)[-1]

        yield LibroItem(
            titulo=titulo_original or None,
            titulo_base=titulo_base or None,
            edicion=edicion,
            autora=autora or None,
            sinopsis=sinopsis or None,
            genero_literario=generos[-1] if generos else None,
            generos_fuente=generos,
            isbn=isbn,
            numero_paginas=numero_paginas,
            editorial=editorial,
            idioma=idioma or "Español",
            fecha_publicacion=fecha_publicacion,
            anio=anio,
            encuadernacion=encuadernacion,
            saga=saga,
            saga_numero=saga_numero,
            imagen_portada=imagen_portada,
            imagen_producto=imagenes_producto[0] if imagenes_producto else None,
            imagenes_producto=imagenes_producto,
            painted_edges=detect_painted_edges({"title": titulo_original, "edition": edicion, "synopsis": sinopsis, "isbn": isbn, "cover": imagen_portada}),
            provider="casa_del_libro",
            source_id=source_id,
            url=url_original,
            extraido_en=datetime.now(timezone.utc).isoformat(),
            avisos=avisos,
        )
