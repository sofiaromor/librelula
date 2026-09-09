// Isolated visual fixture: synthetic books, no backend, no personal account.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import LibraryShelfShowcase from "../../src/LibraryShelfShowcase.jsx";
import { CoverBook } from "../../src/MiBibliotecaImpl.jsx";

const titles = ["Los diablos", "Figuras ocultas", "La paciente silenciosa", "Circe", "Nuestra parte de noche", "La asistenta"];
const items = Array.from({ length: 24 }, (_, index) => ({
  book_id: String(index),
  score: [5, 4.5, 4, 3.5, 1, 0][index % 6],
  status: "completed",
  book: { id: index, title: `${titles[index % 6]} ${index + 1}`, author: "Autor de prueba", cover: "https://librelula.vercel.app/images/librelula.png" },
  ...(index % 7 === 0 ? {
    personal_spine_url: "https://librelula.vercel.app/images/librelula.png",
    personal_spine_crop: { x: 35, y: 60, zoom: 1.2 },
    personal_spine_show_text: false,
  } : {}),
}));

function Fixture() {
  const [showcase, setShowcase] = useState(true);
  const [books, setBooks] = useState(items);
  const [selected, setSelected] = useState("");
  return <>
    <h1>Prueba de estanterías</h1>
    <output aria-label="Libro abierto">{selected || "Ninguno"}</output>
    <button onClick={() => setShowcase(true)}>Ver todas</button>
    <section className="library-v2-visual-row">
      {books.slice(0, 2).map((item) => <CoverBook
        key={item.book_id}
        item={item}
        onSelectBook={(book) => setSelected(book.title)}
        onScoreChange={(book, score) => setBooks((previous) => previous.map((item) => item.book_id === book.book_id ? { ...item, score } : item))}
      />)}
    </section>
    {showcase ? <LibraryShelfShowcase
      shelf={{ id: "completed", title: "Leídos", subtitle: "Prueba aislada, sin modificar tu biblioteca." }}
      items={books}
      onClose={() => setShowcase(false)}
      onSelectBook={(book) => setSelected(book.title)}
    /> : null}
  </>;
}

createRoot(document.getElementById("root")).render(<Fixture />);

export { Fixture };
