import { useEffect, useState } from "react";
import ProfileCollections from "./ProfileCollections.jsx";
import { getMyLibrary } from "./lib/library.js";
import { supabase } from "./lib/supabase.js";

export default function ProfileCollectionsStandalone({ profileId, onSelectBook, embedded = false }) {
  const [context, setContext] = useState({
    loading: true,
    isOwner: false,
    shelfBooks: [],
    targetProfileId: "",
    error: "",
    errorKind: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      let stage = "session";
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw new Error("No se pudo comprobar la sesión de Librélula.", { cause: sessionError });
        }

        const viewerId = String(session?.user?.id || "");
        const targetProfileId = String(profileId || viewerId).trim();
        const isOwner = Boolean(viewerId && (!profileId || String(profileId) === viewerId));
        let shelfBooks = [];

        // Only the owner needs the private library payload used by the editor.
        if (isOwner) {
          stage = "library";
          const library = await getMyLibrary();
          shelfBooks = (library.items || [])
            .map((item) => ({
              ...(item.book || {}),
              status: item.status,
              score: item.score,
            }))
            .filter((book) => book.id);
        }

        if (!cancelled) {
          setContext({
            loading: false,
            isOwner,
            shelfBooks,
            targetProfileId,
            error: "",
            errorKind: "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setContext({
            loading: false,
            isOwner: stage === "library",
            shelfBooks: [],
            targetProfileId: String(profileId || "").trim(),
            error: stage === "library"
              ? "No se pudo cargar tu biblioteca para editar colecciones."
              : error?.message || "No se pudo comprobar la sesión de Librélula.",
            errorKind: stage,
          });
        }
      }
    }

    loadContext();
    return () => { cancelled = true; };
  }, [profileId]);

  if (context.loading) return null;

  if (context.errorKind === "session") {
    return (
      <section className={`profile-collections-standalone-shell${embedded ? " is-embedded" : ""}`}>
        <p className="profile-collections-message is-error" role="alert">{context.error}</p>
      </section>
    );
  }

  return (
    <section className={`profile-collections-standalone-shell${embedded ? " is-embedded" : ""}`}>
      <ProfileCollections
        profileId={context.targetProfileId || profileId}
        isOwner={context.isOwner}
        shelfBooks={context.shelfBooks}
        contextError={context.error}
        onSelectBook={onSelectBook}
      />
    </section>
  );
}
