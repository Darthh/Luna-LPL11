"use client";

import { useState } from "react";
import AuthModal from "./AuthModal";

// Stands in for a feature that needs an account. It explains what's behind the
// gate and opens the normal sign-up modal, carrying that explanation into the
// modal itself so the reason is still on screen while the form is filled in.
//
// `autoPrompt` opens the modal once on arrival - right for landing on
// /watchlist, where the whole page is the gated feature. Closing it leaves
// this panel, which can reopen it.
export default function AuthGate({ title, message, reason, autoPrompt = false, compact = false }) {
  // The gate only mounts once the session has resolved to signed-out, so
  // opening on mount is the same thing as opening on arrival.
  const [modalMode, setModalMode] = useState(autoPrompt ? "signup" : null);

  return (
    <div className={compact ? "auth-gate auth-gate-compact" : "auth-gate"}>
      <h2 className="auth-gate-title">{title}</h2>
      <p className="auth-gate-message">{message}</p>
      <div className="auth-gate-actions">
        <button
          type="button"
          className="auth-btn auth-btn-primary"
          onClick={() => setModalMode("signup")}
        >
          Create account
        </button>
        <button type="button" className="auth-btn" onClick={() => setModalMode("signin")}>
          Sign in
        </button>
      </div>
      {modalMode && (
        <AuthModal mode={modalMode} reason={reason} onClose={() => setModalMode(null)} />
      )}
    </div>
  );
}
