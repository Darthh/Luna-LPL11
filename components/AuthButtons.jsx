"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import AuthModal from "./AuthModal";
import styles from "./AuthButtons.module.css";

// Sign in / sign up / account controls for the site header.
export default function AuthButtons() {
  const { data: session, status } = useSession();
  const [modalMode, setModalMode] = useState(null); // null | "signin" | "signup"
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickAway(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [menuOpen]);

  if (status === "loading") return null;

  if (session?.user) {
    const label = session.user.name || session.user.email || "Account";
    const initial = label.charAt(0).toUpperCase();
    return (
      <div className="auth-buttons" ref={menuRef}>
        <button className={styles.account} onClick={() => setMenuOpen((v) => !v)} aria-label={`Account menu for ${label}`} aria-expanded={menuOpen}>
          <span className="auth-avatar" aria-hidden="true">
            {session.user.image ? <img src={session.user.image} alt="" /> : initial}
          </span>
          <span className={styles.name} title={label}>{label}</span>
        </button>
        {menuOpen && (
          <div className="auth-menu">
            <div className="auth-menu-email">{label}</div>
            <button className="auth-menu-item" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="auth-buttons">
      <button className="auth-btn" onClick={() => setModalMode("signin")}>
        Sign in
      </button>
      <button className="auth-btn auth-btn-primary" onClick={() => setModalMode("signup")}>
        Sign up
      </button>
      {modalMode && <AuthModal mode={modalMode} onClose={() => setModalMode(null)} />}
    </div>
  );
}
