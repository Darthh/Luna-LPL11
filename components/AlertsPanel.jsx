"use client";

// The full list of a user's market sentiment alerts, reached from Settings.
// The button on the chart is for setting one quickly; this is the page for
// seeing everything that is armed and what it has already sent.
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { errorFrom, readJson } from "@/lib/readJson";

const dateText = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Not yet";

export default function AlertsPanel() {
  const { status } = useSession();
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let live = true;
    fetch("/api/alerts")
      .then(async (r) => {
        const message = await errorFrom(r, "Could not load your alerts.");
        if (message) throw new Error(message);
        return (await readJson(r)) ?? {};
      })
      .then((j) => live && setAlerts(j.alerts ?? []))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [status]);

  async function remove(id) {
    const res = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setAlerts((list) => list.filter((a) => a.id !== id));
  }

  if (status === "loading") return <p className="alerts-note">Loading…</p>;

  if (status !== "authenticated") {
    return (
      <div className="alerts-page">
        <h1>Your alerts</h1>
        <p className="alerts-note">
          <Link href="/api/auth/signin">Sign in</Link> to see the alerts on your account.
        </p>
      </div>
    );
  }

  return (
    <div className="alerts-page">
      <h1>Your alerts</h1>
      <p className="alerts-lede">
        Every market sentiment alert on your account. Each one emails you once when the index
        crosses its level, then stays quiet until it crosses again. Set new ones from the{" "}
        <Link href="/dashboard">Alert me button on the chart</Link>.
      </p>

      {error && <p className="alerts-error">{error}</p>}
      {!alerts && !error && <p className="alerts-note">Loading…</p>}

      {alerts && !alerts.length && (
        <p className="alerts-note">No alerts set up yet.</p>
      )}

      {alerts && alerts.length > 0 && (
        <table className="alerts-table">
          <thead>
            <tr>
              <th>When the index</th>
              <th>Emails</th>
              <th>Last sent</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.direction === "above" ? "Rises above" : "Falls below"} <strong>{a.threshold}</strong>
                </td>
                <td>{a.email}</td>
                <td>{dateText(a.lastSentAt)}</td>
                <td className="alerts-actions">
                  <button type="button" onClick={() => remove(a.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
