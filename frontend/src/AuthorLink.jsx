function cleanAuthor(value) {
  return String(value || "").trim();
}

export default function AuthorLink({ author, onSelectAuthor, className = "" }) {
  const name = cleanAuthor(author);
  const classes = ["author-link", className].filter(Boolean).join(" ");

  if (!name) {
    return <span className={classes}>Autor desconocido</span>;
  }

  if (typeof onSelectAuthor !== "function") {
    return <span className={classes}>{name}</span>;
  }

  return (
    <button
      type="button"
      className={classes}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelectAuthor(name);
      }}
      aria-label={`Ver perfil de ${name}`}
    >
      {name}
    </button>
  );
}
