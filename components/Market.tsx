"use client";

import { useEffect, useRef, useState } from "react";
import Chart from "./Chart";
import { useTheme } from "@/lib/useTheme";

type RoundView = {
  id: number;
  startMs: number;
  lockoutMs: number;
  endMs: number;
  status: string;
  strike: number | null;
  settle: number | null;
  upPool: string;
  downPool: string;
  upCount: number;
  downCount: number;
  recentBets?: { side: "up" | "down" | "invalid"; amount: string; email: string; atMs: number }[];
};

function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return e;
  return `${u.slice(0, 2)}***@${d}`;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

type State = {
  now: number;
  bankerEmail: string;
  rakeBps: number;
  current: RoundView;
  recent: RoundView[];
};

const BASE_DECIMALS = 9;

function fmtRpow(base: string): string {
  if (!/^\d+$/.test(base)) return base;
  const padded = base.padStart(BASE_DECIMALS + 1, "0");
  const intPart = padded.slice(0, padded.length - BASE_DECIMALS).replace(/^0+/, "") || "0";
  const frac = padded.slice(-BASE_DECIMALS).replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart;
}

function pct(up: string, down: string): { up: number; down: number } {
  const u = BigInt(up || "0"),
    d = BigInt(down || "0");
  const t = u + d;
  if (t === 0n) return { up: 50, down: 50 };
  const upPct = Number((u * 10000n) / t) / 100;
  return { up: upPct, down: 100 - upPct };
}

function fmtMoney(n: number, dp = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtTimeRange(startMs: number, endMs: number): string {
  const f = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "");
  const tz = new Date()
    .toLocaleTimeString("en-US", { timeZoneName: "short" })
    .split(" ")
    .pop();
  const dateLabel = new Date(startMs).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateLabel}, ${f(startMs).replace(/(AM|PM)/i, "")}-${f(endMs)} ${tz}`;
}

function pillLabel(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toUpperCase();
}

export default function Market() {
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(Date.now());
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [upHistory, setUpHistory] = useState<number[]>([]);
  const [theme] = useTheme();

  useEffect(() => {
    let es: EventSource | null = null;
    let pollT: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const startPolling = () => {
      const load = async () => {
        try {
          const r = await fetch("/api/state", { cache: "no-store" });
          const j = (await r.json()) as State;
          if (!cancelled) setState(j);
        } catch {}
      };
      load();
      pollT = setInterval(load, 4000);
    };

    try {
      es = new EventSource("/api/state/stream");
      es.onmessage = (ev) => {
        try {
          const j = JSON.parse(ev.data) as State;
          if (!cancelled) setState(j);
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!pollT) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollT) clearInterval(pollT);
    };
  }, []);

  // track UP% history per round
  useEffect(() => {
    if (!state) return;
    const p = pct(state.current.upPool, state.current.downPool);
    setUpHistory((h) => [...h.slice(-119), p.up]);
  }, [state?.current.upPool, state?.current.downPool, state?.current.id]);

  useEffect(() => {
    setUpHistory([]);
  }, [state?.current.id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          product_ids: ["BTC-USD"],
          channels: ["ticker"],
        })
      );
    };
    ws.onmessage = (e) => {
      try {
        const j = JSON.parse(e.data) as { type?: string; price?: string };
        if (j.type === "ticker" && j.price) setLivePrice(Number(j.price));
      } catch {}
    };
    return () => ws.close();
  }, []);

  if (!state) return <div className="text-zinc-500">Loading…</div>;

  const cur = state.current;
  const p = pct(cur.upPool, cur.downPool);
  const settleRemainMs = Math.max(0, cur.endMs - now);
  const mins = Math.floor(settleRemainMs / 60000);
  const secs = Math.floor((settleRemainMs % 60000) / 1000);
  const locked = now >= cur.lockoutMs;
  const acceptRemainMs = Math.max(0, cur.lockoutMs - now);

  const strike = cur.strike;
  const delta = strike != null && livePrice != null ? livePrice - strike : null;
  const upDirection = delta != null && delta >= 0;

  return (
    <div className="space-y-6">
      {/* Main card */}
      <div className="rounded-2xl border border-border bg-panel p-5 shadow-xl">
        {/* Header row */}
        <div className="mb-4 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f7931a] text-2xl font-bold text-black">
            ₿
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold leading-tight">BTC Up or Down 5m</div>
            <div className="text-sm text-zinc-500">{fmtTimeRange(cur.startMs, cur.endMs)}</div>
          </div>
          <div className="text-right tabular-nums">
            <div className="flex items-baseline gap-2 text-3xl font-bold leading-none">
              <span className={upDirection ? "text-up" : "text-down"}>
                {String(mins).padStart(2, "0")}
              </span>
              <span className={upDirection ? "text-up" : "text-down"}>
                {String(secs).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-1 flex justify-end gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
              <span>Mins</span>
              <span>Secs</span>
            </div>
          </div>
        </div>

        {/* Price row */}
        <div className="mb-3 flex items-end gap-8">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Price To Beat</div>
            <div className="text-2xl font-semibold text-zinc-400 tabular-nums">
              ${strike != null ? fmtMoney(strike) : "—"}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Current Price</div>
              {delta != null && (
                <span
                  className={`text-xs font-medium ${upDirection ? "text-up" : "text-down"}`}
                  title="vs price to beat"
                >
                  {upDirection ? "▲" : "▼"} ${fmtMoney(Math.abs(delta), 2)}
                </span>
              )}
            </div>
            <div
              className={`text-2xl font-semibold tabular-nums ${
                upDirection ? "text-up" : "text-down"
              }`}
            >
              ${livePrice != null ? fmtMoney(livePrice) : "—"}
            </div>
          </div>
        </div>

        {/* Chart */}
        <Chart
          livePrice={livePrice}
          strike={strike}
          startMs={cur.startMs}
          endMs={cur.endMs}
          theme={theme}
        />

        {/* Round pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded-full border border-border bg-black/30 px-3 py-1.5 text-zinc-300">
            Past ▾
          </button>
          {state.recent.slice(0, 3).map((r) => {
            const out =
              r.settle != null && r.strike != null
                ? r.settle > r.strike
                  ? "up"
                  : r.settle < r.strike
                  ? "down"
                  : "tie"
                : null;
            const dot =
              out === "up"
                ? "bg-up"
                : out === "down"
                ? "bg-down"
                : out === "tie"
                ? "bg-zinc-500"
                : "bg-zinc-700";
            return (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-black/30 px-2 py-1"
                title={`Round ${r.id}`}
              >
                <span className={`h-2 w-2 rounded-full ${dot}`} />
              </span>
            );
          })}
          <button className="rounded-full bg-zinc-100 px-3 py-1.5 font-medium text-black">
            {pillLabel(cur.startMs)}
          </button>
        </div>
      </div>

      {/* Pool + bet panel */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-zinc-500">
            <span>Round #{cur.id}</span>
            <span>
              {locked ? (
                <span className="text-amber-400">Locked</span>
              ) : (
                <span>Bets close in {Math.floor(acceptRemainMs / 1000)}s</span>
              )}
            </span>
          </div>
          <div className="mb-3 h-2 w-full overflow-hidden rounded bg-zinc-900">
            <div className="flex h-full">
              <div className="bg-up" style={{ width: `${p.up}%` }} />
              <div className="bg-down" style={{ width: `${p.down}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-up/30 bg-up/10 p-3">
              <div className="text-up font-semibold">UP · {p.up.toFixed(1)}%</div>
              <div className="tabular-nums">{fmtRpow(cur.upPool)} rPOW</div>
              <div className="text-xs text-zinc-500">{cur.upCount} bets</div>
              <div className="mt-2 max-h-24 overflow-hidden text-[11px]">
                {(cur.recentBets ?? [])
                  .filter((b) => b.side === "up")
                  .slice(0, 5)
                  .map((b) => (
                    <div
                      key={`${b.email}-${b.atMs}`}
                      className="flex items-center justify-between gap-2 py-0.5"
                    >
                      <span className="truncate text-zinc-400">{maskEmail(b.email)}</span>
                      <span className="tabular-nums text-up">+{fmtRpow(b.amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="rounded-lg border border-down/30 bg-down/10 p-3">
              <div className="text-down font-semibold">DOWN · {p.down.toFixed(1)}%</div>
              <div className="tabular-nums">{fmtRpow(cur.downPool)} rPOW</div>
              <div className="text-xs text-zinc-500">{cur.downCount} bets</div>
              <div className="mt-2 max-h-24 overflow-hidden text-[11px]">
                {(cur.recentBets ?? [])
                  .filter((b) => b.side === "down")
                  .slice(0, 5)
                  .map((b) => (
                    <div
                      key={`${b.email}-${b.atMs}`}
                      className="flex items-center justify-between gap-2 py-0.5"
                    >
                      <span className="truncate text-zinc-400">{maskEmail(b.email)}</span>
                      <span className="tabular-nums text-down">+{fmtRpow(b.amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* UP% sparkline */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
              <span>UP% over time</span>
              <span className="tabular-nums">{p.up.toFixed(1)}%</span>
            </div>
            <Sparkline data={upHistory} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-4 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">How to bet</div>
          <div className="space-y-1">
            <div className="text-zinc-400">Send rPOW to:</div>
            <CopyButton value={state.bankerEmail} />
          </div>
          <ul className="mt-2 space-y-1 text-zinc-400">
            <li>
              Last non-zero digit <span className="font-mono text-up">odd</span> = UP
              <span className="ml-2 text-zinc-500">(1, 3, 0.005, 11, 0.001247…)</span>
            </li>
            <li>
              Last non-zero digit <span className="font-mono text-down">even</span> = DOWN
              <span className="ml-2 text-zinc-500">(2, 4, 0.006, 12, 0.000128…)</span>
            </li>
            <li>any rPOW amount works · ties refund all</li>
            <li>if a payout can&apos;t be sent in your denominations, your stake is refunded</li>
            {state.rakeBps > 0 && (
              <li>rake {(state.rakeBps / 100).toFixed(2)}% on losing pool</li>
            )}
          </ul>
        </div>
      </div>

      {/* Recent rounds table */}
      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Recent rounds</div>
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Strike</th>
                <th className="px-3 py-2 text-right">Settle</th>
                <th className="px-3 py-2 text-right">UP pool</th>
                <th className="px-3 py-2 text-right">DOWN pool</th>
                <th className="px-3 py-2 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {state.recent.map((r) => {
                const out =
                  r.settle == null || r.strike == null
                    ? "—"
                    : r.settle === r.strike
                    ? "tie"
                    : r.settle > r.strike
                    ? "UP"
                    : "DOWN";
                return (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-zinc-400">{r.id}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.strike?.toFixed(2) ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.settle?.toFixed(2) ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRpow(r.upPool)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRpow(r.downPool)}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        out === "UP" ? "text-up" : out === "DOWN" ? "text-down" : "text-zinc-500"
                      }`}
                    >
                      {out}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-black/40 px-3 py-2 text-left transition hover:border-zinc-600"
    >
      <span className="truncate font-mono text-sm text-zinc-100">{value}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400 group-hover:text-zinc-200">
        {copied ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-up">copied</span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>copy</span>
          </>
        )}
      </span>
    </button>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) {
    return <div className="h-12 w-full rounded bg-zinc-900/60" />;
  }
  const w = 320;
  const h = 48;
  const min = 0;
  const max = 100;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastY = h - ((data[data.length - 1] - min) / (max - min)) * h;
  const lastX = w;
  const isUpFavored = data[data.length - 1] >= 50;
  const stroke = isUpFavored ? "#16a34a" : "#dc2626";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none">
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="#1f2430" strokeDasharray="2 3" />
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={pts.join(" ")} />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}
