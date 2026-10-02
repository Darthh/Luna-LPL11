"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraph, searchCompanies, COVERED, COMPANY_COUNT, INDEXED_COUNT } from "@/lib/supplyChain";
import { GROUPS } from "@/lib/supplyChainData";
import { layoutGraph } from "@/lib/forceLayout";
import { flowLayout } from "@/lib/flowLayout";
import { dropBrokenImage, hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCap } from "@/lib/formatCap";
import { clamp } from "@/lib/num";

const groupColor = (key) => GROUPS.find((g) => g.key === key)?.color ?? "#8b93a3";

// Nodes carry a ticker when the company is listed and fall back to their graph
// id when it isn't; every logo lookup on this page needs that same fallback.
const logoFor = (node) => logoUrl(node.ticker ?? node.id);

const DEPTHS = [
  { key: 1, label: "1 hop", hint: "Companies with a direct mapped relationship" },
  { key: 2, label: "2 hops", hint: "Companies within two mapped relationships" },
  { key: 3, label: "3 hops", hint: "Companies within three mapped relationships" },
];

// Two ways to read the same graph. The web is the shape of the neighbourhood -
// clusters, cross-links, who sits between whom. The flow is the terminal view:
// sides mean something, so a company's position on the canvas answers "supplier
// or customer" before a single label is read.
const MODES = [
  {
    key: "flow",
    label: "Relationships graph",
    hint: "Suppliers left, customers right, competitors above",
  },
  { key: "web", label: "Network graph", hint: "Clustered by how the companies link up" },
];

const RELATIONSHIP_COLORS = {
  supplier: "#16b8f3",
  customer: "#45e6a1",
  partner: "#8e22ec",
  competitor: "#ef174c",
};

// How many same-industry rivals the flow view puts along its top rail.
const COMPETITORS = 6;
const PARTNERS = 6;

// Somewhere to start from the empty state: recognisable names that each open
// onto a decent-sized chain, spread across sectors so the first impression is
// not that this only knows about chips.
const STARTERS = ["NVDA", "AAPL", "TSLA", "LLY", "BA", "WMT", "XOM", "TSM"];

// Dot size is market cap. The companies on one map can be three orders of
// magnitude apart - a $6B parts maker feeding a $5T customer - so the scale is
// logarithmic: area-proportional would leave the small end as specks that
// can't be clicked, and no scale at all threw away the one number that says
// which of these companies is the big one. Reading it off is deliberately
// coarse: a dot twice the diameter is roughly a thousand times the company.
const CAP_FLOOR = 5e9;
const CAP_CEIL = 5e12;
const NODE_MIN = 5.5;
const NODE_MAX = 21;
// Anything the data has no cap for sits mid-scale rather than vanishing.
const CAP_UNKNOWN = 3e10;
const ROOT_EXTRA = 3;
const CAP_SPAN = Math.log(CAP_CEIL / CAP_FLOOR);

// Below this a logo is a smudge, so the dot stays a plain disc.
const LOGO_MIN_RADIUS = 12.5;

// Labels are placed greedily, most important first, and one is skipped when
// its box would collide with a label already placed. Every node still names
// itself on hover, so a skipped label is a deferral rather than a loss.
const LABEL_H = 12;
const CHAR_W = 5.6;
const EMPTY_EVIDENCE = { key: null, status: "idle", data: null, error: null };

function radiusOf(node, rootId) {
  const cap = clamp(node.cap ?? CAP_UNKNOWN, CAP_FLOOR, CAP_CEIL);
  const t = Math.log(cap / CAP_FLOOR) / CAP_SPAN;
  return NODE_MIN + t * (NODE_MAX - NODE_MIN) + (node.id === rootId ? ROOT_EXTRA : 0);
}

export default function SupplyChain() {
  const [root, setRoot] = useState(null);
  const [networkDepth, setNetworkDepth] = useState(2);
  const [mode, setMode] = useState("flow");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [size, setSize] = useState({ w: 900, h: 640 });
  // Companies the logo CDN has nothing for, learned as the images fail.
  const [noLogo, setNoLogo] = useState(() => new Set());
  const [evidence, setEvidence] = useState(EMPTY_EVIDENCE);
  const evidenceAbort = useRef(null);
  const searchRef = useRef(null);
  const canvasRef = useRef(null);

  const dropLogo = (id) =>
    setNoLogo((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const results = useMemo(() => searchCompanies(query, 8), [query]);
  const graph = useMemo(
    () =>
      root
        ? buildGraph(root, mode === "web" ? networkDepth : 2, {
            competitors: mode === "flow" ? COMPETITORS : 0,
            partners: mode === "flow" ? PARTNERS : 0,
            multiCategory: mode === "flow",
            distanceMode: mode === "web",
          })
        : null,
    [root, networkDepth, mode]
  );

  // The layout runs on the whole graph, not the filtered one, so ticking a
  // group off the legend hides nodes without rearranging the ones that stay.
  const view = useMemo(() => {
    if (!graph) return null;
    const sized = graph.nodes.map((n) => ({ ...n, radius: radiusOf(n, graph.root) }));
    const radii = new Map(sized.map((n) => [n.id, n.radius]));
    if (mode === "flow") {
      const { placed, axes, hub } = flowLayout(sized, graph.edges, {
        width: size.w,
        height: size.h,
        rootId: graph.root,
      });
      // A column with more companies than it has room for draws them smaller
      // rather than overlapping, so the layout has the last word on radius.
      for (const p of placed) if (p.radius != null) radii.set(p.id, p.radius);
      return { positions: new Map(placed.map((p) => [p.id, p])), radii, axes, hub };
    }
    const placed = layoutGraph(sized, graph.edges, {
      width: size.w,
      height: size.h,
      rootId: graph.root,
      spacing: Math.max(30, Math.min(52, 2100 / Math.sqrt(graph.nodes.length * 12))),
    });
    return { positions: new Map(placed.map((p) => [p.id, p])), radii, axes: null, hub: null };
  }, [graph, mode, size]);

  const positions = view?.positions ?? null;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);

  useEffect(() => {
    if (!open) return;
    function away(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => () => evidenceAbort.current?.abort(), []);

  function pick(id) {
    if (!id) return;
    evidenceAbort.current?.abort();
    setEvidence(EMPTY_EVIDENCE);
    setRoot(id);
    setQuery("");
    setOpen(false);
    setActiveIdx(-1);
    setSelected(null);
    setHiddenGroups(new Set());
  }

  function onKeyDown(e) {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "Enter") {
      e.preventDefault();
      return pick(activeIdx >= 0 ? results[activeIdx]?.id : results[0]?.id);
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
    }
  }

  const toggleGroup = (key) =>
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const searchBox = (big) => (
    <div className={`sc-search${big ? " big" : ""}`} ref={big ? searchRef : null}>
      <div className="sc-search-field">
        <svg viewBox="0 0 24 24" width={big ? 17 : 14} height={big ? 17 : 14} aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a company - NVDA, Apple, TSMC…"
          aria-label="Search a company to map its supply chain"
          spellCheck={false}
        />
      </div>
      {open && query.trim() && (
        <div className="sc-search-menu">
          {results.length ? (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className={`sc-search-item${i === activeIdx ? " active" : ""}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(r.id)}
              >
                <i className="sc-dot" style={{ background: groupColor(r.group) }} />
                <span className="sc-search-sym">{r.id}</span>
                <span className="sc-search-name">{r.name}</span>
                <span className="sc-search-meta">{r.links ? `${r.links} link${r.links === 1 ? "" : "s"}` : "no links yet"}</span>
              </button>
            ))
          ) : (
            <div className="sc-search-empty">
              Nothing matching “{query.trim()}”. The map covers the whole Russell 1000 -{" "}
              {INDEXED_COUNT} companies - plus {COMPANY_COUNT - INDEXED_COUNT} overseas and private
              suppliers no US index lists.
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!graph || !positions) {
    return (
      <main className="sc-page sc-page-empty">
        <div className="sc-hero" ref={searchRef}>
          <h1 className="sc-hero-title">Supply chain</h1>
          <p className="sc-hero-sub">
            Search a company to map who supplies it and who it supplies - dots are companies, dot
            size is market cap, colour is the part of the chain they sit in, and lines are documented
            supplier relationships. Every company in the Russell 1000 is mapped, plus{" "}
            {COMPANY_COUNT - INDEXED_COUNT} overseas and private suppliers the index leaves out.
          </p>
          {searchBox(true)}
          <div className="sc-starters">
            <span className="sc-starters-label">Try</span>
            {STARTERS.map((id) => (
              <button key={id} type="button" className="sc-starter" onClick={() => pick(id)}>
                {id}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const radiusFor = (node) => view.radii.get(node.id) ?? radiusOf(node, graph.root);

  const visible = graph.nodes.filter((n) => !hiddenGroups.has(n.group));
  const visibleIds = new Set(visible.map((n) => n.id));
  const edges = graph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  // Competitors carry no links, so their lines to the hub are drawn here
  // rather than coming out of the graph's own edges.
  const peerNodes = view.hub ? visible.filter((n) => n.side === "peer") : [];
  const flowSides =
    mode === "flow"
      ? { up: visible.some((n) => n.side === "up"), down: visible.some((n) => n.side === "down") }
      : null;

  const focusId = hover ?? selected;
  const focusEdges = focusId ? edges.filter((e) => e.from === focusId || e.to === focusId) : [];
  const focusNeighbours = new Set(focusEdges.flatMap((e) => [e.from, e.to]));

  const rootNode = graph.nodes.find((n) => n.id === graph.root);
  const detail = selected ? graph.nodes.find((n) => n.id === selected) : null;
  const detailUp = detail ? graph.edges.filter((e) => e.to === detail.id) : [];
  const detailDown = detail ? graph.edges.filter((e) => e.from === detail.id) : [];
  async function inspectEvidence(edge, relationshipType = "supplier") {
    const key = `${relationshipType}:${edge.from}:${edge.to}`;
    const fromNode = graph.nodes.find((node) => node.id === edge.from);
    const toNode = graph.nodes.find((node) => node.id === edge.to);
    evidenceAbort.current?.abort();
    const controller = new AbortController();
    evidenceAbort.current = controller;
    setEvidence({
      key,
      status: "loading",
      data: {
        relationship: {
          from: edge.from,
          to: edge.to,
          fromName: fromNode?.name,
          toName: toNode?.name,
          type: relationshipType,
        },
      },
      error: null,
    });
    const params = new URLSearchParams({
      from: edge.from,
      to: edge.to,
      fromName: fromNode?.name ?? edge.from,
      toName: toNode?.name ?? edge.to,
      note: edge.note ?? "",
      type: relationshipType,
    });
    try {
      const response = await fetch(`/api/research/supply-chain?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Relationship evidence unavailable");
      setEvidence({ key, status: "ready", data, error: null });
    } catch (error) {
      if (error.name !== "AbortError") {
        setEvidence({ key, status: "error", data: null, error: error.message });
      }
    }
  }

  function selectGraphCompany(id, relationshipType = null) {
    // Relationship cards can repeat the same company in several categories.
    // Clicking any of those cards should always refresh its evidence instead
    // of toggling the shared company id off.
    const next = relationshipType ? id : id === selected ? null : id;
    setSelected(next);

    if (!next) {
      evidenceAbort.current?.abort();
      setEvidence(EMPTY_EVIDENCE);
      return;
    }

    const directRelationship = graph.edges.find(
      (edge) =>
        (edge.from === graph.root && edge.to === next) ||
        (edge.to === graph.root && edge.from === next)
    );
    if (relationshipType) {
      const selectedNode = graph.nodes.find((node) => node.id === next);
      const syntheticRelationship = {
        from: relationshipType === "supplier" ? next : graph.root,
        to: relationshipType === "supplier" ? graph.root : next,
        note: relationshipType === "competitor"
          ? `${rootNode.name} and ${selectedNode?.name ?? next} compete in ${selectedNode?.industry ?? rootNode.industry}`
          : relationshipType === "partner"
            ? `${rootNode.name} and ${selectedNode?.name ?? next} have a mapped partner relationship`
            : "",
      };
      inspectEvidence(
        relationshipType === "competitor" ? syntheticRelationship : directRelationship ?? syntheticRelationship,
        relationshipType
      );
    } else if (directRelationship) {
      inspectEvidence(directRelationship);
    } else {
      evidenceAbort.current?.abort();
      setEvidence(EMPTY_EVIDENCE);
    }
  }

  // Greedy label placement: root first, then by how connected a node is.
  const labelOrder = [...visible].sort(
    (a, b) => (b.id === graph.root) - (a.id === graph.root) || b.degree - a.degree
  );
  // Every dot's own footprint is in the collision set from the start, so a
  // label is dropped when it would sit on top of a *neighbouring node*, not
  // only when it hits another label. Without that the dense middle of a big
  // graph fills up with captions lying across other companies' dots.
  const boxes = visible.flatMap((node) => {
    const p = positions.get(node.id);
    if (!p) return [];
    const r = radiusFor(node) + 1;
    return [{ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }];
  });
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const labelled = new Set();
  for (const node of labelOrder) {
    const p = positions.get(node.id);
    if (!p) continue;
    const w = node.label.length * CHAR_W + 4;
    const r = radiusFor(node);
    const box = { x: p.x - w / 2, y: p.y + r + 1.5, w, h: LABEL_H };
    // The company the map is centred on always keeps its name, however busy
    // the middle gets - it is the one label the view exists to show.
    const isRoot = node.id === graph.root;
    if (!isRoot && boxes.some((b) => overlaps(box, b))) continue;
    boxes.push(box);
    labelled.add(node.id);
  }
  const hoverNode = graph.nodes.find((node) => node.id === hover);
  const hoverEdge = hover
    ? graph.edges.find(
        (edge) =>
          (edge.from === graph.root && edge.to === hover) ||
          (edge.to === graph.root && edge.from === hover)
      ) ?? graph.edges.find((edge) => edge.from === hover || edge.to === hover)
    : null;
  const hoverFromNode = hoverEdge && graph.nodes.find((node) => node.id === hoverEdge.from);
  const hoverToNode = hoverEdge && graph.nodes.find((node) => node.id === hoverEdge.to);
  const hoverRelationship = hoverEdge
    ? supplyDescription(
        hoverEdge,
        hoverFromNode?.name ?? hoverEdge.from,
        hoverToNode?.name ?? hoverEdge.to
      )
    : null;
  return (
    <main className="sc-page">
      <div className="sc-bar">
        {/* The page only names itself on the empty state, where the hero
            carries it. Once a map is up that heading is gone, so the bar says
            what this screen is. */}
        <h1 className="sc-bar-title">Supply chain</h1>
        {searchBox(false)}
        <div className="sc-depth">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`sc-depth-btn${mode === m.key ? " active" : ""}`}
              onClick={() => setMode(m.key)}
              title={m.hint}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "web" && (
          <div className="sc-depth" aria-label="Network graph depth">
            {DEPTHS.map((d) => (
              <button
                key={d.key}
                className={`sc-depth-btn${networkDepth === d.key ? " active" : ""}`}
                onClick={() => setNetworkDepth(d.key)}
                title={d.hint}
                aria-pressed={networkDepth === d.key}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`sc-body${mode === "flow" ? " flow-mode" : ""}`}>
        <div className="sc-canvas" ref={canvasRef}>
          {mode === "flow" ? (
            <RelationshipFlowGraph
              nodes={visible}
              edges={edges}
              rootNode={rootNode}
              size={size}
              focusId={focusId}
              selected={selected}
              noLogo={noLogo}
              onHover={setHover}
              onSelect={selectGraphCompany}
              onCentre={pick}
              onLogoError={dropLogo}
            />
          ) : (
          <svg width={size.w} height={size.h} role="img" aria-label={`Supply chain around ${rootNode.name}`}>
            <g>
              {edges.map((e) => {
                const a = positions.get(e.from);
                const b = positions.get(e.to);
                if (!a || !b) return null;
                const lit = focusId ? e.from === focusId || e.to === focusId : false;
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={`sc-edge${lit ? " lit" : ""}${focusId && !lit ? " dim" : ""}`}
                    strokeWidth={lit ? 1.7 : 0.55 + e.weight * 0.28}
                  />
                );
              })}
            </g>
            {view.hub && (
              <g className="sc-hub">
                {peerNodes.map((node) => {
                  const p = positions.get(node.id);
                  if (!p) return null;
                  const lit = focusId === node.id;
                  return (
                    <line
                      key={`peer-${node.id}`}
                      x1={view.hub.x}
                      y1={view.hub.y + 20}
                      x2={p.x}
                      y2={p.y}
                      className={`sc-edge${lit ? " lit" : ""}${focusId && !lit ? " dim" : ""}`}
                      strokeWidth={lit ? 1.7 : 0.9}
                    />
                  );
                })}
                <rect
                  x={view.hub.x - 84}
                  y={view.hub.y - 20}
                  width={168}
                  height={40}
                  rx={20}
                  className="sc-hub-box"
                />
                <text x={view.hub.x} y={view.hub.y + 7} className="sc-hub-label" textAnchor="middle">
                  Competitors
                </text>
              </g>
            )}
            {flowSides && (
              <g className="sc-flow-axis">
                {flowSides.up && view.axes?.up != null && (
                  <text x={view.axes.up} y={view.axes.y} textAnchor="middle">
                    Suppliers
                  </text>
                )}
                {flowSides.down && view.axes?.down != null && (
                  <text x={view.axes.down} y={view.axes.y} textAnchor="middle">
                    Customers
                  </text>
                )}
              </g>
            )}
            <defs>
              {/* One clip in object-bounding-box units serves every logo, so a
                  90-node graph doesn't ship 90 clip paths. */}
              <clipPath id="sc-logo-clip" clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r="0.5" />
              </clipPath>
            </defs>
            <g>
              {visible.map((node) => {
                const p = positions.get(node.id);
                if (!p) return null;
                const r = radiusFor(node);
                const isRoot = node.id === graph.root;
                const dim = focusId && node.id !== focusId && !focusNeighbours.has(node.id);
                // The logo sits on a light disc inside the dot rather than
                // filling it, so the chain-segment colour survives as a ring
                // around the mark - the colour is what the legend reads.
                const logoR = r * 0.66;
                const showLogo = r >= LOGO_MIN_RADIUS && !noLogo.has(node.id);
                return (
                  <g
                    key={node.id}
                    className={`sc-node${dim ? " dim" : ""}${isRoot ? " root" : ""}`}
                    onMouseEnter={() => setHover(node.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => selectGraphCompany(node.id)}
                    onDoubleClick={() => pick(node.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${node.name}, ${node.industry}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") selectGraphCompany(node.id);
                    }}
                  >
                    <circle cx={p.x} cy={p.y} r={r + 7} className="sc-node-hit" />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={node.color}
                      className="sc-node-dot"
                      stroke={isRoot ? "var(--panel)" : "none"}
                      strokeWidth={isRoot ? 2.5 : 0}
                    />
                    {showLogo && (
                      <image
                        href={logoFor(node)}
                        x={p.x - logoR}
                        y={p.y - logoR}
                        width={logoR * 2}
                        height={logoR * 2}
                        clipPath="url(#sc-logo-clip)"
                        preserveAspectRatio="xMidYMid meet"
                        className="sc-node-logo"
                        onError={() => dropLogo(node.id)}
                      />
                    )}
                  </g>
                );
              })}
            </g>
            {/* Captions ride above every dot in their own layer. Kept inside
                each node's group, a label drawn early was painted over by any
                dot that came after it - which is exactly how the centred
                company lost its name in a crowded middle. */}
            <g className="sc-labels">
              {visible.map((node) => {
                const p = positions.get(node.id);
                if (!p || !(labelled.has(node.id) || node.id === focusId)) return null;
                const isRoot = node.id === graph.root;
                const dim = focusId && node.id !== focusId && !focusNeighbours.has(node.id);
                return (
                  <text
                    key={node.id}
                    x={p.x}
                    y={p.y + radiusFor(node) + 10}
                    className={`sc-node-label${isRoot ? " root" : ""}${dim ? " dim" : ""}`}
                    textAnchor="middle"
                  >
                    {node.label}
                  </text>
                );
              })}
            </g>
          </svg>
          )}
          {mode !== "flow" && hover && positions.get(hover) && (
            <HoverCard
              node={hoverNode}
              pos={positions.get(hover)}
              size={size}
              relationship={hoverRelationship}
            />
          )}
          {/* A company can be in the index and still have nothing mapped to it.
              Saying so beats drawing one lonely dot and leaving it ambiguous
              whether the company has no suppliers or the map has no data. */}
          {graph.edges.length === 0 && (
            <div className="sc-empty-graph solo">
              <b>No relationships mapped for {rootNode.name} yet.</b>
              <span>
                {COVERED.length} of the {COMPANY_COUNT} companies here carry at least one link. The
                map is deepest on physical chains - semiconductors, hardware, autos, healthcare,
                consumer goods and energy - and thinner where a company&apos;s suppliers are
                services rather than parts.
              </span>
            </div>
          )}
          <div className="sc-canvas-hint">
            {mode === "flow"
              ? "Click a company for related articles · double-click to re-centre · cards show the strongest mapped relationships"
              : "Dot size is market cap · click a direct supplier/customer for related articles below · double-click to re-centre"}
            {graph.trimmed && ` · trimmed to the ${graph.nodes.length} best-connected`}
          </div>
        </div>

        <aside className="sc-side">
          <div className="sc-root-card">
            <div className="sc-root-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="sc-root-logo"
                src={logoFor(rootNode)}
                alt=""
                onError={hideBrokenLogo}
              />
              <div className="sc-root-names">
                <b>{rootNode.name}</b>
                <span>{rootNode.industry}</span>
              </div>
            </div>
            <div className="sc-root-stats">
              <span>
                <b>{graph.nodes.length}</b> companies
              </span>
              <span>
                <b>{graph.edges.length}</b> links
              </span>
              {rootNode.ticker && (
                <a className="sc-root-link" href={`/stock/${rootNode.ticker}`} target="_blank" rel="noopener">
                  Open quote ↗
                </a>
              )}
            </div>
          </div>

          <h2 className="sc-side-title">
            Chain segments
            <button
              className="sc-side-all"
              onClick={() => setHiddenGroups(new Set())}
              disabled={!hiddenGroups.size}
            >
              Show all
            </button>
          </h2>
          <div className="sc-legend">
            {graph.groups.map((g) => {
              const off = hiddenGroups.has(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`sc-legend-row${off ? " off" : ""}`}
                  onClick={() => toggleGroup(g.key)}
                  aria-pressed={!off}
                >
                  <i className="sc-legend-check" style={{ background: off ? "transparent" : g.color, borderColor: g.color }}>
                    {!off && (
                      <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
                        <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </i>
                  <span className="sc-legend-main">
                    <span className="sc-legend-label">{g.label}</span>
                    <span className="sc-legend-sectors">{g.industries.join(" · ")}</span>
                  </span>
                  <span className="sc-legend-count">{g.count}</span>
                </button>
              );
            })}
          </div>

          {detail ? (
            <div className="sc-detail">
              <div className="sc-detail-head">
                <i className="sc-dot" style={{ background: detail.color }} />
                <div>
                  <b>{detail.name}</b>
                  <span>
                    {detail.industry}
                    {detail.region ? ` · ${detail.region}` : ""}
                  </span>
                </div>
                <button className="sc-detail-close" onClick={() => setSelected(null)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="sc-detail-actions">
                <button onClick={() => pick(detail.id)}>Centre map here</button>
                {detail.ticker ? (
                  <a href={`/stock/${detail.ticker}`} target="_blank" rel="noopener">
                    Quote ↗
                  </a>
                ) : (
                  <span className="sc-detail-nolist">
                    {detail.private ? "Private company" : `Listed as ${detail.listing ?? "n/a"}`}
                  </span>
                )}
              </div>
              <EdgeList
                title={`Supplies ${detail.id === graph.root ? "it" : detail.name}`}
                rows={detailUp}
                other={(e) => e.from}
                graph={graph}
                onPick={setSelected}
                onEvidence={inspectEvidence}
                activeEvidence={evidence.key}
              />
              <EdgeList
                title="Sells to"
                rows={detailDown}
                other={(e) => e.to}
                graph={graph}
                onPick={setSelected}
                onEvidence={inspectEvidence}
                activeEvidence={evidence.key}
              />
              {detail.side === "peer" && (
                <p className="sc-detail-note">
                  On the map as a competitor: same industry as {rootNode.label}, with no supply link
                  mapped between the two. Centre the map here for its own chain.
                </p>
              )}
            </div>
          ) : (
            <p className="sc-side-note">
              Dot size is market cap, on a log scale - a company three times the width of another is
              far more than three times its size. Relationships are hand-curated from company
              disclosures, supplier lists and teardowns - a research starting point, not a filing,
              and one that goes out of date as contracts move.
            </p>
          )}
        </aside>
        {evidence.status !== "idle" && (
          <div className="sc-evidence-shelf">
            <SupplyEvidencePanel evidence={evidence} />
          </div>
        )}
      </div>
    </main>
  );
}

const truncateFlowText = (value, max) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
};

const endSentence = (value) => (/[.!?]$/.test(value) ? value : `${value}.`);

const supplyDescription = (edge, fromName, toName) => {
  if (edge?.inferred) {
    return `${fromName} is a possible supplier to ${toName}. This is an inferred research lead, not a disclosed contract.`;
  }
  const products = edge?.note
    ? ` Key products or services: ${endSentence(edge.note.replace(/\s*·\s*/g, "; "))}`
    : "";
  return `${fromName} supplies ${toName}.${products}`;
};

const relationshipSourceHref = ({ from, to, fromName, toName, note, type }) => {
  const params = new URLSearchParams({
    from,
    to,
    fromName,
    toName,
    note,
    type,
  });
  return `/api/research/supply-chain?${params.toString()}`;
};

const openExternalRelationshipSource = async (evidenceHref) => {
  // Open synchronously so browsers treat this as the user's click, then send
  // that tab directly to the external article returned by the evidence API.
  const articleTab = window.open("about:blank", "_blank");
  if (articleTab) articleTab.opener = null;
  try {
    const response = await fetch(evidenceHref);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Source unavailable");
    const source = data.sources?.find(({ url }) => {
      try {
        const articleUrl = new URL(url);
        return /^https?:$/.test(articleUrl.protocol) && articleUrl.hostname !== window.location.hostname;
      } catch {
        return false;
      }
    });
    if (!source?.url) throw new Error("No external supporting article was found");
    if (articleTab) articleTab.location.replace(source.url);
    else window.location.assign(source.url);
  } catch (error) {
    if (articleTab) {
      articleTab.document.title = "Source unavailable";
      articleTab.document.body.textContent = error.message;
    }
  }
};

function RelationshipFlowGraph({
  nodes,
  edges,
  rootNode,
  size,
  focusId,
  selected,
  noLogo,
  onHover,
  onSelect,
  onCentre,
  onLogoError,
}) {
  const [expandedSide, setExpandedSide] = useState(null);
  const [hoverCard, setHoverCard] = useState(null);
  const tooltipCloseTimer = useRef(null);
  useEffect(() => () => clearTimeout(tooltipCloseTimer.current), []);
  const width = Math.max(size.w, 1120);
  const height = Math.max(size.h, 720);
  const rank = (a, b) =>
    (a.depth ?? 9) - (b.depth ?? 9) ||
    (b.degree ?? 0) - (a.degree ?? 0) ||
    (b.cap ?? 0) - (a.cap ?? 0);
  const groups = {
    supplier: nodes
      .filter((node) => node.side === "up")
      .sort(rank),
    customer: nodes
      .filter((node) => node.side === "down")
      .sort(rank),
    partner: nodes.filter((node) => node.side === "partner").sort(rank),
    competitor: nodes.filter((node) => node.side === "peer").sort(rank),
  };

  const nodeLookup = new Map([...nodes, rootNode].map((node) => [node.id, node]));
  const relationshipDetailsFor = (node, side) => {
    const direct = edges.find((edge) => {
      if (side === "supplier") return edge.from === node.id && edge.to === rootNode.id;
      if (side === "customer") return edge.from === rootNode.id && edge.to === node.id;
      return (
        (edge.from === rootNode.id && edge.to === node.id) ||
        (edge.to === rootNode.id && edge.from === node.id)
      );
    });
    let description;

    if (side === "supplier") {
      description = direct
        ? supplyDescription(direct, node.name, rootNode.name)
        : `${node.name} is a supplier to ${rootNode.name}.`;
    } else if (side === "customer") {
      description = direct
        ? supplyDescription(direct, rootNode.name, node.name)
        : `${rootNode.name} sells products or services to ${node.name}.`;
    } else if (side === "partner" && direct) {
      const fromNode = nodeLookup.get(direct.from);
      const toNode = nodeLookup.get(direct.to);
      description = supplyDescription(direct, fromNode?.name ?? direct.from, toNode?.name ?? direct.to);
    }

    if (!description && side === "competitor") {
      description = `${node.name} competes with ${rootNode.name} in ${node.industry || rootNode.industry} products and services.`;
    }

    if (!description && side === "partner") {
      const rootNeighbours = new Set(
        edges
          .filter((edge) => edge.from === rootNode.id || edge.to === rootNode.id)
          .map((edge) => (edge.from === rootNode.id ? edge.to : edge.from))
      );
      const shared = edges
        .filter((edge) => edge.from === node.id || edge.to === node.id)
        .map((edge) => (edge.from === node.id ? edge.to : edge.from))
        .filter((id) => rootNeighbours.has(id)).length;
      description = shared
        ? `${node.name} and ${rootNode.name} share ${shared} ${shared === 1 ? "supplier or customer" : "suppliers or customers"} in this network.`
        : `${node.name} and ${rootNode.name} operate in the same ${node.industry || rootNode.industry} market.`;
    }

    const contextual = edges.find(
      (edge) => (edge.from === node.id || edge.to === node.id) && edge.note
    );
    if (!description) {
      const fromNode = contextual && nodeLookup.get(contextual.from);
      const toNode = contextual && nodeLookup.get(contextual.to);
      description = contextual
        ? supplyDescription(contextual, fromNode?.name ?? contextual.from, toNode?.name ?? contextual.to)
        : `${node.name} has a ${side} relationship with ${rootNode.name}.`;
    }

    const sourceEdge = direct ?? contextual;
    const fromNode = sourceEdge ? nodeLookup.get(sourceEdge.from) : side === "supplier" ? node : rootNode;
    const toNode = sourceEdge ? nodeLookup.get(sourceEdge.to) : side === "supplier" ? rootNode : node;
    return {
      description,
      sourceHref: relationshipSourceHref({
        from: fromNode?.ticker ?? fromNode?.id ?? rootNode.id,
        to: toNode?.ticker ?? toNode?.id ?? node.id,
        fromName: fromNode?.name ?? rootNode.name,
        toName: toNode?.name ?? node.name,
        note: sourceEdge?.note ?? description,
        type: side,
      }),
    };
  };

  const openTooltip = (card) => {
    clearTimeout(tooltipCloseTimer.current);
    setHoverCard(card);
  };
  const closeTooltip = () => {
    clearTimeout(tooltipCloseTimer.current);
    tooltipCloseTimer.current = setTimeout(() => setHoverCard(null), 220);
  };

  const cardW = 260;
  const cardH = 58;
  const gap = 8;
  const rootW = 304;
  const rootH = 104;
  const cx = width / 2;
  const cy = height / 2 + 5;
  const footerH = 38;

  const limited = (key, limit = 5) => {
    const all = groups[key];
    const cards = all.slice(0, limit).map((node) => ({ node }));
    if (all.length > limit) cards.push({ more: all.length - limit });
    return cards;
  };

  const sidePositions = (key, x) => {
    const cards = limited(key);
    const total = cards.length * cardH + Math.max(0, cards.length - 1) * gap;
    const y = cy - total / 2;
    return cards.map((card, index) => ({ ...card, x, y: y + index * (cardH + gap) }));
  };

  const railPositions = (key, top) => {
    const cards = limited(key);
    const columns = Math.min(4, Math.max(cards.length, 1));
    const railW = columns * cardW + (columns - 1) * gap;
    const x0 = cx - railW / 2;
    return cards.map((card, index) => ({
      ...card,
      x: x0 + (index % columns) * (cardW + gap),
      y: top + Math.floor(index / columns) * (cardH + gap),
    }));
  };

  const layouts = {
    supplier: sidePositions("supplier", 34),
    customer: sidePositions("customer", width - cardW - 34),
    competitor: railPositions("competitor", 68),
    partner: railPositions("partner", height - footerH - 138),
  };
  const hubs = {
    supplier: { x: cx - rootW / 2 - 120, y: cy },
    customer: { x: cx + rootW / 2 + 120, y: cy },
    competitor: { x: cx, y: Math.max(226, cy - rootH / 2 - 104) },
    partner: { x: cx, y: Math.min(height - footerH - 174, cy + rootH / 2 + 104) },
  };

  const pathToHub = (key, card) => {
    const hub = hubs[key];
    if (key === "supplier") {
      const x = card.x + cardW;
      const y = card.y + cardH / 2;
      return `M ${x} ${y} C ${x + 62} ${y}, ${hub.x - 74} ${hub.y}, ${hub.x} ${hub.y}`;
    }
    if (key === "customer") {
      const x = card.x;
      const y = card.y + cardH / 2;
      return `M ${x} ${y} C ${x - 62} ${y}, ${hub.x + 74} ${hub.y}, ${hub.x} ${hub.y}`;
    }
    const fromTop = key === "competitor";
    const x = card.x + cardW / 2;
    const y = fromTop ? card.y + cardH : card.y;
    const bend = fromTop ? 46 : -46;
    return `M ${x} ${y} C ${x} ${y + bend}, ${hub.x} ${hub.y - bend}, ${hub.x} ${hub.y}`;
  };

  const hubToRoot = (key) => {
    const hub = hubs[key];
    if (key === "supplier") return `M ${hub.x} ${hub.y} L ${cx - rootW / 2} ${cy}`;
    if (key === "customer") return `M ${hub.x} ${hub.y} L ${cx + rootW / 2} ${cy}`;
    if (key === "competitor") return `M ${hub.x} ${hub.y} L ${cx} ${cy - rootH / 2}`;
    return `M ${hub.x} ${hub.y} L ${cx} ${cy + rootH / 2}`;
  };

  const counts = Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length]));
  const panelBounds = {
    supplier: { x: 22, y: 54, width: 292, height: height - footerH - 66 },
    customer: { x: width - 314, y: 54, width: 292, height: height - footerH - 66 },
    competitor: { x: cx - 195, y: 54, width: 390, height: Math.max(150, hubs.competitor.y - 72) },
    partner: {
      x: cx - 195,
      y: cy + rootH / 2 + 32,
      width: 390,
      height: Math.max(150, height - footerH - (cy + rootH / 2 + 42)),
    },
  };
  const legend = [
    ["customer", "Customer"],
    ["supplier", "Supplier"],
    ["partner", "Partner"],
    ["competitor", "Competitor"],
  ];

  return (
    <svg
      className="sc-flow-map"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Suppliers, customers, partners, and competitors around ${rootNode.name}`}
    >
      <defs>
        <pattern id="sc-flow-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" className="sc-flow-grid-line" />
        </pattern>
      </defs>
      <rect width={width} height={height} className="sc-flow-bg" />
      <rect y="43" width={width} height={height - 43 - footerH} fill="url(#sc-flow-grid)" />

      <g className="sc-flow-legend" aria-hidden="true">
        {legend.map(([key, label], index) => (
          <g key={key} transform={`translate(${16 + index * 170} 22)`}>
            <circle r="6" fill={RELATIONSHIP_COLORS[key]} />
            <text x="12" y="5">{label}</text>
            <text x={label.length * 9.2 + 22} y="5" className="count">{counts[key]}</text>
          </g>
        ))}
        <text x={width - 16} y="27" textAnchor="end" className="sc-flow-legend-title">
          Relationships
        </text>
      </g>
      <line x1="0" x2={width} y1="43" y2="43" className="sc-flow-rail" />

      {Object.entries(layouts).map(([key, cards]) => {
        if (!counts[key]) return null;
        const color = RELATIONSHIP_COLORS[key];
        return (
          <g key={key} className={`sc-flow-branch ${key}`}>
            <path d={hubToRoot(key)} stroke={color} className="sc-flow-trunk" />
            {(expandedSide === key ? [] : cards).map((card, index) => {
              const active = card.node && focusId === card.node.id;
              const dim = focusId && card.node && !active;
              return (
                <path
                  key={`${key}-path-${card.node?.id ?? `more-${index}`}`}
                  d={pathToHub(key, card)}
                  stroke={color}
                  className={`sc-flow-link${active ? " lit" : ""}${dim ? " dim" : ""}`}
                />
              );
            })}
            <rect
              x={hubs[key].x - 5}
              y={hubs[key].y - 5}
              width="10"
              height="10"
              fill="#a5a5a7"
              className="sc-flow-junction"
            />
            <text
              x={hubs[key].x}
              y={hubs[key].y - 13}
              textAnchor="middle"
              className="sc-flow-count"
            >
              {counts[key]} {counts[key] === 1 ? key : `${key}s`}
            </text>
          </g>
        );
      })}

      <g
        className={`sc-flow-root${selected === rootNode.id ? " selected" : ""}`}
        transform={`translate(${cx - rootW / 2} ${cy - rootH / 2})`}
        onClick={() => onSelect(rootNode.id)}
        tabIndex="0"
        role="button"
        aria-label={`${rootNode.name}, central company`}
        onKeyDown={(event) => event.key === "Enter" && onSelect(rootNode.id)}
      >
        <rect width={rootW} height={rootH} rx="3" />
        {!noLogo.has(rootNode.id) ? (
          <image
            href={logoFor(rootNode)}
            x="14"
            y="17"
            width="26"
            height="26"
            preserveAspectRatio="xMidYMid meet"
            className="logo"
            onError={() => onLogoError(rootNode.id)}
          />
        ) : (
          <text x="27" y="34" textAnchor="middle" className="logo-fallback">
            {rootNode.label?.slice(0, 2) ?? rootNode.name.slice(0, 2)}
          </text>
        )}
        <text x="52" y="33" className="name">{truncateFlowText(rootNode.name, 16)}</text>
        <text x={rootW - 16} y="33" textAnchor="end" className="cap">
          MKT CAP {formatCap(rootNode.cap).replace("$", "")}
        </text>
        <text x="18" y="62" className="meta">{truncateFlowText(rootNode.industry, 38)}</text>
        <text x="18" y="86" className="stats">
          {counts.supplier} suppliers · {counts.customer} customers
        </text>
      </g>

      {Object.entries(layouts).flatMap(([key, cards]) =>
        (expandedSide === key ? [] : cards).map((card, index) =>
          card.node ? (
            <FlowEntityCard
              key={`${key}-${card.node.id}`}
              node={card.node}
              x={card.x}
              y={card.y}
              width={cardW}
              height={cardH}
              color={RELATIONSHIP_COLORS[key]}
              selected={selected === card.node.id}
              dim={Boolean(focusId && focusId !== card.node.id)}
              noLogo={noLogo.has(card.node.id)}
              side={key}
              relationship={relationshipDetailsFor(card.node, key).description}
              onHover={onHover}
              onTooltip={(next) => {
                if (!next) {
                  closeTooltip();
                  return;
                }
                const details = relationshipDetailsFor(card.node, key);
                openTooltip({
                  node: card.node,
                  side: key,
                  relationship: details.description,
                  sourceHref: details.sourceHref,
                  color: RELATIONSHIP_COLORS[key],
                  x: card.x,
                  y: card.y,
                  width: cardW,
                  height: cardH,
                });
              }}
              onSelect={onSelect}
              onCentre={onCentre}
              onLogoError={onLogoError}
            />
          ) : (
            <FlowMoreCard
              key={`${key}-more-${index}`}
              x={card.x}
              y={card.y}
              width={cardW}
              height={cardH}
              color={RELATIONSHIP_COLORS[key]}
              more={card.more}
              label={key}
              onExpand={() => setExpandedSide(key)}
            />
          )
        )
      )}

      {expandedSide && (
        <FlowExpandedPanel
          side={expandedSide}
          rows={groups[expandedSide]}
          bounds={panelBounds[expandedSide]}
          color={RELATIONSHIP_COLORS[expandedSide]}
          selected={selected}
          onClose={() => setExpandedSide(null)}
          onSelect={onSelect}
          onCentre={onCentre}
          relationshipFor={(node, side) => relationshipDetailsFor(node, side).description}
        />
      )}

      {hoverCard && !expandedSide && (
        <FlowRelationshipTooltip
          card={hoverCard}
          canvasWidth={width}
          canvasHeight={height}
          onMouseEnter={() => clearTimeout(tooltipCloseTimer.current)}
          onMouseLeave={closeTooltip}
        />
      )}

      <line x1="0" x2={width} y1={height - footerH} y2={height - footerH} className="sc-flow-rail" />
      <text x="14" y={height - 13} className="sc-flow-footer">
        {counts.supplier} suppliers · {counts.customer} customers · {counts.competitor} competitors · {counts.partner} partners
      </text>
      <text x={width - 14} y={height - 13} textAnchor="end" className="sc-flow-footer instruction">
        click for evidence · double-click to re-centre
      </text>
    </svg>
  );
}

function FlowEntityCard({
  node,
  x,
  y,
  width,
  height,
  color,
  selected,
  dim,
  noLogo,
  side,
  relationship,
  onHover,
  onTooltip,
  onSelect,
  onCentre,
  onLogoError,
}) {
  const metadata = [node.industry, node.region, node.inferred ? "inferred" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`sc-flow-card${selected ? " selected" : ""}${dim ? " dim" : ""}`}
      onMouseEnter={() => {
        onHover(node.id);
        onTooltip(true);
      }}
      onMouseLeave={() => {
        onHover(null);
        onTooltip(false);
      }}
      onClick={() => onSelect(node.id, side)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onCentre(node.id);
      }}
      tabIndex="0"
      role="button"
      aria-label={`${node.name}, ${side}: ${relationship}`}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(node.id, side);
      }}
    >
      <title>{`${node.name}\n${metadata}`}</title>
      <rect width={width} height={height} rx="3" stroke={color} />
      <rect width="4" height={height} rx="2" fill={color} className="accent" />
      {!noLogo ? (
        <image
          href={logoFor(node)}
          x="13"
          y="16"
          width="24"
          height="24"
          preserveAspectRatio="xMidYMid meet"
          className="logo"
          onError={() => onLogoError(node.id)}
        />
      ) : (
        <text x="25" y="32" textAnchor="middle" className="logo-fallback">
          {node.label?.slice(0, 2) ?? node.name.slice(0, 2)}
        </text>
      )}
      <text x="46" y="23" className="name">{truncateFlowText(node.name, 17)}</text>
      <text x={width - 9} y="22" textAnchor="end" className="cap">
        MKT CAP {formatCap(node.cap).replace("$", "")}
      </text>
      <text x="46" y="45" className="meta">{truncateFlowText(metadata, 25)}</text>
    </g>
  );
}

function FlowRelationshipTooltip({ card, canvasWidth, canvasHeight, onMouseEnter, onMouseLeave }) {
  const width = 324;
  const height = 138;
  let x = card.side === "customer" ? card.x - width - 12 : card.x + card.width + 12;
  let y = card.y + card.height / 2 - height / 2;
  if (card.side === "competitor") {
    x = card.x + card.width / 2 - width / 2;
    y = card.y + card.height + 10;
  } else if (card.side === "partner") {
    x = card.x + card.width / 2 - width / 2;
    y = card.y - height - 10;
  }
  x = clamp(x, 10, canvasWidth - width - 10);
  y = clamp(y, 50, canvasHeight - height - 44);
  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      className="sc-flow-tooltip-wrap"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="sc-flow-tooltip" style={{ "--sc-tooltip-color": card.color }}>
        <div className="sc-flow-tooltip-kicker"><i /> {card.side}</div>
        <b>{card.node.name}</b>
        <p>{card.relationship}</p>
        <button type="button" onClick={() => openExternalRelationshipSource(card.sourceHref)}>
          source link ↗
        </button>
      </div>
    </foreignObject>
  );
}

function FlowMoreCard({ x, y, width, height, color, more, label, onExpand }) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="sc-flow-more"
      onClick={onExpand}
      tabIndex="0"
      role="button"
      aria-label={`See all ${label}s`}
      onKeyDown={(event) => event.key === "Enter" && onExpand()}
    >
      <rect width={width} height={height} rx="3" stroke={color} />
      <text x="14" y="24">+{more} more</text>
      <text x="14" y="45" className="table">see TABLE ↗</text>
    </g>
  );
}

function FlowExpandedPanel({
  side,
  rows,
  bounds,
  color,
  selected,
  onClose,
  onSelect,
  onCentre,
  relationshipFor,
}) {
  return (
    <foreignObject x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
      <div className="sc-flow-table" style={{ "--sc-table-color": color }}>
        <div className="sc-flow-table-head">
          <span><i /> {side}s <b>{rows.length}</b></span>
          <button type="button" onClick={onClose} aria-label={`Close ${side} table`}>×</button>
        </div>
        <div className="sc-flow-table-list">
          {rows.map((node, index) => (
            <button
              type="button"
              key={node.id}
              className={selected === node.id ? "selected" : ""}
              title={relationshipFor(node, side)}
              onClick={() => onSelect(node.id, side)}
              onDoubleClick={() => onCentre(node.id)}
            >
              <span className="rank">{String(index + 1).padStart(2, "0")}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoFor(node)} alt="" onError={hideBrokenLogo} />
              <span className="company">
                <b>{node.name}</b>
                <small>
                  {[node.industry, node.region, node.inferred ? "inferred" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              <span className="market-cap"><small>MKT CAP</small>{formatCap(node.cap).replace("$", "")}</span>
            </button>
          ))}
        </div>
        <div className="sc-flow-table-foot">scroll to explore · double-click to re-centre</div>
      </div>
    </foreignObject>
  );
}

function EdgeList({ title, rows, other, graph, onPick, onEvidence, activeEvidence }) {
  if (!rows.length) return null;
  return (
    <div className="sc-edges">
      <h3>{title}</h3>
      {rows.map((e) => {
        const id = other(e);
        const node = graph.nodes.find((n) => n.id === id);
        const key = `${e.from}:${e.to}`;
        const evidenceActive = activeEvidence?.endsWith(key);
        return (
          <div className={`sc-edge-row${evidenceActive ? " evidence-active" : ""}`} key={key}>
            <button
              className="sc-edge-pick"
              type="button"
              onClick={() => {
                onPick(id);
                onEvidence(e);
              }}
            >
              <i className="sc-dot" style={{ background: node?.color ?? "#8b93a3" }} />
              <span className="sc-edge-sym">{node?.label ?? id}</span>
              <span className="sc-edge-note">{e.note}</span>
              <span className="sc-edge-evidence">Articles ↓</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SupplyEvidencePanel({ evidence }) {
  const data = evidence.data;
  const relationship = data?.relationship;
  if (evidence.status === "loading") {
    return (
      <section className="sc-evidence-panel loading" aria-label="Relationship articles" aria-live="polite">
        <EvidenceHeader relationship={relationship} />
        <div className="sc-evidence-state"><i /> Searching related company news…</div>
      </section>
    );
  }
  if (evidence.status === "error") {
    return (
      <section className="sc-evidence-panel" aria-label="Relationship articles" aria-live="polite">
        <EvidenceHeader relationship={relationship} />
        <div className="sc-evidence-state error">{evidence.error}</div>
      </section>
    );
  }
  if (data?.configured === false) {
    return (
      <div className="sc-evidence-state setup">
        <b>Relationship articles need a Finnhub API key.</b>
        <span>{data.error}</span>
      </div>
    );
  }
  // Keep the presentation rule as a second line of defense so cached or older
  // API responses can never surface SEC filings in this article shelf.
  const sources = (data?.sources ?? [])
    .filter((source) => source.domain !== "sec.gov" && !source.domain.endsWith(".sec.gov"))
    .slice(0, 6);
  return (
    <section className="sc-evidence-panel" aria-label="Relationship articles">
      <div className="sc-evidence-head">
        <EvidenceHeader relationship={data.relationship} />
        <i className={`catalyst-strength ${data.strength}`}>{data.strength} coverage</i>
      </div>
      {sources.length ? (
        <div className="sc-evidence-sources">
          {sources.map((source, index) => (
            <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="sc-evidence-card">
              <div className={`sc-evidence-image${source.image ? "" : " fallback"}`}>
                {source.image ? (
                  // Article imagery comes from the news feed. A broken
                  // publisher image quietly reveals the branded fallback.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={dropBrokenImage} />
                ) : null}
                <span>{source.domain.slice(0, 1).toUpperCase()}</span>
                <i>{String(index + 1).padStart(2, "0")}</i>
              </div>
              <div className="sc-evidence-card-body">
                <div className="sc-evidence-card-meta">
                  <span className={`sc-evidence-type ${source.sourceType}`}>{source.sourceType}</span>
                  <small>{source.publishedDate ?? "Date unavailable"} · {source.publisher || source.domain}</small>
                </div>
                <b>{source.title}</b>
                {source.excerpt && <p>{source.excerpt}</p>}
                <span className="sc-evidence-open">Open source ↗</span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="sc-evidence-empty">No closely related article was found. Treat this link as unverified.</p>
      )}
      {data?.caveat && <p className="sc-evidence-caveat">{data.caveat}</p>}
    </section>
  );
}

function EvidenceHeader({ relationship }) {
  return (
    <div className="sc-evidence-title">
      <span>Related articles</span>
      <b>
        {relationship?.fromName || relationship?.from} <i>→</i> {relationship?.toName || relationship?.to}
      </b>
    </div>
  );
}

function HoverCard({ node, pos, size, relationship }) {
  if (!node) return null;
  // Flip to the other side of the cursor near an edge so the card stays on
  // the canvas.
  const right = pos.x > size.w - 220;
  const style = {
    left: right ? undefined : pos.x + 16,
    right: right ? size.w - pos.x + 16 : undefined,
    top: clamp(pos.y - 20, 8, Math.max(size.h - 90, 8)),
  };
  return (
    <div className="sc-hover" style={style}>
      <div className="sc-hover-name">{node.name}</div>
      <div className="sc-hover-meta">
        <i className="sc-dot" style={{ background: node.color }} />
        {node.industry}
      </div>
      <div className="sc-hover-links">
        {node.side === "peer"
          ? "Competitor · same industry"
          : `${node.degree} link${node.degree === 1 ? "" : "s"} in view`}
        {node.ticker ? ` · ${node.ticker}` : node.listing ? ` · ${node.listing}` : ""}
      </div>
      {relationship && <div className="sc-hover-relationship">{relationship}</div>}
      {node.cap != null && (
        <div className="sc-hover-cap">
          {node.capApprox ? "≈" : ""}
          {formatCap(node.cap)}
          {node.private ? " valuation" : " market cap"}
        </div>
      )}
    </div>
  );
}
