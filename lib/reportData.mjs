// Report analytics are computed from actual daily closes. Missing holdings are
// never silently removed from the blend; incomplete portfolios have no chart.
export function portfolioSeries(holdings, seriesBySymbol, startDate, endDate) {
  if (
    !holdings.length ||
    holdings.some((h) => !seriesBySymbol[h.symbol]?.length)
  )
    return [];
  const from = Date.parse(startDate) / 1000,
    to = Date.parse(endDate) / 1000 + 86399;
  const maps = holdings.map(
    (h) =>
      new Map(
        seriesBySymbol[h.symbol]
          .filter((p) => p.t >= from && p.t <= to && p.c > 0)
          .map((p) => [p.t, p.c]),
      ),
  );
  const dates = [...maps[0].keys()]
    .filter((t) => maps.every((m) => m.has(t)))
    .sort((a, b) => a - b);
  if (dates.length < 2 || dates[0] > from + 7 * 86400) return [];
  const hasWeights = holdings.every((h) => h.weight != null),
    hasShares = holdings.every((h) => h.shares != null);
  if (!hasWeights && !hasShares) return [];
  const amounts = holdings.map((h, i) =>
    hasWeights ? h.weight : h.shares * maps[i].get(dates[dates.length - 1]),
  );
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (!sum) return [];
  return dates.map((t) => ({
    t,
    value: maps.reduce(
      (v, m, i) =>
        v + (((amounts[i] / sum) * m.get(t)) / m.get(dates[0])) * 100,
      0,
    ),
  }));
}
export function seriesMetrics(series) {
  if (series.length < 2)
    return {
      totalReturn: null,
      cagr: null,
      volatility: null,
      maxDrawdown: null,
    };
  const first = series[0],
    last = series.at(-1),
    years = (last.t - first.t) / (365.25 * 86400);
  const returns = series.slice(1).map((p, i) => p.value / series[i].value - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.length > 1
      ? returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1)
      : null;
  let peak = first.value,
    dd = 0;
  for (const p of series) {
    peak = Math.max(peak, p.value);
    dd = Math.min(dd, p.value / peak - 1);
  }
  return {
    totalReturn: (last.value / first.value - 1) * 100,
    cagr:
      years >= 1 ? ((last.value / first.value) ** (1 / years) - 1) * 100 : null,
    volatility: variance == null ? null : Math.sqrt(variance * 252) * 100,
    maxDrawdown: dd * 100,
  };
}
export function sampleSeries(series, limit = 100) {
  if (series.length <= limit) return series;
  return Array.from(
    { length: limit },
    (_, i) => series[Math.round((i * (series.length - 1)) / (limit - 1))],
  );
}
export async function loadReportData(report, { signal, fetcher = fetch } = {}) {
  const cache = new Map();
  const read = (path) => {
    const boundedSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000);
    if (!cache.has(path))
      cache.set(
        path,
        fetcher(path, { signal: boundedSignal })
          .then((r) => (r.ok ? r.json() : null))
          .catch((e) => {
            if (signal?.aborted) throw e;
            return null;
          }),
      );
    return cache.get(path);
  };
  const selections = report.portfolios;
  // Bound concurrency; a 60-security model must not flood upstream feeds.
  const mapLimit = async (items, fn) => {
    const results = Array(items.length);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, items.length) }, async () => {
        while (cursor < items.length) {
          const i = cursor++;
          results[i] = await fn(items[i], i);
        }
      }),
    );
    return results;
  };
  const base = await mapLimit(selections, async (p) => {
    const fund = p.kind === "fund";
    const [holdings, profile] = fund
      ? await Promise.all([
          read(`/api/etf-holdings?symbol=${encodeURIComponent(p.symbol)}`),
          read(`/api/stock-profile?symbol=${encodeURIComponent(p.symbol)}`),
        ])
      : [null, null];
    return {
      ...p,
      displayHoldings: fund
        ? (holdings?.holdings || [])
            .filter((h) => h.symbol)
            .map((h) => ({
              symbol: h.symbol,
              name: h.name || h.symbol,
              weight: h.percent,
            }))
            .slice(0, 100)
        : p.holdings.map((h) => ({ ...h, name: h.symbol })),
      calculationHoldings: fund
        ? [{ symbol: p.symbol, weight: 100 }]
        : p.holdings,
      totalCount: holdings?.totalCount ?? p.holdings.length,
      profile,
    };
  });
  const graphSymbols = [
    ...new Set(report.pages.flatMap((p) => p.graphSymbols || [])),
  ];
  if (graphSymbols.length > 10)
    throw new Error("Use up to ten distinct market graph tickers.");
  const symbols = [
    ...new Set([
      ...base.flatMap((p) => p.calculationHoldings.map((h) => h.symbol)),
      ...graphSymbols,
    ]),
  ];
  if (symbols.length > 60)
    throw new Error(
      "Reports support up to 60 distinct securities for performance. Reduce the selection.",
    );
  const prices = Object.fromEntries(
    await mapLimit(symbols, async (symbol) => [
      symbol,
      (
        await read(
          `/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=10y`,
        )
      )?.points || [],
    ]),
  );
  const profiles = Object.fromEntries(
    await mapLimit(
      [
        ...new Set(base.flatMap((p) => p.displayHoldings.map((h) => h.symbol))),
      ].slice(0, 30),
      async (symbol) => [
        symbol,
        await read(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`),
      ],
    ),
  );
  const portfolios = base.map((p) => {
    const series = portfolioSeries(
      p.calculationHoldings,
      prices,
      report.startDate,
      report.endDate,
    );
    const sharesValue = p.displayHoldings.reduce(
      (sum, h) => sum + (h.shares || 0) * (prices[h.symbol]?.at(-1)?.c || 0),
      0,
    );
    const allPriced = p.displayHoldings.every((h) => prices[h.symbol]?.length);
    const holdings = p.displayHoldings.map((h) => ({
      symbol: h.symbol,
      name: profiles[h.symbol]?.name || h.name,
      weight:
        h.weight ??
        (allPriced && sharesValue
          ? ((h.shares * prices[h.symbol].at(-1).c) / sharesValue) * 100
          : null),
      price:
        prices[h.symbol]?.at(-1)?.c ?? profiles[h.symbol]?.quote?.price ?? null,
      dividendYield:
        profiles[h.symbol]?.quote?.dividendYield != null
          ? profiles[h.symbol].quote.dividendYield * 100
          : null,
      sector: profiles[h.symbol]?.profile?.sector || "Unclassified",
      country: profiles[h.symbol]?.profile?.country || "Unclassified",
      expenseRatio: null,
    }));
    return {
      id: p.id,
      name: p.displayName,
      totalCount: p.totalCount,
      holdings,
      chart: sampleSeries(series),
      metrics: seriesMetrics(series),
      coverage: series.length
        ? `${new Date(series[0].t * 1000).toISOString().slice(0, 10)} to ${new Date(series.at(-1).t * 1000).toISOString().slice(0, 10)}`
        : "Price history unavailable or incomplete for the selected period.",
      source:
        p.kind === "fund"
          ? "Fund holdings feed and daily fund closes"
          : "Saved portfolio allocation and daily closes",
      dividendYield:
        p.profile?.quote?.dividendYield != null
          ? p.profile.quote.dividendYield * 100
          : null,
    };
  });
  const graphs = Object.fromEntries(
    graphSymbols.map((symbol) => [
      symbol,
      {
        name: symbol,
        chart: sampleSeries(
          portfolioSeries(
            [{ symbol, weight: 100 }],
            prices,
            report.startDate,
            report.endDate,
          ),
        ),
      },
    ]),
  );
  return { capturedAt: new Date().toISOString(), portfolios, graphs };
}
