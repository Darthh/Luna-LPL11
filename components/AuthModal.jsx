"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, getProviders } from "next-auth/react";
import Script from "next/script";
import "./AuthModal.css";

// Turnstile is optional. A site key only works on the hostnames it was
// created for in the Cloudflare dashboard; the old hardcoded key belonged to
// the Cloudflare-era domain, so on the CloudFront URL the widget errored, no
// token arrived and "Create account" stayed disabled. Without a key there is
// no widget and the server skips the check too (app/api/auth/register).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

// Auth.js ships no sign-in/sign-up UI of its own (unlike Clerk), so this
// modal discovers available Google/Apple providers through /api/auth/providers.
// Unconfigured providers stay disabled; email/password goes through our
// own /api/auth/register route plus next-auth's credentials sign-in.
// `reason` is shown above the form when the modal was opened by a feature that
// needs an account (the watchlist), so it's clear what signing up unlocks.
export default function AuthModal({ mode: initialMode, reason, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [providers, setProviders] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    let active = true;
    getProviders().then((available) => { if (active) setProviders(available || {}); })
      .catch(() => { if (active) setProviders({}); });
    return () => { active = false; };
  }, []);

  // Turnstile's script scans the DOM for .cf-turnstile once, at load. This
  // modal mounts long after that and remounts as the user toggles signup /
  // signin, so the widget is rendered explicitly against our own container
  // instead.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || mode !== "signup" || !turnstileReady || !turnstileRef.current) return;
    if (widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      callback: setTurnstileToken,
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => {
        setTurnstileToken("");
        setError("The bot check could not load. Reload the page and try again.");
      },
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

  async function handleSocialSignIn(provider) {
    if (busy || !providers?.[provider]) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(provider, { redirectTo: window.location.href });
    } catch {
      setError("Could not start sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, turnstileToken }),
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
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onReady={() => setTurnstileReady(true)}
        />
      )}
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{mode === "signup" ? "Create your account" : "Sign in"}</h2>
        {reason && <p className="auth-modal-reason">{reason}</p>}

        <form onSubmit={handleSubmit} className="auth-form">
          <strong className="auth-welcome">Welcome back</strong>
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
          {mode === "signup" && TURNSTILE_SITE_KEY && <div className="auth-turnstile" ref={turnstileRef} />}
          {error && <div className="auth-form-error">{error}</div>}
          <button type="submit" className="auth-btn auth-btn-primary auth-submit" disabled={busy || (mode === "signup" && TURNSTILE_SITE_KEY && !turnstileToken)}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="auth-modal-divider"><span>or</span></div>
        <div className="auth-social-options">
          {[{ id: "google", name: "Google", Icon: GoogleIcon }, { id: "apple", name: "Apple", Icon: AppleIcon }].map(({ id, name, Icon }) => (
            <button
              key={id}
              type="button"
              className="auth-google-btn"
              disabled={busy || !providers?.[id]}
              title={!providers ? "Checking availability" : !providers[id] ? `${name} sign-in is currently unavailable` : undefined}
              onClick={() => handleSocialSignIn(id)}
            >
              <Icon /> Sign in with {name}
            </button>
          ))}
        </div>

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

function AppleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c.03 3.2 2.81 4.26 2.84 4.28-.02.08-.44 1.52-1.46 3.01-.88 1.28-1.79 2.56-3.23 2.59-1.41.03-1.87-.84-3.48-.84s-2.11.81-3.45.87c-1.39.05-2.45-1.39-3.34-2.66-1.81-2.61-3.19-7.37-1.33-10.59.92-1.6 2.57-2.61 4.36-2.64 1.36-.03 2.65.92 3.48.92.83 0 2.38-1.14 4.01-.98.68.03 2.61.27 3.85 2.08-.1.06-2.3 1.34-2.25 3.96ZM14.42 4.74c.74-.9 1.23-2.15 1.09-3.39-1.07.04-2.37.71-3.14 1.61-.69.8-1.29 2.08-1.13 3.3 1.19.09 2.41-.61 3.18-1.52Z" /></svg>;
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
