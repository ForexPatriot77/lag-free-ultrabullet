import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type EditableProfile = {
  username: string;
  display_name: string | null;
  bio?: string | null;
};

export function ProfileDialog({
  user,
  profile,
  onClose,
  onSaved,
  onLichess,
}: {
  user: User;
  profile: EditableProfile | null;
  onClose: () => void;
  onSaved: (profile: EditableProfile) => void;
  onLichess: () => void;
}) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(user.email ?? "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [lichessUsername, setLichessUsername] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from("lichess_accounts").select("lichess_username").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (active) setLichessUsername(data?.lichess_username ?? null); });
    return () => { active = false; };
  }, [user.id]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError("Username must be 3–20 characters using lowercase letters, numbers, or underscores.");
      setSaving(false);
      return;
    }
    try {
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          username: cleanUsername,
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select("username, display_name, bio")
        .single();
      if (updateError) throw updateError;
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const updateEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || nextEmail === (user.email ?? "").toLowerCase()) {
      setEmailError("Enter a different email address.");
      setEmailMessage("");
      return;
    }
    setEmailSaving(true);
    setEmailError("");
    setEmailMessage("");
    try {
      const { error: updateError } = await supabase.auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL }
      );
      if (updateError) throw updateError;
      setEmailMessage("Confirmation requested. Check your new email inbox and follow the confirmation link to finish changing your address.");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Could not request the email change.");
    } finally {
      setEmailSaving(false);
    }
  };

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="auth-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="auth-brand-mark">♞</div>
        <p className="auth-eyebrow">PLAYER SETTINGS</p>
        <h2 id="profile-title">Your profile</h2>
        <p className="auth-subtitle">Choose how other players see you.</p>
        <form onSubmit={save}>
          <label className="auth-field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} autoComplete="username" required />
            <small>3–20 characters · a–z, 0–9, underscore</small>
          </label>
          <label className="auth-field">
            <span>Display name <small>optional</small></span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} placeholder="How your name appears" />
          </label>
          <label className="auth-field">
            <span>Bio <small>optional</small></span>
            <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} rows={3} placeholder="A little about your chess…" />
          </label>
          {error && <p className="auth-message auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
        </form>
        <div className="profile-email-section">
          <p className="auth-eyebrow">CHESS ACCOUNT</p>
          <h3>Lichess connection</h3>
          <p className="auth-subtitle">{lichessUsername ? `Connected as ${lichessUsername}` : "Connect your Lichess account to sign in with it and import your Bullet and Ultrabullet starting ratings."}</p>
          <button className="auth-lichess-button" type="button" onClick={onLichess}>
            <span className="auth-lichess-mark">♞</span>
            {lichessUsername ? "Reconnect Lichess" : "Connect Lichess"}
          </button>
        </div>
        <div className="profile-email-section">
          <p className="auth-eyebrow">ACCOUNT SECURITY</p>
          <h3>Change email address</h3>
          <p className="auth-subtitle">Current email: {user.email ?? "Unavailable"}</p>
          <form onSubmit={updateEmail}>
            <label className="auth-field">
              <span>New email address</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
            </label>
            {emailError && <p className="auth-message auth-error" role="alert">{emailError}</p>}
            {emailMessage && <p className="auth-message auth-success" role="status">{emailMessage}</p>}
            <button className="auth-submit" type="submit" disabled={emailSaving}>{emailSaving ? "Requesting…" : "Change email"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
