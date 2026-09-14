function readableText(value) {
  if (typeof value === "string") return value.trim();
  if (value instanceof Error) return value.message.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function friendlyAuthError(error, fallback, { hasSupabaseConfig = true } = {}) {
  const messageCandidates = [
    error?.message,
    error?.error_description,
    error?.description,
    error?.details,
    error?.hint,
    error?.name,
  ];
  const message = messageCandidates.map(readableText).find(Boolean) || "";
  const code = readableText(error?.code);

  if (code === "email_request_pending") {
    return error?.retryAfter > 0
      ? `Espera ${error.retryAfter} segundos antes de solicitar otro correo.`
      : "Ya estamos solicitando tu correo. Espera a que termine el envío.";
  }

  if (/failed to fetch|fetch failed|networkerror/i.test(message)) {
    return hasSupabaseConfig
      ? "No pudimos conectar con Librélula. Comprueba tu conexión e inténtalo de nuevo en unos segundos."
      : "Este preview no ha recibido la configuración de Supabase. Necesita un nuevo despliegue de Preview con las variables habilitadas.";
  }

  if (/rate_limit/.test(code) || error?.status === 429 || /too many|rate limit|rate_limit|only request this after/i.test(message)) {
    return "Se ha alcanzado el límite de solicitudes. Espera unos minutos antes de pedir otro correo.";
  }

  if (code === "email_not_confirmed" || /email not confirmed|not confirmed|email_not_confirmed/i.test(message)) {
    return "Tu correo todavía no está confirmado. Revisa el mensaje de verificación y usa su código o enlace.";
  }

  if (code === "invalid_credentials" || /invalid login credentials|invalid credentials|user not found|email not found/i.test(message)) {
    return "El correo o la contraseña no son correctos. Revisa los datos o recupera tu contraseña.";
  }

  if (code === "email_address_invalid" || /invalid email|email address.*invalid/i.test(message)) {
    return "Comprueba que el correo electrónico esté bien escrito.";
  }

  if (code === "same_password") {
    return "Elige una contraseña diferente de la anterior.";
  }

  if (code === "weak_password" || /weak password|password.*at least/i.test(message)) {
    return "La contraseña no cumple los requisitos. Usa al menos 6 caracteres.";
  }

  if (["unexpected_failure", "email_address_not_authorized"].includes(code) || /smtp|sending.*(?:email|mail)|provider|not authorized/i.test(message)) {
    return "El servicio de correo no está disponible ahora mismo. Inténtalo más tarde. Si el problema continúa, contacta con Librélula.";
  }

  if (code === "otp_expired" || /expired|invalid.*(?:token|code|link)|otp|verification code|caducado/i.test(message)) {
    return "El código o enlace no es válido o ya ha caducado. Solicita un correo nuevo e inténtalo otra vez.";
  }

  // Validation errors created by Librélula are safe to show. Provider errors may
  // contain operational details and must remain in the provider's logs.
  return error instanceof Error && !code && !error.status && !/^Auth/.test(error.name)
    ? message || fallback
    : fallback;
}
