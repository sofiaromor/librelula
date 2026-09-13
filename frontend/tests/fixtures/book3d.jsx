// Development-only harness. Not an entry point of the production build.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import LibraryShelfShowcase from "../../src/LibraryShelfShowcase.jsx";
import Book3DInspector from "../../src/Book3DInspector.jsx";
import BookProductFaceEditor from "../../src/BookProductFaceEditor.jsx";
import "../../src/index.css";

const edition = {
  id: "qa-painted", book_id: "qa-book", title: "El jardín de papel", edition_label: "Edición de cantos pintados", pages: 520, isbn: "9780000000002", is_primary: true,
  cover: "/tests/fixtures/book-cover.svg",
  visual: { product_image_url: "https://textures.example.test/product.svg", image_gallery: ["https://textures.example.test/product.svg"], front_quad: [[.15,.08],[.76,.13],[.76,.96],[.15,.88]], fore_edge_quad: [[.76,.13],[.90,.04],[.90,.88],[.76,.96]] },
};
const book = { id: "qa-book", title: "El jardín de papel", author: "Librélula", pages: 520, isbn: edition.isbn, cover: edition.cover, hero_color: "#31534d", synopsis: "Una pequeña biblioteca abre sus puertas cuando el resto de la ciudad duerme. Entre cartas olvidadas y jardines de papel, una lectora descubre que cada historia es una forma de volver a casa.\n\nEsta sinopsis permite comprobar la contraportada, el scroll y la zona segura de los botones en el móvil." };
const items = Array.from({ length: 16 }, (_, i) => ({ book_id: `qa-${i}`, score: (i % 5) + 1, book: { ...book, id: `qa-${i}`, title: i ? `Historias del jardín ${i}` : book.title }, editions: [edition, { ...edition, id: "qa-plain", isbn: "9780000000001", edition_label: "Edición normal", visual: null, is_primary: false }], visual_edition: edition }));

export default function Harness() {
  const [item, setItem] = useState(null);
  const [editing, setEditing] = useState(false);
  return <>
    <LibraryShelfShowcase shelf={{ id: "qa", title: "Mi estantería", subtitle: "Prueba de libros 3D" }} items={items} initialViewMode="spines" onClose={() => {}} onSelectBook={() => {}} onInspectItem={setItem} />
    <button style={{ position: "fixed", top: 8, right: 8, zIndex: 1400 }} onClick={() => setEditing(true)}>Probar recorte</button>
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 92, background: "#fffaf3", zIndex: 1300, borderTop: "1px solid #d9cebe", display: "flex", alignItems: "center", justifyContent: "space-around" }} aria-label="Navbar móvil de prueba"><span>Inicio</span><span>Catálogo</span><span>Biblioteca</span></nav>
    {item ? <Book3DInspector item={item} onClose={() => setItem(null)} onSelectBook={() => {}} /> : null}
    {editing ? <BookProductFaceEditor edition={edition} onClose={() => setEditing(false)} onConfirm={() => setEditing(false)} /> : null}
  </>;
}
createRoot(document.getElementById("root")).render(<Harness />);
