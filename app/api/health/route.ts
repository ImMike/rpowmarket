import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const d = db();
    const hb = (d.prepare(`SELECT value FROM kv WHERE key = 'worker_heartbeat_ms'`).get() as
      | { value: string }
      | undefined)?.value;
    const heartbeatMs = hb ? Number(hb) : 0;
    const heartbeatAge = heartbeatMs ? Date.now() - heartbeatMs : null;
    const pending = (d.prepare(`SELECT COUNT(*) as c FROM payouts WHERE status IN ('pending','failed')`).get() as { c: number }).c;
    const dead = (d.prepare(`SELECT COUNT(*) as c FROM payouts WHERE status = 'dead'`).get() as { c: number }).c;
    const ok = heartbeatAge != null && heartbeatAge < 30_000;
    return NextResponse.json(
      {
        ok,
        heartbeat_age_ms: heartbeatAge,
        pending_payouts: pending,
        dead_payouts: dead,
        now: Date.now(),
      },
      { status: ok ? 200 : 503 }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
