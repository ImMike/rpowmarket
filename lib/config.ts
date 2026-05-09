// rPOW base: 1 rPOW = 10^9 base units
const RPOW = 1_000_000_000n;

export const cfg = {
  bankerEmail: process.env.BANKER_EMAIL ?? "banker@example.com",
  rpowBase: process.env.RPOW_API_BASE ?? "https://api.rpow2.com",
  rpowToken: process.env.RPOW_API_TOKEN ?? "",
  rpowCookie: process.env.RPOW_SESSION_COOKIE ?? "",
  rakeBps: Number(process.env.RAKE_BPS ?? 0),
  roundSec: Number(process.env.ROUND_SECONDS ?? 300),
  acceptSec: Number(process.env.ACCEPT_SECONDS ?? 240),
  dbPath: process.env.DB_PATH ?? "./data/market.db",
  // bet bounds in base units (BigInt-friendly strings)
  // base-unit minimum (default = 1 base unit so anything > 0 is allowed)
  minBetBase: (process.env.MIN_BET_BASE ?? "1"),
  maxBetBase: (BigInt(process.env.MAX_BET_RPOW ?? "1000") * RPOW).toString(),
  // clock skew tolerance for incoming bet timestamps
  maxClockSkewMs: Number(process.env.MAX_CLOCK_SKEW_MS ?? 5 * 60 * 1000),
  // payout retry backoff (ms) per attempt
  payoutBackoffMs: [5_000, 30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000],
};
