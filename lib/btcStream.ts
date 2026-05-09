// One server-side ws to Coinbase, fanned out to all SSE clients.
// Avoids 30k clients each opening their own ws.

import WebSocket from "ws";

type Listener = (price: number) => void;

let ws: WebSocket | null = null;
let lastPrice: number | null = null;
let lastTickMs = 0;
const listeners = new Set<Listener>();
let connecting = false;

function connect() {
  if (ws || connecting) return;
  connecting = true;
  const c = new WebSocket("wss://ws-feed.exchange.coinbase.com");
  c.on("open", () => {
    connecting = false;
    c.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: ["BTC-USD"],
        channels: ["ticker"],
      })
    );
  });
  c.on("message", (buf) => {
    try {
      const j = JSON.parse(buf.toString()) as { type?: string; price?: string };
      if (j.type === "ticker" && j.price) {
        const p = Number(j.price);
        if (Number.isFinite(p)) {
          lastPrice = p;
          lastTickMs = Date.now();
          for (const l of listeners) {
            try {
              l(p);
            } catch {}
          }
        }
      }
    } catch {}
  });
  c.on("close", () => {
    ws = null;
    connecting = false;
    setTimeout(connect, 1000);
  });
  c.on("error", () => {
    try {
      c.close();
    } catch {}
    ws = null;
    connecting = false;
    setTimeout(connect, 2000);
  });
  ws = c;
}

connect();

export function subscribeBtc(fn: Listener): { unsubscribe: () => void } {
  listeners.add(fn);
  return { unsubscribe: () => listeners.delete(fn) };
}

export function getLastBtc(): { price: number | null; ageMs: number } {
  return { price: lastPrice, ageMs: lastTickMs ? Date.now() - lastTickMs : Infinity };
}
