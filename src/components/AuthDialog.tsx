import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type AuthDialogProps = {
  initialMode: "signin" | "signup";
  onClose: () => void;
  onLichess: () => void;
  externalError?: string;
};

export function AuthDialog({ initialMode, onClose, onLichess, externalError }: AuthDialogProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!supabase) throw new Error("Account services are not configured yet.");
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
            data: displayName.trim() ? { display_name: displayName.trim() } : {}
          }
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          onClose();
        } else {
          setMessage("Account created. Check your email for a confirmation link before signing in.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (signInError) throw signInError;
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordReset = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your account email first.");
      return;
    }
    if (!supabase) {
      setError("Account services are not configured.");
      return;
    }
    setResetBusy(true);
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setMessage("If an account exists for that address, a password-reset link has been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a password reset.");
    } finally {
      setResetBusy(false);
    }
  };

  const changeMode = (nextMode: "signin" | "signup") => {
    setMode(nextMode);
    setMessage("");
    setError("");
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="auth-brand-mark">♞</div>
        <p className="auth-eyebrow">LAG-FREE ULTRABULLET</p>
        <h2 id="auth-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p className="auth-subtitle">
          {mode === "signup" ? "Join the board. Your player profile will be created automatically." : "Sign in to continue to your player profile."}
        </p>
        <button className="auth-lichess-button" type="button" onClick={onLichess} disabled={busy}>
          <span className="auth-lichess-mark">♞</span> Continue with Lichess
        </button>
        <div className="auth-provider-divider"><span>or use email</span></div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label className="auth-field">
              <span>Display name <small>Optional</small></span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How players will see you"
                maxLength={32}
                autoComplete="nickname"
              />
            </label>
          )}
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>
          {mode === "signin" && (
            <button className="auth-switch auth-reset-link" type="button" onClick={() => void requestPasswordReset()} disabled={resetBusy}>
              {resetBusy ? "Sending reset link…" : "Forgot password?"}
            </button>
          )}
          {(error || externalError) && <p className="auth-message auth-error" role="alert">{error || externalError}</p>}
          {message && <p className="auth-message auth-success" role="status">{message}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="auth-switch-row">
          {mode === "signup" ? "Already have an account?" : "New around here?"}
          <button type="button" className="auth-switch" onClick={() => changeMode(mode === "signup" ? "signin" : "signup")}>
            {mode === "signup" ? "Log in" : "Create an account"}
          </button>
        </p>
      </section>
    </div>
  );
}
