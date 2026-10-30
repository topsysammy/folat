import { useState } from "react";
import { db } from "../api.ts";
import { Icon } from "../ui.tsx";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
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
        <span className="avatar" style={{ background: "#f3e8cf", width: 44, height: 44, borderRadius: 13 }} aria-hidden="true">FP</span>
        <span>
          <b>Folat Place</b>
          <small>December food savings</small>
        </span>
      </div>

      <div className="login-head">
        <h1>Welcome back</h1>
        <p>Sign in to see every naira your customers have put aside.</p>
      </div>

      <section className="login-card starry">
        <p className="eyebrow">Folat · Savings</p>
        <p className="login-line">Every naira your customers put aside, in one place.</p>
        <p className="login-foot"><span className="card-chip" aria-hidden="true" /> Saving towards the December distribution</p>
      </section>

      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <span className="input-icon">
            <Icon name="mail" size={18} />
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span>Password</span>
          <span className="input-icon">
            <Icon name="lock" size={18} />
            <input type={show ? "text" : "password"} autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 50 }} />
            <button type="button" className="icon-btn icon-btn-plain pw-eye" onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}>
              <Icon name={show ? "eyeOff" : "eye"} size={18} />
            </button>
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="login-note">Only the Folat Place account can sign in.</p>
    </main>
  );
}
