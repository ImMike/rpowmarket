import { currentRound } from "@/lib/rounds";
import { ensureRound, recentRounds, roundView } from "@/lib/market";
import { cfg } from "@/lib/config";

export const dynamic = "force-dynamic";

function snapshot() {
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
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(snapshot())}\n\n`));
        } catch {}
      };
      send();
      timer = setInterval(send, 1500);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
