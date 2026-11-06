import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import "./Auth.css";

export function Account() {
  const { user, token, loading, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [isArtist, setIsArtist] = useState(user?.isArtist ?? false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="container auth"><p className="muted">Loading…</p></div>;
  if (!user || !token) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { user: next } = await api.updateMe(token!, {
        displayName,
        bio: bio || null,
        isArtist,
      });
      setUser(next);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth container">
      <form className="auth-panel" onSubmit={onSubmit}>
        <h1>Your account</h1>
        <p className="muted">{user.email}</p>
        {error && <p className="error-banner">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short note about your practice…"
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={isArtist}
              onChange={(e) => setIsArtist(e.target.checked)}
            />
            <span>Artist mode — create and manage listings</span>
          </label>
        </div>
        <button className="btn btn-accent" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        {isArtist && (
          <p className="auth-switch">
            <Link to="/studio">Open your studio →</Link>
          </p>
        )}
      </form>
    </div>
  );
}
