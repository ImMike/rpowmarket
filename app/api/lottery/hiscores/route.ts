import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maskHandle } from "@/lib/maskHandle";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = db();

  const totalsByEmail = d
    .prepare(
      `SELECT email,
              COUNT(*) AS wins,
              SUM(CASE WHEN place=1 THEN 1 ELSE 0 END) AS firsts,
              SUM(CASE WHEN place=2 THEN 1 ELSE 0 END) AS seconds,
              SUM(CASE WHEN place=3 THEN 1 ELSE 0 END) AS thirds,
              CAST(SUM(CAST(amount_base AS INTEGER)) AS TEXT) AS total_base
       FROM lottery_winners
       WHERE place IN (1,2,3)
       GROUP BY email
       ORDER BY SUM(CAST(amount_base AS INTEGER)) DESC
       LIMIT 50`
    )
    .all() as {
    email: string;
    wins: number;
    firsts: number;
    seconds: number;
    thirds: number;
    total_base: string;
  }[];

  const recentDraws = d
    .prepare(
      `SELECT id, token, end_ms, total_pool_base, ticket_total
       FROM lottery_rounds
       WHERE status = 'settled'
       ORDER BY id DESC
       LIMIT 25`
    )
    .all() as {
    id: number;
    token: string;
    end_ms: number;
    total_pool_base: string;
    ticket_total: number;
  }[];

  const drawWinners = d
    .prepare(
      `SELECT round_id, token, place, email, amount_base FROM lottery_winners ORDER BY round_id DESC, place ASC`
    )
    .all() as { round_id: number; token: string; place: number; email: string; amount_base: string }[];

  const winnersByRoundToken = new Map<string, typeof drawWinners>();
  for (const w of drawWinners) {
    const k = `${w.round_id}|${w.token}`;
    if (!winnersByRoundToken.has(k)) winnersByRoundToken.set(k, []);
    winnersByRoundToken.get(k)!.push(w);
  }

  const draws = recentDraws.map((r) => ({
    ...r,
    winners: winnersByRoundToken.get(`${r.id}|${r.token}`) ?? [],
  }));

  // biggest jackpots all-time
  const biggest = d
    .prepare(
      `SELECT id, token, total_pool_base, ticket_total, end_ms
       FROM lottery_rounds
       WHERE status='settled' AND CAST(total_pool_base AS INTEGER) > 0
       ORDER BY CAST(total_pool_base AS INTEGER) DESC
       LIMIT 5`
    )
    .all() as { id: number; token: string; total_pool_base: string; ticket_total: number; end_ms: number }[];

  // platform-wide
  const totals = d
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM lottery_rounds WHERE status='settled') AS settled_rounds,
         (SELECT COUNT(*) FROM lottery_winners WHERE place IN (1,2,3)) AS payouts,
         (SELECT COUNT(DISTINCT email) FROM lottery_winners WHERE place IN (1,2,3)) AS unique_winners,
         (SELECT COUNT(*) FROM lottery_entries) AS total_entries,
         (SELECT COUNT(DISTINCT email) FROM lottery_entries) AS unique_players,
         (SELECT CAST(SUM(CAST(amount_base AS INTEGER)) AS TEXT) FROM lottery_winners WHERE place IN (1,2,3)) AS total_paid_base`
    )
    .get() as {
    settled_rounds: number;
    payouts: number;
    unique_winners: number;
    total_entries: number;
    unique_players: number;
    total_paid_base: string | null;
  };

  return NextResponse.json({
    totals: { ...totals, total_paid_base: totals.total_paid_base ?? "0" },
    rows: totalsByEmail.map((r) => ({ ...r, email: maskHandle(r.email) })),
    draws: draws.map((d) => ({
      ...d,
      winners: d.winners.map((w) => ({ ...w, email: w.place === 0 ? w.email : maskHandle(w.email) })),
    })),
    biggest,
  });
}
