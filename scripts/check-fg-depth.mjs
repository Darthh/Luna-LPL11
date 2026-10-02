// Replicates lib/fearGreed's request to confirm how deep the series now goes.
// (Importing that module directly needs Next's "@/" alias, which plain node
// has no resolver for.)
import { BROWSER_USER_AGENT } from "../lib/userAgent.js";

const d = new Date();
d.setFullYear(d.getFullYear() - 10);
const wanted = d.toISOString().slice(0, 10);
const start = wanted < "2020-08-01" ? "2020-08-01" : wanted;

const res = await fetch(
  `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${start}`,
  {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.cnn.com/markets/fear-and-greed",
      Origin: "https://www.cnn.com",
    },
  }
);
if (!res.ok) { console.log("upstream", res.status); process.exit(0); }
const h = (await res.json()).fear_and_greed_historical?.data ?? [];
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const span = (h.at(-1).x - h[0].x) / (365.25 * 864e5);
console.log("asked from", start);
console.log("points", h.length, "first", iso(h[0].x), "last", iso(h.at(-1).x));
console.log("span", span.toFixed(2), "years");
