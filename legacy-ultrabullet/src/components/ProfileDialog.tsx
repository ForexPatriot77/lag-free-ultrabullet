import { useState, type FormEvent } from "react";
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
}: {
  user: User;
  profile: EditableProfile | null;
  onClose: () => void;
  onSaved: (profile: EditableProfile) => void;
}) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      </section>
    </div>
  );
}
