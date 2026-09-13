import os


BOT_NAME = "libros"

SPIDER_MODULES = ["libros.spiders"]
NEWSPIDER_MODULE = "libros.spiders"

# Casa del Libro ha autorizado expresamente este uso para Libr?lula.
ROBOTSTXT_OBEY = False

# Rastreo deliberadamente lento: una única petición y pausa entre solicitudes.
CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 3
RANDOMIZE_DOWNLOAD_DELAY = True
DOWNLOAD_TIMEOUT = 30

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 3
AUTOTHROTTLE_MAX_DELAY = 30
AUTOTHROTTLE_TARGET_CONCURRENCY = 0.5

COOKIES_ENABLED = False
TELNETCONSOLE_ENABLED = False

USER_AGENT = os.getenv(
    "LIBRELULA_SCRAPER_USER_AGENT",
    "LibrelulaCatalogResearch/1.0",
)

FEED_EXPORT_ENCODING = "utf-8"
FEED_EXPORT_INDENT = 2
FEED_EXPORT_FIELDS = [
    "titulo",
    "titulo_base",
    "edicion",
    "autora",
    "sinopsis",
    "genero_literario",
    "generos_fuente",
    "isbn",
    "numero_paginas",
    "editorial",
    "idioma",
    "fecha_publicacion",
    "anio",
    "encuadernacion",
    "saga",
    "saga_numero",
    "imagen_portada",
    "imagen_producto",
    "imagenes_producto",
    "provider",
    "source_id",
    "url",
    "extraido_en",
    "avisos",
]

REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"

LOG_LEVEL = "INFO"
