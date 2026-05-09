import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  const d = db();
  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO kv (key, value) VALUES ('page_views', '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`
    ).run();
    return (
      d.prepare(`SELECT value FROM kv WHERE key = 'page_views'`).get() as
        | { value: string }
        | undefined
    )?.value;
  });
  return NextResponse.json({ views: Number(tx() ?? 0) });
}

export async function GET() {
  const d = db();
  const v = (
    d.prepare(`SELECT value FROM kv WHERE key = 'page_views'`).get() as
      | { value: string }
      | undefined
  )?.value;
  return NextResponse.json({ views: Number(v ?? 0) });
}
