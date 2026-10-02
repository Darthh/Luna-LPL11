"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, getProviders } from "next-auth/react";
import Script from "next/script";

const TURNSTILE_SITE_KEY = "0x4AAAAAAEpjl73Tttic0_bm";

// Auth.js ships no sign-in/sign-up UI of its own (unlike Clerk), so this
// modal owns the whole flow: it renders a Google button only if that
// provider is actually configured (discovered via the /api/auth/providers
// endpoint, since AUTH_GOOGLE_ID/SECRET are server-only and can't be read
// from a NEXT_PUBLIC_ var here), and drives email/password against our
// own /api/auth/register route plus next-auth's credentials sign-in.
// `reason` is shown above the form when the modal was opened by a feature that
// needs an account (the watchlist), so it's clear what signing up unlocks.
export default function AuthModal({ mode: initialMode, reason, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    getProviders().then((providers) => setGoogleEnabled(Boolean(providers?.google)));
  }, []);

  // Turnstile's script scans the DOM for .cf-turnstile once, at load. This
  // modal mounts long after that and remounts as the user toggles signup /
  // signin, so the widget is rendered explicitly against our own container
  // instead.
  useEffect(() => {
    if (mode !== "signup" || !turnstileReady || !turnstileRef.current) return;
    if (widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      callback: setTurnstileToken,
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => setTurnstileToken(""),
    });
    return () => {
      if (widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      setTurnstileToken("");
    };
  }, [mode, turnstileReady]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, turnstileToken }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Could not create account.");
          // A token is single-use, so a failed attempt needs a fresh challenge.
          if (widgetIdRef.current !== null) window.turnstile.reset(widgetIdRef.current);
          setTurnstileToken("");
          return;
        }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(mode === "signup" ? "Account created, but sign-in failed. Try signing in." : "Incorrect email or password.");
        return;
      }
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setTurnstileReady(true)}
      />
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{mode === "signup" ? "Create your account" : "Sign in"}</h2>
        <p className="auth-modal-sub">
          {mode === "signup" ? "Get a higher API quota and save your preferences." : "Welcome back."}
        </p>
        {reason && <p className="auth-modal-reason">{reason}</p>}

        {googleEnabled && (
          <>
            <button
              type="button"
              className="auth-google-btn"
              onClick={() => signIn("google")}
            >
              <GoogleIcon /> Continue with Google
            </button>
            <div className="auth-modal-divider">
              <span>or</span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <label>
              Name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          {mode === "signup" && <div className="auth-turnstile" ref={turnstileRef} />}
          {error && <div className="auth-form-error">{error}</div>}
          <button type="submit" className="auth-btn auth-btn-primary auth-submit" disabled={busy || (mode === "signup" && !turnstileToken)}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="auth-modal-switch">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("signin")}>
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button type="button" onClick={() => setMode("signup")}>
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.34C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
