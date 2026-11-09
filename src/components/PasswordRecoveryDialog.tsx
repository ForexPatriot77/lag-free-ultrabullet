import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function PasswordRecoveryDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Your password has been updated.");
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay" role="presentation">
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="password-recovery-title">
        <div className="auth-brand-mark">♞</div>
        <p className="auth-eyebrow">ACCOUNT SECURITY</p>
        <h2 id="password-recovery-title">Choose a new password</h2>
        <p className="auth-subtitle">Your recovery link has been verified. Set a new password for your Lag-Free account.</p>
        <form onSubmit={submit}>
          <label className="auth-field">
            <span>New password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          <label className="auth-field">
            <span>Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          {error && <p className="auth-message auth-error" role="alert">{error}</p>}
          {message && <p className="auth-message auth-success" role="status">{message}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
        </form>
        {message && <button className="auth-switch" type="button" onClick={onClose}>Continue</button>}
      </section>
    </div>
  );
}
