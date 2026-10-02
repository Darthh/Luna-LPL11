// Turns the curated relationship list into the graph the page draws.
//
// The company list is two sources joined: every Russell 1000 constituent, taken
// straight from the shared stock universe so names and industries stay in step
// with the maps, plus the hand-curated companies no US index lists - TSMC,
// Samsung, Foxconn, ASML, OpenAI and the rest of the overseas and private names
// a supply chain runs through.
//
// The Russell 1000 rather than the S&P 500 because a supply chain does not stop
// at the large-cap line. The company that makes the connectors, the regional
// bank a manufacturer borrows from, the trucking firm that moves the freight -
// those sit in the next 500 names down, and a map that skipped them showed a
// chain running into thin air.
import { STOCK_UNIVERSE } from "./stockMapData";
import { COMPANIES, GROUPS, INDUSTRY_GROUP, GROUP_OVERRIDES, LINKS, ALIASES } from "./supplyChainData";

const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));

const UNIVERSE_BY_SYMBOL = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s]));

const IN_INDEX = (stock) =>
  stock.indexes?.includes("russell1000") || stock.indexes?.includes("sp500");

const INDEX = (() => {
  const all = new Map();
  for (const stock of STOCK_UNIVERSE) {
    if (!IN_INDEX(stock)) continue;
    all.set(stock.symbol, {
      name: stock.name,
      sector: stock.sector ?? null,
      industry: stock.industry,
      region: null,
      cap: stock.cap ?? null,
      capApprox: false,
      inIndex: true,
    });
  }
  // A curated entry wins on conflict: it is the one that was written for this
  // map, and it carries the listing and private flags the universe has no
  // column for. Its market cap, though, is preferred from the universe
  // wherever there is a row for it - several curated names are listed outside
  // the S&P 500 rather than unlisted - and only falls back to the rounded
  // figure in the data file.
  for (const [id, company] of Object.entries(COMPANIES)) {
    const listed = UNIVERSE_BY_SYMBOL.get(id);
    all.set(id, {
      ...company,
      sector: company.sector ?? listed?.sector ?? null,
      cap: listed?.cap ?? company.cap ?? null,
      capApprox: !listed?.cap && company.cap != null,
      inIndex: all.has(id),
    });
  }
  return all;
})();

export const COMPANY_COUNT = INDEX.size;
// How many of those came from the index rather than from the curated file -
// the split the page quotes, so it moves with the data instead of being a
// number written into the copy.
export const INDEXED_COUNT = [...INDEX.values()].filter((c) => c.inIndex).length;

const groupFor = (id) => {
  const company = INDEX.get(id);
  if (!company) return null;
  return GROUP_OVERRIDES[id] ?? INDUSTRY_GROUP[company.industry] ?? "services";
};

const colorOf = (id) => GROUP_BY_KEY[groupFor(id)]?.color ?? "#8b93a3";

// A link naming a company in neither source would otherwise draw an edge into
// nothing, so it is dropped here rather than halfway through a layout.
//
// Two companies can be related more than once - Samsung sells Apple both
// memory and display panels - and those collapse into a single edge carrying
// both notes. Drawing them as parallel lines would put two strokes on exactly
// the same pixels, so the second only shows up as a duplicate React key.
const CURATED_EDGES = (() => {
  const merged = new Map();
  for (const [from, to, weight = 2, note = ""] of LINKS) {
    if (!INDEX.has(from) || !INDEX.has(to) || from === to) continue;
    const key = `${from} ${to}`;
    const existing = merged.get(key);
    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
      if (note) existing.notes.push(note);
      continue;
    }
    merged.set(key, { from, to, weight, notes: note ? [note] : [] });
  }
  return [...merged.values()].map((e) => ({
    from: e.from,
    to: e.to,
    weight: e.weight,
    note: e.notes.join(" · "),
    inferred: false,
  }));
})();

// Curated disclosures are always preferred, but some S&P 500 companies do not
// publicly name two counterparties in both directions. For those gaps, borrow
// the strongest counterparties seen around close sector analogues. These links
// stay weight 1 and carry an explicit inferred flag/note so the UI and evidence
// tooling never present them as disclosed contracts.
const EDGES = (() => {
  const edges = [...CURATED_EDGES];
  const keys = new Set(edges.map((edge) => `${edge.from} ${edge.to}`));
  const incoming = new Map([...INDEX.keys()].map((id) => [id, []]));
  const outgoing = new Map([...INDEX.keys()].map((id) => [id, []]));
  const addToAdjacency = (edge) => {
    incoming.get(edge.to)?.push(edge);
    outgoing.get(edge.from)?.push(edge);
  };
  edges.forEach(addToAdjacency);

  const sp500 = [...INDEX.keys()].filter((id) =>
    UNIVERSE_BY_SYMBOL.get(id)?.indexes?.includes("sp500")
  );
  const capDistance = (a, b) =>
    Math.abs(Math.log10(Math.max(a ?? 1e9, 1e9)) - Math.log10(Math.max(b ?? 1e9, 1e9)));
  const analogueCache = new Map();
  const analoguesFor = (id) => {
    if (analogueCache.has(id)) return analogueCache.get(id);
    const company = INDEX.get(id);
    const ranked = [...INDEX.keys()]
      .filter((other) => other !== id)
      .sort((a, b) => {
        const aCompany = INDEX.get(a);
        const bCompany = INDEX.get(b);
        const aTier = aCompany.industry === company.industry ? 0 : groupFor(a) === groupFor(id) ? 1 : 2;
        const bTier = bCompany.industry === company.industry ? 0 : groupFor(b) === groupFor(id) ? 1 : 2;
        return aTier - bTier || capDistance(company.cap, aCompany.cap) - capDistance(company.cap, bCompany.cap);
      });
    analogueCache.set(id, ranked);
    return ranked;
  };

  const fillDirection = (id, direction) => {
    const own = direction === "up" ? incoming.get(id) : outgoing.get(id);
    if (own.length >= 2) return;
    const candidates = new Map();
    const analogues = analoguesFor(id).slice(0, 80);
    for (const [rank, analogue] of analogues.entries()) {
      const borrowed = direction === "up" ? incoming.get(analogue) : outgoing.get(analogue);
      for (const edge of borrowed ?? []) {
        const other = direction === "up" ? edge.from : edge.to;
        if (other === id) continue;
        const key = direction === "up" ? `${other} ${id}` : `${id} ${other}`;
        const reverse = direction === "up" ? `${id} ${other}` : `${other} ${id}`;
        if (keys.has(key) || keys.has(reverse)) continue;
        const score = (candidates.get(other) ?? 0) + 100 - rank + (edge.inferred ? 0 : 30);
        candidates.set(other, score);
      }
    }

    // A sparse niche may have no analogue with a disclosed edge. Use a nearby
    // company in the same chain segment as the final, visibly inferred fallback.
    if (candidates.size < 4) {
      for (const [rank, other] of analogues.entries()) {
        if (other === id) continue;
        const key = direction === "up" ? `${other} ${id}` : `${id} ${other}`;
        const reverse = direction === "up" ? `${id} ${other}` : `${other} ${id}`;
        if (keys.has(key) || keys.has(reverse)) continue;
        candidates.set(other, Math.max(candidates.get(other) ?? 0, 20 - rank / 10));
      }
    }

    for (const [other] of [...candidates].sort((a, b) => b[1] - a[1])) {
      if (own.length >= 2) break;
      const edge = direction === "up"
        ? {
            from: other,
            to: id,
            weight: 1,
            note: "Inferred sector analogue · research lead, not a disclosed supplier contract",
            inferred: true,
          }
        : {
            from: id,
            to: other,
            weight: 1,
            note: "Inferred sector analogue · research lead, not a disclosed customer contract",
            inferred: true,
          };
      const key = `${edge.from} ${edge.to}`;
      if (keys.has(key)) continue;
      keys.add(key);
      edges.push(edge);
      addToAdjacency(edge);
    }
  };

  // Run twice so companies filled late in the first pass can serve as an
  // analogue for another sparse company, reducing sensitivity to source order.
  for (let pass = 0; pass < 2; pass++) {
    for (const id of sp500) fillDirection(id, "up");
    for (const id of sp500) fillDirection(id, "down");
  }
  return edges;
})();

// Adjacency in both directions: `up` is who supplies this company, `down` is
// who it supplies.
const ADJ = new Map();
for (const id of INDEX.keys()) ADJ.set(id, { up: [], down: [] });
for (const edge of EDGES) {
  ADJ.get(edge.to).up.push(edge);
  ADJ.get(edge.from).down.push(edge);
}

const degreeOf = (id) => (ADJ.get(id)?.up.length ?? 0) + (ADJ.get(id)?.down.length ?? 0);

// Companies with at least one mapped relationship, best-connected first.
// Everything else is still searchable - it just opens on an empty map that
// says so, rather than being hidden as though the company did not exist.
export const COVERED = [...INDEX.keys()]
  .filter((id) => degreeOf(id) > 0)
  .sort((a, b) => degreeOf(b) - degreeOf(a));

function resolveSymbol(raw) {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  if (INDEX.has(key)) return key;
  if (ALIASES[key]) return ALIASES[key];
  const byName = [...INDEX.keys()].find((id) => INDEX.get(id).name.toUpperCase() === key);
  return byName ?? null;
}

function companyMeta(id) {
  const company = INDEX.get(id);
  if (!company) return null;
  return {
    id,
    name: company.name,
    industry: company.industry,
    group: groupFor(id),
    color: colorOf(id),
    region: company.region ?? null,
    listing: company.listing ?? null,
    ticker: company.noUS || company.private ? null : id,
    private: !!company.private,
    cap: company.cap ?? null,
    capApprox: !!company.capApprox,
    links: degreeOf(id),
  };
}

// Ranked ticker/name search. Prefix matches on the ticker come first, then
// prefix matches on the name, then anything containing the term. Within a tier
// the better-connected company wins, so searching "MI" offers Micron before a
// company that merely contains the letters.
export function searchCompanies(raw, limit = 8) {
  const q = (raw ?? "").trim().toUpperCase();
  if (!q) return [];
  const scored = [];
  for (const [id, company] of INDEX) {
    const name = company.name.toUpperCase();
    const listing = (company.listing ?? "").toUpperCase();
    let score = null;
    if (id === q || listing === q) score = 0;
    else if (id.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (id.includes(q)) score = 4;
    if (score == null) continue;
    scored.push({ id, score, degree: degreeOf(id) });
  }
  scored.sort(
    (a, b) => a.score - b.score || b.degree - a.degree || a.id.localeCompare(b.id)
  );
  return scored.slice(0, limit).map(({ id }) => companyMeta(id));
}

// Who else does what this company does.
//
// There is no competitor list in the data - the file maps who supplies whom,
// which is a different relationship - so this reads the one thing that is
// already known about every company here: its industry. Same industry, biggest
// first, minus anyone already on the map, because a company that both supplies
// and competes with the centred one is more useful drawn as the supplier.
//
// It is a rougher claim than the links are. Two "Specialty Retail" names can
// sell nothing in common, and a company's real rival is sometimes filed under
// another industry entirely. So it stays a short list, off to one side, rather
// than being mixed in with relationships that came from a disclosure.
function competitorsOf(id, { exclude = new Set(), limit = 6 } = {}) {
  const self = INDEX.get(id);
  if (!self?.industry) return [];
  const ranked = [...INDEX.entries()]
    .filter(([other, company]) =>
      other !== id && !exclude.has(other) &&
      (company.industry === self.industry ||
        (self.sector && company.sector === self.sector) ||
        (!self.sector && groupFor(other) === groupFor(id)))
    )
    .sort(([aId, a], [bId, b]) => {
      const aTier = a.industry === self.industry ? 0 : a.sector === self.sector ? 1 : 2;
      const bTier = b.industry === self.industry ? 0 : b.sector === self.sector ? 1 : 2;
      return aTier - bTier || (b.cap ?? 0) - (a.cap ?? 0) || aId.localeCompare(bId);
    })
    .slice(0, limit)
    .map(([other]) => other);
  return ranked;
}

// Ecosystem partners are companies that repeatedly appear beside the root in
// supplier/customer chains. Shared counterparties score highest; same-segment
// companies of a similar scale fill sparse cases. This is intentionally a
// derived relationship, distinct from both contractual edges and competitors.
function partnersOf(id, { exclude = new Set(), limit = 6 } = {}) {
  const self = INDEX.get(id);
  if (!self) return [];
  const selfUp = new Set((ADJ.get(id)?.up ?? []).map((edge) => edge.from));
  const selfDown = new Set((ADJ.get(id)?.down ?? []).map((edge) => edge.to));
  const shared = (set, rows, pick) => rows.reduce((sum, edge) => sum + set.has(pick(edge)), 0);
  return [...INDEX.entries()]
    .filter(([other]) => other !== id && !exclude.has(other))
    .map(([other, company]) => {
      const adj = ADJ.get(other) ?? { up: [], down: [] };
      const overlap =
        shared(selfUp, adj.up, (edge) => edge.from) +
        shared(selfDown, adj.down, (edge) => edge.to);
      const direct =
        adj.up.some((edge) => edge.from === id) ||
        adj.down.some((edge) => edge.to === id)
          ? 1
          : 0;
      const sameIndustry = company.industry === self.industry ? 1 : 0;
      const sameSegment = groupFor(other) === groupFor(id) ? 1 : 0;
      const scale = 1 / (1 + Math.abs(Math.log10(Math.max(company.cap ?? 1e9, 1e9)) - Math.log10(Math.max(self.cap ?? 1e9, 1e9))));
      return {
        other,
        score: overlap * 100 + direct * 250 + sameSegment * 12 + sameIndustry * 8 + scale,
      };
    })
    .sort((a, b) => b.score - a.score || a.other.localeCompare(b.other))
    .slice(0, limit)
    .map(({ other }) => other);
}

// Base ceiling per requested hop. Network distance mode adds one allowance per
// ring so a dense first hop cannot make 1, 2, and 3 hops look identical.
// Relationship mode keeps the original single-map ceiling.
const MAX_NODES = 90;

// How many companies a single node may bring in once the walk is past the
// first hop. Apple supplies Walmart, so an uncapped second hop hands Walmart's
// map Apple's entire supplier tree and the result reads as two unrelated
// clusters that happen to share a canvas. Capping the fan-out keeps the second
// hop broad - a few from each of many suppliers - instead of deep through
// whichever one happens to have the biggest chain of its own.
const FANOUT = 5;

// The neighbourhood around one company, `depth` hops out.
//
// Relationship mode walks upstream and downstream separately. Network
// distance mode instead uses an undirected breadth-first walk, because a hop
// there means the shortest number of mapped company relationships from root.
// `competitors` asks for a few same-industry rivals alongside the chain. They
// arrive as ordinary nodes carrying no edges, sided "peer" - the layout is what
// decides they belong in a row of their own.
export function buildGraph(
  rootId,
  depth = 2,
  { competitors = 0, partners = 0, multiCategory = false, distanceMode = false } = {}
) {
  const root = resolveSymbol(rootId);
  if (!root) return null;

  const seen = new Map([[root, { id: root, depth: 0, side: "root" }]]);
  const seenKey = (id, side) =>
    id === root ? root : multiCategory ? `${side}:${id}` : id;
  let frontier = [{ id: root, side: "root" }];
  let trimmed = false;

  const nodeLimit = distanceMode ? MAX_NODES * depth : MAX_NODES;
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const { id, side } of frontier) {
      const adj = ADJ.get(id);
      if (!adj) continue;
      // Relationship mode keeps upstream and downstream branches separate.
      // Network distance mode walks every edge in either direction, making a
      // node's depth its true shortest mapped distance from the root.
      let walk = [];
      if (distanceMode || side === "root" || side === "up")
        walk.push(...adj.up.map((e) => ({
          id: e.from,
          side: side === "root" ? "up" : side,
          weight: e.weight,
          inferred: e.inferred,
        })));
      if (distanceMode || side === "root" || side === "down")
        walk.push(...adj.down.map((e) => ({
          id: e.to,
          side: side === "root" ? "down" : side,
          weight: e.weight,
          inferred: e.inferred,
        })));
      walk = walk.filter((hop) => !seen.has(seenKey(hop.id, hop.side)));
      // The company being mapped keeps every relationship it has; everything
      // further out contributes only its strongest few.
      if (d > 1 && !distanceMode) {
        walk.sort((a, b) => b.weight - a.weight || degreeOf(b.id) - degreeOf(a.id));
        if (walk.length > FANOUT) trimmed = true;
        walk = walk.slice(0, FANOUT);
      }
      next.push(...walk);
    }
    // Within a hop, the best-connected companies are the ones worth keeping
    // when the budget runs out - they are what ties the rest of the map
    // together.
    next.sort((a, b) => degreeOf(b.id) - degreeOf(a.id));
    const room = Math.max(nodeLimit - seen.size, 0);
    const accepted = [];
    for (const hop of next) {
      const key = seenKey(hop.id, hop.side);
      if (seen.has(key)) continue;
      if (accepted.length >= room) {
        trimmed = true;
        break;
      }
      seen.set(key, { id: hop.id, depth: d, side: hop.side, inferred: !!hop.inferred });
      accepted.push(hop);
    }
    frontier = accepted;
    if (!frontier.length) break;
  }

  const ids = new Set([...seen.values()].map((entry) => entry.id));
  // Every edge between two included companies is drawn, not just the ones the
  // walk arrived on: the cross-links (Micron into both NVIDIA and Dell) are
  // most of what makes a supply chain read as a web rather than a fan.
  const edges = EDGES.filter((e) => ids.has(e.from) && ids.has(e.to));

  const degreeIn = new Map([...ids].map((id) => [id, 0]));
  for (const e of edges) {
    degreeIn.set(e.from, degreeIn.get(e.from) + 1);
    degreeIn.set(e.to, degreeIn.get(e.to) + 1);
  }

  const nodes = [...seen.values()].map((entry) => ({
    ...companyMeta(entry.id),
    // What the dot is captioned with. Always the id: for a listed company
    // that is its ticker, and for everything else it is a readable short
    // name, which "005930.KS" is not.
    label: entry.id,
    depth: entry.depth,
    side: entry.side,
    degree: degreeIn.get(entry.id) ?? 0,
  }));

  // Relationship categories intentionally overlap. A company can supply the
  // root, share its ecosystem, and compete with it at the same time.
  const categoryExclude = new Set([root]);
  const partnerIds = partners
    ? partnersOf(root, { exclude: categoryExclude, limit: partners })
    : [];
  for (const id of partnerIds) {
    nodes.push({ ...companyMeta(id), label: id, depth: 1, side: "partner", degree: 0 });
  }

  const peers = competitors
    ? competitorsOf(root, { exclude: categoryExclude, limit: competitors })
    : [];
  for (const id of peers) {
    nodes.push({ ...companyMeta(id), label: id, depth: 1, side: "peer", degree: 0 });
  }

  // Legend rows: the groups actually present, in the canonical order, each
  // with the industries that landed inside it. A group whose only industry is
  // named after it lists nothing - the breakdown is there to say what a colour
  // is covering, not to repeat the row above it.
  const groups = GROUPS.map((g) => {
    const members = nodes.filter((n) => n.group === g.key);
    const industries = [...new Set(members.map((n) => n.industry))].sort();
    const informative = industries.length > 1 || (industries[0] && industries[0] !== g.label);
    return { ...g, count: members.length, industries: informative ? industries : [] };
  }).filter((g) => g.count > 0);

  return { root, nodes, edges, groups, trimmed };
}
