"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TickerInput from "@/components/TickerInput";
import PortfolioWheel from "@/components/PortfolioWheel";
import { holdingColors } from "@/lib/portfolioColors";
import { extractPdfText, parseHoldings } from "@/lib/parseHoldings";
import { MODEL_PORTFOLIOS } from "@/lib/portfolioModels";

// The Advisor Tools screens. All three are the same shape - a searchable table
// of saved things with a toolbar over it - and differ in what a row is:
//
//   clients  portfolios the advisor built, each a list of holdings
//   models   the strategy shelf, whose rows are read-only starting points
//   reports  reports generated off either of the above
//
// The return columns are not stored on a row. They are computed from the
// holdings by /api/portfolio-performance whenever the table is shown, because
// a saved return is wrong the next morning.
//
// ponytail: localStorage, same as the watchlist's anonymous path. These are
// the advisor's own saved views; moving them to the API is the change to make
// when they need to follow a login across devices.
const KEY = (kind) => `advisor:${kind}`;

function load(kind) {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY(kind)) ?? "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function save(kind, rows) {
  try {
    localStorage.setItem(KEY(kind), JSON.stringify(rows));
  } catch {}
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

const pct = (v) =>
  v == null ? "-" : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;

const money = (v) =>
  v == null
    ? "-"
    : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const PCT_COLS = [
  ["mtd", "Total Return (MTD)"],
  ["ytd", "Total Return (YTD)"],
  ["y1", "Total Return (1Y)"],
  ["cagr3", "Tot. Return %, CAGR (3Y)"],
  ["cagr5", "Tot. Return %, CAGR (5Y)"],
  ["cagr10", "Tot. Return %, CAGR (10Y)"],
];

const CONFIG = {
  clients: {
    title: "Client Portfolios",
    nameLabel: "Portfolio name",
    addLabel: "Add New",
    empty: "No client portfolios yet. Add one to get started.",
  },
  models: {
    title: "Model Portfolios",
    nameLabel: "Portfolio name",
    addLabel: "Add New",
    empty: "No model portfolios yet.",
  },
  reports: {
    title: "Reports",
    nameLabel: "Report title",
    addLabel: "Create Report",
    empty: "No reports yet. Create one to get started.",
  },
};

// Performance for many portfolios at once. One request per portfolio rather
// than one combined call, because each has its own weighting and the server
// memoises the per-symbol price series they share - two portfolios both
// holding VTI cost one fetch between them.
function usePerformance(rows) {
  const [perf, setPerf] = useState({});

  // The identity of the work, so a re-render that changes nothing about the
  // holdings does not refetch. Names and dates are deliberately not in here.
  const signature = useMemo(
    () =>
      rows
        .map(
          (r) =>
            `${r.id}:${(r.holdings ?? [])
              .map((h) => `${h.symbol}@${h.shares ?? ""}/${h.weight ?? ""}`)
              .join("|")}`
        )
        .join(";"),
    [rows]
  );

  useEffect(() => {
    let live = true;
    const withHoldings = rows.filter((r) => r.holdings?.length);
    if (!withHoldings.length) return;

    Promise.all(
      withHoldings.map(async (row) => {
        try {
          const res = await fetch("/api/portfolio-performance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holdings: row.holdings }),
          });
          if (!res.ok) return [row.id, null];
          return [row.id, await res.json()];
        } catch {
          return [row.id, null];
        }
      })
    ).then((pairs) => {
      if (live) setPerf(Object.fromEntries(pairs));
    });

    return () => {
      live = false;
    };
    // signature is the real dependency; rows is read through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return perf;
}

export default function AdvisorWorkspace({ kind }) {
  const cfg = CONFIG[kind];
  const [saved, setSaved] = useState([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(load(kind));
  }, [kind]);

  // The model shelf ships with the app, so its rows are the strategy list plus
  // whatever the advisor has saved of their own.
  const rows = useMemo(
    () =>
      kind === "models"
        ? [
            ...MODEL_PORTFOLIOS.map((m) => ({
              id: m.id,
              name: m.name,
              blurb: m.blurb,
              holdings: m.holdings,
              builtIn: true,
              opened: null,
            })),
            ...saved,
          ]
        : saved,
    [kind, saved]
  );

  const perf = usePerformance(rows);

  const commit = useCallback(
    (next) => {
      setSaved(next);
      save(kind, next);
    },
    [kind]
  );

  const upsert = useCallback(
    (row) => {
      const id = row.id ?? String(Date.now());
      const next = saved.some((r) => r.id === id)
        ? saved.map((r) => (r.id === id ? { ...r, ...row, id } : r))
        : [{ ...row, id, opened: new Date().toISOString() }, ...saved];
      commit(next);
      setModal(null);
      setEditing(null);
    },
    [commit, saved]
  );

  const remove = useCallback((id) => commit(saved.filter((r) => r.id !== id)), [commit, saved]);

  const shown = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="adv">
      <div className="adv-head">
        <h1>{cfg.title}</h1>
        <div className="adv-actions">
          <button type="button" className="adv-btn" onClick={() => downloadCsv(kind, shown, perf)}>
            Download
          </button>
          {kind !== "reports" && (
            <button type="button" className="adv-btn" onClick={() => setModal("report")}>
              Create Report
            </button>
          )}
          <button
            type="button"
            className="adv-btn primary"
            onClick={() => {
              setEditing(null);
              setModal(kind === "reports" ? "report" : "create");
            }}
          >
            + {cfg.addLabel}
          </button>
        </div>
      </div>

      <div className="adv-toolbar">
        <input
          className="adv-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={"Search by " + cfg.nameLabel.toLowerCase()}
          aria-label={"Search by " + cfg.nameLabel.toLowerCase()}
        />
      </div>

      <div className="adv-tablewrap">
        <table className="adv-table">
          <thead>
            <tr>
              <th className="adv-menu-col" />
              <th>{cfg.nameLabel}</th>
              <th>Holdings</th>
              {kind !== "models" && <th className="adv-num">Value</th>}
              <th>Last opened</th>
              {PCT_COLS.map(([k, label]) => (
                <th key={k} className="adv-num">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const p = perf[r.id];
              const t = p?.totals;
              return (
                <tr key={r.id}>
                  <td className="adv-menu-col">
                    {r.builtIn ? (
                      <button
                        type="button"
                        className="adv-rowmenu"
                        title={`Copy ${r.name} into my portfolios`}
                        aria-label={`Copy ${r.name} into my portfolios`}
                        onClick={() =>
                          upsert({ name: `${r.name} (Copy)`, holdings: r.holdings })
                        }
                      >
                        +
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="adv-rowmenu"
                        onClick={() => remove(r.id)}
                        title={"Delete " + r.name}
                        aria-label={"Delete " + r.name}
                      >
                        ×
                      </button>
                    )}
                  </td>
                  <td className="adv-name">
                    <button
                      type="button"
                      className="adv-linkish"
                      onClick={() => {
                        setEditing(r);
                        setModal("edit");
                      }}
                    >
                      {r.name}
                    </button>
                    {r.blurb && <small className="adv-blurb">{r.blurb}</small>}
                  </td>
                  <td className="adv-holdings">
                    {(r.holdings ?? []).map((h) => h.symbol).join(", ") || "-"}
                  </td>
                  {kind !== "models" && <td className="adv-num">{money(p?.value)}</td>}
                  <td>{r.opened ? fmtDate(r.opened) : "Model"}</td>
                  {PCT_COLS.map(([k]) => (
                    <td
                      key={k}
                      className="adv-num"
                      data-sign={t?.[k] == null ? undefined : t[k] >= 0 ? "up" : "down"}
                    >
                      {p === undefined && r.holdings?.length ? "…" : pct(t?.[k])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td className="adv-empty" colSpan={PCT_COLS.length + 5}>
                  {rows.length ? "Nothing matches that search." : cfg.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "create" && (
        <CreateAccount
          onClose={() => setModal(null)}
          onCreate={upsert}
          onBuild={(seed) => {
            setEditing(seed);
            setModal("edit");
          }}
        />
      )}
      {modal === "edit" && editing && (
        <PortfolioEditor
          row={editing}
          performance={perf[editing.id]}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
          onSave={upsert}
        />
      )}
      {modal === "report" && (
        <CreateReport
          portfolios={rows}
          onClose={() => setModal(null)}
          onCreate={(row) => (kind === "reports" ? upsert(row) : setModal(null))}
        />
      )}
    </div>
  );
}

function downloadCsv(kind, rows, perf) {
  const head = ["Name", "Holdings", "Last opened", ...PCT_COLS.map(([, l]) => l)];
  const body = rows.map((r) => [
    r.name,
    (r.holdings ?? []).map((h) => h.symbol).join(" "),
    r.opened ? fmtDate(r.opened) : "Model",
    ...PCT_COLS.map(([k]) => perf[r.id]?.totals?.[k] ?? ""),
  ]);
  const csv = [head, ...body]
    .map((line) => line.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = kind + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Modal({ title, children, onClose, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="adv-scrim" onClick={onClose}>
      <div
        className={wide ? "adv-modal wide" : "adv-modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adv-modal-head">
          <h2>{title}</h2>
          <button type="button" className="adv-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="adv-modal-body">{children}</div>
        {footer && <div className="adv-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Three ways in. Blank hands off to the editor with an empty book; the two
// imports parse the file first and hand off with the holdings already filled,
// so an import lands in the same review screen a hand-built one does rather
// than silently creating something the advisor has not seen.
function CreateAccount({ onClose, onBuild }) {
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  const pick = (accept, asPdf) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = asPdf
          ? extractPdfText(new Uint8Array(await file.arrayBuffer()))
          : await file.text();
        const { holdings, warnings } = parseHoldings(text);
        if (!holdings.length) {
          setError(
            asPdf
              ? "No holdings found in that PDF. Scanned statements have no text to read - paste the rows instead."
              : warnings[0] ?? "No holdings found in that file."
          );
          return;
        }
        onBuild({
          name: file.name.replace(/\.[^.]+$/, ""),
          holdings,
          notice: warnings[0] ?? null,
        });
      } catch {
        setError("Could not read that file.");
      }
    };
    input.click();
  };

  return (
    <Modal title="Create Account" onClose={onClose}>
      <p className="adv-lede">How would you like to get started?</p>
      {error && <p className="adv-note adv-error">{error}</p>}
      <div className="adv-cards">
        <div className="adv-card">
          <div className="adv-card-art">
            <span className="adv-plus">+</span>
          </div>
          <div className="adv-card-foot">
            <small>Blank</small>
            <strong>Get started from scratch</strong>
            <form
              className="adv-inline"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onBuild({ name: name.trim(), holdings: [] });
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Portfolio name"
                aria-label="Portfolio name"
              />
              <button type="submit" className="adv-btn primary">
                Create
              </button>
            </form>
          </div>
        </div>
        <button type="button" className="adv-card" onClick={() => pick(".csv,text/csv,.txt", false)}>
          <div className="adv-card-art">
            <span className="adv-chip">CSV Import</span>
          </div>
          <div className="adv-card-foot">
            <small>CSV Import</small>
            <strong>Upload account from CSV</strong>
          </div>
        </button>
        <button type="button" className="adv-card" onClick={() => pick("application/pdf", true)}>
          <div className="adv-card-art">
            <span className="adv-chip">PDF Import</span>
          </div>
          <div className="adv-card-foot">
            <small>PDF Import</small>
            <strong>Upload account(s) from a broker PDF</strong>
          </div>
        </button>
      </div>

      <p className="adv-lede">Paste holdings</p>
      <PasteBox onParsed={onBuild} />
    </Modal>
  );
}

// The path that always works: rows pasted straight out of a statement or a
// spreadsheet, through the same parser the file imports use.
function PasteBox({ onParsed }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  return (
    <div className="adv-paste">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={4}
        placeholder={"AAPL, 125\nMSFT, 40\nBND, 30"}
        aria-label="Paste holdings"
      />
      {error && <p className="adv-note adv-error">{error}</p>}
      <button
        type="button"
        className="adv-btn"
        onClick={() => {
          const { holdings, warnings } = parseHoldings(text);
          if (!holdings.length) {
            setError(warnings[0] ?? "No holdings found.");
            return;
          }
          onParsed({ name: "Imported portfolio", holdings, notice: warnings[0] ?? null });
        }}
      >
        Read holdings
      </button>
    </div>
  );
}

// Where a portfolio is actually built: name it, add tickers, and give each one
// either a share count or a weight. Both are offered because an advisor holds
// client accounts in shares and models in percentages, and converting one to
// the other needs a price the editor should not have to guess at.
function PortfolioEditor({ row, performance, onClose, onSave }) {
  const [name, setName] = useState(row.name ?? "");
  const [mode, setMode] = useState(
    row.holdings?.some((h) => h.weight != null) ? "weight" : "shares"
  );
  const [holdings, setHoldings] = useState(row.holdings ?? []);
  const [draft, setDraft] = useState("");
  const [notional, setNotional] = useState(100000);

  // The editor prices its own holdings rather than leaning on the saved row's
  // performance: a portfolio being built has not been saved yet, so there is
  // nothing to have measured, and the numbers have to move as rows are added.
  const [quotes, setQuotes] = useState({});
  const symbolKey = holdings.map((h) => h.symbol).join(",");
  useEffect(() => {
    if (!symbolKey) return;
    let live = true;
    fetch(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbolKey)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        setQuotes(Object.fromEntries((j.quotes ?? []).map((q) => [q.symbol, q])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [symbolKey]);

  const add = (symbol) => {
    const s = symbol.trim().toUpperCase();
    if (!s || holdings.some((h) => h.symbol === s)) return;
    setHoldings([...holdings, { symbol: s, shares: null, weight: null }]);
    setDraft("");
  };

  const setAmount = (symbol, raw) => {
    const value = raw === "" ? null : Number(raw);
    const amount = Number.isFinite(value) && value > 0 ? value : null;
    setHoldings(
      holdings.map((h) =>
        h.symbol === symbol
          ? { ...h, shares: mode === "shares" ? amount : null, weight: mode === "weight" ? amount : null }
          : h
      )
    );
  };

  const perBySymbol = Object.fromEntries((performance?.holdings ?? []).map((h) => [h.symbol, h]));

  // Everything the table and the wheel show is derived from what was typed
  // plus the live price - entering shares fills in the value and the weight,
  // and entering a weight fills in the shares it would take to hold it.
  const priceOf = (symbol) => quotes[symbol]?.price ?? perBySymbol[symbol]?.price ?? null;

  const rows = holdings.map((h) => {
    const price = priceOf(h.symbol);
    const value = h.shares != null && price != null ? h.shares * price : null;
    return { ...h, price, value };
  });

  const totalValue = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const weightTotal = holdings.reduce((a, h) => a + (h.weight ?? 0), 0);

  // In shares mode the weights come out of the money held; in weight mode they
  // are what was typed, normalised so a book adding to 90 still reads as a
  // whole portfolio in the picture.
  const priced = rows.map((r) => {
    const weight =
      mode === "shares"
        ? totalValue > 0
          ? ((r.value ?? 0) / totalValue) * 100
          : null
        : weightTotal > 0
          ? ((r.weight ?? 0) / weightTotal) * 100
          : null;
    return { ...r, pctOfPort: weight };
  });

  // The wheel wants a worth per slice. Shares give it directly; a
  // weight-only book has no money in it, so the percentages stand in - the
  // picture is the same either way, since the wheel only reads proportions.
  const wheelHoldings = priced
    .filter((r) => (mode === "shares" ? r.value > 0 : r.weight > 0))
    .map((r) => ({
      symbol: r.symbol,
      name: quotes[r.symbol]?.name ?? r.symbol,
      value: mode === "shares" ? r.value : r.weight,
    }));
  const wheelTotal = wheelHoldings.reduce((a, h) => a + h.value, 0);

  // A weight-only model holds no money, so a dollar column needs a notional
  // amount to be a percentage of. The advisor sets it; it is a display basis
  // for this screen only and is never saved with the portfolio.
  const basis = mode === "weight" ? notional : totalValue;

  // Same colour map the wheel uses, so the swatch beside a ticker in the table
  // matches its slice in the picture below.
  const wheelColors = holdingColors(wheelHoldings);

  return (
    <Modal
      title={row.id ? "Edit portfolio" : "New portfolio"}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="adv-step">
            {holdings.length} holding{holdings.length === 1 ? "" : "s"}
            {mode === "weight" && holdings.length > 0 && ` · ${weightTotal.toFixed(1)}% allocated`}
          </span>
          <button type="button" className="adv-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="adv-btn primary"
            disabled={!name.trim() || !holdings.length}
            onClick={() =>
              onSave({
                id: row.builtIn ? undefined : row.id,
                name: name.trim(),
                holdings: holdings.filter((h) => h.symbol),
              })
            }
          >
            Save portfolio
          </button>
        </>
      }
    >
      {row.notice && <p className="adv-note">{row.notice}</p>}
      {row.builtIn && (
        <p className="adv-note">
          This is a model. Saving stores your own copy and leaves the model unchanged.
        </p>
      )}

      <div className="adv-form">
        <label>
          Portfolio name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <div className="adv-editor-head">
        <div className="adv-modeswitch" role="group" aria-label="Holding amounts">
          {[
            ["shares", "Shares"],
            ["weight", "Weight %"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={mode === key ? "adv-mode active" : "adv-mode"}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <TickerInput
          value={draft}
          index={0}
          onChange={setDraft}
          onPick={add}
          label="Add ticker"
          withPrices
        />
        {mode === "weight" && (
          <label className="adv-notional">
            on
            <input
              type="number"
              min="0"
              step="1000"
              value={notional}
              onChange={(e) => setNotional(Number(e.target.value) || 0)}
              aria-label="Notional amount to size the weights against"
            />
          </label>
        )}
      </div>

      <table className="adv-table adv-editor-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th className="adv-num">{mode === "shares" ? "Shares" : "Weight %"}</th>
            <th className="adv-num">Price</th>
            <th className="adv-num">Value</th>
            <th className="adv-num">% of port.</th>
            <th className="adv-num">1Y</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {priced.map((r) => {
            const p = perBySymbol[r.symbol];
            return (
              <tr key={r.symbol}>
                <td className="adv-name">
                  <span className="adv-swatch" style={{ background: wheelColors[r.symbol] }} aria-hidden="true" />
                  {r.symbol}
                </td>
                <td className="adv-num">
                  <input
                    className="adv-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={(mode === "shares" ? r.shares : r.weight) ?? ""}
                    onChange={(e) => setAmount(r.symbol, e.target.value)}
                    aria-label={`${r.symbol} ${mode === "shares" ? "shares" : "weight"}`}
                  />
                </td>
                <td className="adv-num">{r.price == null ? "…" : `$${r.price.toFixed(2)}`}</td>
                <td className="adv-num">
                  {mode === "shares"
                    ? money(r.value)
                    : r.price == null || r.weight == null
                      ? "-"
                      : money((r.weight / 100) * (basis || 0))}
                </td>
                <td className="adv-num">{r.pctOfPort == null ? "-" : `${r.pctOfPort.toFixed(1)}%`}</td>
                <td className="adv-num" data-sign={p?.y1 == null ? undefined : p.y1 >= 0 ? "up" : "down"}>
                  {pct(p?.y1)}
                </td>
                <td className="adv-num">
                  <button
                    type="button"
                    className="adv-rowmenu"
                    onClick={() => setHoldings(holdings.filter((x) => x.symbol !== r.symbol))}
                    aria-label={`Remove ${r.symbol}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {!holdings.length && (
            <tr>
              <td className="adv-empty" colSpan={7}>
                No holdings yet. Search for a ticker above to add one.
              </td>
            </tr>
          )}
        </tbody>
        {holdings.length > 0 && (
          <tfoot>
            <tr>
              <td>Total</td>
              {/* In weight mode the typed column has a meaningful sum and it
                  is worth showing whether it reaches 100; a sum of share
                  counts across different stocks is a number with no meaning,
                  so that cell stays empty rather than adding 4 and 7. */}
              <td className="adv-num">
                {mode === "weight" ? `${weightTotal.toFixed(1)}%` : ""}
              </td>
              <td />
              <td className="adv-num">{money(basis)}</td>
              <td className="adv-num">
                {priced.some((r) => r.pctOfPort != null) ? "100.0%" : "-"}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      {/* The book as a picture: the same wheel the ETF and watchlist pages
          draw, so a portfolio reads the way a fund does. In weight mode there
          is no money in the book, so the slices are the percentages - the
          wheel only ever shows proportions, so the shape is the same. */}
      {wheelHoldings.length > 0 && (
        <div className="adv-wheel">
          <h3>Allocation</h3>
          <PortfolioWheel holdings={wheelHoldings} total={wheelTotal} />
        </div>
      )}
    </Modal>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

// Two steps: which portfolio and which report, then who it is for.
function CreateReport({ portfolios, onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    kind: "one-pager",
    portfolioId: portfolios[0]?.id ?? "",
    name: "One Pager Report",
    client: "",
    preparedBy: "",
    start: "1999-03-10",
    end: today(),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      title="Create Report"
      onClose={onClose}
      footer={
        <>
          <span className="adv-step">Step {step} of 2</span>
          <button
            type="button"
            className="adv-btn"
            onClick={() => (step === 1 ? onClose() : setStep(1))}
          >
            Back
          </button>
          <button
            type="button"
            className="adv-btn primary"
            disabled={step === 2 && !form.name.trim()}
            onClick={() => {
              if (step === 1) return setStep(2);
              const source = portfolios.find((p) => p.id === form.portfolioId);
              onCreate({
                name: form.name.trim(),
                client: form.client,
                holdings: source?.holdings ?? [],
              });
            }}
          >
            Next
          </button>
        </>
      }
    >
      {step === 1 ? (
        <>
          <p className="adv-lede">Choose a report to build.</p>
          <div className="adv-cards">
            {[
              ["one-pager", "One Pager Report", "A single page: allocation, returns and holdings."],
              ["performance", "Performance Report", "Returns against a benchmark over the period."],
              ["holdings", "Holdings Report", "Every position with weight and cost basis."],
            ].map(([id, label, blurb]) => (
              <button
                key={id}
                type="button"
                className={form.kind === id ? "adv-card active" : "adv-card"}
                aria-pressed={form.kind === id}
                onClick={() => setForm((f) => ({ ...f, kind: id, name: label }))}
              >
                <div className="adv-card-art">
                  <span className="adv-chip">{label}</span>
                </div>
                <div className="adv-card-foot">
                  <strong>{label}</strong>
                  <small>{blurb}</small>
                </div>
              </button>
            ))}
          </div>
          {portfolios.length > 0 && (
            <div className="adv-form">
              <label>
                Portfolio
                <select value={form.portfolioId} onChange={set("portfolioId")}>
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </>
      ) : (
        <div className="adv-form">
          <label>
            Report Title
            <input value={form.name} onChange={set("name")} />
          </label>
          <label>
            Client Name
            <input value={form.client} onChange={set("client")} />
          </label>
          <label>
            Prepared By
            <input value={form.preparedBy} onChange={set("preparedBy")} />
          </label>
          <div className="adv-form-row">
            <label>
              Start Date
              <input type="date" value={form.start} onChange={set("start")} />
            </label>
            <label>
              End Date
              <input type="date" value={form.end} onChange={set("end")} />
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
