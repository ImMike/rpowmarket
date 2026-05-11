import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureLotteryRound, ticketsFor, drawLottery, splitForCap } from "@/lib/lottery";
import type { TokenSlug } from "@/lib/config";

export const dynamic = "force-dynamic";

// Dev-only: seed fake entries and optionally force-draw. Disabled in prod.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.LOTTERY_SEED_ALLOWED !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    token?: TokenSlug;
    entries?: { email: string; rpow: number }[];
    draw?: boolean;
  };
  const token = (body.token ?? "rpow2") as TokenSlug;
  const entries = body.entries ?? [];
  const d = db();
  const rid = ensureLotteryRound(token);
  const now = Date.now();
  const ins = d.prepare(
    `INSERT OR IGNORE INTO lottery_entries (round_id, token, email, amount_base, tickets, at_ms, tx_key) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insRefund = d.prepare(
    `INSERT INTO payouts (round_id, email, amount_base, kind, status, token, created_at)
     VALUES (?, ?, ?, 'lottery_refund', 'pending', ?, ?)`
  );
  const tx = d.transaction(() => {
    for (const e of entries) {
      const baseStr = String(BigInt(Math.floor(e.rpow * 1e9)));
      const already = (
        d
          .prepare(
            `SELECT CAST(COALESCE(SUM(CAST(amount_base AS INTEGER)),0) AS TEXT) AS s
             FROM lottery_entries WHERE round_id=? AND token=? AND email=?`
          )
          .get(rid, token, e.email) as { s: string }
      ).s;
      const { credited, excess } = splitForCap(baseStr, already);
      if (BigInt(credited) > 0n) {
        const tix = ticketsFor(credited);
        const txKey = `seed|${token}|${e.email}|${now}|${baseStr}|${Math.random().toString(36).slice(2)}`;
        ins.run(rid, token, e.email, credited, tix, now, txKey);
        d.prepare(
          `UPDATE lottery_rounds SET total_pool_base = CAST(CAST(total_pool_base AS INTEGER) + ? AS TEXT), ticket_total = ticket_total + ? WHERE id = ? AND token = ?`
        ).run(credited, tix, rid, token);
      }
      if (BigInt(excess) > 0n) {
        insRefund.run(rid, e.email, excess, token, now);
      }
    }
  });
  tx();
  let draw = null;
  if (body.draw) {
    // force end_ms to past so drawLottery proceeds
    d.prepare(`UPDATE lottery_rounds SET end_ms = ? WHERE id = ? AND token = ?`).run(now - 1, rid, token);
    draw = await drawLottery(token, rid);
  }
  return NextResponse.json({ ok: true, round_id: rid, token, seeded: entries.length, draw });
}
