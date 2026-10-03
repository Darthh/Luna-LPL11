"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  REPORT_TYPES,
  CUSTOM_LAYOUTS,
  HOLDING_COLUMNS,
  REPORT_METRICS,
  PAGE_EXHIBITS,
  newReport,
  validateReport,
  reportRecord,
  reportFromItem,
} from "@/lib/reportSpec.mjs";
import { loadReportData } from "@/lib/reportData.mjs";
import { reportLayout, reportSheets } from "@/lib/reportLayout.mjs";
import { downloadDocument } from "@/lib/workspaceClient.mjs";
import { reportImageFile } from "@/lib/reportImages.mjs";
import "./ReportsWorkspace.css";

export function ReportSheet({ report, sheet, number = 1 }) {
  const commands = reportLayout(report, sheet, number);
  return (
    <svg
      className="rp-sheet"
      viewBox="0 0 792 612"
      role="img"
      aria-label={`${sheet.page.name} report preview`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {commands.map((c, i) => {
        if (c.type === "text")
          return (
            <text
              key={i}
              x={c.x}
              y={c.y}
              fontSize={c.size}
              fill={c.fill}
              fontWeight={c.bold ? 600 : 400}
            >
              {c.value}
            </text>
          );
        if (c.type === "rect")
          return (
            <rect
              key={i}
              x={c.x}
              y={c.y}
              width={c.width}
              height={c.height}
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth=".5"
            />
          );
        if (c.type === "line")
          return (
            <line
              key={i}
              x1={c.x1}
              y1={c.y1}
              x2={c.x2}
              y2={c.y2}
              stroke={c.stroke}
              strokeWidth={c.width}
            />
          );
        if (c.type === "polyline")
          return (
            <polyline
              key={i}
              points={c.points.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={c.stroke}
              strokeWidth={c.width}
            />
          );
        if (c.type === "polygon")
          return (
            <polygon
              key={i}
              points={c.points.map((p) => p.join(",")).join(" ")}
              fill={c.fill}
              opacity={c.opacity ?? 1}
            />
          );
        if (c.type === "image")
          return (
            <image
              key={i}
              href={c.src}
              x={c.x}
              y={c.y}
              width={c.width}
              height={c.height}
              preserveAspectRatio="xMidYMid meet"
            />
          );
        return null;
      })}
    </svg>
  );
}
function Dialog({ title, children, onClose, footer, className = "" }) {
  const ref = useRef(null),
    closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const nodes = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ),
      ].filter((n) => n.getClientRects().length);
      if (!nodes.length) return;
      if (
        e.shiftKey &&
        (document.activeElement === nodes[0] ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        nodes.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0].focus();
      }
    };
    const current = ref.current;
    current.addEventListener("keydown", key);
    return () => {
      current.removeEventListener("keydown", key);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="rp-scrim">
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`rp-dialog ${className}`}
      >
        <header>
          <h2>{title}</h2>
          <button className="rp-icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="rp-dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
function ReportArt({ type }) {
  return (
    <div className={`rp-art ${type}`}>
      <div className="rp-mini-paper">
        <div className="rp-mini-line" />
        <div className="rp-mini-line short" />
        {type === "comparison" ? (
          <div className="rp-mini-columns">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i}>
                <span className="rp-mini-donut" />
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ) : (
          <>
            <span className="rp-mini-donut" />
            <div className="rp-mini-bars">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="rp-mini-grid" />
          </>
        )}
      </div>
    </div>
  );
}
/* eslint-disable @next/next/no-img-element -- Locally uploaded data URLs are already bounded. */
function UploadImage({ value, onChange, label = "Company Logo", onError }) {
  return (
    <div className="rp-upload">
      <span>{label}</span>
      {value && (
        <div className="rp-image-thumb">
          <img src={value} alt={label} />
          <button
            className="rp-icon"
            aria-label={`Remove ${label}`}
            onClick={() => onChange("")}
          >
            ×
          </button>
        </div>
      )}
      <label className="rp-btn">
        Upload {label === "Company Logo" ? "logo" : "image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              onChange(await reportImageFile(file));
            } catch (error) {
              onError(error.message);
            }
          }}
        />
      </label>
      <small>JPEG, PNG or SVG (1 MB max.)</small>
    </div>
  );
}
function PortfolioPicker({
  value,
  onChange,
  portfolios,
  label,
  required = false,
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("ALL"),
    [results, setResults] = useState([]),
    [open, setOpen] = useState(false),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!query || !open || ["MP", "CP"].includes(category)) return;
    let active = true;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `/api/stock-search?funds=true&q=${encodeURIComponent(query)}`,
          { signal: abort.signal },
        );
        const j = await r.json();
        if (active) setResults(j.results || []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, category, open]);
  const matches = portfolios.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === "ALL" || category === (p.kind === "model" ? "MP" : "CP")),
  );
  const funds = ["ALL", "ETF", "MF"].includes(category)
    ? results.filter(
        (r) =>
          category === "ALL" ||
          (category === "MF" ? r.type === "MUTUALFUND" : r.type === "ETF"),
      )
    : [];
  const choose = (p) => {
    onChange({ ...p, displayName: p.displayName || p.name });
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="rp-picker">
      <label>
        <span>
          {label}
          {required && " (Required)"}
        </span>
        <input
          aria-label={label}
          value={open ? query : value?.name || ""}
          placeholder="Portfolio or fund"
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </label>
      {value && (
        <button
          className="rp-icon rp-clear"
          aria-label={`Clear ${label}`}
          onClick={() => onChange(null)}
        >
          ×
        </button>
      )}
      {open && (
        <div className="rp-picker-results">
          <div className="rp-filter-tabs">
            {["ALL", "ETF", "MF", "MP", "CP"].map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
            <button
              className="rp-icon"
              aria-label="Close search"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          {searching && <small>Searching funds…</small>}
          {matches.slice(0, 12).map((p) => (
            <button
              className="rp-pick-result"
              key={p.id}
              onClick={() => choose(p)}
            >
              <strong>{p.name}</strong>
              <small>
                {p.kind === "model" ? "Model Portfolio" : "Client Portfolio"}
              </small>
            </button>
          ))}
          {funds.map((f) => (
            <button
              className="rp-pick-result"
              key={f.symbol}
              onClick={() =>
                choose({
                  id: `fund:${f.symbol}`,
                  name: f.name,
                  symbol: f.symbol,
                  kind: "fund",
                  holdings: [],
                })
              }
            >
              <strong>
                {f.symbol}
                <span>{f.name}</span>
              </strong>
              <small>{f.type === "ETF" ? "ETF" : "Mutual Fund"}</small>
            </button>
          ))}
          {!matches.length && !funds.length && !searching && (
            <small>
              {query
                ? "No matching portfolios or funds."
                : "Search for an ETF, mutual fund or saved portfolio."}
            </small>
          )}
        </div>
      )}
      {value && (
        <label className="rp-display-name">
          Name displayed in the report
          <input
            aria-label={`${label} displayed name`}
            value={value.displayName}
            onChange={(e) =>
              onChange({ ...value, displayName: e.target.value })
            }
            placeholder="As named"
            maxLength={160}
          />
        </label>
      )}
    </div>
  );
}
function Details({
  report,
  setReport,
  portfolios,
  onError,
  includePortfolios = true,
}) {
  const set = (key) => (e) =>
    setReport((r) => ({
      ...r,
      [key]: e.target.value,
      ...(["startDate", "endDate"].includes(key) ? { snapshot: null } : {}),
    }));
  return (
    <div className="rp-form">
      <h3>Key Details</h3>
      <label>
        Report Title
        <input value={report.title} onChange={set("title")} maxLength={160} />
      </label>
      <label>
        Client Name
        <input value={report.client} onChange={set("client")} maxLength={160} />
      </label>
      <label>
        Prepared By
        <input
          value={report.preparedBy}
          onChange={set("preparedBy")}
          maxLength={160}
        />
      </label>
      {includePortfolios && (
        <Selection
          report={report}
          setReport={setReport}
          portfolios={portfolios}
        />
      )}
      <h3>Dates</h3>
      <div className="rp-date-row">
        <label>
          Start Date
          <input
            type="date"
            value={report.startDate}
            max={report.endDate}
            onChange={set("startDate")}
          />
        </label>
        <label>
          End Date
          <input
            type="date"
            value={report.endDate}
            min={report.startDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={set("endDate")}
          />
        </label>
      </div>
      <UploadImage
        value={report.style.logo}
        onChange={(logo) =>
          setReport((r) => ({ ...r, style: { ...r.style, logo } }))
        }
        onError={onError}
      />
    </div>
  );
}
function Selection({ report, setReport, portfolios }) {
  const limit = REPORT_TYPES.find((t) => t.id === report.type).limit;
  const count =
    report.type === "comparison"
      ? Math.min(limit, Math.max(2, report.portfolios.length + 1))
      : 2;
  return (
    <div className="rp-selection">
      {Array.from({ length: count }, (_, i) => (
        <PortfolioPicker
          key={i}
          value={report.portfolios[i]}
          portfolios={portfolios}
          label={
            i === 0
              ? "Primary Portfolio"
              : i === 1
                ? "Comparison Portfolio"
                : `Portfolio ${i + 1}`
          }
          required={i === 0}
          onChange={(p) =>
            setReport((r) => {
              const ps = [...r.portfolios];
              if (p) ps[i] = p;
              else ps.splice(i, 1);
              return { ...r, portfolios: ps.filter(Boolean), snapshot: null };
            })
          }
        />
      ))}
    </div>
  );
}
function PageEditor({ page, onSave, onClose }) {
  const [draft, setDraft] = useState(structuredClone(page)),
    [error, setError] = useState("");
  const update = (k, value) => setDraft((p) => ({ ...p, [k]: value }));
  return (
    <Dialog
      title={`Edit Page · ${page.name}`}
      className="rp-page-editor"
      onClose={onClose}
      footer={
        <>
          <button className="rp-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rp-btn primary"
            onClick={() => {
              if (!draft.name.trim()) {
                setError("Enter a page title.");
                return;
              }
              onSave(draft);
            }}
          >
            Save Changes
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="rp-error">
          {error}
        </p>
      )}
      <div className="rp-form">
        {!page.custom && (
          <label>
            Page Title
            <input
              value={draft.displayTitle || page.name}
              onChange={(e) => update("displayTitle", e.target.value)}
              maxLength={160}
            />
          </label>
        )}
        {page.custom && (
          <label>
            Page Title
            <input
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={160}
            />
          </label>
        )}
        {(page.custom || page.name === "Disclosures") && (
          <label>
            Text
            <textarea
              aria-label="Page text"
              value={draft.text || ""}
              rows={12}
              maxLength={16000}
              onChange={(e) => update("text", e.target.value)}
            />
          </label>
        )}
        {page.custom && page.table && (
          <p>
            This page includes the table saved by New Chat. Its full data is
            retained in PDF and CSV exports.
          </p>
        )}
        {(PAGE_EXHIBITS[page.name] || []).length > 0 && (
          <>
            <h3>Page Exhibits</h3>
            {PAGE_EXHIBITS[page.name].map((title) => (
              <label className="rp-exhibit-choice" key={title}>
                <span>{title}</span>
                <select
                  aria-label={title + " visibility"}
                  value={draft.exhibits?.[title] === false ? "hide" : "show"}
                  onChange={(e) =>
                    update("exhibits", {
                      ...(draft.exhibits || {}),
                      [title]: e.target.value === "show",
                    })
                  }
                >
                  <option value="show">Show</option>
                  <option value="hide">Hide</option>
                </select>
              </label>
            ))}
          </>
        )}
        {[
          "Holdings Summary",
          "Comparison Summary",
          "Risk",
          "Quantitative Metrics",
          "One Pager",
        ].includes(page.name) && (
          <>
            <h3>Key Stats Table</h3>
            <div className="rp-checks">
              {REPORT_METRICS.map((m) => (
                <label key={m}>
                  <input
                    type="checkbox"
                    checked={!draft.metrics || draft.metrics.includes(m)}
                    onChange={(e) =>
                      update(
                        "metrics",
                        e.target.checked
                          ? [...(draft.metrics || REPORT_METRICS), m]
                          : (draft.metrics || REPORT_METRICS).filter(
                              (x) => x !== m,
                            ),
                      )
                    }
                  />
                  {m}
                </label>
              ))}
            </div>
          </>
        )}
        {["Top Holdings", "Holdings Table"].includes(page.name) && (
          <>
            <h3>Table Columns</h3>
            <div className="rp-checks">
              {HOLDING_COLUMNS.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={draft.columns?.includes(c) || false}
                    onChange={(e) =>
                      update(
                        "columns",
                        e.target.checked
                          ? [...(draft.columns || []), c]
                          : draft.columns.filter((x) => x !== c),
                      )
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
            <label>
              Number of top holdings
              <input
                type="number"
                min="1"
                max="25"
                value={draft.topCount ?? 20}
                onChange={(e) =>
                  update(
                    "topCount",
                    Math.max(1, Math.min(25, Number(e.target.value))),
                  )
                }
              />
            </label>
            <div className="rp-checks">
              {["showTable", "showChart"].map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={draft[k] !== false}
                    onChange={(e) => update(k, e.target.checked)}
                  />
                  {k === "showTable" ? "Show table" : "Show chart"}
                </label>
              ))}
            </div>
          </>
        )}
        {page.name.includes("Fee") && (
          <label>
            Advisor Fees (%)
            <input
              type="number"
              step=".05"
              min="0"
              max="10"
              value={draft.fee ?? 1}
              onChange={(e) => update("fee", Number(e.target.value))}
            />
          </label>
        )}
        {page.name === "Cash Sensitivity" && (
          <label>
            Cash Weight (%)
            <input
              type="number"
              min="0"
              max="100"
              value={draft.cash ?? 10}
              onChange={(e) => update("cash", Number(e.target.value))}
            />
          </label>
        )}
        {page.name.endsWith("Sensitivity") && (
          <label>
            Starting Investment ($)
            <input
              type="number"
              min="1"
              max="1000000000000"
              value={draft.investment ?? 100000}
              onChange={(e) => update("investment", Number(e.target.value))}
            />
          </label>
        )}
        {page.custom && page.layout.includes("graph") && (
          <>
            <h3>Market Graphs</h3>
            <p>
              Choose a ticker or market index (for example ^GSPC or ^TNX).
              Series are indexed to 100 for comparison.
            </p>
            {Array.from(
              { length: page.layout === "Two graphs with text" ? 2 : 1 },
              (_, i) => (
                <label key={i}>
                  Graph {i + 1} ticker
                  <input
                    maxLength={24}
                    value={draft.graphSymbols?.[i] || ""}
                    placeholder={i ? "^TNX" : "^GSPC"}
                    onChange={(e) => {
                      const symbols = [...(draft.graphSymbols || [])];
                      symbols[i] = e.target.value.toUpperCase();
                      update("graphSymbols", symbols.filter(Boolean));
                    }}
                  />
                </label>
              ),
            )}
          </>
        )}
        {page.custom &&
          page.layout.includes("image") &&
          [0, ...(page.layout.includes("two images") ? [1] : [])].map((i) => (
            <UploadImage
              key={i}
              label={`Image ${i + 1}`}
              value={draft.images?.[i]}
              onError={setError}
              onChange={(value) => {
                const images = [...(draft.images || [])];
                images[i] = value;
                update("images", images);
              }}
            />
          ))}
        {page.custom &&
          (page.layout.includes("cards") ||
            ["With bios", "Without bios"].includes(page.layout)) && (
            <>
              <h3>
                {page.layout.includes("bios")
                  ? "Team Members"
                  : "Feature Cards"}
              </h3>
              {(draft.cards || []).map((c, i) => (
                <div className="rp-edit-card" key={i}>
                  <label>
                    Title
                    <input
                      value={c.title}
                      maxLength={160}
                      onChange={(e) =>
                        update(
                          "cards",
                          draft.cards.map((x, j) =>
                            i === j ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={c.text}
                      maxLength={1000}
                      onChange={(e) =>
                        update(
                          "cards",
                          draft.cards.map((x, j) =>
                            i === j ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="rp-btn"
                    onClick={() =>
                      update(
                        "cards",
                        draft.cards.filter((_, j) => j !== i),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="rp-btn"
                disabled={draft.cards?.length >= 6}
                onClick={() =>
                  update("cards", [
                    ...(draft.cards || []),
                    { title: "New card", text: "" },
                  ])
                }
              >
                + Add{" "}
                {page.layout.includes("bios") ? "team member" : "feature card"}
              </button>
            </>
          )}
        {!page.custom &&
          ![
            "Disclosures",
            "Top Holdings",
            "Holdings Table",
            "Fee Comparison Table",
            "Fee Sensitivity",
            "Cash Sensitivity",
          ].includes(page.name) && (
            <p>
              This page uses the selected portfolios and dates. Change them in
              Details or hide this page in Pages.
            </p>
          )}
      </div>
    </Dialog>
  );
}

export default function ReportFlow({
  portfolios = [],
  templates = [],
  preparedBy = "",
  initial = null,
  onSave,
  onClose,
  saveDisabled = false,
}) {
  const [step, setStep] = useState(initial?.isTemplate ? "selection" : initial ? "builder" : "type");
  const [report, setReport] = useState(() =>
    initial
      ? reportFromItem(initial, preparedBy)
      : newReport("standard", "overview", preparedBy),
  );
  const [tab, setTab] = useState("Pages"),
    [selected, setSelected] = useState(
      initial?.report?.pages.find((p) => p.visible)?.id ||
        report.pages.find((p) => p.visible)?.id,
    ),
    [part, setPart] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [working, setWorking] = useState(false),
    [refresh, setRefresh] = useState(0),
    [edit, setEdit] = useState(null),
    [custom, setCustom] = useState(false),
    [menu, setMenu] = useState(false),
    [templateName, setTemplateName] = useState(null),
    [toast, setToast] = useState("");
  const drag = useRef(null),
    dialog = useRef(null),
    controls = useRef({});
  useEffect(() => {
    controls.current = { edit, custom, templateName, menu, onClose };
  }, [edit, custom, templateName, menu, onClose]);
  const signature = JSON.stringify([
    report.startDate,
    report.endDate,
    report.portfolios,
    report.pages.flatMap((p) => p.graphSymbols || []),
  ]);
  useEffect(() => {
    if (
      step !== "builder" ||
      report.snapshot ||
      (!report.portfolios.length &&
        !report.pages.some((p) => p.graphSymbols?.length))
    )
      return;
    const abort = new AbortController();
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const snapshot = await loadReportData(report, { signal: abort.signal });
        if (active) setReport((r) => ({ ...r, snapshot }));
      } catch (e) {
        if (active && e.name !== "AbortError") setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
      abort.abort();
    };
    // Page and brand changes keep the same financial snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, signature, refresh]);
  useEffect(() => {
    if (step !== "builder") return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const key = (e) => {
      const control = controls.current;
      if (
        e.key === "Escape" &&
        !control.edit &&
        !control.custom &&
        control.templateName === null
      ) {
        if (control.menu) setMenu(false);
        else control.onClose();
      }
      if (
        e.key === "Tab" &&
        !control.edit &&
        !control.custom &&
        control.templateName === null
      ) {
        const nodes = [
          ...dialog.current.querySelectorAll(
            'button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ),
        ].filter((n) => n.getClientRects().length);
        if (
          e.shiftKey &&
          (document.activeElement === nodes[0] ||
            document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    const el = dialog.current;
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [step]);
  const setSelection = (id) => {
    setSelected(id);
    setPart(0);
    setTab("Pages");
  };
  const sheets = reportSheets(report),
    selectedSheets = sheets.filter((s) => s.page.id === selected);
  const sheet =
    selectedSheets[Math.min(part, selectedSheets.length - 1)] || sheets[0];
  const number = Math.max(1, sheets.indexOf(sheet) + 1),
    currentPage = report.pages.find((p) => p.id === selected) || sheet?.page;
  const move = (id, delta) =>
    setReport((r) => {
      const pages = [...r.pages],
        index = pages.findIndex((p) => p.id === id),
        target = index + delta;
      if (target < 0 || target >= pages.length) return r;
      [pages[index], pages[target]] = [pages[target], pages[index]];
      return { ...r, pages };
    });
  const exportFile = async (format) => {
    setMenu(false);
    setWorking(true);
    setError("");
    try {
      await downloadDocument(reportRecord(report), format);
      setToast(`${format.toUpperCase()} downloaded`);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };
  const save = async (isTemplate, exportAfter = false) => {
    setError("");
    setWorking(true);
    try {
      const configured = {
        ...report,
        title: isTemplate ? templateName.trim() : report.title,
      };
      const item = reportRecord(configured, isTemplate);
      await onSave(item, isTemplate, exportAfter);
      if (exportAfter) {
        await downloadDocument(item, "pdf");
        onClose();
      }
      if (isTemplate) {
        setTemplateName(null);
        setToast("Template saved");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };
  const canContinue = () => {
    try {
      validateReport(report);
      if (!report.portfolios.length)
        throw new Error("Select your primary portfolio or fund.");
      setError("");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  if (step !== "builder")
    return (
      <Dialog
        title="Create Report"
        onClose={onClose}
        className={
          step === "type" || step === "template" ? "rp-chooser" : "rp-setup"
        }
        footer={
          step === "type" ? null : (
            <>
              <span className="rp-step">
                {step === "selection"
                  ? "Step 1 of 2"
                  : step === "details"
                    ? "Step 2 of 2"
                    : ""}
              </span>
              <button
                className="rp-btn"
                onClick={() => {
                  setError("");
                  setStep(
                    step === "template"
                      ? "type"
                      : step === "selection"
                        ? "template"
                        : "selection",
                  );
                }}
              >
                Back
              </button>
              {step !== "template" && (
                <button
                  className="rp-btn primary"
                  disabled={step === "selection" && !report.portfolios.length}
                  onClick={() => {
                    if (canContinue()) {
                      setStep(step === "selection" ? "details" : "builder");
                      setSelected(report.pages.find((p) => p.visible).id);
                    }
                  }}
                >
                  Next
                </button>
              )}
            </>
          )
        }
      >
        {error && (
          <p className="rp-error" role="alert">
            {error}
          </p>
        )}
        {step === "type" && (
          <div className="rp-type-cards">
            {REPORT_TYPES.map((t) => (
              <button
                className="rp-type-card"
                key={t.id}
                onClick={() => {
                  setReport(newReport(t.id, "overview", preparedBy));
                  setStep("template");
                }}
              >
                <ReportArt type={t.id} />
                <div>
                  <strong>{t.name}</strong>
                  <p>{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {step === "template" && (
          <>
            <h3>Default Templates</h3>
            <div className="rp-type-cards">
              {[
                ["blank", "Blank", "Get started from scratch"],
                ["overview", "Luna Template", "Overview Summary Report"],
                ["proposal", "Luna Template", "Client Proposal"],
              ].map(([id, caption, name]) => (
                <button
                  className="rp-type-card"
                  key={id}
                  onClick={() => {
                    setReport(newReport(report.type, id, preparedBy));
                    setStep("selection");
                  }}
                >
                  <ReportArt type={report.type} />
                  <div>
                    <small>{caption}</small>
                    <strong>{name}</strong>
                  </div>
                </button>
              ))}
            </div>
            <h3>Your Templates</h3>
            {templates.filter((t) => t.report?.type === report.type).length ? (
              <div className="rp-template-list">
                {templates
                  .filter((t) => t.report?.type === report.type)
                  .map((t) => (
                    <button
                      className="rp-btn"
                      key={t.id}
                      onClick={() => {
                        setReport({
                          ...structuredClone(t.report),
                          preparedBy,
                          portfolios: [],
                          snapshot: null,
                        });
                        setStep("selection");
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
              </div>
            ) : (
              <p className="rp-muted">Templates you create will appear here.</p>
            )}
          </>
        )}
        {step === "selection" && (
          <>
            <p className="rp-lede">
              Select your primary portfolio or fund <small>(Required)</small>
            </p>
            <Selection
              report={report}
              setReport={setReport}
              portfolios={portfolios}
            />
            <p className="rp-muted">
              {report.type === "comparison"
                ? "Compare up to five portfolios or funds."
                : "Select your comparison portfolio or fund (Optional)."}
            </p>
          </>
        )}
        {step === "details" && (
          <>
            <p className="rp-lede">
              Configure your report with this important information.
            </p>
            <Details
              report={report}
              setReport={setReport}
              portfolios={portfolios}
              onError={setError}
              includePortfolios={false}
            />
          </>
        )}
      </Dialog>
    );
  return createPortal(
    <section
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Create Report"
      className="rp-builder"
    >
      <header className="rp-builder-head">
        <h2>
          {initial && !initial.isTemplate ? "Edit Report" : "Create Report"}
        </h2>
        <button
          className="rp-btn"
          disabled={working || saveDisabled}
          onClick={() => setTemplateName(`${report.title} Template`)}
        >
          ▣ Save as Template
        </button>
        <button
          className="rp-icon"
          aria-label="Close report builder"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="rp-builder-body">
        <aside className="rp-rail">
          <div className="rp-tabs" role="tablist">
            {["Pages", "Details", "Style"].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={t === tab}
                className={t === tab ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="rp-rail-content">
            {tab === "Pages" && (
              <>
                <button
                  className="rp-btn rp-add-page"
                  onClick={() => setCustom(true)}
                >
                  ＋ Add Custom Page
                </button>
                <ol className="rp-pages">
                  {report.pages.map((p, i) => (
                    <li
                      key={p.id}
                      className={`${p.id === selected ? "active" : ""} ${!p.visible ? "hidden-page" : ""}`}
                      draggable
                      onDragStart={() => {
                        drag.current = p.id;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = report.pages.findIndex(
                          (x) => x.id === drag.current,
                        );
                        if (from < 0) return;
                        setReport((r) => {
                          const pages = [...r.pages],
                            [item] = pages.splice(from, 1);
                          pages.splice(i, 0, item);
                          return { ...r, pages };
                        });
                        drag.current = null;
                      }}
                    >
                      <span className="rp-page-number">
                        {p.visible
                          ? report.pages
                              .slice(0, i + 1)
                              .filter((x) => x.visible).length
                          : ""}
                      </span>
                      <button
                        className="rp-page-name"
                        onClick={() => setSelection(p.id)}
                      >
                        <span aria-hidden="true">
                          {p.name === "Cover" ? "▣" : p.custom ? "▤" : "▥"}
                        </span>
                        {p.displayTitle || p.name}
                      </button>
                      <div className="rp-page-actions">
                        <button
                          aria-label={`${p.visible ? "Hide" : "Show"} ${p.name}`}
                          title={`${p.visible ? "Hide" : "Show"} page`}
                          onClick={() => {
                            if (
                              p.visible &&
                              report.pages.filter((x) => x.visible).length === 1
                            ) {
                              setError("Show at least one page.");
                              return;
                            }
                            setReport((r) => ({
                              ...r,
                              pages: r.pages.map((x) =>
                                x.id === p.id
                                  ? { ...x, visible: !x.visible }
                                  : x,
                              ),
                            }));
                          }}
                        >
                          {p.visible ? "◉" : "⊘"}
                        </button>
                        <button
                          aria-label={`Move ${p.name} up`}
                          disabled={i === 0}
                          onClick={() => move(p.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${p.name} down`}
                          disabled={i === report.pages.length - 1}
                          onClick={() => move(p.id, 1)}
                        >
                          ↓
                        </button>
                        {p.custom && (
                          <button
                            aria-label={`Delete ${p.name}`}
                            onClick={() => {
                              if (
                                p.visible &&
                                report.pages.filter((x) => x.visible).length ===
                                  1
                              ) {
                                setError("Show at least one page.");
                                return;
                              }
                              setReport((r) => ({
                                ...r,
                                pages: r.pages.filter((x) => x.id !== p.id),
                              }));
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {tab === "Details" && (
              <Details
                report={report}
                setReport={setReport}
                portfolios={portfolios}
                onError={setError}
              />
            )}
            {tab === "Style" && (
              <div className="rp-form">
                <h3>Cover Design</h3>
                <div className="rp-cover-choices">
                  {["gradient", "geometric", "none"].map((c) => (
                    <button
                      aria-pressed={report.style.cover === c}
                      key={c}
                      className={`${c} ${report.style.cover === c ? "active" : ""}`}
                      onClick={() =>
                        setReport((r) => ({
                          ...r,
                          style: { ...r.style, cover: c },
                        }))
                      }
                    >
                      <span style={{ "--report-color": report.style.color }} />
                      {c[0].toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
                <h3>Brand Color</h3>
                <label>
                  Choose your brand color
                  <input
                    type="color"
                    value={report.style.color}
                    onChange={(e) =>
                      setReport((r) => ({
                        ...r,
                        style: { ...r.style, color: e.target.value },
                      }))
                    }
                  />
                </label>
                <UploadImage
                  value={report.style.logo}
                  onChange={(logo) =>
                    setReport((r) => ({ ...r, style: { ...r.style, logo } }))
                  }
                  onError={setError}
                />
              </div>
            )}
          </div>
        </aside>
        <main className="rp-canvas">
          <div className="rp-canvas-toolbar">
            <div className="rp-pagination">
              <button
                className="rp-icon"
                aria-label="Previous page"
                disabled={number <= 1}
                onClick={() => {
                  const s = sheets[number - 2];
                  setSelected(s.page.id);
                  setPart(s.part);
                }}
              >
                ‹
              </button>
              <span>
                {selectedSheets.length > 1
                  ? `${part + 1} of ${selectedSheets.length}`
                  : "1 of 1"}
              </span>
              <button
                className="rp-icon"
                aria-label="Next page"
                disabled={number >= sheets.length}
                onClick={() => {
                  const s = sheets[number];
                  setSelected(s.page.id);
                  setPart(s.part);
                }}
              >
                ›
              </button>
            </div>
            <button
              className="rp-btn"
              disabled={loading}
              onClick={() => {
                setReport((r) => ({ ...r, snapshot: null }));
                setRefresh((r) => r + 1);
              }}
            >
              {loading ? "Loading data…" : "↻ Refresh Data"}
            </button>
            <button className="rp-btn" onClick={() => setEdit(currentPage)}>
              ✎ Edit Page
            </button>
          </div>
          {error && (
            <p role="alert" className="rp-error">
              {error}
            </p>
          )}
          {loading && (
            <p className="rp-canvas-message" role="status">
              Loading holdings and price history…
            </p>
          )}
          {currentPage && !currentPage.visible && (
            <p className="rp-canvas-message">
              This page is hidden from your saved report.
            </p>
          )}
          <div className="rp-paper-wrap">
            {sheet && (
              <ReportSheet
                report={report}
                sheet={
                  currentPage && !currentPage.visible
                    ? { page: currentPage, part: 0, count: 1 }
                    : sheet
                }
                number={number}
              />
            )}
          </div>
          <p className="rp-preview-caption">
            {REPORT_TYPES.find((t) => t.id === report.type).name} ·{" "}
            {sheets.length} {sheets.length === 1 ? "page" : "pages"} ·{" "}
            {report.snapshot
              ? `Data captured ${new Date(report.snapshot.capturedAt).toLocaleString()}`
              : loading
                ? "Loading data..."
                : "Select a portfolio in Details to load data"}
          </p>
        </main>
      </div>
      <footer className="rp-builder-foot">
        <span role="status">
          {toast ||
            `${loading ? "Loading data" : "PDF and CSV exports"} · ${sheets.length} ${sheets.length === 1 ? "page" : "pages"}`}
        </span>
        <button className="rp-btn" onClick={onClose}>
          Cancel
        </button>
        <div className="rp-split">
          <button
            className="rp-btn primary"
            disabled={
              working || loading || saveDisabled || !report.title.trim()
            }
            onClick={() => save(false)}
          >
            {working ? "Saving…" : "Save Report"}
          </button>
          <button
            className="rp-btn primary"
            aria-label="Open export menu"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            ⌄
          </button>
          {menu && (
            <div className="rp-export-menu">
              <button
                disabled={working || loading}
                onClick={() => exportFile("pdf")}
              >
                Export PDF
              </button>
              <button
                disabled={working || loading || saveDisabled}
                onClick={() => {
                  setMenu(false);
                  save(false, true);
                }}
              >
                Save and Export
              </button>
              <button
                disabled={working || loading}
                onClick={() => exportFile("csv")}
              >
                Download CSV
              </button>
            </div>
          )}
        </div>
      </footer>
      {edit && (
        <PageEditor
          page={edit}
          onClose={() => setEdit(null)}
          onSave={(page) => {
            setReport((r) => ({
              ...r,
              ...(JSON.stringify(edit.graphSymbols || []) !==
              JSON.stringify(page.graphSymbols || [])
                ? { snapshot: null }
                : {}),
              pages: r.pages.map((p) => (p.id === page.id ? page : p)),
            }));
            setEdit(null);
          }}
        />
      )}
      {custom && (
        <Dialog
          title="Add a custom page"
          className="rp-custom-chooser"
          onClose={() => setCustom(false)}
        >
          {["Editorial", "Team Pages", "Macro Graphs", "Feature Cards"].map(
            (group) => (
              <section key={group}>
                <h3>{group}</h3>
                <div className="rp-custom-layouts">
                  {CUSTOM_LAYOUTS.filter(([g]) => g === group).map(
                    ([, layout]) => (
                      <button
                        className="rp-custom-card"
                        key={layout}
                        onClick={() => {
                          const p = {
                            id: crypto.randomUUID(),
                            name: group === "Editorial" ? "Custom Page" : group,
                            custom: true,
                            visible: true,
                            layout,
                            text: "",
                            images: [],
                            cards: [],
                            graphSymbols:
                              group === "Macro Graphs"
                                ? layout === "Two graphs with text"
                                  ? ["^GSPC", "^TNX"]
                                  : ["^GSPC"]
                                : [],
                            columns: [],
                            topCount: 20,
                          };
                          setReport((r) => ({
                            ...r,
                            ...(p.graphSymbols.length
                              ? { snapshot: null }
                              : {}),
                            pages: [...r.pages, p],
                          }));
                          setSelection(p.id);
                          setCustom(false);
                          setEdit(p);
                        }}
                      >
                        <span
                          className={`rp-layout-art ${layout.includes("image") ? "image" : ""}`}
                        >
                          ▤
                        </span>
                        <small>{group}</small>
                        <strong>{layout}</strong>
                      </button>
                    ),
                  )}
                </div>
              </section>
            ),
          )}
        </Dialog>
      )}
      {templateName !== null && (
        <Dialog
          title="Save as Template"
          onClose={() => setTemplateName(null)}
          footer={
            <>
              <button className="rp-btn" onClick={() => setTemplateName(null)}>
                Cancel
              </button>
              <button
                className="rp-btn primary"
                disabled={working || !templateName.trim()}
                onClick={() => save(true)}
              >
                Save Template
              </button>
            </>
          }
        >
          <label className="rp-form">
            Template Name
            <input
              value={templateName}
              maxLength={160}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="rp-error">
              {error}
            </p>
          )}
          <p className="rp-muted">
            Saves pages, details and styling for reuse. Portfolio selections and
            market data are selected for each new report.
          </p>
        </Dialog>
      )}
    </section>,
    document.body,
  );
}
