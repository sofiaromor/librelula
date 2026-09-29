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
    "El servicio de correo no está disponible ahora mismo. Inténtalo más tarde. Si el problema continúa, contacta con Librélula.",
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
    "Se ha alcanzado el límite de solicitudes. Espera unos minutos antes de pedir otro correo.",
  );
});

test("structured SMTP errors do not depend on provider message wording", () => {
  const result = friendlyAuthError({ code: "unexpected_failure", message: "Internal service error" }, "No se pudo enviar.");
  assert.match(result, /servicio de correo/);
  assert.doesNotMatch(result, /Brevo|IP|Internal/);
  assert.match(friendlyAuthError({ code: "unexpected_failure", message: "Error sending OTP email" }, "Error"), /servicio de correo/);
});

test("unknown provider errors never reveal operational messages", () => {
  assert.equal(
    friendlyAuthError({ code: "unrecognized", status: 500, message: "Internal configuration: sensitive-value" }, "No se pudo completar la solicitud."),
    "No se pudo completar la solicitud.",
  );
});

test("invalid email and password errors are not mistaken for expired codes", () => {
  assert.match(friendlyAuthError({ code: "email_address_invalid", message: "Invalid email" }, "Error"), /bien escrito/);
  assert.match(friendlyAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }, "Error"), /correo o la contraseña/);
  assert.match(friendlyAuthError({ code: "email_not_confirmed", message: "Unauthorized" }, "Error"), /todavía no está confirmado/);
});

test("a project rate limit does not blame the user for repeated requests", () => {
  const result = friendlyAuthError({ code: "over_email_send_rate_limit", status: 429 }, "Error");
  assert.match(result, /límite de solicitudes/);
  assert.doesNotMatch(result, /Has solicitado/);
});

test("local retry errors explain the remaining wait", () => {
  assert.match(friendlyAuthError({ code: "email_request_pending", retryAfter: 42 }, "Error"), /42 segundos/);
});
