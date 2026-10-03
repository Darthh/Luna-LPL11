"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import ReportFlow from "./ReportBuilder";
import { MODEL_PORTFOLIOS } from "@/lib/portfolioModels";
import { workspaceRequest, downloadDocument } from "@/lib/workspaceClient.mjs";
import {
  REPORT_TYPES,
  reportRecord,
  reportFromItem,
} from "@/lib/reportSpec.mjs";
import "./ReportsWorkspace.css";
const readLocal = (kind) => {
  try {
    const list = JSON.parse(localStorage.getItem(`advisor:${kind}`) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const builtin = MODEL_PORTFOLIOS.map((p) => ({ ...p, kind: "model" }));
export default function ReportsWorkspace() {
  const { data: session, status } = useSession(),
    userId = session?.user?.id;
  const scope = useRef(userId);
  useEffect(() => {
    scope.current = userId;
  }, [userId]);
  const [rows, setRows] = useState([]),
    [portfolios, setPortfolios] = useState(builtin),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Reports"),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [sort, setSort] = useState("newest"),
    [flow, setFlow] = useState(null),
    [legacy, setLegacy] = useState(0),
    [busy, setBusy] = useState(false),
    [pendingDelete, setPendingDelete] = useState(null);
  useEffect(() => {
    let active = true;
    const reload = async () => {
      if (status === "loading") return;
      setLoading(true);
      setError("");
      setRows([]);
      setFlow(null);
      setPortfolios(builtin);
      try {
        if (userId) {
          const results = await Promise.allSettled(
            ["reports", "models", "clients"].map((kind) =>
              workspaceRequest(`/api/advisor-items?kind=${kind}`, null, "GET"),
            ),
          );
          if (!active) return;
          const records =
            results[0].status === "fulfilled" ? results[0].value.items : [];
          setRows(records);
          setPortfolios([
            ...builtin,
            ...results.slice(1).flatMap((r, i) =>
              r.status === "fulfilled"
                ? r.value.items.map((p) => ({
                    ...p,
                    kind: i === 0 ? "model" : "client",
                  }))
                : [],
            ),
          ]);
          setLegacy(readLocal("reports").length);
          if (results.some((r) => r.status === "rejected"))
            setError(
              "Account workspace storage is unavailable. Reports can be designed and downloaded, but account saving requires a working database connection.",
            );
          const item = records.find(
            (r) =>
              r.id === new URLSearchParams(window.location.search).get("item"),
          );
          if (item) setFlow(item);
        } else {
          const records = readLocal("reports");
          if (!active) return;
          setRows(records);
          setPortfolios([
            ...builtin,
            ...["models", "clients"].flatMap((kind) =>
              readLocal(kind).map((p) => ({
                ...p,
                kind: kind === "models" ? "model" : "client",
              })),
            ),
          ]);
          setLegacy(0);
          const item = records.find(
            (r) =>
              r.id === new URLSearchParams(window.location.search).get("item"),
          );
          if (item) setFlow(item);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    reload();
    window.addEventListener("luna-workspace-changed", reload);
    return () => {
      active = false;
      window.removeEventListener("luna-workspace-changed", reload);
    };
  }, [userId, status]);
  const close = useCallback(() => setFlow(null), []);
  const persist = async (
    record,
    isTemplate,
    keepOpen = false,
    templateTarget = null,
  ) => {
    const owner = userId;
    const previous = isTemplate
      ? templateTarget
      : flow?.persisted || (flow?.id && !flow.isTemplate ? flow : null);
    let item;
    if (userId) {
      ({ item } = await workspaceRequest(
        "/api/advisor-items?kind=reports",
        {
          ...record,
          ...(previous ? { id: previous.id, revision: previous.revision } : {}),
        },
        previous ? "PUT" : "POST",
      ));
    } else {
      item = {
        ...record,
        id: previous?.id || crypto.randomUUID(),
        opened: new Date().toISOString(),
      };
      localStorage.setItem(
        "advisor:reports",
        JSON.stringify([
          item,
          ...readLocal("reports").filter((r) => r.id !== item.id),
        ]),
      );
    }
    if (scope.current !== owner) return;
    setRows((r) => [item, ...r.filter((x) => x.id !== item.id)]);
    if (!isTemplate && !keepOpen) close();
    else if (!isTemplate && keepOpen)
      setFlow((f) => ({ ...f, persisted: item }));
    return item;
  };
  const duplicate = async (row) => {
    setBusy(true);
    setError("");
    const owner = userId;
    try {
      const copy = {
        ...row,
        id: undefined,
        revision: undefined,
        name: `${row.name} (Copy)`,
        ...(row.report
          ? { report: { ...row.report, title: `${row.name} (Copy)` } }
          : {}),
      };
      const item = userId
        ? (await workspaceRequest("/api/advisor-items?kind=reports", copy)).item
        : {
            ...copy,
            id: crypto.randomUUID(),
            opened: new Date().toISOString(),
          };
      if (scope.current !== owner) return;
      const next = [item, ...rows];
      if (!userId)
        localStorage.setItem("advisor:reports", JSON.stringify(next));
      setRows(next);
    } catch (e) {
      if (scope.current === owner) setError(e.message);
    } finally {
      if (scope.current === owner) setBusy(false);
    }
  };
  const remove = async (row) => {
    setBusy(true);
    setError("");
    const owner = userId;
    try {
      if (userId)
        await workspaceRequest(
          "/api/advisor-items?kind=reports",
          { id: row.id, revision: row.revision },
          "DELETE",
        );
      if (scope.current !== owner) return;
      const next = rows.filter((r) => r.id !== row.id);
      if (!userId)
        localStorage.setItem("advisor:reports", JSON.stringify(next));
      setRows(next);
      setPendingDelete(null);
    } catch (e) {
      if (scope.current === owner) setError(e.message);
    } finally {
      if (scope.current === owner) setBusy(false);
    }
  };
  const importLegacy = async () => {
    setBusy(true);
    setError("");
    const owner = userId;
    try {
      for (const r of readLocal("reports")) {
        const { item } = await workspaceRequest(
          "/api/advisor-items?kind=reports",
          r,
        );
        if (scope.current !== owner) return;
        setRows((rows) => [item, ...rows]);
        const remaining = readLocal("reports").filter((x) => x.id !== r.id);
        localStorage.setItem("advisor:reports", JSON.stringify(remaining));
        setLegacy(remaining.length);
      }
    } catch (e) {
      if (scope.current === owner) setError(e.message);
    } finally {
      if (scope.current === owner) setBusy(false);
    }
  };
  const shown = rows
    .filter(
      (r) =>
        Boolean(r.isTemplate) === (tab === "Templates") &&
        `${r.name} ${r.client || ""} ${r.blurb || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (type === "all" || r.report?.type === type),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : Date.parse(b.opened || 0) - Date.parse(a.opened || 0),
    );
  return (
    <div className="rp-library">
      <div className="rp-library-head">
        <div>
          <h1>Reports</h1>
          <p>Create client-ready portfolio reports and visual insights.</p>
        </div>
        <button
          className="rp-btn primary"
          disabled={status === "loading"}
          onClick={() => setFlow({ new: true })}
        >
          ＋ Create Report
        </button>
      </div>
      <p className="rp-muted">
        {userId
          ? "Saved to your account"
          : "Browser workspace · Sign in to save reports and templates to your account."}
      </p>
      {error && (
        <p role="alert" className="rp-error">
          {error}
        </p>
      )}
      {userId && legacy > 0 && (
        <p className="rp-muted">
          {legacy} reports are saved in this browser.{" "}
          <button className="rp-btn" disabled={busy} onClick={importLegacy}>
            Import into my account
          </button>
        </p>
      )}
      <div className="rp-library-toolbar">
        <div className="rp-tabs" role="tablist">
          {["Reports", "Templates"].map((t) => (
            <button
              role="tab"
              aria-selected={t === tab}
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          aria-label="Search reports"
          placeholder="Search by report title or client name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Report type filter"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All report types</option>
          {REPORT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort reports"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      {loading ? (
        <p role="status" className="rp-empty">
          Loading your reports…
        </p>
      ) : !shown.length ? (
        <div className="rp-empty">
          <div className="rp-empty-art">▥</div>
          <h2>
            {rows.length
              ? "No matching reports"
              : tab === "Templates"
                ? "Create your first template"
                : "Create your first report"}
          </h2>
          <p>
            {tab === "Templates"
              ? "Save a report as a template to reuse its pages and style."
              : "Turn your portfolio data into client-ready reports and visual insights."}
          </p>
          <button
            className="rp-btn primary"
            onClick={() => setFlow({ new: true })}
          >
            Create new report
          </button>
        </div>
      ) : (
        <div className="rp-report-table">
          <table>
            <thead>
              <tr>
                <th>Report Title</th>
                <th>Report Type</th>
                <th>Portfolio / Fund</th>
                <th>Client Name</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="rp-report-title"
                      onClick={() =>
                        setFlow(
                          r.isTemplate
                            ? {
                                ...r,
                                report: {
                                  ...structuredClone(r.report),
                                  portfolios: [],
                                  snapshot: null,
                                },
                              }
                            : r,
                        )
                      }
                    >
                      {r.name}
                    </button>
                    <small>
                      {r.report?.pages.filter((p) => p.visible).length || 1}{" "}
                      pages
                    </small>
                  </td>
                  <td>
                    {REPORT_TYPES.find((t) => t.id === r.report?.type)?.name ||
                      "Document"}
                  </td>
                  <td>
                    {r.report?.portfolios
                      .map((p) => p.displayName)
                      .join(" vs ") ||
                      r.holdings?.map((h) => h.symbol).join(", ") ||
                      "—"}
                  </td>
                  <td>{r.client || "—"}</td>
                  <td>{new Date(r.opened).toLocaleDateString()}</td>
                  <td>
                    <div className="rp-row-actions">
                      {r.isTemplate && (
                        <button
                          className="rp-btn"
                          disabled={busy}
                          onClick={() => setFlow({ ...r, editTemplate: true })}
                        >
                          Edit Template
                        </button>
                      )}
                      <button
                        className="rp-btn"
                        disabled={busy}
                        onClick={() => duplicate(r)}
                      >
                        Duplicate
                      </button>
                      {!r.isTemplate &&
                        ["pdf", "csv"].map((format) => (
                          <button
                            key={format}
                            className="rp-btn"
                            disabled={busy}
                            onClick={async () => {
                              try {
                                await downloadDocument(
                                  r.report
                                    ? r
                                    : {
                                        ...r,
                                        ...reportRecord(reportFromItem(r)),
                                      },
                                  format,
                                );
                              } catch (e) {
                                setError(e.message);
                              }
                            }}
                          >
                            {format.toUpperCase()}
                          </button>
                        ))}
                      <button
                        className="rp-icon"
                        aria-label={`Delete ${r.name}`}
                        disabled={busy}
                        onClick={() => setPendingDelete(r)}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pendingDelete && (
        <div
          className="rp-delete-confirm"
          role="alertdialog"
          aria-label="Delete report"
        >
          <p>Delete “{pendingDelete.name}”?</p>
          <button className="rp-btn" onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button
            className="rp-btn"
            disabled={busy}
            onClick={() => remove(pendingDelete)}
          >
            Delete
          </button>
        </div>
      )}
      {flow && (
        <ReportFlow
          key={`${userId || "browser"}:${flow.id || "new"}`}
          portfolios={portfolios}
          templates={rows.filter((r) => r.isTemplate)}
          preparedBy={session?.user?.name || ""}
          initial={flow.new ? null : flow}
          onClose={close}
          onSave={persist}
        />
      )}
    </div>
  );
}
