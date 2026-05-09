"use client";

import { useEffect, useState } from "react";

type Row = {
  rank: number;
  email: string;
  total: string;
  bets: number;
  upTotal: string;
  downTotal: string;
};
type ByToken = { token: string; bets: number; uniques: number; volume: string };
type State = {
  now: number;
  totalVolumeBase: string;
  totalPredictions: number;
  uniquePlayers: number;
  settledRounds: number;
  byToken: ByToken[];
  rows: Row[];
};

const BASE_DECIMALS = 9;
function fmtRpow(base: string): string {
  if (!/^\d+$/.test(base)) return base;
  const padded = base.padStart(BASE_DECIMALS + 1, "0");
  const intPart = padded.slice(0, padded.length - BASE_DECIMALS).replace(/^0+/, "") || "0";
  const frac = padded.slice(-BASE_DECIMALS).replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart;
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function Hiscores() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/hiscores", { cache: "no-store" });
        const j = (await r.json()) as State;
        if (!cancelled) setState(j);
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!state) return <div className="text-zinc-500">Loading…</div>;

  const tokenLabel = (t: string) => t.replace("rpow", "rPOW");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Total volume" value={`${fmtRpow(state.totalVolumeBase)} rPOW`} />
        <Stat label="Total predictions" value={state.totalPredictions.toLocaleString()} />
        <Stat label="Unique players" value={state.uniquePlayers.toLocaleString()} />
        <Stat label="Settled rounds" value={state.settledRounds.toLocaleString()} />
      </div>

      {state.byToken.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {state.byToken.map((b) => (
            <div key={b.token} className="rounded-2xl border border-border bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">{tokenLabel(b.token)}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {b.uniques} player{b.uniques === 1 ? "" : "s"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Volume</div>
                  <div className="tabular-nums text-zinc-200">{fmtRpow(b.volume)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Bets</div>
                  <div className="tabular-nums text-zinc-200">{b.bets.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-3 text-left">Rank</th>
              <th className="px-3 py-3 text-left">Player</th>
              <th className="px-3 py-3 text-right">Volume</th>
              <th className="px-3 py-3 text-right">Bets</th>
              <th className="px-3 py-3 text-right">UP</th>
              <th className="px-3 py-3 text-right">DOWN</th>
              <th className="px-3 py-3 text-right">Bias</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No bets yet — be the first to climb the ranks.
                </td>
              </tr>
            ) : (
              state.rows.map((r) => {
                const up = BigInt(r.upTotal);
                const down = BigInt(r.downTotal);
                const total = up + down;
                const upPct = total > 0n ? Number((up * 1000n) / total) / 10 : 0;
                const downPct = 100 - upPct;
                const top3 = r.rank <= 3;
                return (
                  <tr
                    key={r.email + r.rank}
                    className={`border-t border-border/50 ${top3 ? "bg-amber-500/5" : ""}`}
                  >
                    <td className={`px-3 py-2 ${top3 ? "text-amber-400 font-semibold" : "text-zinc-400 font-mono"}`}>
                      {rankBadge(r.rank)}
                    </td>
                    <td className="px-3 py-2 truncate text-zinc-200">{r.email}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {fmtRpow(r.total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{r.bets}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-up">
                      {fmtRpow(r.upTotal)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-down">
                      {fmtRpow(r.downTotal)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="h-1.5 w-12 overflow-hidden rounded bg-zinc-800">
                          <div className="flex h-full">
                            <div className="bg-up" style={{ width: `${upPct}%` }} />
                            <div className="bg-down" style={{ width: `${downPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-zinc-500">
        Rankings are cumulative across all rounds and all tokens. Every valid bet adds to your
        volume — keep climbing.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
