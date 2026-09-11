import test from "node:test";
import assert from "node:assert/strict";

import { friendlyAuthError } from "../src/lib/authErrors.js";

test("auth errors fall back to a readable message for empty objects", () => {
  assert.equal(
    friendlyAuthError({}, "No pudimos enviar el correo."),
    "No pudimos enviar el correo.",
  );
});

test("auth errors explain SMTP delivery failures without exposing raw provider output", () => {
  assert.equal(
    friendlyAuthError(
      { message: "unexpected_failure: Error sending recovery email via SMTP provider" },
      "No pudimos enviar el correo.",
    ),
    "No pudimos enviar el correo ahora mismo. Revisa que Brevo tenga autorizada la IP nueva y vuelve a intentarlo en unos minutos.",
  );
});

test("auth errors keep the existing network troubleshooting copy", () => {
  assert.equal(
    friendlyAuthError(new Error("Failed to fetch"), "No se pudo iniciar sesión.", {
      hasSupabaseConfig: false,
    }),
    "Este preview no ha recibido la configuración de Supabase. Necesita un nuevo despliegue de Preview con las variables habilitadas.",
  );
});

test("auth errors explain expired verification links in Spanish", () => {
  assert.equal(
    friendlyAuthError(
      { message: "Email link is invalid or has expired" },
      "No pudimos validar el enlace.",
    ),
    "El código o enlace no es válido o ya ha caducado. Solicita un correo nuevo e inténtalo otra vez.",
  );
});

test("auth errors explain verification rate limits without blaming email delivery", () => {
  assert.equal(
    friendlyAuthError(
      { message: "Too many requests: email rate limit exceeded" },
      "No pudimos enviar el código.",
    ),
    "Has solicitado varios códigos seguidos. Espera unos minutos antes de pedir otro e inténtalo de nuevo.",
  );
});
