"use client";

// "Alert me" beside the gauge: a button that opens a small panel for standing
// email alerts on the index crossing a level. Alerts are per account, so a
// signed-out visitor gets the sign-in prompt instead of the form.
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { MIN_THRESHOLD, MAX_THRESHOLD } from "@/lib/fearGreedAlerts";
import { errorFrom, readJson } from "@/lib/readJson";

export default function FearGreedAlertButton({ embedded = false }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(embedded);
  const [alerts, setAlerts] = useState([]);
  const [direction, setDirection] = useState("below");
  const [threshold, setThreshold] = useState("10");
  // null means "not edited yet", so the field shows the account address until
  // the user types their own - derived at render rather than synced in an
  // effect, which would fight the user's typing on every session refresh.
  const [emailInput, setEmailInput] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const signedIn = status === "authenticated";

  // Only load the list once the panel is actually opened - a visitor who never
  // touches the button costs no query.
  useEffect(() => {
    if (!open || !signedIn) return;
    let live = true;
    // Failures here used to be swallowed, which left the panel looking empty
    // when the list simply had not loaded.
    fetch("/api/alerts")
      .then(async (r) => {
        const message = await errorFrom(r, "Could not load your alerts.");
        if (message) throw new Error(message);
        return (await readJson(r))?.alerts ?? [];
      })
      .then((list) => live && setAlerts(list))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [open, signedIn]);

  const email = emailInput ?? session?.user?.email ?? "";

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, threshold: Number(threshold), email }),
      });
      const message = await errorFrom(res, "Could not save that alert.");
      if (message) throw new Error(message);
      const json = await readJson(res);
      if (json?.alert) setAlerts((list) => [...list, json.alert]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    const res = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setAlerts((list) => list.filter((a) => a.id !== id));
  }

  return (
    <div className="fga">
      {!embedded && <button
        type="button"
        onClick={() => signedIn && setOpen((o) => !o)}
        aria-expanded={open}
        // Alerts are per account and the API refuses an anonymous caller, so
        // the control says so up front instead of opening a form that cannot
        // save. Left focusable (not `disabled`) so the reason is reachable by
        // keyboard and screen reader rather than silently inert.
        aria-disabled={!signedIn}
        className={`fga-open${signedIn ? "" : " fga-open-off"}`}
        title={signedIn ? "Alert me when the index crosses a level" : "Sign in to set an alert"}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Zm0 18a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        Alert me
      </button>}

      {!signedIn && (
        <span className="fga-signin">
          <Link href="/api/auth/signin">Sign in</Link> to set alerts
        </span>
      )}

      {open && signedIn && (
        <div className="fga-panel">
          <p className="fga-lede">
            Get an email when the index crosses a level. Sent once on the crossing, not every day
            it stays there.
          </p>

          <form className="fga-form" onSubmit={add}>
            <div className="fga-row">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                aria-label="Alert direction"
              >
                <option value="below">Falls below</option>
                <option value="above">Rises above</option>
              </select>
              <input
                type="number"
                min={MIN_THRESHOLD}
                max={MAX_THRESHOLD}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                aria-label="Index level"
              />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
            />
            <button type="submit" className="fga-save" disabled={busy}>
              {busy ? "Saving…" : "Add alert"}
            </button>
          </form>

          {error && <p className="fga-error">{error}</p>}

          <ul className="fga-list">
            {alerts.map((a) => (
              <li key={a.id}>
                <span>
                  {a.direction === "above" ? "Above" : "Below"} {a.threshold} · {a.email}
                </span>
                <button type="button" onClick={() => remove(a.id)} aria-label="Remove alert">
                  ×
                </button>
              </li>
            ))}
            {!alerts.length && <li className="fga-note">No alerts yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
