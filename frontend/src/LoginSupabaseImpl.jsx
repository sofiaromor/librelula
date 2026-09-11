import { useState } from "react";
import { publicUrl } from "./api.js";
import {
  getAuthRedirectUrl,
  requestPasswordRecovery,
  requestSignInCode,
  resendSignupConfirmation,
  signInSupabase,
  signUpSupabase,
  verifyPasswordRecoveryCode,
  verifySignInCode,
  verifySignupCode,
} from "./lib/session.js";
import { friendlyAuthError } from "./lib/authErrors.js";
import "./LoginSupabase.css";

const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

function goHomeAfterAuth() {
  window.setTimeout(() => {
    const homeButton = [...document.querySelectorAll(".site-nav-links button")].find(
      (button) => button.textContent?.trim() === "Inicio",
    );
    homeButton?.click();
  }, 0);
}

function getRecoveryRedirectUrl() {
  const url = new URL(getAuthRedirectUrl());
  url.searchParams.set("auth", "recovery");
  return url.toString();
}

const CODE_PURPOSE_COPY = {
  signup: {
    label: "Código de confirmación",
    resend: "Reenviar correo de verificación",
    resendSuccess: "Hemos solicitado un nuevo correo de verificación. Revisa tu bandeja de entrada y spam.",
  },
  login: {
    label: "Código para entrar",
    resend: "Reenviar código de acceso",
    resendSuccess: "Hemos enviado un código nuevo para entrar. Revisa tu bandeja de entrada y spam.",
  },
  recovery: {
    label: "Código de recuperación",
    resend: "Reenviar código de recuperación",
    resendSuccess: "Hemos solicitado un correo nuevo de recuperación. Revisa tu bandeja de entrada y spam.",
  },
};

export default function LoginSupabase({ onLoginSuccess, onOpenCatalog }) {
  const [activePanel, setActivePanel] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [loginMethod, setLoginMethod] = useState("password");
  const [pendingCodePurpose, setPendingCodePurpose] = useState("");
  const [pendingCodeEmail, setPendingCodeEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function switchPanel(panel) {
    setActivePanel(panel);
    setPendingCodePurpose("");
    setPendingCodeEmail("");
    setVerificationCode("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function startCodeVerification(purpose, address) {
    setPendingCodePurpose(purpose);
    setPendingCodeEmail(address);
    setVerificationCode("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const session = await signInSupabase({
        email: email.trim(),
        password,
      });

      onLoginSuccess?.(session);
      goHomeAfterAuth();
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No se pudo iniciar sesión. Revisa el email y la contraseña.",
          { hasSupabaseConfig },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setPendingCodePurpose("");
    setPendingCodeEmail("");

    try {
      const session = await signUpSupabase({
        email: email.trim(),
        password,
        username: signupUsername.trim(),
      });

      if (session?.needsEmailConfirmation) {
        startCodeVerification("signup", session.email || email.trim().toLowerCase());
        setSuccessMessage(
          "Tu cuenta está pendiente de confirmar. Revisa tu correo: puedes pulsar el enlace o introducir el código de seis cifras aquí. Si no recibes el mensaje, puedes reenviarlo desde aquí.",
        );
        setActivePanel("login");
        return;
      }

      onLoginSuccess?.(session);
      goHomeAfterAuth();
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No se pudo crear la cuenta. Revisa los datos e inténtalo otra vez.",
          { hasSupabaseConfig },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestSignInCode(event) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Escribe el correo electrónico de tu cuenta.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await requestSignInCode(cleanEmail);
      startCodeVerification("login", cleanEmail);
      setSuccessMessage(
        "Te hemos enviado un código de seis cifras para entrar sin contraseña. Revisa tu correo y la carpeta de spam.",
      );
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No pudimos enviar el código de acceso. Inténtalo de nuevo en unos minutos.",
          { hasSupabaseConfig },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    try {
      const codeEmail = pendingCodeEmail || email;
      let session;

      if (pendingCodePurpose === "signup") {
        session = await verifySignupCode(codeEmail, verificationCode);
      } else if (pendingCodePurpose === "login") {
        session = await verifySignInCode(codeEmail, verificationCode);
      } else if (pendingCodePurpose === "recovery") {
        session = await verifyPasswordRecoveryCode(codeEmail, verificationCode);
        if (!session) {
          throw new Error("No se pudo iniciar la recuperación con ese código.");
        }
        window.location.assign(getRecoveryRedirectUrl());
        return;
      } else {
        throw new Error("Solicita primero un código de verificación.");
      }

      if (!session) {
        throw new Error("No se pudo completar el acceso con ese código.");
      }

      onLoginSuccess?.(session);
      goHomeAfterAuth();
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "El código no es válido o ya ha caducado. Solicita un código nuevo e inténtalo otra vez.",
          { hasSupabaseConfig },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode(event) {
    event.preventDefault();
    const codeEmail = pendingCodeEmail || email.trim().toLowerCase();

    if (!codeEmail) {
      setErrorMessage("Escribe el correo electrónico de tu cuenta.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      if (pendingCodePurpose === "signup") {
        await resendSignupConfirmation(codeEmail);
      } else if (pendingCodePurpose === "login") {
        await requestSignInCode(codeEmail);
      } else if (pendingCodePurpose === "recovery") {
        await requestPasswordRecovery(codeEmail);
      } else {
        throw new Error("Solicita primero un código de verificación.");
      }

      setSuccessMessage(CODE_PURPOSE_COPY[pendingCodePurpose]?.resendSuccess || "Hemos enviado un correo nuevo.");
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No pudimos reenviar el código. Inténtalo de nuevo en unos minutos.",
          { hasSupabaseConfig },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Escribe el correo electrónico de tu cuenta.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await requestPasswordRecovery(cleanEmail);
      startCodeVerification("recovery", cleanEmail);

      setSuccessMessage(
        "Si existe una cuenta con ese correo, recibirás un enlace y un código de seis cifras para cambiar tu contraseña. Revisa también spam y correo no deseado.",
      );
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No pudimos enviar el correo de recuperación. Inténtalo de nuevo en unos minutos.",
          { hasSupabaseConfig },
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCodeCopy = CODE_PURPOSE_COPY[pendingCodePurpose] || CODE_PURPOSE_COPY.signup;

  return (
    <main className="login-supabase-page">
      <div className="lg-wrap">
        <div className="lg-left">
          <img
            src={publicUrl("images/fondo.png")}
            alt="Librería acogedora"
            className="lg-image"
          />
          <div className="lg-overlay" />
          <div className="lg-brand">
            <div className="lg-brand-title">Librélula</div>
            <div className="lg-brand-sub">Lectura · Historias · Imaginación</div>
          </div>
        </div>

        <div className="lg-right">
          <button
            type="button"
            className="lg-back"
            onClick={onOpenCatalog}
          >
            ← Volver al catálogo
          </button>

          <div className="lg-tabs" aria-label="Acceso a Librélula">
            <button
              type="button"
              className={`lg-tab${activePanel === "login" ? " active" : ""}`}
              onClick={() => switchPanel("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`lg-tab${activePanel === "signup" ? " active" : ""}`}
              onClick={() => switchPanel("signup")}
            >
              Registrarse
            </button>
          </div>

          {errorMessage && (
            <div className="lg-error">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="lg-note">
              <p>{successMessage}</p>
              {pendingCodeEmail && (
                <>
                  <form onSubmit={handleVerifyCode} className="lg-code-form">
                    <label htmlFor="verification-code">{pendingCodeCopy.label}</label>
                    <div className="lg-code-row">
                      <input
                        id="verification-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                      <button type="submit" disabled={submitting || verificationCode.length !== 6}>
                        {submitting ? "Comprobando…" : "Verificar"}
                      </button>
                    </div>
                  </form>
                  <p>
                    <a href="#" onClick={handleResendCode}>
                      {submitting ? "Reenviando…" : pendingCodeCopy.resend}
                    </a>
                  </p>
                </>
              )}
            </div>
          )}

          <section className={`lg-panel${activePanel === "login" ? " active" : ""}`}>
            <div className="lg-title">
              Bienvenida de <em>vuelta</em>
            </div>
            <div className="lg-sub">Tu rincón literario te espera</div>

            <div className="lg-auth-methods" aria-label="Método de acceso">
              <button
                type="button"
                className={`lg-auth-method${loginMethod === "password" ? " active" : ""}`}
                aria-pressed={loginMethod === "password"}
                onClick={() => setLoginMethod("password")}
              >
                Contraseña
              </button>
              <button
                type="button"
                className={`lg-auth-method${loginMethod === "code" ? " active" : ""}`}
                aria-pressed={loginMethod === "code"}
                onClick={() => setLoginMethod("code")}
              >
                Código por email
              </button>
            </div>

            {loginMethod === "password" ? (
              <form onSubmit={handleSubmit}>
                <div className="lg-fields">
                  <div className="lg-field">
                    <label htmlFor="login-email">Correo electrónico</label>
                    <input
                      type="email"
                      id="login-email"
                      name="email"
                      placeholder="tu@correo.com"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  <div className="lg-field">
                    <label htmlFor="login-pass">Contraseña</label>
                    <input
                      type="password"
                      id="login-pass"
                      name="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                </div>

                <div className="lg-check">
                  <input type="checkbox" id="remember" />
                  <label htmlFor="remember">
                    Recordarme ·{" "}
                    <a
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        switchPanel("forgot");
                      }}
                    >
                      ¿Olvidaste tu contraseña?
                    </a>
                  </label>
                </div>

                <button type="submit" className="lg-btn" disabled={submitting}>
                  {submitting ? "Entrando…" : "Entrar a mi rincón"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRequestSignInCode}>
                <div className="lg-fields">
                  <div className="lg-field">
                    <label htmlFor="login-code-email">Correo electrónico</label>
                    <input
                      type="email"
                      id="login-code-email"
                      name="email-code"
                      placeholder="tu@correo.com"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </div>

                <p className="lg-helper-text">
                  Te enviaremos un código de seis cifras. No necesitas recordar la contraseña.
                </p>

                <button type="submit" className="lg-btn" disabled={submitting}>
                  {submitting ? "Enviando…" : "Enviar código al correo"}
                </button>
              </form>
            )}

            <div className="lg-switch">
              ¿No tienes cuenta?{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  switchPanel("signup");
                }}
              >
                Regístrate
              </a>
            </div>
          </section>

          <section className={`lg-panel${activePanel === "signup" ? " active" : ""}`}>
            <div className="lg-title">
              Únete a <em>Librélula</em>
            </div>
            <div className="lg-sub">Empieza tu aventura literaria hoy</div>

            <form onSubmit={handleSignupSubmit}>
              <div className="lg-fields">
                <div className="lg-field">
                  <label htmlFor="signup-username">Nombre de usuario</label>
                  <input
                    type="text"
                    id="signup-username"
                    name="username"
                    placeholder="tu_nombre"
                    autoComplete="username"
                    required
                    value={signupUsername}
                    onChange={(event) => setSignupUsername(event.target.value)}
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="signup-email">Correo electrónico</label>
                  <input
                    type="email"
                    id="signup-email"
                    name="email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="signup-pass">Contraseña</label>
                  <input
                    type="password"
                    id="signup-pass"
                    name="password"
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="lg-btn" disabled={submitting}>
                {submitting ? "Creando cuenta…" : "Crear mi cuenta"}
              </button>
            </form>

            <div className="lg-switch">
              ¿Ya tienes cuenta?{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  switchPanel("login");
                }}
              >
                Inicia sesión
              </a>
            </div>
          </section>

          <section className={`lg-panel${activePanel === "forgot" ? " active" : ""}`}>
            <div className="lg-title">
              Recupera tu <em>contraseña</em>
            </div>
            <div className="lg-sub">
              Te enviaremos un enlace y un código de seis cifras para elegir una contraseña nueva.
            </div>

            <form onSubmit={handleForgotPassword}>
              <div className="lg-fields">
                <div className="lg-field">
                  <label htmlFor="recovery-email">Correo electrónico</label>
                  <input
                    type="email"
                    id="recovery-email"
                    name="recovery-email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="lg-btn" disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar enlace y código"}
              </button>
            </form>

            <div className="lg-switch">
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  switchPanel("login");
                }}
              >
                Volver a iniciar sesión
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
