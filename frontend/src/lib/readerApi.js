import { publishReaderPost } from "./homeDashboardApi.js";
import { saveCatalogUserBookProgress } from "./catalogApi.js";
import { supabase } from "./supabase.js";
import {
  clampReaderProgress,
  normalizeReaderLocator,
  readerMimeType,
  READER_DOCUMENT_BUCKET,
  safeReaderPathSegment,
  validateReaderFile,
} from "./readerUtils.js";

const READER_SIGNED_URL_SECONDS = 60 * 60 * 4;

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanBookId(value) {
  const bookId = cleanText(value);
  if (!bookId) throw apiError("No se ha indicado el libro.", 400);
  return bookId;
}

function isMissingReaderSchema(error) {
  return Boolean(
    error?.code === "42P01"
      || error?.code === "PGRST205"
      || /reader_(documents|book_progress|annotations)/i.test(error?.message || ""),
  );
}

function schemaError(error) {
  if (isMissingReaderSchema(error)) {
    return apiError("El lector todavía no está activado en Supabase. Ejecuta la migración reader-documents-v1.sql.", 503);
  }

  return apiError(error?.message || "No se pudo acceder al lector.");
}

async function getReaderContext() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesión para usar el lector.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.legacy_id) {
    throw apiError("No se pudo cargar tu perfil lector.");
  }

  return {
    authId: user.id,
    legacyId: Number(profile.legacy_id),
  };
}

function normalizeDocument(row, signedUrl = "") {
  return {
    id: row.id,
    book_id: String(row.book_id || ""),
    format: row.format === "pdf" ? "pdf" : "epub",
    original_name: row.original_name || "Documento lector",
    storage_path: row.storage_path || "",
    mime_type: row.mime_type || readerMimeType(row.format),
    size_bytes: Number(row.size_bytes || 0),
    signed_url: signedUrl,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeAnnotation(row) {
  return {
    id: row.id,
    book_id: String(row.book_id || ""),
    document_id: row.document_id || null,
    kind: row.kind || "postit",
    quote: row.quote || "",
    note: row.note || "",
    locator: normalizeReaderLocator(row.locator),
    page: row.page === null || row.page === undefined ? null : Number(row.page),
    color: row.color || "yellow",
    spoiler: Boolean(row.spoiler),
    shared_post_id: row.shared_post_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export async function getReaderBookAssets(bookId) {
  const cleanId = cleanBookId(bookId);
  const { data, error } = await supabase
    .from("books")
    .select("id, pdf_file, epub_file")
    .eq("id", cleanId)
    .maybeSingle();

  if (error) throw apiError(error.message || "No se pudo cargar el libro.");
  return data || { id: cleanId, pdf_file: "", epub_file: "" };
}

export async function getReaderDocuments(bookId) {
  const cleanId = cleanBookId(bookId);
  const { error: userError } = await supabase.auth.getUser();
  if (userError) throw apiError(userError.message || "No se pudo comprobar la sesión.");

  const { data, error } = await supabase
    .from("reader_documents")
    .select("id, book_id, format, original_name, storage_path, mime_type, size_bytes, created_at, updated_at")
    .eq("book_id", cleanId)
    .order("updated_at", { ascending: false });

  if (error) throw schemaError(error);

  const documents = await Promise.all(
    (data || []).map(async (row) => {
      const path = cleanText(row.storage_path);
      if (!path) return normalizeDocument(row);

      const { data: signed, error: signedError } = await supabase.storage
        .from(READER_DOCUMENT_BUCKET)
        .createSignedUrl(path, READER_SIGNED_URL_SECONDS);

      return normalizeDocument(row, signedError ? "" : signed?.signedUrl || "");
    }),
  );

  return documents;
}

export async function uploadReaderDocument({ bookId, file }) {
  const cleanId = cleanBookId(bookId);
  const validation = validateReaderFile(file);
  if (!validation.valid) throw apiError(validation.error, 400);

  const context = await getReaderContext();
  const format = validation.format;
  const mimeType = readerMimeType(format);

  const { data: previous, error: previousError } = await supabase
    .from("reader_documents")
    .select("id, storage_path")
    .eq("book_id", cleanId)
    .eq("format", format)
    .maybeSingle();

  if (previousError) throw schemaError(previousError);

  const uniqueId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extension = format === "pdf" ? "pdf" : "epub";
  const storagePath = [
    context.authId,
    safeReaderPathSegment(cleanId),
    `${uniqueId}.${extension}`,
  ].join("/");

  const { error: uploadError } = await supabase.storage
    .from(READER_DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw apiError(uploadError.message || "No se pudo subir el documento.");
  }

  const { data: saved, error: saveError } = await supabase
    .from("reader_documents")
    .upsert(
      {
        owner_id: context.authId,
        book_id: cleanId,
        format,
        original_name: cleanText(file.name) || `lectura.${extension}`,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: Number(file.size || 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,book_id,format" },
    )
    .select("id, book_id, format, original_name, storage_path, mime_type, size_bytes, created_at, updated_at")
    .single();

  if (saveError) {
    await supabase.storage.from(READER_DOCUMENT_BUCKET).remove([storagePath]);
    throw schemaError(saveError);
  }

  const previousPath = cleanText(previous?.storage_path);
  if (previousPath && previousPath !== storagePath) {
    await supabase.storage.from(READER_DOCUMENT_BUCKET).remove([previousPath]);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(READER_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, READER_SIGNED_URL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    throw apiError("El documento se guardó, pero no se pudo abrir todavía.");
  }

  return normalizeDocument(saved, signed.signedUrl);
}

export async function deleteReaderDocument(document) {
  if (!document?.id) return;

  const { error: storageError } = await supabase.storage
    .from(READER_DOCUMENT_BUCKET)
    .remove([cleanText(document.storage_path)]);

  if (storageError) throw apiError(storageError.message || "No se pudo borrar el archivo.");

  const { error } = await supabase
    .from("reader_documents")
    .delete()
    .eq("id", document.id);

  if (error) throw schemaError(error);
}

export async function getReaderBookState(bookId) {
  const cleanId = cleanBookId(bookId);
  const [progressResult, annotationsResult] = await Promise.all([
    supabase
      .from("reader_book_progress")
      .select("owner_id, book_id, document_id, progress, locator, current_page, current_chapter, created_at, updated_at")
      .eq("book_id", cleanId)
      .maybeSingle(),
    supabase
      .from("reader_annotations")
      .select("id, book_id, document_id, kind, quote, note, locator, page, color, spoiler, shared_post_id, created_at, updated_at")
      .eq("book_id", cleanId)
      .order("created_at", { ascending: false }),
  ]);

  if (progressResult.error) throw schemaError(progressResult.error);
  if (annotationsResult.error) throw schemaError(annotationsResult.error);

  return {
    progress: progressResult.data
      ? {
          ...progressResult.data,
          progress: clampReaderProgress(progressResult.data.progress),
          locator: normalizeReaderLocator(progressResult.data.locator),
        }
      : null,
    annotations: (annotationsResult.data || []).map(normalizeAnnotation),
  };
}

export async function saveReaderBookProgress({
  bookId,
  documentId = null,
  progress,
  locator = {},
  currentPage = null,
  currentChapter = "",
}) {
  const cleanId = cleanBookId(bookId);
  const context = await getReaderContext();
  const cleanProgress = clampReaderProgress(progress);
  const safeLocator = normalizeReaderLocator(locator);

  const { data: saved, error } = await supabase
    .from("reader_book_progress")
    .upsert(
      {
        owner_id: context.authId,
        book_id: cleanId,
        document_id: documentId || null,
        progress: cleanProgress,
        locator: safeLocator,
        current_page: currentPage ? Math.max(1, Math.round(Number(currentPage))) : null,
        current_chapter: cleanText(currentChapter).slice(0, 240) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,book_id" },
    )
    .select("owner_id, book_id, document_id, progress, locator, current_page, current_chapter, created_at, updated_at")
    .single();

  if (error) throw schemaError(error);

  const libraryResult = await saveCatalogUserBookProgress({
    book_id: cleanId,
    progress: cleanProgress,
    progress_mode: "percentage",
  });

  return {
    progress: {
      ...saved,
      progress: cleanReaderProgress(saved.progress),
      locator: normalizeReaderLocator(saved.locator),
    },
    libraryItem: libraryResult?.item || null,
  };
}

function cleanReaderProgress(value) {
  return clampReaderProgress(value);
}

export async function createReaderAnnotation({
  bookId,
  documentId = null,
  kind = "postit",
  quote = "",
  note = "",
  locator = {},
  page = null,
  color = "yellow",
  spoiler = false,
  share = false,
}) {
  const cleanId = cleanBookId(bookId);
  const context = await getReaderContext();
  const cleanQuote = cleanText(quote).slice(0, 4000);
  const cleanNote = cleanText(note).slice(0, 1200);

  if (!cleanQuote && !cleanNote) {
    throw apiError("Añade una frase o una nota antes de guardar.", 400);
  }

  const { data: saved, error } = await supabase
    .from("reader_annotations")
    .insert({
      owner_id: context.authId,
      book_id: cleanId,
      document_id: documentId || null,
      kind: ["highlight", "note", "postit", "bookmark"].includes(kind) ? kind : "postit",
      quote: cleanQuote,
      note: cleanNote,
      locator: normalizeReaderLocator(locator),
      page: page ? Math.max(1, Math.round(Number(page))) : null,
      color: ["yellow", "pink", "blue", "green", "lilac"].includes(color) ? color : "yellow",
      spoiler: Boolean(spoiler),
    })
    .select("id, book_id, document_id, kind, quote, note, locator, page, color, spoiler, shared_post_id, created_at, updated_at")
    .single();

  if (error) throw schemaError(error);

  let annotation = normalizeAnnotation(saved);
  let shareError = "";

  if (share) {
    const shareBody = [
      cleanQuote ? `“${cleanQuote}”` : "",
      cleanNote,
    ].filter(Boolean).join("\n\n").slice(0, 1200);

    try {
      const post = await publishReaderPost({
        body: shareBody || "Compartió una anotación de lectura.",
        spoiler: Boolean(spoiler),
        bookId: cleanId,
      });

      const { data: shared, error: shareSaveError } = await supabase
        .from("reader_annotations")
        .update({ shared_post_id: post?.id || null })
        .eq("id", annotation.id)
        .select("id, book_id, document_id, kind, quote, note, locator, page, color, spoiler, shared_post_id, created_at, updated_at")
        .single();

      if (shareSaveError) {
        shareError = "La anotación se guardó, pero no se pudo enlazar la publicación.";
      } else {
        annotation = normalizeAnnotation(shared);
      }
    } catch (error) {
      shareError = error?.message || "La anotación se guardó, pero no se pudo compartir.";
    }
  }

  return { annotation, shareError };
}

export async function deleteReaderAnnotation(annotationId) {
  const id = cleanText(annotationId);
  if (!id) return;

  const { error } = await supabase
    .from("reader_annotations")
    .delete()
    .eq("id", id);

  if (error) throw schemaError(error);
}
