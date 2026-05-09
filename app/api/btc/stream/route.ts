import { subscribeBtc, getLastBtc } from "@/lib/btcStream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const enc = new TextEncoder();
  let sub: { unsubscribe: () => void } | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (price: number) => {
        try {
          controller.enqueue(enc.encode(`data: {"p":${price}}\n\n`));
        } catch {}
      };
      sub = subscribeBtc(send);
      const last = getLastBtc().price;
      if (last != null) send(last);
      keepalive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 25_000);
    },
    cancel() {
      sub?.unsubscribe();
      if (keepalive) clearInterval(keepalive);
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
