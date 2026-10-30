import { useState } from "react";
import { db } from "../api.ts";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("invalid")
          ? "That email and password don't match. Check both and try again."
          : error.message,
      );
    }
  };

  return (
    <main className="app login">
      <div className="brand">
        <span className="brand-chip" aria-hidden="true" />
        <span>Folat Place</span>
      </div>

      <section className="hero-card login-card">
        <p className="eyebrow">December food savings</p>
        <p className="login-line">Every naira your customers put aside, in one place.</p>
        <div className="hero-foot">
          <span className="card-chip" aria-hidden="true" />
          <span className="card-mark">FOLAT · SAVINGS</span>
        </div>
      </section>

      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
