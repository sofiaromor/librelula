"""Conservative edition candidates. Text never supplies face coordinates."""
import re
import unicodedata

FEATURE = re.compile(
    r"\b(?:(?:cantos?|bordes?)\s+(?:de\s+(?:las?\s+)?paginas?\s+)?"
    r"(?:pintad[oa]s?|tintad[oa]s?|decorad[oa]s?|ilustrad[oa]s?|metalizad[oa]s?|"
    r"coloread[oa]s?|tenid[oa]s?|dorad[oa]s?|platead[oa]s?|estampad[oa]s?)|"
    r"taco\s+pintad[oa]s?|(?:sprayed|stencilled|stenciled|painted|decorated|gilded|"
    r"stained|coloured|colored)\s+(?:book\s+)?edges)\b"
)
NEGATION = re.compile(r"(?:\bsin(?:\s+ningun[oa]?)?|\bno\s+(?:tiene|incluye|lleva|trae|presenta|son|estan)(?:\s+\w+){0,3})\s*$")
SPECIAL = re.compile(r"\b(?:edicion\s+(?:especial|limitada|coleccionista)|coleccionista|collector(?:'s)?\s+edition|deluxe\s+edition)\b")
CONDITIONAL = re.compile(r"\b(?:primera\s+(?:edicion|tirada|impresion)|hasta\s+(?:agotar|fin\s+de)\s+(?:existencias|stock)|no\s+(?:se\s+)?(?:puede\s+)?garantiza\w*|solo\s+(?:en\s+)?(?:la\s+)?primera)\b")
PROVISIONAL = re.compile(r"\b(?:provisional|diseno\s+no\s+definitivo|artwork\s+(?:not\s+final|subject\s+to\s+change))\b")


def text(value):
    value = re.sub(r"<[^>]*>", " ", str(value or ""))
    value = "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", value.lower()).strip()


def valid_isbn(value):
    if re.fullmatch(r"\d{13}", value):
        total = sum(int(n) * (3 if i % 2 else 1) for i, n in enumerate(value[:12]))
        return (10 - total % 10) % 10 == int(value[12])
    if re.fullmatch(r"\d{9}[\dX]", value):
        return sum((10 if n == "X" else int(n)) * (10 - i) for i, n in enumerate(value)) % 11 == 0
    return False


def detect_painted_edges(item):
    title = text(" ".join(str(v) for v in [item.get("title") or item.get("titulo"), item.get("edition_label") or item.get("edition") or item.get("edicion")] if v))
    synopsis = text(item.get("synopsis") or item.get("sinopsis"))
    fields = [title, synopsis]
    all_text = " ".join(fields)
    matches = [(match.group(), index == 0) for index, field in enumerate(fields)
               for match in FEATURE.finditer(field)
               if not NEGATION.search(field[max(0, match.start() - 60):match.start()])]
    if not matches and not SPECIAL.search(title):
        return {"status": "none", "reason": "no_signal", "evidence": ""}
    evidence = matches[0][0] if matches else ""
    if re.search(r"\b(?:estuche|box\s*set|boxed\s*set|cofre)\b", title):
        return {"status": "excluded", "reason": "box_set", "evidence": evidence}
    def review(reason):
        return {"status": "review", "reason": reason, "evidence": evidence}
    isbn = re.sub(r"[^0-9X]", "", str(item.get("isbn") or "").upper())
    if not valid_isbn(isbn):
        return review("isbn_required")
    cover = str(item.get("cover") or item.get("imagen_portada") or "")
    photo_isbn = re.search(r"casadellibro\.com\/[^?#]*\/(\d{13})\.(?:webp|jpe?g|png)(?:[?#]|$)", cover, re.I)
    if photo_isbn and photo_isbn.group(1) != isbn:
        return review("cover_mismatch")
    if PROVISIONAL.search(all_text):
        return review("provisional")
    if matches and CONDITIONAL.search(all_text):
        return review("first_printing")
    if any(is_title for _, is_title in matches):
        return {"status": "explicit", "reason": "edition_label", "evidence": evidence}
    if matches:
        return review("synopsis_only")
    return {"status": "possible", "reason": "special_edition", "evidence": ""}
