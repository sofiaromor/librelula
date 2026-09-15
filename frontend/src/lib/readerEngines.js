let epubPromise = null;
let pdfPromise = null;

export function loadEpub() {
  if (!epubPromise) {
    epubPromise = import("epubjs")
      .then(({ default: ePub }) => ePub)
      .catch((error) => {
        epubPromise = null;
        throw error;
      });
  }

  return epubPromise;
}

export function loadPdf() {
  if (!pdfPromise) {
    pdfPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
      .then(([pdf, worker]) => {
        pdf.GlobalWorkerOptions.workerSrc = worker.default;
        return pdf;
      })
      .catch((error) => {
        pdfPromise = null;
        throw error;
      });
  }

  return pdfPromise;
}
