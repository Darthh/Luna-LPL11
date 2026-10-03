"use client";
import { useEffect, useRef, useState } from "react";

export default function AIResearchPanel({ disabled, selected, onSelect }) {
  const [jobs, setJobs] = useState([]);
  const [available, setAvailable] = useState(false);
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [message, setMessage] = useState("Checking research services...");
  const [working, setWorking] = useState(false);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const picker = useRef(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/ai-documents", { cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (!response.ok) { setAvailable(false); setMessage(body.error || "Uploads are unavailable."); return; }
        setAvailable(true); setAgentAvailable(body.agentAvailable); setJobs(body.jobs || []); setMessage("");
      } catch { if (active) { setAvailable(false); setMessage("Research services are unavailable."); } }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setOpen(true);
    if (file.size > 4 * 1024 * 1024) { setFile(null); setMessage("Maximum upload size is 4 MB."); return; }
    setFile(file);
    setMessage(available ? "" : "Uploads are currently unavailable. Your file has not been uploaded.");
  }
  async function upload() {
    if (!file) return;
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
      setFile(null);
      setMessage("Queued. Processing continues in the background.");
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  }
  return <div className="ai-attachments">
    <input ref={picker} hidden aria-label="Choose files or photos" type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.mp3,.wav" disabled={working || disabled} onChange={chooseFile} />
    <button type="button" className="ai-tool-button ai-add-files" aria-label="Add files or photos" title="Add files or photos" aria-expanded={open} disabled={working || disabled} onClick={() => picker.current?.click()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
    {open && <div className="ai-attachment-popover" role="dialog" aria-label="Upload files or photos" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <div className="ai-attachment-heading"><strong>Files &amp; photos</strong><button type="button" className="ai-tool-button" aria-label="Close uploads" onClick={() => setOpen(false)}>×</button></div>
    {file && <p className="ai-attachment-filename">{file.name}</p>}
    <div className="ai-research-actions">
      <button type="button" className="ai-tool-button" disabled={working || disabled} onClick={() => picker.current?.click()}>Choose file or photo</button>
      <button type="button" className="ai-tool-button" disabled={!file || !available || working || disabled} onClick={upload}>{working ? "Uploading…" : "Upload"}</button>
    </div>
    <small>Maximum 4 MB.</small>
    {message && <p role="status">{message}</p>}
    <ul>{jobs.map(job => <li key={job.id}>
      <div>{job.kind === "document" && job.status === "ready" ? <label><input type="checkbox" checked={selected.includes(job.id)} disabled={disabled || !agentAvailable} onChange={() => onSelect(selected.includes(job.id) ? selected.filter(id => id !== job.id) : [...selected, job.id].slice(0, 8))} /> {job.title}</label> : <strong>{job.title}</strong>} <span>{job.status}</span></div>
      {job.error && <p>{job.error}</p>}
      {job.kind === "report" && job.status === "ready" && <details><summary>Read report</summary><p style={{ whiteSpace: "pre-wrap" }}>{job.summary}</p></details>}
      {job.kind === "document" && job.status === "ready" && <a href={`/api/ai-documents?id=${job.id}&download=1`}>Download source</a>}
    </li>)}</ul>
    {selected.length > 0 && <small>{selected.length} document(s) attached to your next AWS chat message.</small>}
    </div>}
  </div>;
}
