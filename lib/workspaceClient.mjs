export async function workspaceRequest(path, body, method = "POST") {
  const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Account storage is unavailable.");
  return data;
}

export async function saveDocument(draft, destination = draft.destination) {
  const { item } = await workspaceRequest(`/api/advisor-items?kind=${destination}`, draft);
  window.dispatchEvent(new Event("luna-workspace-changed"));
  return item;
}

export async function downloadDocument(item, format) {
  const response = await fetch("/api/workspace-file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, format }) });
  if (!response.ok) throw new Error((await response.json()).error || "Download failed.");
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url; a.download = `${item.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${format}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
