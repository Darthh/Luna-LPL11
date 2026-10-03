"use client";
import Link from "next/link";
import { useState } from "react";
import { ITEM_PATHS } from "@/lib/advisorItems.mjs";
import { saveDocument, downloadDocument } from "@/lib/workspaceClient.mjs";

export default function ChatDocument({ draft, onSave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(draft.saveError || "");
  async function run(action) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="ai-document" aria-label={`Generated document: ${draft.name}`}>
    <strong>{draft.name}</strong>
    {draft.blurb && <p>{draft.blurb}</p>}
    <details><summary>Preview</summary><p style={{ whiteSpace: "pre-wrap" }}>{draft.content}</p>
      {draft.holdings?.length > 0 && <ul>{draft.holdings.map(h => <li key={h.symbol}>{h.symbol}: {h.weight != null ? `${h.weight}%` : `${h.shares ?? "Unspecified"} shares`}</li>)}</ul>}
      {draft.table && <div style={{ overflowX: "auto" }}><table><thead><tr>{draft.table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{draft.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
    </details>
    <div className="ai-document-actions">
      <button type="button" disabled={busy} onClick={() => run(() => downloadDocument(draft, "csv"))}>Download CSV</button>
      <button type="button" disabled={busy} onClick={() => run(() => downloadDocument(draft, "pdf"))}>Download PDF</button>
      {draft.savedId ? <Link href={`${ITEM_PATHS[draft.destination]}?item=${encodeURIComponent(draft.savedId)}`}>Saved · Open {draft.destination === "models" ? "Model Portfolios" : draft.destination === "clients" ? "Client Portfolios" : "Reports"}</Link> : <button type="button" disabled={busy} onClick={() => run(async () => {
        const item = await saveDocument(draft);
        onSave({ ...draft, savedId: item.id, saveError: undefined });
      })}>Save to {draft.destination === "models" ? "Model Portfolios" : draft.destination === "clients" ? "Client Portfolios" : "Reports"}</button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
