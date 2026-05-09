// rPOW base: 1 rPOW = 10^9 base units
const RPOW = 1_000_000_000n;

export type TokenSlug = "rpow2" | "rpow3" | "rpow4";

export type TokenConfig = {
  slug: TokenSlug;
  label: string;
  apiBase: string;
  banker: string;
  cookie: string;
  token: string;
  enabled: boolean;
};

function tokenCfg(slug: TokenSlug, label: string, defaultApi: string): TokenConfig {
  const upper = slug.toUpperCase();
  // legacy envs supported when slug=rpow2 so we don't break older deployments
  const legacyBanker = slug === "rpow2" ? process.env.BANKER_EMAIL ?? "" : "";
  const legacyCookie = slug === "rpow2" ? process.env.RPOW_SESSION_COOKIE ?? "" : "";
  const legacyToken = slug === "rpow2" ? process.env.RPOW_API_TOKEN ?? "" : "";
  const legacyApi = slug === "rpow2" ? process.env.RPOW_API_BASE ?? "" : "";
  const banker = process.env[`${upper}_BANKER`] ?? legacyBanker;
  const cookie = process.env[`${upper}_COOKIE`] ?? legacyCookie;
  const token = process.env[`${upper}_TOKEN`] ?? legacyToken;
  const apiBase = process.env[`${upper}_API_BASE`] ?? legacyApi ?? defaultApi;
  return {
    slug,
    label,
    apiBase: apiBase || defaultApi,
    banker,
    cookie,
    token,
    enabled: Boolean(banker),
  };
}

export const tokens: TokenConfig[] = [
  tokenCfg("rpow2", "rPOW2", "https://api.rpow2.com"),
  tokenCfg("rpow3", "rPOW3", "https://api.rpow3.com"),
  tokenCfg("rpow4", "rPOW4", "https://api.rpow4.com"),
];

export function tokenBySlug(slug: string): TokenConfig | undefined {
  return tokens.find((t) => t.slug === slug);
}

export const cfg = {
  // legacy single-token shim, still used by some callers
  bankerEmail: tokens[0].banker || "banker@example.com",
  rpowBase: tokens[0].apiBase,
  rpowToken: tokens[0].token,
  rpowCookie: tokens[0].cookie,
  rakeBps: Number(process.env.RAKE_BPS ?? 0),
  roundSec: Number(process.env.ROUND_SECONDS ?? 300),
  acceptSec: Number(process.env.ACCEPT_SECONDS ?? 240),
  dbPath: process.env.DB_PATH ?? "./data/market.db",
  minBetBase: process.env.MIN_BET_BASE ?? "1",
  maxBetBase: (BigInt(process.env.MAX_BET_RPOW ?? "21000000") * RPOW).toString(),
  maxClockSkewMs: Number(process.env.MAX_CLOCK_SKEW_MS ?? 5 * 60 * 1000),
  payoutBackoffMs: [5_000, 30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000],
};
