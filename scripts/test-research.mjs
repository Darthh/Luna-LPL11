import assert from "node:assert/strict";
import {
  coverageStrength,
  deriveNotableMove,
  filterUnsupportedEvidence,
  nearestPointIndex,
  normalizeFinnhubNews,
  newsMatchesAny,
  rankNews,
  sourceDomain,
} from "../lib/research.js";

const day = (iso) => Date.parse(`${iso}T20:00:00Z`) / 1000;
const move = deriveNotableMove([
  { t: day("2026-08-24"), c: 100 },
  { t: day("2026-08-25"), c: 102 },
  { t: day("2026-08-26"), c: 94 },
]);
assert.equal(move.date, "2026-08-26");
assert.ok(Math.abs(move.pct - (94 / 102 - 1) * 100) < 1e-10);
assert.equal(nearestPointIndex([{ t: day("2026-08-25") }, { t: day("2026-08-27") }], "2026-08-26"), 0);
assert.equal(sourceDomain("https://www.sec.gov/Archives/test"), "sec.gov");

const intraday = deriveNotableMove(
  Array.from({ length: 12 }, (_, index) => ({
    t: day("2026-08-26") + index * 300,
    c: 100 + index / 100,
  })),
  { pct: 1.15, timestamp: day("2026-08-26"), close: 313.45 }
);
assert.equal(intraday.kind, "latest");
assert.equal(intraday.pct, 1.15);

const sources = normalizeFinnhubNews(
  [
    { headline: "Nvidia uses TSMC foundries", url: "https://example.com/a?x=1", summary: "TSMC fabricates Nvidia GPUs.", datetime: day("2026-08-25"), related: "NVDA,TSM" },
    { headline: "Duplicate", url: "https://example.com/a?x=2", summary: "Duplicate.", datetime: day("2026-08-24") },
    {
      headline: "Fed officials prepare for the next meeting",
      url: "https://example.com/story",
      summary: "The Federal Reserve will weigh inflation and employment.",
      datetime: day("2026-08-26"),
      image: "https://example.com/article.jpg",
    },
  ]
);
assert.equal(sources.length, 2);
assert.equal(sources[0].sourceType, "coverage");
assert.equal(sources[1].image, "https://example.com/article.jpg");
assert.equal(coverageStrength(sources), "limited");
assert.equal(newsMatchesAny(sources[0], ["TSM"]), true);
assert.equal(newsMatchesAny(sources[1], ["TSM"]), false);
assert.equal(rankNews(sources, { termGroups: [["TSMC", "TSM"]] }).length, 1);

const supported = filterUnsupportedEvidence([
  { title: "Unrelated filing", excerpt: "There is no information about Apple in this filing." },
  { title: "Near miss", excerpt: "This does not explicitly state or confirm the supplier relationship." },
  { title: "Product event", excerpt: "Apple announced a product event on August 26." },
]);
assert.equal(supported.length, 1);
assert.equal(supported[0].title, "Product event");

console.log("ok - news research helpers");
