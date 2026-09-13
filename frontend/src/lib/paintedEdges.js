// Candidate detection is NOT face detection: text never enables a texture.
const FEATURE = /\b(?:(?:cantos?|bordes?)\s+(?:de\s+(?:las?\s+)?paginas?\s+)?(?:pintad[oa]s?|tintad[oa]s?|decorad[oa]s?|ilustrad[oa]s?|metalizad[oa]s?|coloread[oa]s?|tenid[oa]s?|dorad[oa]s?|platead[oa]s?|estampad[oa]s?)|taco\s+pintad[oa]s?|(?:sprayed|stencilled|stenciled|painted|decorated|gilded|stained|coloured|colored)\s+(?:book\s+)?edges)\b/g;
const NEGATION = /(?:\bsin(?:\s+ningun[oa]?)?|\bno\s+(?:tiene|incluye|lleva|trae|presenta|son|estan)(?:\s+\w+){0,3})\s*$/;
const SPECIAL = /\b(?:edicion\s+(?:especial|limitada|coleccionista)|coleccionista|collector(?:'s)?\s+edition|deluxe\s+edition)\b/;
const CONDITIONAL = /\b(?:primera\s+(?:edicion|tirada|impresion)|hasta\s+(?:agotar|fin\s+de)\s+(?:existencias|stock)|no\s+(?:se\s+)?(?:puede\s+)?garantiza\w*|solo\s+(?:en\s+)?(?:la\s+)?primera)\b/;
const PROVISIONAL = /\b(?:provisional|diseno\s+no\s+definitivo|artwork\s+(?:not\s+final|subject\s+to\s+change))\b/;

function text(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function validIsbn(isbn) {
  if (/^\d{13}$/.test(isbn)) {
    const total = [...isbn.slice(0, 12)].reduce((sum, n, i) => sum + Number(n) * (i % 2 ? 3 : 1), 0);
    return (10 - total % 10) % 10 === Number(isbn[12]);
  }
  if (/^\d{9}[\dX]$/.test(isbn)) return [...isbn].reduce((sum, n, i) => sum + (n === "X" ? 10 : Number(n)) * (10 - i), 0) % 11 === 0;
  return false;
}

export function detectPaintedEdges(item = {}) {
  const title = text([item.title || item.titulo, item.edition_label || item.edition || item.edicion, item.special_binding || item.specialBinding || item.encuadernacion_especial].filter(Boolean).join(" "));
  const synopsis = text(item.synopsis || item.sinopsis);
  const fields = [title, synopsis];
  const all = fields.join(" ");
  const matches = fields.flatMap((field, index) => [...field.matchAll(FEATURE)]
    .filter((match) => !NEGATION.test(field.slice(Math.max(0, match.index - 60), match.index)))
    .map((match) => ({ evidence: match[0], title: index === 0 })));
  const candidate = matches.length > 0 || SPECIAL.test(title);
  if (!candidate) return { status: "none", reason: "no_signal", evidence: "" };
  if (/\b(?:estuche|box\s*set|boxed\s*set|cofre)\b/.test(title)) return { status: "excluded", reason: "box_set", evidence: matches[0]?.evidence || "" };
  const evidence = matches[0]?.evidence || "";
  const review = (reason) => ({ status: "review", reason, evidence });
  const isbn = String(item.isbn || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (!validIsbn(isbn)) return review("isbn_required");
  const cover = String(item.cover || item.imagen_portada || "");
  const photoIsbn = cover.match(/casadellibro\.com\/[^?#]*\/(\d{13})\.(?:webp|jpe?g|png)(?:[?#]|$)/i)?.[1];
  if (photoIsbn && photoIsbn !== isbn) return review("cover_mismatch");
  if (PROVISIONAL.test(all)) return review("provisional");
  if (matches.length && CONDITIONAL.test(all)) return review("first_printing");
  if (matches.some((match) => match.title)) return { status: "explicit", reason: "edition_label", evidence };
  if (matches.length) return review("synopsis_only");
  return { status: "possible", reason: "special_edition", evidence: "" };
}

export function paintedEdgeReviewMessage(result) {
  const messages = {
    edition_label: "Cantos indicados en esta edición. Revisa la foto y delimita el canto visible antes de aplicarlo.",
    synopsis_only: "La sinopsis menciona cantos especiales: confirma que pertenecen a este ISBN y no a otra edición.",
    first_printing: "Los cantos pueden limitarse a la primera tirada o al stock disponible. Comprueba esta edición.",
    provisional: "El dibujo del canto es provisional. Espera una foto definitiva antes de aplicarlo.",
    isbn_required: "Falta un ISBN válido para identificar la edición con cantos especiales.",
    cover_mismatch: "La imagen de portada corresponde a otro ISBN. Corrige la foto antes de preparar el canto.",
    special_edition: "Edición especial por comprobar: no implica que tenga cantos pintados.",
    box_set: "Estuche con varios libros: revisa cada volumen por separado; no se aplicará un único canto al conjunto.",
  };
  return messages[result?.reason] || "";
}

export function discardStaleFaceSelection(item, changes) {
  const identityChanged = ["isbn", "cover"].some((field) => Object.hasOwn(changes, field) && changes[field] !== item[field]);
  return identityChanged ? { ...changes, visual: null } : changes;
}
