"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "leaflet/dist/leaflet.css";
import { COMPANY_WORLD_DATA } from "@/lib/companyWorldData";
import { useTheme } from "@/components/PageChrome";
import { dragMeasurePlugin } from "@/lib/dragMeasure";
import { hoverLinePlugin } from "@/lib/hoverLine";
import { blankBrokenLogo, logoUrl } from "@/lib/companyLogo";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, dragMeasurePlugin, hoverLinePlugin);

const INDUSTRY_COLORS = {
  "Aerospace & Defense": "#94a3b8", Automotive: "#f05252", Conglomerates: "#a8a29e",
  Education: "#e879f9", Energy: "#fbbf24", Financials: "#2dd4bf", "Food & Beverage": "#4ade80",
  "Healthcare & Biotech": "#f472b6", Industrials: "#a3b3c7", Materials: "#d6a657",
  "Media & Telecom": "#a78bfa", Other: "#b7ada8", "Real Estate": "#c084fc",
  "Retail & Consumer": "#fb7185", Technology: "#60a5fa", Transportation: "#38bdf8", Utilities: "#22d3ee",
};
const INDUSTRIES = Object.keys(INDUSTRY_COLORS);
const OWNERSHIP = ["All", "Public", "Private", "Other"];
const MINIMUMS = [10, 25, 50, 100, 250, 500, 1000];
const CHART_RANGES = ["6m", "1y", "3y", "5y", "10y"];
// Marker growth: full size at MIN_ZOOM (the whole world), twice that from
// GROWTH_ZOOM in, where the map is close enough that overlapping is no longer
// the risk and hitting a single dot is.
const MIN_ZOOM = 2;
const GROWTH_ZOOM = 7;
const CURATED_HQ_PHOTOS = {
  NVDA: { image: "/company-hq/nvidia.jpg", source: null },
  AAPL: { image: "/company-hq/apple.avif", source: null },
  LPLA: { image: "/company-hq/lpl-financial.png", source: "https://www.lpl.com/about-us/careers/locations.html" },
  HALO: { image: "https://pharmprom.net/wp-content/uploads/Halozyme.jpg", source: "https://pharmprom.net/halozyme-to-acquire-antares-pharma-in-a-960-million-deal/" },
  PLTR: { image: "https://images.axios.com/lyat3psX2Gl0vfHwtIDl3wAZWT4%3D/2020/08/19/1597869468989.jpg", source: "https://www.axios.com/2020/08/19/palantir-to-move-headquarters-to-colorado" },
};
const CURATED_HQ_PHOTOS_BY_NAME = {
  Anthropic: { image: "https://newsimg.koreatimes.co.kr/2026/02/27/9848ea71-7602-4943-944b-2286c19c3ff7.jpg?w=728", source: "https://www.koreatimes.co.kr/world/20260227/anthropic-ceo-says-it-cannot-in-good-conscience-accede-to-pentagons-demands-for-ai-use" },
};

function formatValue(value) {
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}T`;
  return `$${value < 100 ? value.toFixed(1) : Math.round(value)}B`;
}

function formatPrice(value, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: value < 10 ? 2 : 0 }).format(value);
  } catch {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

function tooltipFor(company) {
  const node = document.createElement("div");
  node.className = "cwm-tooltip-inner";
  const title = document.createElement("strong");
  title.textContent = company.n;
  const meta = document.createElement("span");
  meta.textContent = `${company.c} · ${company.i}`;
  const value = document.createElement("b");
  value.textContent = formatValue(company.v);
  node.append(title, meta, value);
  return node;
}

function CompanyMark({ company }) {
  return (
    <>
      <i className="cwm-company-industry-dot" style={{ background: INDUSTRY_COLORS[company.i] || INDUSTRY_COLORS.Other }} />
      <span className="cwm-company-logo">
        {company.o === "Public" && company.t !== "PRIVATE" && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl(company.t, 64)} alt="" onError={blankBrokenLogo} />
          </>
        )}
      </span>
    </>
  );
}

function PriceLine({ rows, isStock, currency, symbol, theme }) {
  const palette = useMemo(() => {
    void theme;
    if (typeof document === "undefined") return { accent: "#34d3b0", text: "#f5f7fa", muted: "#8d99a6", panel: "#14181d", line: "rgba(141,153,166,.2)" };
    const styles = getComputedStyle(document.querySelector(".cwm-shell") || document.documentElement);
    return {
      accent: styles.getPropertyValue("--cwm-mint").trim() || "#34d3b0",
      text: styles.getPropertyValue("--cwm-text").trim() || "#f5f7fa",
      muted: styles.getPropertyValue("--cwm-muted").trim() || "#8d99a6",
      panel: styles.getPropertyValue("--cwm-panel-solid").trim() || "#14181d",
      line: styles.getPropertyValue("--cwm-line").trim() || "rgba(141,153,166,.2)",
    };
  }, [theme]);
  const sampled = useMemo(() => {
    if (!rows?.length) return [];
    const step = Math.max(1, Math.ceil(rows.length / 420));
    return rows.filter((_, index) => index % step === 0 || index === rows.length - 1);
  }, [rows]);
  const chartUp = sampled.length < 2 || sampled.at(-1).c >= sampled[0].c;
  const movementColor = chartUp ? "#30cc5a" : "#f63538";
  const data = useMemo(() => ({
    labels: sampled.map((point) => isStock ? new Date(point.t * 1000).toISOString().slice(0, 10) : point.label),
    datasets: [{
      label: isStock ? symbol : "Company value",
      data: sampled.map((point) => point.c),
      borderColor: movementColor,
      backgroundColor: chartUp ? "rgba(48, 204, 90, .12)" : "rgba(246, 53, 56, .12)",
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 10,
      pointHoverRadius: 3,
      pointHoverBackgroundColor: palette.panel,
      pointHoverBorderColor: movementColor,
      pointHoverBorderWidth: 2,
      tension: .16,
      fill: true,
    }],
  }), [sampled, isStock, symbol, palette, chartUp, movementColor]);
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderWidth: 1,
        titleColor: palette.muted,
        bodyColor: palette.text,
        callbacks: {
          title: (items) => {
            const label = items[0]?.label;
            return isStock && label ? new Date(`${label}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : label;
          },
          label: (item) => isStock ? formatPrice(item.parsed.y, currency) : formatValue(item.parsed.y),
        },
      },
      hoverLine: { enabled: true, color: palette.muted },
      dragMeasure: {
        series: [{ datasetIndex: 0, label: isStock ? symbol : "Value", format: (value) => isStock ? formatPrice(value, currency) : formatValue(value) }],
        mutedColor: palette.muted,
        boxColor: palette.panel,
        boxBorderColor: palette.line,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { display: false } },
      y: { grid: { color: palette.line, drawTicks: false }, border: { display: false }, ticks: { display: false }, grace: "8%" },
    },
  }), [currency, isStock, symbol, palette]);

  if (sampled.length < 2) return <div className="cwm-chart-empty">Not enough history to draw this chart.</div>;
  return <div className="cwm-price-chart" data-direction={chartUp ? "up" : "down"} role="img" aria-label={`${symbol || "Company"} price history; hover for date and price, or drag to compare`}><Line data={data} options={options} /></div>;
}

export default function CompanyWorldMap() {
  const theme = useTheme();
  const mapNode = useRef(null);
  const map = useRef(null);
  const leaflet = useRef(null);
  const markers = useRef(null);
  const canvasRenderer = useRef(null);
  const hqPhotoClaims = useRef(new Map());
  const [mapReady, setMapReady] = useState(false);
  // The map's current zoom, so markers can grow as the reader zooms in.
  const [zoom, setZoom] = useState(2);
  const [ownership, setOwnership] = useState("All");
  const [minimum, setMinimum] = useState(10);
  const [query, setQuery] = useState("");
  const [industries, setIndustries] = useState(() => new Set(INDUSTRIES));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailResult, setDetailResult] = useState({ key: null, data: null, error: null });
  const [chartRange, setChartRange] = useState("5y");
  const [chartResult, setChartResult] = useState({ key: null, data: null });
  const [hqPhotoResult, setHqPhotoResult] = useState({ key: null, data: null });
  const [scaleSize, setScaleSize] = useState(true);
  const [colorIndustry, setColorIndustry] = useState(true);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return COMPANY_WORLD_DATA.filter((company) => {
      if (ownership !== "All" && company.o !== ownership) return false;
      if (company.v < minimum || !industries.has(company.i)) return false;
      return !term || `${company.n} ${company.t} ${company.c} ${company.i}`.toLowerCase().includes(term);
    });
  }, [ownership, minimum, query, industries]);
  const combinedValue = useMemo(() => filtered.reduce((sum, company) => sum + company.v, 0), [filtered]);
  const listCompanies = filtered.slice(0, 160);
  const isPublicStock = selected?.o === "Public" && selected.t !== "PRIVATE";
  const detailKey = selected?.n ?? null;
  const details = detailResult.key === detailKey ? detailResult.data : null;
  const detailsError = detailResult.key === detailKey ? detailResult.error : null;
  const detailsLoading = Boolean(selected && detailResult.key !== detailKey);
  const chartKey = isPublicStock ? `${selected.t}:${chartRange}` : null;
  const stockChart = chartResult.key === chartKey ? chartResult.data : null;
  const chartLoading = Boolean(isPublicStock && chartResult.key !== chartKey);

  useEffect(() => {
    const shell = mapNode.current?.closest(".cwm-shell");
    const ticker = document.querySelector(".ticker-tape");
    const header = document.querySelector("header.site");
    if (!shell || !ticker || !header) return;
    const sizeToChrome = () => {
      const chromeHeight = ticker.getBoundingClientRect().height + header.getBoundingClientRect().height;
      shell.style.setProperty("--cwm-chrome-height", `${Math.ceil(chromeHeight)}px`);
    };
    sizeToChrome();
    const observer = new ResizeObserver(sizeToChrome);
    observer.observe(ticker);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function startMap() {
      const L = await import("leaflet");
      if (cancelled || !mapNode.current) return;
      leaflet.current = L;
      const instance = L.map(mapNode.current, { center: [24, 7], zoom: 2, minZoom: 2, maxZoom: 18, worldCopyJump: true, zoomControl: false, preferCanvas: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(instance);
      L.control.zoom({ position: "bottomright" }).addTo(instance);
      map.current = instance;
      markers.current = L.layerGroup().addTo(instance);
      canvasRenderer.current = L.canvas({ padding: 0.5 });
      instance.on("zoomend", () => setZoom(instance.getZoom()));
      setMapReady(true);
    }
    startMap();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady || !markers.current || !leaflet.current) return;
    const L = leaflet.current;
    const rootStyle = getComputedStyle(document.documentElement);
    const themeAccent = rootStyle.getPropertyValue("--accent").trim() || "#73e6c2";
    const themeText = rootStyle.getPropertyValue("--text").trim() || "#ffffff";
    markers.current.clearLayers();
    filtered.forEach((company) => {
      const isSelected = selected?.n === company.n;
      const base = scaleSize ? Math.max(3, Math.min(17, 2.4 + Math.sqrt(company.v) / 4.7)) : 5;
      // At the opening zoom the whole world is on screen and markers have to
      // stay small to not merge into one blob. Zoomed in there is room, and a
      // dot that stayed 3px would be a hard thing to hit - so they reach twice
      // their size by the time the map is close enough to pick a single
      // company out. Capped at 2x: past that they start overlapping again.
      const radius = base * (1 + Math.min(1, Math.max(0, (zoom - MIN_ZOOM) / (GROWTH_ZOOM - MIN_ZOOM))));
      const color = colorIndustry ? INDUSTRY_COLORS[company.i] || INDUSTRY_COLORS.Other : themeAccent;
      const marker = L.circleMarker([company.lat, company.lng], { renderer: canvasRenderer.current, radius: isSelected ? radius + 3 : radius, color: isSelected ? themeText : color, weight: isSelected ? 2 : .8, fillColor: color, fillOpacity: isSelected ? 1 : .78 });
      marker.bindTooltip(tooltipFor(company), { direction: "top", offset: [0, -4], opacity: 1 });
      marker.on("click", () => { setSelected(company); setChartRange("5y"); });
      marker.addTo(markers.current);
    });
  }, [filtered, mapReady, scaleSize, colorIndustry, selected, theme, zoom]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/company-world-map?name=${encodeURIComponent(selected.n)}`, { signal: controller.signal })
      .then(async (response) => { const json = await response.json(); if (!response.ok) throw new Error(json.error || "Company details unavailable"); setDetailResult({ key: selected.n, data: json, error: null }); })
      .catch((error) => { if (error.name !== "AbortError") setDetailResult({ key: selected.n, data: null, error: error.message }); });
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    if (!isPublicStock) return;
    const controller = new AbortController();
    fetch(`/api/stock-chart?symbol=${encodeURIComponent(selected.t)}&range=${chartRange}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Chart unavailable")))
      .then((data) => setChartResult({ key: `${selected.t}:${chartRange}`, data }))
      .catch((error) => { if (error.name !== "AbortError") setChartResult({ key: `${selected.t}:${chartRange}`, data: null }); });
    return () => controller.abort();
  }, [selected, chartRange, isPublicStock]);

  useEffect(() => {
    if (!selected || Object.hasOwn(CURATED_HQ_PHOTOS_BY_NAME, selected.n) || Object.hasOwn(CURATED_HQ_PHOTOS, selected.t) || detailsLoading) return;
    const controller = new AbortController();
    const hqCity = details?.a?.split(",")[1]?.trim() || selected.c;
    const sanDiegoCounty = /\b(?:San Diego|Carlsbad|La Jolla|Del Mar|Encinitas|Oceanside|Chula Vista|Escondido|Santee|Poway|Vista|El Cajon|Solana Beach|Coronado|National City)\s*,\s*CA\b/i.test(details?.a || "");
    const priorityPhoto = selected.v >= 300 || sanDiegoCounty;
    fetch(`/api/company-hq-photo?name=${encodeURIComponent(selected.n)}&location=${encodeURIComponent(hqCity)}&value=${selected.v}&priority=${priorityPhoto}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Headquarters photo unavailable")))
      .then((data) => {
        if (!data.image) {
          setHqPhotoResult({ key: selected.n, data: null });
          return;
        }
        const fingerprint = (data.title || data.image).toLowerCase();
        const claimedBy = hqPhotoClaims.current.get(fingerprint);
        if (claimedBy && claimedBy !== selected.n) {
          setHqPhotoResult({ key: selected.n, data: null });
          return;
        }
        hqPhotoClaims.current.set(fingerprint, selected.n);
        setHqPhotoResult({ key: selected.n, data });
      })
      .catch((error) => { if (error.name !== "AbortError") setHqPhotoResult({ key: selected.n, data: null }); });
    return () => controller.abort();
  }, [selected, details?.a, detailsLoading]);

  function focusCompany(company) {
    setSelected(company); setChartRange("5y");
    map.current?.flyTo([company.lat, company.lng], Math.max(map.current.getZoom(), 7), { duration: .75 });
  }
  function toggleIndustry(industry) {
    setIndustries((current) => { const next = new Set(current); if (next.has(industry)) next.delete(industry); else next.add(industry); return next; });
  }

  const historyRows = details?.h?.map(([year, value]) => ({ label: String(year), c: value })) ?? [];
  const chartRows = stockChart?.points?.length ? stockChart.points : historyRows;
  const chartIsStock = Boolean(stockChart?.points?.length);
  const remoteHqPhoto = hqPhotoResult.key === selected?.n ? hqPhotoResult.data : null;
  const curatedHqPhoto = selected ? CURATED_HQ_PHOTOS_BY_NAME[selected.n] || CURATED_HQ_PHOTOS[selected.t] : null;
  const hqImage = curatedHqPhoto ? curatedHqPhoto.image : remoteHqPhoto?.image;
  const hqPhotoSource = curatedHqPhoto ? curatedHqPhoto.source : remoteHqPhoto?.source;

  return (
    <main className={`cwm-shell ${selected ? "has-dossier" : ""}`}>
      <div ref={mapNode} className="cwm-map" aria-label="Interactive map of company headquarters" />
      <div className="cwm-title-block"><span className="cwm-kicker">Global company atlas</span><h1>Company World Map</h1><p>Headquarters sized by value, colored by industry.</p></div>
      <label className="cwm-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies, tickers, or places" aria-label="Search companies, tickers, or places" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
      </label>
      <button type="button" className={`cwm-sidebar-toggle ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen((value) => !value)} aria-expanded={sidebarOpen} aria-controls="company-map-panel"><span aria-hidden="true">{sidebarOpen ? "‹" : "›"}</span>{sidebarOpen ? "Hide" : "Browse"}</button>

      <aside id="company-map-panel" className={`cwm-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="cwm-filters">
          <div className="cwm-tabs" aria-label="Ownership filter">{OWNERSHIP.map((item) => <button key={item} type="button" className={ownership === item ? "active" : ""} onClick={() => setOwnership(item)}>{item}</button>)}</div>
          <label className="cwm-minimum"><span>Value</span><select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}>{MINIMUMS.map((value) => <option key={value} value={value}>{value >= 1000 ? "$1T+" : `$${value}B+`}</option>)}</select></label>
        </div>
        <details className="cwm-industries">
          <summary><span>Industries</span><strong>{industries.size === INDUSTRIES.length ? "All" : industries.size}</strong></summary>
          <div className="cwm-industry-actions"><button type="button" onClick={() => setIndustries(new Set(INDUSTRIES))}>Select all</button><button type="button" onClick={() => setIndustries(new Set())}>Clear</button></div>
          <div className="cwm-industry-grid">{INDUSTRIES.map((industry) => <label key={industry}><input type="checkbox" checked={industries.has(industry)} onChange={() => toggleIndustry(industry)} /><i style={{ background: INDUSTRY_COLORS[industry] }} /><span>{industry}</span></label>)}</div>
        </details>
        <div className="cwm-summary" aria-live="polite"><div><strong>{filtered.length.toLocaleString()}</strong><span>companies</span></div><div><span>Combined value</span><strong>{formatValue(combinedValue)}</strong></div></div>
        <div className="cwm-list">
          {listCompanies.map((company) => <button type="button" key={`${company.n}-${company.lat}-${company.lng}`} className={selected?.n === company.n ? "active" : ""} onClick={() => focusCompany(company)}><CompanyMark company={company} /><span><strong>{company.n}</strong><small>{company.c}{company.o === "Public" && company.t !== "PRIVATE" ? ` · ${company.t}` : ` · ${company.o}`}</small></span><b>{formatValue(company.v)}</b></button>)}
          {filtered.length > listCompanies.length && <p>Showing the 160 largest matches. Search to narrow the list.</p>}{!filtered.length && <p>No companies match these filters.</p>}
        </div>
      </aside>

      {selected && <aside className="cwm-dossier" aria-live="polite">
        <button type="button" className="cwm-dossier-close" onClick={() => setSelected(null)} aria-label="Close company details">×</button>
        <header className={hqImage ? "has-hq-image" : ""} style={hqImage ? { "--cwm-hq-image": `url("${hqImage.replace(/["\\]/g, "")}")` } : undefined}><span>{selected.o}</span><h2>{selected.n}</h2><strong>{formatValue(selected.v)}</strong><small>{selected.o === "Public" ? "Market cap" : "Company value"}{details?.as ? ` · ${details.as}` : ""}</small>{hqPhotoSource && <a className="cwm-hq-photo-source" href={hqPhotoSource} target="_blank" rel="noreferrer">Photo source ↗</a>}</header>
        {detailsLoading && <div className="cwm-dossier-loading"><i /><i /><i /><i /></div>}{detailsError && <p className="cwm-dossier-error">{detailsError}</p>}
        {details && <>
          <section className="cwm-dossier-section">
            <h3>What it does and sells</h3><div className="cwm-company-meta"><i style={{ background: INDUSTRY_COLORS[selected.i] || INDUSTRY_COLORS.Other }} /><strong>{selected.i}</strong>{details.si && <span>{details.si}</span>}{details.f && <span>Founded {details.f}</span>}</div>
            <p>{details.d || "Business description is not available for this company."}</p>
            {details.of?.length > 1 && <div className="cwm-offerings"><h4>Core offerings</h4><ul>{details.of.slice(1, 5).map((offering) => <li key={offering}>{offering}</li>)}</ul></div>}
            <nav className="cwm-company-links" aria-label={`${selected.n} links`}>{details.w && <a href={details.w} target="_blank" rel="noreferrer">Website ↗</a>}{details.ps && <a href={details.ps} target="_blank" rel="noreferrer">Company profile ↗</a>}{details.ar && <a href={details.ar} target="_blank" rel="noreferrer">Annual reports ↗</a>}</nav>
          </section>
          <section className="cwm-dossier-section cwm-chart-section">
            <div className="cwm-chart-heading"><div><h3>{chartIsStock ? "Stock price" : "Value history"}</h3><strong>{chartIsStock ? formatPrice(stockChart.price, stockChart.currency) : formatValue(selected.v)}</strong></div>{isPublicStock && <div className="cwm-chart-ranges">{CHART_RANGES.map((range) => <button type="button" key={range} className={chartRange === range ? "active" : ""} onClick={() => setChartRange(range)}>{range.toUpperCase()}</button>)}</div>}</div>
            {chartLoading ? <div className="cwm-chart-loading" /> : <PriceLine rows={chartRows} isStock={chartIsStock} currency={stockChart?.currency} symbol={selected.t} theme={theme} />}
            {chartRows.length > 1 && <div className="cwm-chart-years"><span>{chartIsStock ? new Date(chartRows[0].t * 1000).getFullYear() : chartRows[0].label}</span><span>{chartIsStock ? new Date(chartRows.at(-1).t * 1000).getFullYear() : chartRows.at(-1).label}</span></div>}
            {chartRows.length > 1 && <p className="cwm-chart-hint">Hover for price and date · drag to measure a move</p>}
            {isPublicStock && <a className="cwm-stock-link" href={`/stock/${encodeURIComponent(selected.t)}`}>Open full {selected.t} stock analysis →</a>}
          </section>
          <section className="cwm-dossier-section cwm-hq-section"><h3>Operational headquarters</h3><strong>{details.a || `${selected.c} headquarters`}</strong><span>{details.p ? `Pin: ${details.p}` : "Mapped headquarters"}</span>{details.ps && <a href={details.ps} target="_blank" rel="noreferrer">Address source ↗</a>}</section>
        </>}
      </aside>}

      <div className="cwm-legend" aria-label="Map marker controls"><button type="button" onClick={() => setScaleSize((value) => !value)} aria-pressed={scaleSize}><span className="cwm-switch"><i /></span>Size by value</button><button type="button" onClick={() => setColorIndustry((value) => !value)} aria-pressed={colorIndustry}><span className="cwm-switch"><i /></span>Color by industry</button></div>
    </main>
  );
}
