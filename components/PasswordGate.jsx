"use client";

import { useEffect, useState } from "react";

// Wraps a private page. Nothing of the page renders until /api/gate says the
// session cookie is set - and the data those pages need is checked server-side
// in its own route as well, so a hidden panel is not the only lock.
export default function PasswordGate({ title, children }) {
  const [open, setOpen] = useState(null); // null = still asking
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/gate")
      .then((r) => r.json())
      .then((j) => setOpen(!!j.ok))
      .catch(() => setOpen(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return setOpen(true);
    setError("That password isn't right.");
    setPassword("");
  }

  if (open === null) return null;
  if (open) return children;

  return (
    <div className="gate-page">
      <div className="auth-gate">
        <h2 className="auth-gate-title">{title}</h2>
        <p className="auth-gate-message">
          This section is private. Enter the password to continue.
        </p>
        <form className="gate-form" onSubmit={submit}>
          <input
            type="password"
            className="gate-input"
            value={password}
            autoFocus
            placeholder="Password"
            aria-label="Password"
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="auth-btn auth-btn-primary" disabled={!password}>
            Unlock
          </button>
        </form>
        {error && <p className="gate-error">{error}</p>}
      </div>
    </div>
  );
}
