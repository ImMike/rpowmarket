// Price oracle. Primary: Coinbase Exchange. Fallback: Kraken. Both work in US, no key.

const COINBASE = "https://api.exchange.coinbase.com";
const KRAKEN = "https://api.kraken.com/0/public";

async function coinbaseSpot(): Promise<number> {
  const r = await fetch(`${COINBASE}/products/BTC-USD/ticker`, { cache: "no-store" });
  if (!r.ok) throw new Error(`coinbase ${r.status}`);
  const j = (await r.json()) as { price: string };
  return Number(j.price);
}

async function krakenSpot(): Promise<number> {
  const r = await fetch(`${KRAKEN}/Ticker?pair=XBTUSD`, { cache: "no-store" });
  if (!r.ok) throw new Error(`kraken ${r.status}`);
  const j = (await r.json()) as { result: Record<string, { c: [string, string] }> };
  const k = Object.keys(j.result)[0];
  return Number(j.result[k].c[0]);
}

export async function getSpotPrice(): Promise<number> {
  try {
    return await coinbaseSpot();
  } catch {
    return krakenSpot();
  }
}

async function coinbaseAt(tsMs: number): Promise<number> {
  const start = new Date(tsMs - 120_000).toISOString();
  const end = new Date(tsMs + 1000).toISOString();
  const r = await fetch(
    `${COINBASE}/products/BTC-USD/candles?granularity=60&start=${start}&end=${end}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`coinbase candles ${r.status}`);
  const rows = (await r.json()) as number[][];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("no candles");
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const target = Math.floor(tsMs / 1000);
  let pick = sorted[0];
  for (const r of sorted) if (r[0] <= target) pick = r;
  return Number(pick[4]);
}

async function krakenAt(tsMs: number): Promise<number> {
  // Kraken OHLC: returns recent candles >= since
  const since = Math.floor((tsMs - 120_000) / 1000);
  const r = await fetch(`${KRAKEN}/OHLC?pair=XBTUSD&interval=1&since=${since}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`kraken ohlc ${r.status}`);
  const j = (await r.json()) as { result: Record<string, unknown> };
  const k = Object.keys(j.result).find((x) => x !== "last");
  if (!k) throw new Error("kraken no result");
  const rows = j.result[k] as (string | number)[][];
  if (!rows.length) throw new Error("kraken no rows");
  const target = Math.floor(tsMs / 1000);
  let pick = rows[0];
  for (const r of rows) if (Number(r[0]) <= target) pick = r;
  return Number(pick[4]); // close
}

export async function getPriceAt(tsMs: number): Promise<number> {
  // primary
  try {
    return await coinbaseAt(tsMs);
  } catch {}
  // fallback
  try {
    return await krakenAt(tsMs);
  } catch {}
  // last resort: live spot (works in US too)
  return getSpotPrice();
}

// Cross-check: returns {price, agreed}. agreed=false if Coinbase vs Kraken disagree > 0.5%.
export async function getPriceAtChecked(tsMs: number): Promise<{ price: number; agreed: boolean }> {
  const [a, b] = await Promise.allSettled([coinbaseAt(tsMs), krakenAt(tsMs)]);
  const av = a.status === "fulfilled" ? a.value : null;
  const bv = b.status === "fulfilled" ? b.value : null;
  if (av != null && bv != null) {
    const delta = Math.abs(av - bv) / ((av + bv) / 2);
    return { price: av, agreed: delta < 0.005 };
  }
  if (av != null) return { price: av, agreed: true };
  if (bv != null) return { price: bv, agreed: true };
  // fallback
  return { price: await getSpotPrice(), agreed: true };
}
