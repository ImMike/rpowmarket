import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { windowsFor } from "@/lib/rounds";

export const dynamic = "force-dynamic";

let cache: Map<number, { at: number; body: { ts: number; p: number }[] }> = new Map();
const TTL_MS = 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const round = Number(url.searchParams.get("round"));
  if (!round) return NextResponse.json({ error: "round required" }, { status: 400 });
  const w = windowsFor(round);

  const c = cache.get(round);
  const now = Date.now();
  if (c && now - c.at < TTL_MS) {
    return new NextResponse(JSON.stringify(c.body), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=1, s-maxage=1, stale-while-revalidate=2",
      },
    });
  }

  const rows = db()
    .prepare(
      `SELECT ts_ms as ts, price as p FROM prices WHERE ts_ms >= ? AND ts_ms <= ? ORDER BY ts_ms ASC`
    )
    .all(w.startMs, Math.min(now, w.endMs)) as { ts: number; p: number }[];
  cache.set(round, { at: now, body: rows });
  return new NextResponse(JSON.stringify(rows), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=1, s-maxage=1, stale-while-revalidate=2",
    },
  });
}
