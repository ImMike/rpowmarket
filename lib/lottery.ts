import crypto from "node:crypto";
import { db } from "./db";
import { tokens, type TokenSlug } from "./config";
import { getPriceAtChecked } from "./binance";
import { fetchActivity, txKey } from "./rpow";

const RPOW = 1_000_000_000n;
export const LOTTERY_PERIOD_MS = Number(process.env.LOTTERY_PERIOD_MS ?? 6 * 3600 * 1000);
// Each wallet can credit at most this many rPOW toward the lottery per round.
// Excess (across all transfers from that wallet within the round) is refunded.
// This keeps new/small players competitive against whales — everyone caps at the same max.
export const WALLET_CAP_RPOW = Number(process.env.LOTTERY_WALLET_CAP_RPOW ?? 100);
export const WALLET_CAP_BASE = BigInt(WALLET_CAP_RPOW) * RPOW;
export const FACILITATOR_BPS = Number(process.env.LOTTERY_FACILITATOR_BPS ?? 500); // 5%
export const PLACE_BPS: Record<number, number> = { 1: 6000, 2: 2500, 3: 1000 };    // 60/25/10

export const FACILITATOR_LABEL = process.env.LOTTERY_FACILITATOR_LABEL ?? "facilitator";

export function ticketsFor(amountBase: string): number {
  if (!/^\d+$/.test(amountBase)) return 0;
  // Linear: 1 rPOW = 1 ticket. Per-wallet wallet cap is enforced at ingest, so caller passes credited amount.
  const rpow = Number(BigInt(amountBase) / RPOW);
  if (rpow < 1) return 0;
  return Math.min(WALLET_CAP_RPOW, rpow);
}

/**
 * Split an incoming transfer into the portion that counts toward the lottery
 * (capped per wallet per round at WALLET_CAP_BASE) and the excess that must be refunded.
 */
export function splitForCap(
  amountBase: string,
  alreadyCreditedBase: string
): { credited: string; excess: string } {
  const incoming = BigInt(amountBase);
  const already = BigInt(alreadyCreditedBase || "0");
  const remaining = WALLET_CAP_BASE - already;
  if (remaining <= 0n) return { credited: "0", excess: incoming.toString() };
  if (incoming <= remaining) return { credited: incoming.toString(), excess: "0" };
  return { credited: remaining.toString(), excess: (incoming - remaining).toString() };
}

export function currentLotteryRoundId(now = Date.now()): number {
  return Math.floor(now / LOTTERY_PERIOD_MS) * Math.floor(LOTTERY_PERIOD_MS / 1000);
}

export function lotteryWindowFor(roundId: number) {
  const start = roundId * 1000;
  return { startMs: start, endMs: start + LOTTERY_PERIOD_MS };
}

export function ensureLotteryRound(token: TokenSlug, now = Date.now()) {
  const d = db();
  const rid = currentLotteryRoundId(now);
  const w = lotteryWindowFor(rid);
  d.prepare(
    `INSERT OR IGNORE INTO lottery_rounds (id, token, start_ms, end_ms, status, total_pool_base, ticket_total)
     VALUES (?, ?, ?, ?, 'open', '0', 0)`
  ).run(rid, token, w.startMs, w.endMs);
  return rid;
}

export type EntryRow = {
  email: string;
  amount_base: string;
  tickets: number;
};

function pickWinnerIndex(seedHex: string, ticketTotal: number, salt: string): number {
  const h = crypto.createHash("sha256").update(seedHex).update("|").update(salt).digest();
  // take first 8 bytes as uint, modulo ticketTotal — bias is negligible for our scales
  const v = h.readBigUInt64BE(0);
  return Number(v % BigInt(ticketTotal));
}

function locateTicket(entries: EntryRow[], idx: number): EntryRow | null {
  let cur = 0;
  for (const e of entries) {
    cur += e.tickets;
    if (idx < cur) return e;
  }
  return entries[entries.length - 1] ?? null;
}

export type DrawResult = {
  winners: { place: number; email: string; amount_base: string }[];
  rolled?: boolean;
  rolled_from?: number;
  refunded?: boolean; // <3 entrants — every entry refunded in full
};

export const MIN_ENTRANTS_TO_DRAW = 3;

export async function drawLottery(token: TokenSlug, roundId: number): Promise<DrawResult | null> {
  const d = db();
  const round = d
    .prepare(`SELECT * FROM lottery_rounds WHERE id = ? AND token = ?`)
    .get(roundId, token) as
    | { id: number; status: string; start_ms: number; end_ms: number; total_pool_base: string; ticket_total: number }
    | undefined;
  if (!round) return null;
  if (round.status === "settled" || round.status === "drawing") return null;
  if (Date.now() < round.end_ms) return null;

  // atomic claim
  const claim = d
    .prepare(`UPDATE lottery_rounds SET status = 'drawing' WHERE id = ? AND token = ? AND status = 'open'`)
    .run(roundId, token);
  if (claim.changes !== 1) return null;

  // entry data — tickets aggregated per wallet (per-entry cap was applied at ingest)
  const entriesGroup = d
    .prepare(
      `SELECT email, CAST(SUM(CAST(amount_base AS INTEGER)) AS TEXT) AS amount_base, SUM(tickets) AS tickets
       FROM lottery_entries WHERE round_id = ? AND token = ? GROUP BY email ORDER BY email`
    )
    .all(roundId, token) as EntryRow[];

  const totalTickets = entriesGroup.reduce((acc, e) => acc + e.tickets, 0);
  const totalPool = BigInt(round.total_pool_base);

  if (totalTickets === 0 || totalPool === 0n) {
    // no entries — roll the pool forward into the next round
    const next = roundId + Math.floor(LOTTERY_PERIOD_MS / 1000);
    ensureLotteryRound(token, round.end_ms + 1);
    d.prepare(
      `UPDATE lottery_rounds SET total_pool_base = CAST(CAST(total_pool_base AS INTEGER) + ? AS TEXT), rolled_from = ? WHERE id = ? AND token = ?`
    ).run(totalPool.toString(), roundId, next, token);
    d.prepare(`UPDATE lottery_rounds SET status = 'settled', settled_at = ? WHERE id = ? AND token = ?`).run(
      Date.now(),
      roundId,
      token
    );
    return { winners: [], rolled: true, rolled_from: roundId };
  }

  // Not enough entrants to fill 1st/2nd/3rd — refund every entry in full.
  if (entriesGroup.length < MIN_ENTRANTS_TO_DRAW) {
    const now = Date.now();
    const insRefund = d.prepare(
      `INSERT INTO payouts (round_id, email, amount_base, kind, status, token, created_at)
       VALUES (?, ?, ?, 'lottery_refund', 'pending', ?, ?)`
    );
    const tx = d.transaction(() => {
      for (const e of entriesGroup) {
        insRefund.run(roundId, e.email, e.amount_base, token, now);
      }
      d.prepare(`UPDATE lottery_rounds SET status = 'settled', settled_at = ? WHERE id = ? AND token = ?`).run(
        now,
        roundId,
        token
      );
    });
    tx();
    return { winners: [], refunded: true };
  }

  // deterministic seed = sha256(btc_close_at_end || roundId || token)
  const oracle = await getPriceAtChecked(round.end_ms).catch(() => ({ price: 0, agreed: false }));
  const seedHex = crypto
    .createHash("sha256")
    .update(String(oracle.price ?? 0))
    .update("|")
    .update(String(roundId))
    .update("|")
    .update(token)
    .digest("hex");

  // pick up to 3 unique winners by ticket-weighted draws
  const remaining = entriesGroup.map((e) => ({ ...e }));
  const winners: { place: number; email: string; amount_base: string }[] = [];
  const placeAmount = (bps: number) => (totalPool * BigInt(bps)) / 10_000n;

  for (let place = 1; place <= 3; place++) {
    const remainingTickets = remaining.reduce((a, e) => a + e.tickets, 0);
    if (remainingTickets <= 0) break;
    const idx = pickWinnerIndex(seedHex, remainingTickets, `place-${place}`);
    const winner = locateTicket(remaining, idx);
    if (!winner) break;
    winners.push({
      place,
      email: winner.email,
      amount_base: placeAmount(PLACE_BPS[place]!).toString(),
    });
    // remove winner from pool so 1st≠2nd≠3rd
    const wi = remaining.findIndex((e) => e.email === winner.email);
    if (wi >= 0) remaining.splice(wi, 1);
  }

  // facilitator always paid
  winners.push({
    place: 0,
    email: FACILITATOR_LABEL,
    amount_base: placeAmount(FACILITATOR_BPS).toString(),
  });

  // persist + queue payouts for each winner
  const now = Date.now();
  const ins = d.prepare(
    `INSERT INTO lottery_winners (round_id, token, place, email, amount_base, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insPayout = d.prepare(
    `INSERT INTO payouts (round_id, email, amount_base, kind, status, token, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  );
  const tx = d.transaction(() => {
    for (const w of winners) {
      ins.run(roundId, token, w.place, w.email, w.amount_base, now);
      // place 0 = facilitator — that's you, no payout queued (you keep it in the banker)
      if (w.place === 0) continue;
      if (BigInt(w.amount_base) <= 0n) continue;
      insPayout.run(roundId, w.email, w.amount_base, "lottery_win", token, now);
    }
    d.prepare(
      `UPDATE lottery_rounds SET status = 'settled', settled_at = ?, draw_seed = ? WHERE id = ? AND token = ?`
    ).run(now, seedHex, roundId, token);
  });
  tx();

  return { winners };
}

/**
 * Read banker activity for each lottery-enabled token and credit receives
 * to the current lottery round. Excess over the per-wallet cap is queued
 * as a `lottery_refund` payout (drained by flushPayouts).
 */
export async function ingestLotteryActivity() {
  const d = db();
  const now = Date.now();
  for (const t of tokens) {
    if (!t.enabled) continue;
    // Only ingest into lottery when the market on this token is paused (one banker → one purpose).
    if (!t.paused) continue;
    const slug = t.slug as TokenSlug;
    const items = await fetchActivity(slug).catch(() => []);
    const rid = ensureLotteryRound(slug, now);
    const insEntry = d.prepare(
      `INSERT OR IGNORE INTO lottery_entries (round_id, token, email, amount_base, tickets, at_ms, tx_key) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insRefund = d.prepare(
      `INSERT INTO payouts (round_id, email, amount_base, kind, status, token, created_at)
       VALUES (?, ?, ?, 'lottery_refund', 'pending', ?, ?)`
    );
    const sumPrep = d.prepare(
      `SELECT CAST(COALESCE(SUM(CAST(amount_base AS INTEGER)),0) AS TEXT) AS s FROM lottery_entries WHERE round_id=? AND token=? AND email=?`
    );
    const refundDupePrep = d.prepare(
      `SELECT 1 FROM payouts WHERE kind='lottery_refund' AND token=? AND round_id=? AND email=? AND amount_base=? LIMIT 1`
    );
    for (const it of items) {
      if (it.type !== "receive") continue;
      const atMs = Date.parse(it.at);
      if (!Number.isFinite(atMs)) continue;
      // only ingest into current lottery round window
      const w = lotteryWindowFor(rid);
      if (atMs < w.startMs || atMs >= w.endMs) continue;
      if (!/^\d+$/.test(it.amount_base_units)) continue;
      const incoming = BigInt(it.amount_base_units);
      if (incoming <= 0n) continue;
      const tx = txKey(slug, it);
      // already ingested?
      const seen = d.prepare(`SELECT 1 FROM lottery_entries WHERE tx_key=? LIMIT 1`).get(tx);
      if (seen) continue;
      const already = (sumPrep.get(rid, slug, it.counterparty_email) as { s: string }).s;
      const { credited, excess } = splitForCap(it.amount_base_units, already);
      if (BigInt(credited) > 0n) {
        const tix = ticketsFor(credited);
        insEntry.run(rid, slug, it.counterparty_email, credited, tix, atMs, tx);
        d.prepare(
          `UPDATE lottery_rounds SET total_pool_base = CAST(CAST(total_pool_base AS INTEGER) + ? AS TEXT), ticket_total = ticket_total + ? WHERE id = ? AND token = ?`
        ).run(credited, tix, rid, slug);
      }
      if (BigInt(excess) > 0n) {
        // dedupe so we don't queue duplicate refunds on re-ingest of same activity item
        const dup = refundDupePrep.get(slug, rid, it.counterparty_email, excess);
        if (!dup) {
          insRefund.run(rid, it.counterparty_email, excess, slug, now);
        }
      }
    }
  }
}

export function processLotteries() {
  const out: { token: TokenSlug; result: Promise<DrawResult | null> }[] = [];
  for (const t of tokens) {
    if (!t.enabled) continue;
    ensureLotteryRound(t.slug as TokenSlug);
    // also draw any past-due
    const due = db()
      .prepare(
        `SELECT id FROM lottery_rounds WHERE token = ? AND status = 'open' AND end_ms <= ? ORDER BY id ASC LIMIT 5`
      )
      .all(t.slug, Date.now()) as { id: number }[];
    for (const r of due) out.push({ token: t.slug as TokenSlug, result: drawLottery(t.slug as TokenSlug, r.id) });
  }
  return Promise.all(out.map((x) => x.result));
}
