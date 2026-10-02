import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { memo } from "@/lib/memo";
import { countriesForSymbols, yahooSession } from "@/lib/symbolProfile";
import { buildQuery } from "@/lib/screenerFields";
import { countryLabel, dropOtcDuplicates, EXCHANGE_FLAGS, marketOf } from "@/lib/market";

// Runs the user's filters through Yahoo's own equity screener, which does the
// matching across every US listing server-side - the alternative, pulling
// fundamentals for thousands of tickers and filtering here, is thousands of
// requests for the same answer.

// Yahoo refuses a page larger than 250, and the rows come back market-cap
// ordered, so this scans the 250 biggest matches and hands back the first 100.
// ponytail: no pagination - deepen with an `offset` loop if anyone wants past
// the top 250 by size.
const SCAN = 250;
const PAGE = 100;

// The upstream call is a POST, which Next's data cache never stores, so
// repeated screens (a shared link, a double click) are held here instead.
const TTL = 300_000;
const screens = memo(TTL, { max: 100 });

async function runScreen(operands, session) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(session.crumb)}&lang=en-US&region=US&formatted=false`,
    {
      method: "POST",
      headers: {
        "User-Agent": YAHOO_USER_AGENT,
        Cookie: session.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        size: SCAN,
        offset: 0,
        sortField: "intradaymarketcap",
        sortType: "DESC",
        // Keeps funds and trusts out: this screens companies.
        quoteType: "EQUITY",
        query: {
          operator: "AND",
          operands: [{ operator: "eq", operands: ["region", "us"] }, ...operands],
        },
        userId: "",
        userIdType: "guid",
      }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.finance?.result?.[0];
  if (!result) throw new Error(json?.finance?.error?.description ?? "No screener result");
  return result;
}

export async function GET(request) {
  const { operands, applied, local } = buildQuery(request.nextUrl.searchParams);
  const key = JSON.stringify(operands) + JSON.stringify(local);

  try {
    return Response.json(await screens(key, () => screen(operands, applied, local)), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json(
      { error: "The screener is temporarily unavailable. Try again in a moment.", retryable: true },
      { status: 503 }
    );
  }
}

async function screen(operands, applied, local) {
  const result = await runScreen(operands, await yahooSession());

  let rows = (result.quotes ?? []).map((q) => ({
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    // `market` still comes from the exchange - the OTC de-duplication below
    // reads it - but the column the table shows is the company's country,
    // filled in after the rows are trimmed. See the note there.
    market: marketOf(q.fullExchangeName),
    exchangeCode: q.exchange ?? null,
    price: q.regularMarketPrice ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    marketCap: q.marketCap ?? null,
    pe: q.trailingPE ?? null,
    forwardPe: q.forwardPE ?? null,
    eps: q.epsTrailingTwelveMonths ?? null,
  }));

  // Yahoo files preferred shares, depositary lines and investment trusts
  // under EQUITY as well (JPM-PC, BECEF, "Scottish Mortgage Investment Tr"),
  // and none of them has a market cap in any feed. There is no honest way to
  // compute one either: the shares outstanding on those rows is the parent
  // company's common count, which would price a $25 preferred as the whole
  // bank. Their P/E and EPS are the parent's too, so a low P/E screen fills
  // up with them at prices that make the parent look absurdly cheap. A row
  // with no size isn't a company this screen can rank, which is exactly what
  // it promises to do.
  rows = rows.filter((r) => r.marketCap != null);

  // One company, one row: a foreign name's OTC line goes when it also has a
  // real US listing (TOYOF goes, TM stays). See lib/market.js for why that's
  // the only duplicate worth collapsing.
  rows = dropOtcDuplicates(rows);

  // Forward P/E isn't screenable upstream, so it's applied to what came back.
  // A row Yahoo has no forward estimate for can't satisfy the filter and is
  // dropped rather than passed through as a maybe.
  if (local) {
    rows = rows.filter(
      (r) =>
        r.forwardPe != null &&
        (local.min == null || r.forwardPe >= local.min) &&
        (local.max == null || r.forwardPe <= local.max)
    );
  }

  const page = rows.slice(0, PAGE);

  // The country column is the company's domicile, which the quote doesn't
  // carry - TSM and TM trade in New York but are Taiwanese and Japanese - so
  // it comes from the profile endpoint. Only the page being returned is
  // looked up, and the exchange's country is the fallback when a profile is
  // missing, so a row is never left blank just because one lookup failed.
  const countries = await countriesForSymbols(page.map((r) => r.symbol));
  const withCountry = page.map((r) => {
    const label = countryLabel(countries.get(r.symbol));
    return {
      ...r,
      country: label.country,
      flag: label.flag ?? EXCHANGE_FLAGS[r.exchangeCode] ?? null,
    };
  });

  return {
    // What Yahoo matched overall, before the 250-row scan window - the honest
    // denominator for "showing 100 of …".
    total: result.total ?? rows.length,
    scanned: Math.min(result.total ?? 0, SCAN),
    // A forward P/E filter only ever saw the scan window, so the total above
    // no longer describes the rows below.
    partial: Boolean(local),
    applied,
    rows: withCountry,
  };
}
