import { db } from "./db";
import { fetchActivity, sideFromAmount, txKey, sendRpow, type Side } from "./rpow";
import { currentRound, inAcceptWindow, roundIdAt, windowsFor } from "./rounds";
import { getPriceAt, getPriceAtChecked, getSpotPrice } from "./binance";
import { cfg, tokens, type TokenSlug } from "./config";

function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return e;
  return `${u.slice(0, 2)}***@${d}`;
}

export function ensureRound(roundId: number) {
  const d = db();
  d.prepare(`INSERT OR IGNORE INTO rounds (id, status, created_at) VALUES (?, 'open', ?)`).run(roundId, Date.now());
}

export async function snapshotStrike(roundId: number) {
  const d = db();
  const row = d.prepare(`SELECT strike FROM rounds WHERE id = ?`).get(roundId) as { strike: number | null } | undefined;
  if (row && row.strike != null) return;
  const w = windowsFor(roundId);
  const px = await getPriceAt(w.startMs);
  d.prepare(`UPDATE rounds SET strike = ? WHERE id = ?`).run(px, roundId);
}

function getWatermark(): number {
  const d = db();
  const row = d.prepare(`SELECT value FROM kv WHERE key = 'ingest_watermark_ms'`).get() as
    | { value: string }
    | undefined;
  if (row) return Number(row.value);
  // first init: look back 10min so recent test bets get picked up
  const seed = Date.now() - 10 * 60 * 1000;
  d.prepare(`INSERT INTO kv (key, value) VALUES ('ingest_watermark_ms', ?)`).run(String(seed));
  return seed;
}

async function ingestForToken(slug: TokenSlug) {
  const items = await fetchActivity(slug).catch(() => []);
  const d = db();
  const watermark = getWatermark();
  const min = BigInt(cfg.minBetBase);
  const max = BigInt(cfg.maxBetBase);
  const now = Date.now();
  const insert = d.prepare(
    `INSERT OR IGNORE INTO bets (round_id, email, amount_base, side, at_ms, tx_key, token) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const it of items) {
    if (it.type !== "receive") continue;
    const atMs = Date.parse(it.at);
    if (!Number.isFinite(atMs)) continue;
    if (atMs < watermark) continue;
    if (atMs > now + cfg.maxClockSkewMs) continue;
    if (!/^\d+$/.test(it.amount_base_units)) continue;
    const amt = BigInt(it.amount_base_units);
    if (amt < min) continue;
    const overCap = amt > max;
    const rid = roundIdAt(atMs);
    const w = windowsFor(rid);
    let side: Side = "invalid";
    if (!overCap && inAcceptWindow(atMs, w)) {
      side = sideFromAmount(it.amount_base_units);
    }
    ensureRound(rid);
    insert.run(rid, it.counterparty_email, it.amount_base_units, side, atMs, txKey(slug, it), slug);
  }
}

export async function ingestActivity() {
  for (const t of tokens) {
    if (!t.enabled) continue;
    await ingestForToken(t.slug).catch(() => {});
  }
}

type BetRow = { id: number; email: string; amount_base: string; side: Side; token: string };

export async function settleRound(roundId: number) {
  const d = db();
  const r = d.prepare(`SELECT * FROM rounds WHERE id = ?`).get(roundId) as
    | { id: number; strike: number | null; settle: number | null; status: string }
    | undefined;
  if (!r) return;
  if (r.status === "settled" || r.status === "refunded" || r.status === "settling") return;

  const w = windowsFor(roundId);
  if (Date.now() < w.endMs) return;

  // atomic claim: only one process settles
  const claim = d
    .prepare(`UPDATE rounds SET status = 'settling' WHERE id = ? AND status IN ('open','locked')`)
    .run(roundId);
  if (claim.changes !== 1) return;

  if (r.strike == null) await snapshotStrike(roundId);
  const strike = (d.prepare(`SELECT strike FROM rounds WHERE id = ?`).get(roundId) as { strike: number }).strike;

  // settle: try cross-checked oracle; if disagreement > 0.5%, refund the round
  const checked = await getPriceAtChecked(w.endMs).catch(async () => ({
    price: await getPriceAt(w.endMs).catch(() => strike),
    agreed: true,
  }));
  if (!checked.agreed) {
    // refund all valid + invalid bets — oracle dispute
    const all = d.prepare(`SELECT id, email, amount_base, side FROM bets WHERE round_id = ?`).all(roundId) as BetRow[];
    const ip = d.prepare(
      `INSERT INTO payouts (round_id, email, amount_base, kind, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
    );
    for (const b of all) ip.run(roundId, b.email, b.amount_base, "refund", Date.now());
    d.prepare(`UPDATE rounds SET status = 'refunded', settled_at = ? WHERE id = ?`).run(Date.now(), roundId);
    return;
  }
  const settle = checked.price;
  d.prepare(`UPDATE rounds SET settle = ? WHERE id = ?`).run(settle, roundId);

  const bets = d
    .prepare(`SELECT id, email, amount_base, side, token FROM bets WHERE round_id = ?`)
    .all(roundId) as BetRow[];

  const insertPayout = d.prepare(
    `INSERT INTO payouts (round_id, email, amount_base, kind, status, token, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  );
  const sumBI = (rows: BetRow[]) => rows.reduce((acc, r) => acc + BigInt(r.amount_base), 0n);

  // settle each token's pool independently using the same strike/settle price
  const allTokens = Array.from(new Set(bets.map((b) => b.token)));
  for (const tok of allTokens) {
    const tokBets = bets.filter((b) => b.token === tok);
    const valid = tokBets.filter((b) => b.side === "up" || b.side === "down");
    const invalid = tokBets.filter((b) => b.side === "invalid");

    for (const b of invalid) insertPayout.run(roundId, b.email, b.amount_base, "refund", tok, Date.now());

    if (valid.length === 0) continue;

    if (settle === strike) {
      for (const b of valid) insertPayout.run(roundId, b.email, b.amount_base, "refund", tok, Date.now());
      continue;
    }

    const winnerSide: Side = settle > strike ? "up" : "down";
    const winners = valid.filter((b) => b.side === winnerSide);
    const losers = valid.filter((b) => b.side !== winnerSide);

    if (winners.length === 0) {
      for (const b of valid) insertPayout.run(roundId, b.email, b.amount_base, "refund", tok, Date.now());
      continue;
    }

    const winnerStake = sumBI(winners);
    const loserStake = sumBI(losers);
    const rake = (loserStake * BigInt(cfg.rakeBps)) / 10000n;
    const distributable = loserStake - rake;

    for (const w of winners) {
      const stake = BigInt(w.amount_base);
      const winShare = (distributable * stake) / winnerStake;
      const total = stake + winShare;
      if (total > 0n) {
        insertPayout.run(roundId, w.email, total.toString(), "win", tok, Date.now());
      }
    }
  }

  const finalStatus = settle === strike ? "refunded" : "settled";
  d.prepare(`UPDATE rounds SET status = ?, settled_at = ? WHERE id = ?`).run(finalStatus, Date.now(), roundId);
}

export async function flushPayouts() {
  const d = db();
  const now = Date.now();
  const claim = d.prepare(
    `UPDATE payouts SET status = 'sending' WHERE id = ? AND status IN ('pending','failed') AND next_attempt_at <= ?`
  );
  const ids = (
    d
      .prepare(
        `SELECT id FROM payouts WHERE status IN ('pending','failed') AND next_attempt_at <= ? LIMIT 25`
      )
      .all(now) as { id: number }[]
  ).map((r) => r.id);

  for (const id of ids) {
    if (claim.run(id, now).changes !== 1) continue;
    const row = d
      .prepare(`SELECT id, email, amount_base, attempts, token FROM payouts WHERE id = ?`)
      .get(id) as { id: number; email: string; amount_base: string; attempts: number; token: string };

    const key = `rpowmarket-payout-${row.id}`;
    d.prepare(`UPDATE payouts SET idempotency_key = ? WHERE id = ?`).run(key, row.id);

    const res = await sendRpow(row.token as TokenSlug, row.email, row.amount_base, key);
    if (res.ok) {
      d.prepare(
        `UPDATE payouts SET status = 'sent', sent_at = ?, transfer_id = ?, last_error = NULL WHERE id = ?`
      ).run(Date.now(), res.transferId ?? null, row.id);
    } else {
      const err = res.error ?? "unknown";
      // permanent errors → mark dead immediately, no retries
      const permanent = /EXACT_SUM_REQUIRED|INSUFFICIENT_FUNDS|INVALID_RECIPIENT/i.test(err);
      const nextAttempts = row.attempts + 1;
      const backoff = cfg.payoutBackoffMs[Math.min(nextAttempts - 1, cfg.payoutBackoffMs.length - 1)];
      const giveUp = permanent || nextAttempts >= cfg.payoutBackoffMs.length + 3;
      d.prepare(
        `UPDATE payouts SET status = ?, last_error = ?, attempts = ?, next_attempt_at = ? WHERE id = ?`
      ).run(
        giveUp ? "dead" : "failed",
        err,
        nextAttempts,
        Date.now() + backoff,
        row.id
      );
    }
  }
}

// for any 'dead' win payout, refund the bettor's original stakes for that round.
// kind='dead_refund' so we don't double-process.
export function refundDeadPayouts() {
  const d = db();
  const dead = d
    .prepare(
      `SELECT id, round_id, email, kind, token FROM payouts WHERE status = 'dead' AND kind IN ('win','refund')`
    )
    .all() as { id: number; round_id: number; email: string; kind: string; token: string }[];
  const insert = d.prepare(
    `INSERT INTO payouts (round_id, email, amount_base, kind, status, token, created_at) VALUES (?, ?, ?, 'dead_refund', 'pending', ?, ?)`
  );
  const markCompensated = d.prepare(`UPDATE payouts SET status = 'compensated' WHERE id = ?`);
  for (const p of dead) {
    const existing = (
      d
        .prepare(
          `SELECT COUNT(*) as c FROM payouts WHERE round_id = ? AND email = ? AND token = ? AND kind = 'dead_refund'`
        )
        .get(p.round_id, p.email, p.token) as { c: number }
    ).c;
    if (existing > 0) {
      markCompensated.run(p.id);
      continue;
    }
    const stakes = (
      d
        .prepare(
          `SELECT COALESCE(SUM(CAST(amount_base AS INTEGER)), 0) as s FROM bets WHERE round_id = ? AND email = ? AND token = ? AND side IN ('up','down')`
        )
        .get(p.round_id, p.email, p.token) as { s: number }
    ).s;
    if (stakes <= 0) {
      markCompensated.run(p.id);
      continue;
    }
    insert.run(p.round_id, p.email, String(stakes), p.token, Date.now());
    markCompensated.run(p.id);
  }
}

export type TokenPool = {
  token: TokenSlug;
  upPool: string;
  downPool: string;
  upCount: number;
  downCount: number;
};
export type RoundView = {
  id: number;
  startMs: number;
  lockoutMs: number;
  endMs: number;
  status: string;
  strike: number | null;
  settle: number | null;
  upPool: string;
  downPool: string;
  upCount: number;
  downCount: number;
  pools: TokenPool[];
  recentBets?: {
    side: "up" | "down" | "invalid";
    amount: string;
    email: string;
    atMs: number;
    token: TokenSlug;
  }[];
};

export function roundView(roundId: number): RoundView {
  const d = db();
  ensureRound(roundId);
  const r = d.prepare(`SELECT id, status, strike, settle FROM rounds WHERE id = ?`).get(roundId) as {
    id: number;
    status: string;
    strike: number | null;
    settle: number | null;
  };
  const agg = d
    .prepare(
      `SELECT token, side, COUNT(*) as n, COALESCE(SUM(CAST(amount_base AS INTEGER)), 0) as sum FROM bets WHERE round_id = ? GROUP BY token, side`
    )
    .all(roundId) as { token: TokenSlug; side: Side; n: number; sum: number }[];

  const poolMap = new Map<TokenSlug, TokenPool>();
  for (const t of tokens) {
    poolMap.set(t.slug, { token: t.slug, upPool: "0", downPool: "0", upCount: 0, downCount: 0 });
  }
  for (const a of agg) {
    const p = poolMap.get(a.token) ?? {
      token: a.token,
      upPool: "0",
      downPool: "0",
      upCount: 0,
      downCount: 0,
    };
    if (a.side === "up") {
      p.upPool = String(a.sum);
      p.upCount = a.n;
    } else if (a.side === "down") {
      p.downPool = String(a.sum);
      p.downCount = a.n;
    }
    poolMap.set(a.token, p);
  }
  const pools = tokens.map((t) => poolMap.get(t.slug)!).filter(Boolean);

  // legacy single-pool aggregate (sum across all tokens) for backward-compatible UI fields
  let up = 0n,
    down = 0n,
    upN = 0,
    downN = 0;
  for (const p of pools) {
    up += BigInt(p.upPool);
    down += BigInt(p.downPool);
    upN += p.upCount;
    downN += p.downCount;
  }

  const w = windowsFor(roundId);
  const recentRaw = d
    .prepare(
      `SELECT side, amount_base as amount, email, at_ms as atMs, token FROM bets WHERE round_id = ? ORDER BY at_ms DESC LIMIT 200`
    )
    .all(roundId) as {
    side: "up" | "down" | "invalid";
    amount: string;
    email: string;
    atMs: number;
    token: TokenSlug;
  }[];
  const recent = recentRaw.map((b) => ({ ...b, email: maskEmail(b.email) }));
  return {
    id: r.id,
    startMs: w.startMs,
    lockoutMs: w.lockoutMs,
    endMs: w.endMs,
    status: r.status,
    strike: r.strike,
    settle: r.settle,
    upPool: up.toString(),
    downPool: down.toString(),
    upCount: upN,
    downCount: downN,
    pools,
    recentBets: recent,
  };
}

export function recentRounds(n = 10): RoundView[] {
  const d = db();
  const rows = d.prepare(`SELECT id FROM rounds ORDER BY id DESC LIMIT ?`).all(n) as { id: number }[];
  return rows.map((r) => roundView(r.id));
}

async function samplePrice() {
  try {
    const px = await getSpotPrice();
    db().prepare(`INSERT OR REPLACE INTO prices (ts_ms, price) VALUES (?, ?)`).run(Date.now(), px);
  } catch {}
}

export async function tick() {
  const now = Date.now();
  const cur = currentRound(now);
  ensureRound(cur.id);
  await snapshotStrike(cur.id).catch(() => {});
  // sample price every tick for chart history + settlement fallback
  await samplePrice();
  // settle anything past end
  const d = db();
  const due = d
    .prepare(`SELECT id FROM rounds WHERE status IN ('open','locked') AND id <= ?`)
    .all(Math.floor((now - cfg.roundSec * 1000) / 1000)) as { id: number }[];
  await ingestActivity().catch(() => {});
  for (const r of due) await settleRound(r.id).catch(() => {});
  await flushPayouts().catch(() => {});
  try {
    refundDeadPayouts();
  } catch {}
  // heartbeat for /api/health
  d.prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES ('worker_heartbeat_ms', ?)`).run(String(Date.now()));
}
