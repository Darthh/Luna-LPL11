"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import ProfileSettings from "./ProfileSettings";
import { FONT_OPTIONS, PATTERNS, THEME_GROUPS, WEIGHTS } from "@/lib/appearance";

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

// One row of the Appearance section: a label and the dropdown that sets it.
function AppearanceRow({ label, value, options, onChange }) {
  return (
    <div className="opt">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SettingsMenu({ appearance, onAppearanceChange }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        type="button"
        className="theme-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
      >
        <GearIcon />
        <span className="theme-toggle-label">Settings</span>
      </button>
      {open && (
        <div className="settings-panel">
          <ProfileSettings />
          <h3>Appearance</h3>
          {/* Nineteen palettes is too many for one flat list, so they're
              grouped by how light or loud they are. */}
          <div className="opt">
            <span>Theme</span>
            <select
              value={appearance.theme}
              onChange={(e) => onAppearanceChange("theme", e.target.value)}
              aria-label="Theme"
            >
              {THEME_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.themes.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <AppearanceRow
            label="Background"
            value={appearance.pattern}
            options={PATTERNS}
            onChange={(v) => onAppearanceChange("pattern", v)}
          />
          <AppearanceRow
            label="Font"
            value={appearance.font}
            options={FONT_OPTIONS}
            onChange={(v) => onAppearanceChange("font", v)}
          />
          <AppearanceRow
            label="Text weight"
            value={appearance.weight}
            options={WEIGHTS}
            onChange={(v) => onAppearanceChange("weight", v)}
          />
          {/* Alerts belong to an account, so the row only appears for one.
              It leaves the menu for a page rather than nesting a list inside
              a dropdown that is already several controls deep. */}
          {session?.user && (
            <Link className="settings-row" href="/alerts" onClick={() => setOpen(false)}>
              <BellIcon />
              Your alerts
            </Link>
          )}
          {/* Last item in the menu, and the only destructive one, so it sits
              below a rule rather than in the run of settings. */}
          {session?.user && (
            <button
              type="button"
              className="settings-row settings-signout"
              onClick={() => signOut()}
            >
              <SignOutIcon />
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
