"use client";
import { useEffect, useState } from "react";

export default function AIResearchPanel({ model, question, disabled, selected, onSelect }) {
  const [jobs, setJobs] = useState([]);
  const [available, setAvailable] = useState(false);
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [message, setMessage] = useState("Checking research services...");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/ai-documents", { cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (!response.ok) { setAvailable(false); setMessage(body.error || "Research is unavailable."); return; }
        setAvailable(true); setAgentAvailable(body.agentAvailable); setJobs(body.jobs || []); setMessage("");
      } catch { if (active) { setAvailable(false); setMessage("Research services are unavailable."); } }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setMessage("Maximum upload size is 4 MB."); return; }
    const form = new FormData(); form.append("file", file);
    await create("/api/ai-documents", { body: form });
  }
  async function create(url, options) {
    setWorking(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", ...options });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Research request failed.");
      setJobs(current => [body.job, ...current]);
      setMessage("Queued. Processing continues in the background.");
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }
  return <details className="ai-research-panel">
    <summary>Documents &amp; research</summary>
    <p>Upload a document for cited answers, or save a research report. Files are processed in AWS and remain private to your account or this browser.</p>
    <div className="ai-research-actions">
      <label className="ai-tool-button">Upload document<input aria-label="Upload research document" type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.mp3,.wav" disabled={!available || working || disabled} onChange={upload} /></label>
      <button type="button" className="ai-tool-button" disabled={!available || !agentAvailable || working || disabled || !question.trim() || !model.startsWith("aws-")}
        onClick={() => create("/api/ai-jobs", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: question, model }) })}>Research in background</button>
    </div>
    <small>PDF, text, Markdown, images, MP3 or WAV. Maximum 4 MB.</small>
    {message && <p role="status">{message}</p>}
    <ul>{jobs.map(job => <li key={job.id}>
      <div>{job.kind === "document" && job.status === "ready" ? <label><input type="checkbox" checked={selected.includes(job.id)} disabled={disabled || !agentAvailable} onChange={() => onSelect(selected.includes(job.id) ? selected.filter(id => id !== job.id) : [...selected, job.id].slice(0, 8))} /> {job.title}</label> : <strong>{job.title}</strong>} <span>{job.status}</span></div>
      {job.error && <p>{job.error}</p>}
      {job.kind === "report" && job.status === "ready" && <details><summary>Read report</summary><p style={{ whiteSpace: "pre-wrap" }}>{job.summary}</p></details>}
      {job.kind === "document" && job.status === "ready" && <a href={`/api/ai-documents?id=${job.id}&download=1`}>Download source</a>}
    </li>)}</ul>
    {selected.length > 0 && <small>{selected.length} document(s) attached to your next AWS chat message.</small>}
  </details>;
}
