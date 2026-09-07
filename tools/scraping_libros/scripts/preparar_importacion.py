from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse


MAPA_GENEROS = {
    "narrativa fantastica": "Fantasía",
    "fantasia y magia": "Fantasía",
    "novela romantica": "Romance",
    "novela romantica y erotica": "Romance",
    "narrativa contemporanea": "Narrativa contemporánea",
    "novela negra": "Novela negra",
    "novela policiaca": "Novela policíaca",
    "ciencia ficcion": "Ciencia ficción",
    "novela de ciencia ficcion": "Ciencia ficción",
    "novela de terror": "Terror",
    "novela historica": "Novela histórica",
    "literatura juvenil": "Juvenil",
    "juvenil": "Juvenil",
    "infantil": "Infantil",
}

TERMINOS_EDICION = re.compile(
    r"\b(?:"
    r"ed\.?|edici[oó]n|tapa\s+dura|tapa\s+blanda|encuadernaci[oó]n|"
    r"formato\s+bolsillo|libro\s+de\s+bolsillo|coleccionista|"
    r"especial|limitada|ilustrada|cantos?\s+(?:tintados?|pintados?)"
    r")\b",
    re.IGNORECASE,
)


SAGA_FINAL_TITULO = re.compile(
    r"\s*[\(\[]\s*(?P<name>[^\(\)\[\]]+?)"
    r"(?:,\s*#\s*|#\s*|\s+)"
    r"(?P<number>\d+)\s*[\)\]]\s*$",
    re.IGNORECASE,
)

SAGA_TEXTO = re.compile(
    r"^(?P<name>.+?)(?:,\s*#\s*|#\s*|\s+)(?P<number>\d+)$",
    re.IGNORECASE,
)


# Solo alias editoriales verificados. No se traducen todas las sagas.
SAGA_ALIASES = {
    "dungeon crawler carl": "Carl el Mazmorrero",
    "carl el mazmorrero": "Carl el Mazmorrero",
    "mindf ck": "Mindf*ck",
    "mindfck": "Mindf*ck",
    "serie mindf ck": "Mindf*ck",
    "serie mindfck": "Mindf*ck",
}


def texto(value: object) -> str:
    raw = re.sub(r"\\([*_#])", r"\1", str(value or ""))
    return re.sub(r"\s+", " ", raw.replace("\xa0", " ")).strip()



def datos_saga(value: object) -> tuple[str, int | None]:
    value = texto(value).strip("()[] ")

    if not value:
        return "", None

    match = SAGA_TEXTO.fullmatch(value)
    if not match:
        return saga_canonica(value), None

    name = texto(match.group("name")).strip(" ,#")
    if not name or TERMINOS_EDICION.search(name):
        return saga_canonica(value), None

    return saga_canonica(name), int(match.group("number"))


def normalizar_saga_en_titulo(title: str) -> tuple[str, str, int | None]:
    match = SAGA_FINAL_TITULO.search(title)

    if not match:
        return title, "", None

    name = texto(match.group("name")).strip(" ,#")
    if not name or TERMINOS_EDICION.search(name):
        return title, "", None

    if name.lower().startswith("serie "):
        name = texto(name[6:])
    name = saga_canonica(name)

    number = int(match.group("number"))
    prefix = texto(title[: match.start()]).rstrip(" -–—,:")
    normalized = f"{prefix} ({name}, #{number})" if prefix else f"({name}, #{number})"

    return normalized, name, number


def normalizado(value: object) -> str:
    return (
        texto(value)
        .lower()
        .translate(str.maketrans("áéíóúüñ", "aeiouun"))
    )


def identidad_saga(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", normalizado(value)).strip()


def saga_canonica(value: object) -> str:
    raw = texto(value)
    if not raw:
        return ""
    return SAGA_ALIASES.get(identidad_saga(raw), raw)


def isbn(value: object) -> str:
    return re.sub(r"[^0-9Xx]", "", texto(value)).upper()


def isbn_valido(value: str) -> bool:
    if len(value) == 10:
        total = 0

        for posicion, caracter in enumerate(value):
            if caracter == "X":
                if posicion != 9:
                    return False
                numero = 10
            elif caracter.isdigit():
                numero = int(caracter)
            else:
                return False

            total += numero * (10 - posicion)

        return total % 11 == 0

    if len(value) == 13 and value.isdigit():
        total = sum(
            int(caracter) * (1 if posicion % 2 == 0 else 3)
            for posicion, caracter in enumerate(value[:12])
        )
        control = (10 - total % 10) % 10
        return control == int(value[-1])

    return False


def entero(value: object) -> int | None:
    coincidencia = re.search(r"\d+", texto(value))
    return int(coincidencia.group(0)) if coincidencia else None


def url_https(value: object) -> str:
    value = texto(value)

    try:
        parsed = urlparse(value)
    except ValueError:
        return ""

    return value if parsed.scheme == "https" and parsed.netloc else ""


def genero_libr_lula(value: object) -> str:
    return MAPA_GENEROS.get(normalizado(value), "")


def separar_edicion(title: str) -> tuple[str, str]:
    ediciones: list[str] = []

    def quitar_grupo(match: re.Match[str]) -> str:
        contenido = texto(match.group(1))

        if TERMINOS_EDICION.search(contenido):
            ediciones.append(contenido)
            return ""

        return match.group(0)

    base = re.sub(r"[\(\[]([^\)\]]+)[\)\]]", quitar_grupo, title)
    return texto(base).strip(" -–—,:"), " · ".join(ediciones)



def normalizar_titulo_mayusculas(value: object) -> str:
    value = texto(value)
    if not value:
        return ""

    match_saga = SAGA_FINAL_TITULO.search(value)
    if match_saga:
        principal = texto(value[: match_saga.start()]).rstrip(" -–—,:")
        sufijo = value[match_saga.start():].strip()
    else:
        principal = value
        sufijo = ""

    letras = [c for c in principal if c.isalpha()]
    if not letras:
        return value

    mayusculas = sum(c.isupper() for c in letras)
    proporcion_mayusculas = mayusculas / len(letras)

    if proporcion_mayusculas < 0.85:
        return value

    principal = principal.lower()

    chars = list(principal)
    for i, char in enumerate(chars):
        if char.isalpha():
            chars[i] = char.upper()
            break
    principal = "".join(chars)

    principal = re.sub(
        r"\\b(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)\\b",
        lambda m: m.group(1).upper(),
        principal,
        flags=re.IGNORECASE,
    )

    return f"{principal} {sufijo}".strip() if sufijo else principal

def transformar(registro: dict, posicion: int) -> dict:
    original_title = texto(registro.get("titulo") or registro.get("titulo_original"))
    original_title = normalizar_titulo_mayusculas(original_title)
    title, title_saga_name, title_saga_number = normalizar_saga_en_titulo(
        original_title
    )
    source_saga_name, source_saga_number = datos_saga(registro.get("saga"))
    explicit_saga_number = entero(registro.get("saga_numero"))

    saga_name = saga_canonica(source_saga_name or title_saga_name)
    saga_number = (
        explicit_saga_number
        or title_saga_number
        or source_saga_number
    )

    # Fallback para títulos como: Pecados 6. Rey de la gula.
    if saga_name and not saga_number:
        saga_pattern = re.escape(saga_name)
        match_numero = re.search(
            rf"(?i)(?:^|[\s(])(?:serie\s+)?{saga_pattern}\s*"
            rf"(?:#|n[úu]m(?:ero)?\.?|n[ºo]\.?\s*)?(\d+)\b",
            original_title,
        )
        if match_numero:
            saga_number = int(match_numero.group(1))

    if saga_name and saga_number:
        match_saga_titulo = SAGA_FINAL_TITULO.search(original_title)
        if match_saga_titulo:
            prefix = texto(original_title[: match_saga_titulo.start()]).rstrip(
                " -–—,:"
            )
            title = (
                f"{prefix} ({saga_name}, #{saga_number})"
                if prefix
                else f"({saga_name}, #{saga_number})"
            )
        elif not title_saga_name:
            title = f"{title} ({saga_name}, #{saga_number})"

    detected_title_base, detected_edition = separar_edicion(title)
    # Se recalcula para no conservar el sufijo antiguo '(Saga 3)' del JSON raw.
    title_base = detected_title_base
    edition = texto(registro.get("edicion")) or detected_edition
    author = texto(registro.get("autora"))
    synopsis = texto(registro.get("sinopsis"))
    normalized_isbn = isbn(registro.get("isbn"))
    pages = entero(registro.get("numero_paginas"))
    publisher = texto(registro.get("editorial"))
    year = entero(registro.get("anio"))
    source_url = url_https(registro.get("url"))
    cover = url_https(registro.get("imagen_portada"))
    warnings = [texto(item) for item in registro.get("avisos", []) if texto(item)]
    errors: list[str] = []

    if not title:
        errors.append("Falta el título")
    if not author:
        errors.append("Falta el autor")
    if normalized_isbn and not isbn_valido(normalized_isbn):
        errors.append("El ISBN no supera la validación")
    if not normalized_isbn:
        warnings.append("Falta el ISBN")
    if not cover:
        warnings.append("Falta una portada HTTPS")
    if not synopsis:
        warnings.append("Falta la sinopsis")
    if not pages:
        warnings.append("Falta el número de páginas")
    if not publisher:
        warnings.append("Falta la editorial")
    if not year:
        warnings.append("Falta el año")
    if not source_url:
        warnings.append("Falta la URL de procedencia")

    raw_genre = texto(registro.get("genero_literario"))
    genre = genero_libr_lula(raw_genre)

    if raw_genre and not genre:
        warnings.append(f'Revisar el género de origen: "{raw_genre}"')

    return {
        "import_id": posicion,
        "selected": False,
        "ready": not errors,
        "title": title,
        "title_base": title_base,
        "edition": edition,
        "author": author,
        "synopsis": synopsis,
        "genre": genre,
        "source_genre": raw_genre,
        "year": year,
        "pages": pages,
        "publisher": publisher,
        "language": "es",
        "isbn": normalized_isbn,
        "saga_name": saga_name,
        "saga_number": saga_number,
        "cover": cover,
        "hero_color": texto(registro.get("hero_color")),
        "provider": "casa_del_libro",
        "source_id": texto(registro.get("source_id")) or normalized_isbn or source_url,
        "source_url": source_url,
        "binding": texto(registro.get("encuadernacion")),
        "publication_date": texto(registro.get("fecha_publicacion")),
        "warnings": list(dict.fromkeys(warnings)),
        "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara un JSON del scraper para revisarlo en Librélula."
    )
    parser.add_argument("entrada", type=Path)
    parser.add_argument("salida", type=Path)
    args = parser.parse_args()

    with args.entrada.open(encoding="utf-8") as source:
        raw = json.load(source)

    if not isinstance(raw, list):
        raise SystemExit("La entrada debe ser una lista JSON de libros.")

    result = [transformar(item, index + 1) for index, item in enumerate(raw)]
    seen_isbns: set[str] = set()
    seen_sources: set[str] = set()

    for item in result:
        duplicate = False

        if item["isbn"] and item["isbn"] in seen_isbns:
            item["errors"].append("ISBN duplicado dentro del archivo")
            duplicate = True

        if item["source_id"] and item["source_id"] in seen_sources:
            item["errors"].append("Fuente duplicada dentro del archivo")
            duplicate = True

        if duplicate:
            item["ready"] = False
            item["selected"] = False

        if item["isbn"]:
            seen_isbns.add(item["isbn"])
        if item["source_id"]:
            seen_sources.add(item["source_id"])

    args.salida.parent.mkdir(parents=True, exist_ok=True)

    with args.salida.open("w", encoding="utf-8", newline="\n") as destination:
        json.dump(result, destination, ensure_ascii=False, indent=2)
        destination.write("\n")

    ready = sum(bool(item["ready"]) for item in result)
    warnings = sum(bool(item["warnings"]) for item in result)
    errors = len(result) - ready

    print(f"Registros preparados: {len(result)}")
    print(f"Listos para revisión: {ready}")
    print(f"Con avisos: {warnings}")
    print(f"Bloqueados por errores: {errors}")
    print(f"Archivo creado: {args.salida.resolve()}")


if __name__ == "__main__":
    main()

