"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import {
  STAGES,
  RISKS,
  clientValue,
  clientsCsv,
  reviewDue,
  validateClient,
} from "@/lib/financeCrm.mjs";
import { demoClients } from "@/lib/financeCrmDemo.mjs";
import { MODEL_PORTFOLIOS } from "@/lib/portfolioModels";
import s from "./FinanceCRM.module.css";

const money = (value) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
const dateLabel = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not scheduled";
const blankClient = () => ({
  name: "",
  email: "",
  phone: "",
  advisor: "",
  stage: "Prospect",
  risk: "Moderate",
  nextReview: "",
  lastContact: "",
  notes: "",
  portfolios: [],
});
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
const strategies = (client) => [
  ...new Set(client.portfolios.map((p) => p.strategy).filter(Boolean)),
];

function Icon({ name, ...props }) {
  const paths = {
    clients:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    portfolio: "M3 7h18v14H3zM8 7V3h8v4M3 12h18M10 12v3h4v-3",
    strategy: "M4 20V10M10 20V4M16 20v-8M22 20V7",
    calendar: "M8 2v4M16 2v4M3 10h18M3 4h18v18H3z",
    search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    export: "M12 16V2m-5 5 5-5 5 5M3 14v7h18v-7",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M6 18 18 6",
    arrow: "m9 5 7 7-7 7",
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.clients} />
    </svg>
  );
}

export default function FinanceCRM() {
  const { data: session, status } = useSession();
  // A key change unmounts all client data and editors when the account changes.
  if (status === "loading")
    return <div className={s.loading}>Loading Finance CRM…</div>;
  return (
    <Workspace key={session?.user?.id || "demo"} account={session?.user?.id} />
  );
}

function Workspace({ account }) {
  const [clients, setClients] = useState(() => (account ? [] : demoClients()));
  const [loading, setLoading] = useState(Boolean(account));
  const [error, setError] = useState("");
  const [view, setView] = useState("Clients");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("All stages");
  const [risk, setRisk] = useState("All risk profiles");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const selectAll = useRef(null);
  const reload = useCallback(async (signal) => {
    try {
      const response = await fetch("/api/advisor-clients", {
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setClients(data.clients);
      setSelected([]);
      setError("");
    } catch (e) {
      if (e.name !== "AbortError")
        setError(e.message || "Could not load clients.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    // reload only updates state after the request resolves; this effect starts
    // the external account-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(controller.signal);
    return () => controller.abort();
  }, [account, reload]);
  function refresh() {
    setLoading(true);
    setError("");
    reload();
  }

  const shown = clients
    .filter((c) => {
      const matches =
        `${c.name} ${c.email} ${c.advisor} ${strategies(c).join(" ")} ${c.portfolios.map((p) => p.name).join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      return (
        matches &&
        (stage === "All stages" || c.stage === stage) &&
        (risk === "All risk profiles" || c.risk === risk) &&
        (view !== "Reviews" || reviewDue(c))
      );
    })
    .sort((a, b) =>
      sort === "value"
        ? clientValue(b) - clientValue(a)
        : sort === "review"
          ? (a.nextReview || "9999").localeCompare(b.nextReview || "9999")
          : a.name.localeCompare(b.name),
    );
  const checked = shown.filter((c) => selected.includes(c.id));
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        checked.length > 0 && checked.length < shown.length;
  }, [checked.length, shown.length]);
  const portfolioCount = clients.reduce(
    (sum, c) => sum + c.portfolios.length,
    0,
  );
  const strategyRows = [...new Set(shown.flatMap(strategies))]
    .sort()
    .map((name) => {
      const matching = shown.filter((c) => strategies(c).includes(name));
      const portfolios = matching.flatMap((c) =>
        c.portfolios.filter((p) => p.strategy === name),
      );
      return {
        name,
        clients: matching.length,
        portfolios: portfolios.length,
        value: portfolios.reduce((sum, p) => sum + (p.value || 0), 0),
      };
    });

  async function save(client) {
    let saved = {
      ...validateClient(client),
      id: client.id || crypto.randomUUID(),
      revision: (client.revision || 0) + 1,
    };
    if (account) {
      const response = await fetch("/api/advisor-clients", {
        method: client.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      saved = data.client;
    }
    setClients((rows) =>
      client.id
        ? rows.map((c) => (c.id === saved.id ? saved : c))
        : [saved, ...rows],
    );
    setEditing(null);
    setNotice(
      account
        ? "Client saved."
        : "Sample updated for this session. Sign in to save real clients.",
    );
  }
  async function remove(client) {
    if (account) {
      const response = await fetch("/api/advisor-clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id, revision: client.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    }
    setClients((rows) => rows.filter((c) => c.id !== client.id));
    setSelected((ids) => ids.filter((id) => id !== client.id));
    setEditing(null);
    setNotice("Client deleted.");
  }
  function exportClients() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", clientsCsv(checked.length ? checked : shown)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = account ? "finance-crm.csv" : "finance-crm-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${checked.length || shown.length} clients.`);
  }

  return (
    <section className={s.crm} aria-label="Finance CRM">
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <span className={s.brandIcon}>
            <Icon name="portfolio" />
          </span>
          <div>
            <strong>Finance CRM</strong>
            <small>Your client book</small>
          </div>
        </div>
        <nav aria-label="CRM views">
          {[
            ["Clients", "clients", clients.length],
            ["Portfolios", "portfolio", portfolioCount],
            [
              "Strategies",
              "strategy",
              new Set(clients.flatMap(strategies)).size,
            ],
            ["Reviews", "calendar", clients.filter((c) => reviewDue(c)).length],
          ].map(([label, icon, count]) => (
            <button
              key={label}
              className={view === label ? s.navActive : ""}
              onClick={() => {
                setView(label);
                setSelected([]);
              }}
            >
              <Icon name={icon} />
              {label}
              <span>{count}</span>
            </button>
          ))}
        </nav>
        <div className={s.sideGroup}>
          <h2>Client book</h2>
          {STAGES.map((item, i) => (
            <button
              key={item}
              onClick={() => {
                setStage(stage === item ? "All stages" : item);
                setView("Clients");
              }}
              aria-pressed={stage === item}
            >
              <i className={s.dot} data-tone={i} />
              {item}
              <span>{clients.filter((c) => c.stage === item).length}</span>
            </button>
          ))}
        </div>
        <div className={s.sideGroup}>
          <h2>Advisor tools</h2>
          <Link href="/client-portfolios">
            <Icon name="portfolio" />
            Portfolio builder
          </Link>
          <Link href="/model-portfolios">
            <Icon name="strategy" />
            Model portfolios
          </Link>
          <Link href="/reports">
            <Icon name="export" />
            Reports
          </Link>
        </div>
        <div className={s.sideFoot}>
          <span className={s.liveDot} />
          <div>
            {account ? "Private workspace" : "Sample workspace"}
            <small>
              {account
                ? "Saved to your account"
                : "Explore with fictional clients"}
            </small>
          </div>
        </div>
      </aside>
      <div className={s.main}>
        <header className={s.header}>
          <div>
            <h1>{view}</h1>
            <span className={s.badge}>{account ? "Private" : "Demo"}</span>
          </div>
          <button
            className={s.primary}
            disabled={loading || Boolean(error)}
            onClick={() => setEditing(blankClient())}
          >
            <Icon name="plus" />
            New client
          </button>
        </header>
        <div className={s.tabs} aria-label="Client views">
          {["Clients", "Portfolios", "Strategies", "Reviews"].map((tab) => (
            <button
              key={tab}
              aria-pressed={view === tab}
              className={view === tab ? s.tabActive : ""}
              onClick={() => {
                setView(tab);
                setSelected([]);
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        {!account && (
          <div className={s.demoBanner}>
            <span>Sample data. Changes last for this session only.</span>
            <button onClick={() => setAuthOpen(true)}>
              Sign in to save clients <Icon name="arrow" />
            </button>
          </div>
        )}
        <div className={s.toolbar}>
          <label className={s.search}>
            <Icon name="search" />
            <input
              aria-label="Search clients"
              placeholder="Search your client book…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Sort clients"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Sort: Client name</option>
            <option value="value">Sort: Portfolio value</option>
            <option value="review">Sort: Next review</option>
          </select>
          <select
            aria-label="Filter stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {["All stages", ...STAGES].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Filter risk"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
          >
            {["All risk profiles", ...RISKS].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <button
            className={s.export}
            onClick={exportClients}
            disabled={!shown.length || loading}
          >
            <Icon name="export" />
            Export{checked.length ? ` (${checked.length})` : ""}
          </button>
          {account && (
            <button onClick={refresh} disabled={loading}>
              Refresh
            </button>
          )}
        </div>
        {error && (
          <div className={s.error} role="alert">
            {error}{" "}
            <button onClick={refresh} disabled={loading}>
              Retry
            </button>
          </div>
        )}
        <div className={s.tableWrap}>
          {view === "Strategies" ? (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Clients</th>
                  <th>Portfolios</th>
                  <th className={s.numeric}>Entered value · USD</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {strategyRows.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <span className={s.tag} data-tone="strategy">
                        {row.name}
                      </span>
                    </td>
                    <td>{row.clients}</td>
                    <td>{row.portfolios}</td>
                    <td className={s.numeric}>{money(row.value)}</td>
                    <td>
                      <button
                        className={s.textButton}
                        onClick={() => {
                          setQuery(row.name);
                          setView("Clients");
                        }}
                      >
                        View clients <Icon name="arrow" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : view === "Portfolios" ? (
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Portfolio</th>
                  <th>Client</th>
                  <th>Strategy</th>
                  <th>Holdings</th>
                  <th className={s.numeric}>Entered value · USD</th>
                  <th>Valuation date</th>
                </tr>
              </thead>
              <tbody>
                {shown.flatMap((c) =>
                  c.portfolios.map((p, i) => (
                    <tr key={`${c.id}-${i}`}>
                      <td>
                        <button
                          className={s.nameButton}
                          onClick={() => setEditing(c)}
                        >
                          {p.name}
                        </button>
                      </td>
                      <td>{c.name}</td>
                      <td>
                        <span className={s.tag} data-tone="strategy">
                          {p.strategy || "Unassigned"}
                        </span>
                      </td>
                      <td className={s.holdings} title={p.holdings}>
                        {p.holdings || "—"}
                      </td>
                      <td className={s.numeric}>
                        {p.value == null ? "—" : money(p.value)}
                      </td>
                      <td>
                        {p.valueDate ? dateLabel(p.valueDate) : "Not entered"}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          ) : (
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.checkbox}>
                    <input
                      ref={selectAll}
                      type="checkbox"
                      aria-label="Select all visible clients"
                      checked={
                        shown.length > 0 && checked.length === shown.length
                      }
                      disabled={!shown.length}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [
                                ...new Set([
                                  ...selected,
                                  ...shown.map((c) => c.id),
                                ]),
                              ]
                            : selected.filter(
                                (id) => !shown.some((c) => c.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  <th>Client / household</th>
                  <th>Stage & strategy</th>
                  <th>Advisor</th>
                  <th>Portfolios</th>
                  <th className={s.numeric}>Entered value · USD</th>
                  <th>Risk profile</th>
                  <th>Next review</th>
                  <th>Last contact</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((c, i) => (
                  <tr
                    key={c.id}
                    className={selected.includes(c.id) ? s.selected : ""}
                  >
                    <td className={s.checkbox}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name}`}
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.id]
                              : selected.filter((id) => id !== c.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className={s.nameButton}
                        onClick={() => setEditing(c)}
                      >
                        <span className={s.avatar} data-tone={i % 4}>
                          {initials(c.name)}
                        </span>
                        {c.name}
                      </button>
                    </td>
                    <td>
                      <div className={s.tags}>
                        <span className={s.tag} data-tone={c.stage}>
                          {c.stage}
                        </span>
                        {strategies(c)
                          .slice(0, 1)
                          .map((strategy) => (
                            <span
                              key={strategy}
                              className={s.tag}
                              data-tone="strategy"
                            >
                              {strategy}
                            </span>
                          ))}
                        {strategies(c).length > 1 && (
                          <span
                            className={s.more}
                            title={strategies(c).join(", ")}
                          >
                            +{strategies(c).length - 1}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {c.advisor || <span className={s.muted}>Unassigned</span>}
                    </td>
                    <td>{c.portfolios.length}</td>
                    <td className={s.numeric}>
                      {c.portfolios.some((p) => p.value != null)
                        ? money(clientValue(c))
                        : "—"}
                    </td>
                    <td>
                      <div className={s.risk}>
                        <span aria-hidden="true" className={s.riskBars}>
                          {[0, 1, 2, 3].map((n) => (
                            <i
                              key={n}
                              data-filled={n <= RISKS.indexOf(c.risk)}
                              data-level={RISKS.indexOf(c.risk)}
                            />
                          ))}
                        </span>
                        {c.risk}
                      </div>
                    </td>
                    <td>
                      <span className={reviewDue(c) ? s.due : s.date}>
                        <Icon name="calendar" />
                        {dateLabel(c.nextReview)}
                      </span>
                    </td>
                    <td className={s.muted}>
                      {c.lastContact ? dateLabel(c.lastContact) : "—"}
                    </td>
                    <td>
                      <button
                        className={s.rowButton}
                        aria-label={`Open ${c.name}`}
                        onClick={() => setEditing(c)}
                      >
                        <Icon name="arrow" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {loading ? (
            <div className={s.empty}>Loading your client book…</div>
          ) : (
            (!shown.length ||
              (view === "Strategies" && !strategyRows.length) ||
              (view === "Portfolios" &&
                !shown.some((c) => c.portfolios.length))) && (
              <div className={s.empty}>
                <Icon
                  name={view === "Reviews" ? "calendar" : "clients"}
                  width="28"
                  height="28"
                />
                <h2>
                  {view === "Reviews"
                    ? "No reviews due"
                    : clients.length
                      ? "No matching records"
                      : "Your client book starts here"}
                </h2>
                <p>
                  {view === "Reviews"
                    ? "Clients with a review due today or earlier appear here."
                    : "Add a client or adjust your filters to see records here."}
                </p>
                <button
                  onClick={() => {
                    setQuery("");
                    setStage("All stages");
                    setRisk("All risk profiles");
                    if (!clients.length) setEditing(blankClient());
                  }}
                >
                  {clients.length ? "Clear filters" : "Add your first client"}
                </button>
              </div>
            )
          )}
        </div>
        <footer className={s.tableFoot}>
          <span>
            {shown.length} clients in view
            {checked.length ? ` · ${checked.length} selected` : ""}
          </span>
          <span>
            {shown.reduce((n, c) => n + c.portfolios.length, 0)} portfolios
          </span>
          <span>
            Entered value{" "}
            <strong>
              {money(shown.reduce((n, c) => n + clientValue(c), 0))}
            </strong>
          </span>
        </footer>
        <div className={s.bottomNote}>
          <span>
            Values are manually recorded snapshots. Missing values are excluded
            from totals.
          </span>
          <span role="status">{notice}</span>
        </div>
      </div>
      {editing && (
        <ClientEditor
          client={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={remove}
          demo={!account}
        />
      )}
      {authOpen && (
        <AuthModal
          mode="signin"
          reason="Sign in to save your private client book."
          onClose={() => setAuthOpen(false)}
        />
      )}
    </section>
  );
}

function ClientEditor({ client, onClose, onSave, onDelete, demo }) {
  const [draft, setDraft] = useState(() => structuredClone(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const el = dialog.current;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const updatePortfolio = (index, key, value) =>
    setDraft((d) => ({
      ...d,
      portfolios: d.portfolios.map((p, i) =>
        i === index ? { ...p, [key]: value } : p,
      ),
    }));
  async function perform(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message || "Could not save. Please try again.");
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={s.drawer}
      aria-labelledby="crm-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) closeRef.current();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          perform(() => onSave(draft));
        }}
      >
        <header className={s.drawerHead}>
          <div>
            <small>{demo ? "Sample client" : "Client record"}</small>
            <h2 id="crm-editor-title">
              {client.id ? client.name : "New client"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close client editor"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <fieldset disabled={busy} className={s.editorFields}>
          <div className={s.formGrid}>
            <label className={s.full}>
              Client / household name
              <input
                autoFocus
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Morgan household"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                maxLength={254}
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                maxLength={50}
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </label>
            <label>
              Advisor
              <input
                maxLength={120}
                value={draft.advisor}
                onChange={(e) => set("advisor", e.target.value)}
                placeholder="Assigned advisor"
              />
            </label>
            <label>
              Stage
              <select
                value={draft.stage}
                onChange={(e) => set("stage", e.target.value)}
              >
                {STAGES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Risk profile
              <select
                value={draft.risk}
                onChange={(e) => set("risk", e.target.value)}
              >
                {RISKS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Next review
              <input
                type="date"
                value={draft.nextReview}
                onChange={(e) => set("nextReview", e.target.value)}
              />
            </label>
            <label>
              Last contact
              <input
                type="date"
                value={draft.lastContact}
                onChange={(e) => set("lastContact", e.target.value)}
              />
            </label>
          </div>
          <div className={s.sectionHead}>
            <h3>
              Portfolios & strategies <span>{draft.portfolios.length}</span>
            </h3>
            <button
              type="button"
              disabled={draft.portfolios.length >= 50}
              onClick={() =>
                set("portfolios", [
                  ...draft.portfolios,
                  {
                    name: "",
                    strategy: "",
                    value: "",
                    valueDate: "",
                    holdings: "",
                  },
                ])
              }
            >
              <Icon name="plus" />
              Add portfolio
            </button>
          </div>
          {!draft.portfolios.length && (
            <p className={s.formHint}>
              Add the investment accounts or strategies you track for this
              client.
            </p>
          )}
          {draft.portfolios.map((p, i) => (
            <section
              className={s.portfolioForm}
              key={i}
              aria-label={`Portfolio ${i + 1}`}
            >
              <div className={s.portfolioHead}>
                <strong>Portfolio {i + 1}</strong>
                <button
                  type="button"
                  aria-label={`Remove portfolio ${i + 1}`}
                  onClick={() =>
                    set(
                      "portfolios",
                      draft.portfolios.filter((_, j) => i !== j),
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <div className={s.formGrid}>
                <label>
                  Portfolio name
                  <input
                    required
                    maxLength={120}
                    value={p.name}
                    onChange={(e) => updatePortfolio(i, "name", e.target.value)}
                  />
                </label>
                <label>
                  Strategy
                  <input
                    list="crm-strategies"
                    maxLength={120}
                    value={p.strategy}
                    onChange={(e) =>
                      updatePortfolio(i, "strategy", e.target.value)
                    }
                    placeholder="Choose or write a strategy"
                  />
                </label>
                <label>
                  Entered value (USD)
                  <input
                    type="number"
                    min="0"
                    max="1000000000000"
                    step="0.01"
                    value={p.value ?? ""}
                    onChange={(e) =>
                      updatePortfolio(i, "value", e.target.value)
                    }
                    placeholder="Not entered"
                  />
                </label>
                <label>
                  Valuation date
                  <input
                    type="date"
                    value={p.valueDate}
                    onChange={(e) =>
                      updatePortfolio(i, "valueDate", e.target.value)
                    }
                  />
                </label>
                <label className={s.full}>
                  Holdings / allocation notes
                  <textarea
                    maxLength={3000}
                    rows={2}
                    value={p.holdings}
                    onChange={(e) =>
                      updatePortfolio(i, "holdings", e.target.value)
                    }
                    placeholder="e.g. VTI 60%, VXUS 20%, BND 20%"
                  />
                </label>
              </div>
            </section>
          ))}
          <datalist id="crm-strategies">
            {[
              "Core equity",
              "Balanced income",
              "Capital preservation",
              "Tax-aware growth",
              "Global opportunities",
              ...MODEL_PORTFOLIOS.map((m) => m.name),
            ].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <label className={s.notes}>
            Client notes
            <textarea
              rows={5}
              maxLength={10000}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Objectives, meeting notes, and next steps…"
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        {confirmDelete && (
          <div className={s.deleteConfirm}>
            <p>
              Delete this client and all their CRM portfolios? This cannot be
              undone.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => perform(() => onDelete(client))}
            >
              Delete permanently
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Keep client
            </button>
          </div>
        )}
        <footer className={s.drawerFoot}>
          {client.id && (
            <button
              className={s.deleteButton}
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete client
            </button>
          )}
          <span />{" "}
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={s.primary}>
            {busy ? "Saving…" : "Save client"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
