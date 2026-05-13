import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tokens } from "@/lib/config";
import { maskHandle } from "@/lib/maskHandle";
import {
  currentLotteryRoundId,
  lotteryWindowFor,
  LOTTERY_PERIOD_MS,
  FACILITATOR_BPS,
  PLACE_BPS,
} from "@/lib/lottery";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = db();
  const now = Date.now();
  const periodSec = Math.floor(LOTTERY_PERIOD_MS / 1000);

  const out = {
    now,
    period_ms: LOTTERY_PERIOD_MS,
    payout_bps: { first: PLACE_BPS[1], second: PLACE_BPS[2], third: PLACE_BPS[3], facilitator: FACILITATOR_BPS },
    tokens: tokens
      .filter((t) => t.enabled)
      .map((t) => {
        const rid = currentLotteryRoundId(now);
        const w = lotteryWindowFor(rid);
        const round = d
          .prepare(`SELECT total_pool_base, ticket_total, rolled_from FROM lottery_rounds WHERE id = ? AND token = ?`)
          .get(rid, t.slug) as { total_pool_base: string; ticket_total: number; rolled_from: number | null } | undefined;
        const entries = (
          d
            .prepare(
              `SELECT email, CAST(SUM(CAST(amount_base AS INTEGER)) AS TEXT) AS amount_base, SUM(tickets) AS tickets
               FROM lottery_entries WHERE round_id = ? AND token = ? GROUP BY email ORDER BY tickets DESC LIMIT 100`
            )
            .all(rid, t.slug) as { email: string; amount_base: string; tickets: number }[]
        ).map((e) => ({ ...e, email: maskHandle(e.email) }));
        const lastRound = d
          .prepare(
            `SELECT id, end_ms, total_pool_base, ticket_total FROM lottery_rounds WHERE token = ? AND status = 'settled' ORDER BY id DESC LIMIT 1`
          )
          .get(t.slug) as
          | { id: number; end_ms: number; total_pool_base: string; ticket_total: number }
          | undefined;
        const lastWinners = lastRound
          ? (
              d
                .prepare(
                  `SELECT place, email, amount_base FROM lottery_winners WHERE round_id = ? AND token = ? ORDER BY place`
                )
                .all(lastRound.id, t.slug) as { place: number; email: string; amount_base: string }[]
            ).map((w) => ({ ...w, email: w.place === 0 ? w.email : maskHandle(w.email) }))
          : [];
        return {
          token: t.slug,
          label: t.label,
          banker: t.banker,
          paused: t.paused,
          round: {
            id: rid,
            start_ms: w.startMs,
            end_ms: w.endMs,
            remaining_ms: Math.max(0, w.endMs - now),
            pool_base: round?.total_pool_base ?? "0",
            ticket_total: entries.reduce((a, e) => a + e.tickets, 0),
            rolled_from: round?.rolled_from ?? null,
            entries,
          },
          last: lastRound
            ? {
                id: lastRound.id,
                end_ms: lastRound.end_ms,
                pool_base: lastRound.total_pool_base,
                ticket_total: lastRound.ticket_total,
                winners: lastWinners,
              }
            : null,
        };
      }),
    period_sec: periodSec,
  };
  return NextResponse.json(out);
}
