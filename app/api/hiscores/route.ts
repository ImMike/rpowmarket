import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 5_000;

function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return e;
  return `${u.slice(0, 2)}***@${d}`;
}

type Row = { email: string; total: number; bets: number; up_total: number; down_total: number };

function build() {
  const rows = db()
    .prepare(
      `
      SELECT
        email,
        COALESCE(SUM(CAST(amount_base AS INTEGER)), 0) AS total,
        COUNT(*) AS bets,
        COALESCE(SUM(CASE WHEN side='up' THEN CAST(amount_base AS INTEGER) ELSE 0 END), 0) AS up_total,
        COALESCE(SUM(CASE WHEN side='down' THEN CAST(amount_base AS INTEGER) ELSE 0 END), 0) AS down_total
      FROM bets
      WHERE side IN ('up','down')
      GROUP BY email
      ORDER BY total DESC
      LIMIT 100
    `
    )
    .all() as Row[];

  const totalVolumeBase = rows.reduce((acc, r) => acc + BigInt(r.total), 0n);
  const totalPredictions = rows.reduce((acc, r) => acc + r.bets, 0);

  // overall totals across ALL bets (not just top 100 returned to client)
  const overall = db()
    .prepare(
      `SELECT COUNT(*) as bets, COUNT(DISTINCT email) as uniques FROM bets WHERE side IN ('up','down')`
    )
    .get() as { bets: number; uniques: number };

  const byToken = db()
    .prepare(
      `SELECT token, COUNT(*) as bets, COUNT(DISTINCT email) as uniques,
              COALESCE(SUM(CAST(amount_base AS INTEGER)), 0) as volume
       FROM bets WHERE side IN ('up','down') GROUP BY token`
    )
    .all() as { token: string; bets: number; uniques: number; volume: number }[];

  const settledRounds = (db()
    .prepare(`SELECT COUNT(*) as c FROM rounds WHERE status IN ('settled','refunded')`)
    .get() as { c: number }).c;

  return {
    now: Date.now(),
    totalVolumeBase: totalVolumeBase.toString(),
    totalPredictions: overall.bets,
    uniquePlayers: overall.uniques,
    settledRounds,
    byToken: byToken.map((b) => ({
      token: b.token,
      bets: b.bets,
      uniques: b.uniques,
      volume: String(b.volume),
    })),
    rows: rows.map((r, i) => ({
      rank: i + 1,
      email: maskEmail(r.email),
      total: String(r.total),
      bets: r.bets,
      upTotal: String(r.up_total),
      downTotal: String(r.down_total),
    })),
  };
}

export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    cache = { at: now, body: build() };
  }
  return new NextResponse(JSON.stringify(cache.body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=5, s-maxage=5, stale-while-revalidate=10",
    },
  });
}
