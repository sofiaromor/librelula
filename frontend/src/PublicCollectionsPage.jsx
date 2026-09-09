import ProfileCollectionsStandalone from "./ProfileCollectionsStandalone.jsx";
import "./PublicCollectionsPage.css";

export default function PublicCollectionsPage({ profileId, onOpenCatalog, onSelectBook }) {
  return (
    <main className="public-collections-page">
      <div className="public-collections-page-shell">
        <button type="button" className="public-collections-back" onClick={onOpenCatalog}>
          <span aria-hidden="true">←</span> Explorar catálogo
        </button>
        <header className="public-collections-heading">
          <span className="profile-eyebrow">Enlace público</span>
          <h1>Colecciones lectoras</h1>
          <p>Una selección de libros para descubrir, guardar y compartir en Librélula.</p>
        </header>
        <ProfileCollectionsStandalone profileId={profileId} onSelectBook={onSelectBook} />
      </div>
    </main>
  );
}
