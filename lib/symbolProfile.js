import { YAHOO_USER_AGENT } from "./userAgent";
import { STOCK_UNIVERSE } from "./stockMapData";
import { pool } from "./pool";

// Describes arbitrary tickers well enough to lay them out on a map or list
// them with their size: sector, industry, market cap and display name. Our
// static universe covers the large caps; anything else (meme stocks, ETFs,
// recent listings, foreign lines) is filled in from Yahoo's profile endpoint.
//
// Shared by the stock map and the watchlist so the two never disagree about
// how big a company is.
const UNIVERSE_BY_SYMBOL = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s]));

const CONCURRENCY = 6;
// One Yahoo session (cookie + crumb) authorises the quoteSummary endpoint.
// Held for a while rather than minted per request: the crumb is part of the
// request URL, so a stable one is also what lets the profile responses below
// actually hit the data cache.
const SESSION_TTL = 1_800_000;
let cachedSession = null;

// Minting a session is never served from the data cache: a retry asks for a
// fresh crumb precisely because the last one was rejected, and a cached
// response would hand back the same dead pair.
async function newSession() {
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_USER_AGENT },
    redirect: "manual",
    cache: "no-store",
  });
  const cookie = cookieRes.headers.get("set-cookie")?.split(";")[0];
  const crumb = await (
    await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: cookie },
      cache: "no-store",
    })
  ).text();
  if (!cookie || !crumb || crumb.includes("<")) throw new Error("No Yahoo session");
  return { cookie, crumb };
}

// `fresh` skips the cached pair - for a retry after Yahoo rejected the crumb.
export async function yahooSession({ fresh = false } = {}) {
  if (!fresh && cachedSession && Date.now() - cachedSession.at < SESSION_TTL) {
    return cachedSession.session;
  }
  const session = await newSession();
  cachedSession = { at: Date.now(), session };
  return session;
}

// Drop the held pair so the next lookup authenticates again, instead of
// failing for the rest of the cached session's lifetime.
export function invalidateYahooSession() {
  cachedSession = null;
}

async function fetchProfile(symbol, session) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,price,summaryDetail&crumb=${encodeURIComponent(session.crumb)}`;
  const json = await (
    await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: session.cookie },
      next: { revalidate: 3600 },
    })
  ).json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) {
    // Most likely the cached crumb has been rotated out from under us.
    invalidateYahooSession();
    throw new Error("No profile");
  }
  const profile = result.assetProfile;
  const price = result.price;
  return {
    sector: profile?.sector || null,
    industry: profile?.industry?.replace(/—/g, " - ") || null,
    cap: price?.marketCap?.raw ?? null,
    // A fund has no market cap; the comparable measure of its size is the
    // assets it holds, which is what sizes its tile on a cap-weighted map.
    totalAssets: result.summaryDetail?.totalAssets?.raw ?? null,
    currency: price?.currency || null,
    quoteType: price?.quoteType || null,
    name: price?.longName || price?.shortName || null,
    country: profile?.country || null,
  };
}

// Home country per symbol, for the country column on the screener and the
// market cap ranking. The listing exchange can't answer this: TSM and TM
// trade in New York but are Taiwanese and Japanese companies, and the flag
// beside a row is meant to say where the company is, not where it lists.
//
// quoteSummary has no batch form, so this is one request per symbol, bounded
// by the same pool and served from the same hour-long fetch cache as every
// other profile read. Failures resolve to null rather than rejecting: a
// missing flag is a blank cell, not a broken table.
export async function countriesForSymbols(symbols) {
  let session = null;
  try {
    session = await yahooSession();
  } catch {
    return new Map();
  }
  const found = await pool(symbols, CONCURRENCY, async (symbol) => {
    try {
      return [symbol, (await fetchProfile(symbol, session)).country];
    } catch {
      return [symbol, null];
    }
  });
  return new Map(found.filter(([, c]) => c));
}

// `entries` is [{ symbol, name? }]. Results keep the input order.
export async function describeSymbols(entries) {
  let session = null;
  try {
    session = await yahooSession();
  } catch {
    /* fall back to universe-only metadata below */
  }

  return pool(entries, CONCURRENCY, async (item) => {
    const known = UNIVERSE_BY_SYMBOL.get(item.symbol);
    let sector = known?.sector ?? null;
    let industry = known?.industry ?? null;
    let cap = known?.cap ?? null;
    // Whether `cap` is a company's market cap or a fund's total assets,
    // so callers can label it honestly.
    let capKind = "cap";
    let name = known?.name ?? item.name ?? item.symbol;

    if ((!sector || !cap) && session) {
      try {
        const p = await fetchProfile(item.symbol, session);
        if (p.quoteType === "ETF") {
          sector = sector ?? "Exchange-Traded Funds";
          industry = industry ?? "ETF";
          if (cap == null && p.totalAssets != null) {
            cap = p.totalAssets;
            capKind = "assets";
          }
        } else {
          sector = sector ?? p.sector;
          industry = industry ?? p.industry;
        }
        cap = cap ?? p.cap;
        if (p.name) name = known?.name ?? p.name;
      } catch {
        /* leave whatever the universe gave us */
      }
    }

    return {
      symbol: item.symbol,
      name,
      sector: sector || "Other",
      industry: industry || sector || "Other",
      cap,
      capKind,
    };
  });
}
