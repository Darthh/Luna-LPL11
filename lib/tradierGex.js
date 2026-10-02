const BASE = "https://api.tradier.com/v1/markets";

async function get(path, params, token) {
  const response = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Tradier market data HTTP ${response.status}`);
  return response.json();
}

export async function tradierGexChain(symbol, { zeroDte, requested, marketDate }) {
  const token = process.env.TRADIER_API_TOKEN;
  if (!token) return null;
  const expirationData = await get("options/expirations", { symbol }, token);
  const dates = expirationData?.expirations?.date;
  const listed = Array.isArray(dates) ? dates : dates ? [dates] : [];
  const expirations = listed.map((date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000)).filter(Number.isFinite);
  const zeroDteExpiration = expirations.find((date) => new Date(date * 1000).toISOString().slice(0, 10) === marketDate);
  if (zeroDte && !zeroDteExpiration) return { available: false, expirations };
  const selectedExpiration = zeroDte ? zeroDteExpiration : expirations.includes(requested) ? requested : expirations[0];
  if (!selectedExpiration) throw new Error(`No listed ${symbol} expirations`);
  const expiration = new Date(selectedExpiration * 1000).toISOString().slice(0, 10);
  const [chainData, quoteData] = await Promise.all([
    get("options/chains", { symbol, expiration, greeks: "true" }, token),
    get("quotes", { symbols: symbol }, token),
  ]);
  const contracts = chainData?.options?.option;
  const options = Array.isArray(contracts) ? contracts : contracts ? [contracts] : [];
  const spot = Number(quoteData?.quotes?.quote?.last);
  if (!(spot > 0) || !options.length) throw new Error(`Incomplete ${symbol} Tradier chain`);
  const convert = (contract) => ({
    strike: Number(contract.strike),
    openInterest: Number(contract.open_interest),
    volume: Number(contract.volume),
    impliedVolatility: Number(contract.greeks?.mid_iv ?? contract.greeks?.smv_vol),
  });
  return {
    available: true, spot, selectedExpiration, expirations,
    calls: options.filter((option) => option.option_type === "call").map(convert),
    puts: options.filter((option) => option.option_type === "put").map(convert),
  };
}
