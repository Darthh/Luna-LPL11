"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import UserAvatar from "./UserAvatar";

const AVATAR_SIZE = 128;

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

// The account half of the settings menu: who you're signed in as, and the two
// things you can change about it. Each is an action rather than a form that is
// always open - the menu is a menu.
export default function ProfileSettings() {
  const { data: session, update } = useSession();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCreatedAt(d?.user?.createdAt ?? null))
      .catch(() => {});
  }, []);

  if (!session?.user) return null;

  async function save(payload) {
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong");
        return false;
      }
      await update({ name: data.user.name, image: data.user.image });
      return true;
    } catch {
      setError("Couldn't reach the server. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again still fires a change event.
    e.target.value = "";
    if (!file) return;
    let dataUri;
    try {
      dataUri = await resizeImageFile(file);
    } catch {
      setError("Couldn't read that image.");
      return;
    }
    if (await save({ image: dataUri })) setDone("Avatar updated");
  }

  async function submitName(e) {
    e.preventDefault();
    const next = name.trim();
    if (!next) {
      setError("Name can't be empty");
      return;
    }
    if (await save({ name: next })) {
      setEditingName(false);
      setDone("Username updated");
    }
  }

  return (
    <div className="settings-account">
      <h3>Account</h3>
      <div className="settings-account-head">
        <UserAvatar user={session.user} size={34} />
        <div className="settings-account-who">
          <b>{session.user.name || "No username set"}</b>
          <span>{session.user.email}</span>
          {createdAt && (
            <span>
              Joined{" "}
              {new Date(createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      {editingName ? (
        <form className="settings-name-form" onSubmit={submitName}>
          <input
            // The row was just replaced by this field, so the caret belongs in it.
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Username"
            aria-label="Username"
          />
          <div className="settings-name-actions">
            <button type="submit" className="settings-btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={() => {
                setEditingName(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="settings-row"
          onClick={() => {
            setName(session.user.name ?? "");
            setError(null);
            setDone(null);
            setEditingName(true);
          }}
        >
          <PencilIcon />
          Change username
        </button>
      )}

      <button
        type="button"
        className="settings-row"
        onClick={() => fileInputRef.current?.click()}
        disabled={saving}
      >
        <ImageIcon />
        {saving && !editingName ? "Uploading…" : "Change avatar"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {error && <p className="settings-error">{error}</p>}
      {done && <p className="settings-done">{done}</p>}
    </div>
  );
}
