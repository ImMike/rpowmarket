import { NextResponse } from "next/server";
import { currentRound } from "@/lib/rounds";
import { ensureRound, recentRounds, roundView } from "@/lib/market";
import { cfg } from "@/lib/config";

export const dynamic = "force-dynamic";

let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 1000;

function build() {
  const cur = currentRound();
  ensureRound(cur.id);
  return {
    now: Date.now(),
    bankerEmail: cfg.bankerEmail,
    rakeBps: cfg.rakeBps,
    minBetRpow: Number(BigInt(cfg.minBetBase) / 1_000_000_000n),
    maxBetRpow: Number(BigInt(cfg.maxBetBase) / 1_000_000_000n),
    current: roundView(cur.id),
    recent: recentRounds(10),
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
      // edge/CDN caches for 1s; clients revalidate cheaply
      "cache-control": "public, max-age=1, s-maxage=1, stale-while-revalidate=2",
    },
  });
}
