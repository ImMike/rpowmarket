"use client";
import { useEffect, useState } from "react";
import LotteryCelebration from "./LotteryCelebration";

type Entry = { email: string; amount_base: string; tickets: number };
type Winner = { place: number; email: string; amount_base: string };
type TokenLot = {
  token: string;
  label: string;
  banker: string;
  paused: boolean;
  round: {
    id: number;
    start_ms: number;
    end_ms: number;
    remaining_ms: number;
    pool_base: string;
    ticket_total: number;
    rolled_from: number | null;
    entries: Entry[];
  };
  last: {
    id: number;
    end_ms: number;
    pool_base: string;
    ticket_total: number;
    winners: Winner[];
  } | null;
};
type LotteryState = {
  now: number;
  period_ms: number;
  payout_bps: { first: number; second: number; third: number; facilitator: number };
  tokens: TokenLot[];
};

function fmtRpow(base: string): string {
  try {
    const v = Number(BigInt(base)) / 1e9;
    if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return base;
  }
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "drawing…";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

type Hiscores = {
  totals: {
    settled_rounds: number;
    payouts: number;
    unique_winners: number;
    total_entries: number;
    unique_players: number;
    total_paid_base: string;
  };
  rows: { email: string; wins: number; firsts: number; seconds: number; thirds: number; total_base: string }[];
  draws: {
    id: number;
    token: string;
    end_ms: number;
    total_pool_base: string;
    ticket_total: number;
    winners: { place: number; email: string; amount_base: string }[];
  }[];
  biggest: { id: number; token: string; total_pool_base: string; ticket_total: number; end_ms: number }[];
};

type Celebrate = {
  token: string;
  label: string;
  roundId: number;
  pool_base: string;
  winners: { place: number; email: string; amount_base: string }[];
} | null;

export default function Lottery() {
  const [state, setState] = useState<LotteryState | null>(null);
  const [hiscores, setHiscores] = useState<Hiscores | null>(null);
  const [celebrate, setCelebrate] = useState<Celebrate>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const fetchAll = () =>
      Promise.all([fetch("/api/lottery").then((r) => r.json()), fetch("/api/lottery/hiscores").then((r) => r.json())])
        .then(([s, h]) => {
          if (!alive) return;
          setState(s);
          setHiscores(h);
          // Detect fresh draws to celebrate.
          for (const t of (s as LotteryState).tokens) {
            if (!t.last || !t.last.winners.length) continue;
            const seenKey = `lottery-seen-${t.last.id}-${t.token}`;
            if (typeof window === "undefined") continue;
            if (localStorage.getItem(seenKey)) continue;
            const ageMs = Date.now() - t.last.end_ms;
            if (ageMs > 10 * 60 * 1000) {
              // older than 10 min — mark seen without celebrating
              localStorage.setItem(seenKey, "1");
              continue;
            }
            setCelebrate({
              token: t.token,
              label: t.label,
              roundId: t.last.id,
              pool_base: t.last.pool_base,
              winners: t.last.winners,
            });
            localStorage.setItem(seenKey, "1");
            break;
          }
        })
        .catch(() => {});
    fetchAll();
    const poll = setInterval(fetchAll, 5000);
    const cd = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(cd);
    };
  }, []);

  if (!state) return <div className="text-sm text-zinc-500">Loading lottery…</div>;

  // Lottery is "live" only when at least one token is paused (the paused-market flag is the polarity switch).
  const lotteryActive = state.tokens.some((t) => t.paused);

  const nextDrawMs = Math.min(...state.tokens.map((t) => t.round.end_ms));
  const totalPool = state.tokens.reduce((acc, t) => {
    try {
      return acc + BigInt(t.round.pool_base);
    } catch {
      return acc;
    }
  }, 0n);

  return (
    <div className="space-y-6">
      {celebrate && lotteryActive && <LotteryCelebration {...celebrate} onClose={() => setCelebrate(null)} />}

      {!lotteryActive && (
        <div className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-5 text-center">
          <div className="mb-1 text-xs uppercase tracking-[0.3em] text-amber-400">⏸ RPOWerball is paused</div>
          <div className="text-sm text-zinc-300">
            We&apos;re running the <span className="font-semibold">5-minute prediction market</span> right now — check the <span className="font-mono text-amber-300">Market</span> tab to play.
            The lottery is on standby and will return soon. Past winners and stats below.
          </div>
        </div>
      )}

      <div className={`relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent p-5 text-center shadow-[0_0_40px_rgba(251,191,36,0.25)] ${lotteryActive ? "" : "opacity-50"}`}>
        <div className="text-[10px] uppercase tracking-[0.4em] text-amber-300">⚡ next RPOWerball draw in ⚡</div>
        <CountdownBig endMs={nextDrawMs} />
        <div className="mt-3 text-[10px] uppercase tracking-widest text-amber-400">total grand prize</div>
        <div className="font-mono text-2xl font-black tabular-nums text-amber-200 sm:text-3xl">
          {fmtRpow(totalPool.toString())} rPOW
        </div>
        <div className="text-[10px] text-zinc-400">across all 3 tokens</div>
      </div>

      <div className="rounded-2xl border border-border bg-panel p-5">
        <div className="mb-1 text-xs uppercase tracking-wider text-amber-400">⚡ RPOWerball</div>
        <div className="text-sm text-zinc-300">
          Send rPOW to the lottery banker. Every 6 hours we draw three winners weighted by tickets.
          <span className="font-mono"> 1 rPOW = 1 ticket</span>, capped at <span className="font-mono">100 per wallet per round</span> — any rPOW beyond that (even across multiple sends) is automatically refunded.
          <span className="block mt-2 text-amber-300/90">⚖️ Why the cap? Fairness. We don&apos;t want whales locking out new players — capping at 100 means a brand-new miner with a handful of rPOW has a real chance to win against anyone.</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400 sm:text-xs md:grid-cols-4">
          <div className="rounded border border-border bg-black/30 p-2"><span className="text-up font-semibold">1st</span> · {(state.payout_bps.first / 100).toFixed(0)}%</div>
          <div className="rounded border border-border bg-black/30 p-2"><span className="text-zinc-200 font-semibold">2nd</span> · {(state.payout_bps.second / 100).toFixed(0)}%</div>
          <div className="rounded border border-border bg-black/30 p-2"><span className="text-zinc-400 font-semibold">3rd</span> · {(state.payout_bps.third / 100).toFixed(0)}%</div>
          <div className="rounded border border-border bg-black/30 p-2"><span className="text-amber-400 font-semibold">facilitator</span> · {(state.payout_bps.facilitator / 100).toFixed(0)}%</div>
        </div>
      </div>

      {(() => {
        const uniqueBankers = Array.from(new Set(state.tokens.map((t) => t.banker).filter(Boolean)));
        const single = uniqueBankers.length === 1 ? uniqueBankers[0] : null;
        return (
          <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-5 shadow-[0_0_30px_rgba(251,191,36,0.15)]">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">🎟️</span>
              <div className="text-[11px] uppercase tracking-[0.25em] text-amber-400">send your entries here</div>
            </div>
            {single ? (
              <>
                <BankerCopy value={single} large />
                <div className="mt-2 text-[11px] text-zinc-400">
                  💡 Same address for all 3 tokens —{" "}
                  <span className="font-semibold text-zinc-300">rPOW2 · rPOW3 · rPOW4</span>. Send whichever you have.
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {state.tokens.map((t) => (
                  <div key={t.token} className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">{t.label}</span>
                    <BankerCopy value={t.banker || "—"} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid gap-4 md:grid-cols-3">
        {state.tokens.map((t) => {
          const remaining = Math.max(0, t.round.end_ms - (state.now + tick * 0));
          // recompute remaining each tick using current real time
          const localRemain = Math.max(0, t.round.end_ms - Date.now());
          return (
            <div key={t.token} className="space-y-3 rounded-2xl border border-border bg-panel p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400">
                  jackpot
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-amber-400">prize pool</div>
                <div className="font-mono text-2xl font-bold tabular-nums text-amber-300">
                  {fmtRpow(t.round.pool_base)}
                </div>
                <div className="text-[10px] text-zinc-500">{t.label}</div>
                {t.round.rolled_from != null && (
                  <div className="mt-1 text-[10px] text-amber-400">⤴ rolled from #{t.round.rolled_from}</div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>draw in</span>
                <span className="font-mono text-zinc-200">{fmtCountdown(localRemain || remaining)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>tickets sold</span>
                <span className="tabular-nums">{t.round.ticket_total.toLocaleString()}</span>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">entries</div>
                {t.round.entries.length === 0 ? (
                  <div className="text-xs text-zinc-600">No entries yet — be first!</div>
                ) : (
                  <div className="max-h-40 overflow-y-auto pr-1 text-[10px]">
                    {t.round.entries.map((e) => (
                      <div key={e.email} className="flex items-center justify-between py-0.5">
                        <span className="truncate text-zinc-400">{e.email}</span>
                        <span className="ml-2 flex-shrink-0 tabular-nums text-zinc-200">
                          {e.tickets} 🎟
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {t.last && (
                <div className="border-t border-border/50 pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">last draw · pool {fmtRpow(t.last.pool_base)}</div>
                  {t.last.winners.length === 0 ? (
                    <div className="text-[10px] text-zinc-500">no entries — rolled forward</div>
                  ) : (
                    <div className="space-y-0.5">
                      {t.last.winners.filter((w) => w.place !== 0).map((w) => (
                        <div key={w.place + w.email} className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-400">
                            {w.place === 1 && "🥇"} {w.place === 2 && "🥈"} {w.place === 3 && "🥉"}{" "}
                            <span className="truncate">{w.email}</span>
                          </span>
                          <span className="tabular-nums text-zinc-200">{fmtRpow(w.amount_base)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hiscores && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Settled draws" value={hiscores.totals.settled_rounds.toLocaleString()} />
            <StatCard label="Winners paid" value={hiscores.totals.payouts.toLocaleString()} />
            <StatCard label="Unique winners" value={hiscores.totals.unique_winners.toLocaleString()} />
            <StatCard label="Total entries" value={hiscores.totals.total_entries.toLocaleString()} />
            <StatCard label="Total paid out" value={fmtRpow(hiscores.totals.total_paid_base)} sub="rPOW (all tokens)" />
          </div>

          {hiscores.biggest.length > 0 && (
            <div className="rounded-2xl border border-border bg-panel p-4">
              <div className="mb-2 text-xs uppercase tracking-wider text-amber-400">🏆 biggest jackpots</div>
              <div className="space-y-1 text-sm">
                {hiscores.biggest.map((b, i) => {
                  const key = `${b.id}-${b.token}`;
                  const winners = (hiscores.draws.find((d) => d.id === b.id && d.token === b.token)?.winners ?? []).filter((w) => w.place !== 0);
                  const open = expanded === key;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setExpanded(open ? null : key)}
                        className="flex w-full items-center justify-between border-b border-border/40 py-1 text-left hover:bg-amber-500/5"
                      >
                        <span className="text-zinc-400">
                          <span className="mr-1 text-zinc-600">{open ? "▾" : "▸"}</span>
                          #{i + 1} · {b.token.toUpperCase()} · round {b.id}
                        </span>
                        <span className="font-mono tabular-nums text-amber-300">{fmtRpow(b.total_pool_base)}</span>
                      </button>
                      {open && (
                        <div className="ml-4 space-y-0.5 border-l border-border/40 pl-3 py-2 text-xs">
                          {winners.length === 0 ? (
                            <div className="text-zinc-600">No winner data.</div>
                          ) : (
                            winners.map((w) => (
                              <div key={w.place + w.email} className="flex items-center justify-between">
                                <span className="text-zinc-400">
                                  {w.place === 1 && "🥇"} {w.place === 2 && "🥈"} {w.place === 3 && "🥉"}{" "}
                                  <span className="text-zinc-300">{w.email}</span>
                                </span>
                                <span className="font-mono tabular-nums text-zinc-200">+{fmtRpow(w.amount_base)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">all-time top earners</div>
            {hiscores.rows.length === 0 ? (
              <div className="text-xs text-zinc-600">No winners yet.</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-black/30 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-2 py-2 text-left sm:px-3">#</th>
                      <th className="px-2 py-2 text-left sm:px-3">player</th>
                      <th className="hidden px-3 py-2 text-right sm:table-cell">🥇</th>
                      <th className="hidden px-3 py-2 text-right sm:table-cell">🥈</th>
                      <th className="hidden px-3 py-2 text-right sm:table-cell">🥉</th>
                      <th className="px-2 py-2 text-right sm:px-3">total won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiscores.rows.map((r, i) => (
                      <tr key={r.email} className="border-t border-border/40">
                        <td className="px-2 py-2 text-zinc-500 tabular-nums sm:px-3">{i + 1}</td>
                        <td className="max-w-[140px] truncate px-2 py-2 text-zinc-200 sm:max-w-none sm:px-3">{r.email}</td>
                        <td className="hidden px-3 py-2 text-right tabular-nums text-zinc-400 sm:table-cell">{r.firsts}</td>
                        <td className="hidden px-3 py-2 text-right tabular-nums text-zinc-400 sm:table-cell">{r.seconds}</td>
                        <td className="hidden px-3 py-2 text-right tabular-nums text-zinc-400 sm:table-cell">{r.thirds}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-amber-300 sm:px-3">{fmtRpow(r.total_base)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {hiscores.draws.length > 0 && (
            <div className="rounded-2xl border border-border bg-panel p-4">
              <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">recent draws</div>
              <div className="space-y-3 text-xs">
                {hiscores.draws.slice(0, 10).map((d) => (
                  <div key={`${d.id}-${d.token}`} className="rounded border border-border/50 bg-black/20 p-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                      <span>{d.token.toUpperCase()} · round {d.id}</span>
                      <span className="font-mono text-amber-400">pool {fmtRpow(d.total_pool_base)}</span>
                    </div>
                    {d.winners.length === 0 ? (
                      <div className="text-[11px] text-zinc-600">no entries — rolled forward</div>
                    ) : (
                      <div className="space-y-0.5">
                        {d.winners.filter((w) => w.place !== 0).map((w) => (
                          <div key={w.place + w.email} className="flex items-center justify-between">
                            <span className="text-zinc-400">
                              {w.place === 1 && "🥇"} {w.place === 2 && "🥈"} {w.place === 3 && "🥉"}{" "}
                              <span className="text-zinc-300">{w.email}</span>
                            </span>
                            <span className="font-mono tabular-nums text-zinc-200">+{fmtRpow(w.amount_base)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-panel p-5 text-xs text-zinc-400">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-amber-400">🔍 how winners are picked (verifiable & fair)</div>
        <ol className="ml-4 list-decimal space-y-1.5 leading-relaxed">
          <li>
            <span className="text-zinc-300">Tickets</span> — every wallet&apos;s sends (up to the 100 rPOW per-round cap) get one ticket per rPOW. Excess is auto-refunded.
          </li>
          <li>
            <span className="text-zinc-300">Seed</span> — when the timer hits zero we snapshot the BTC/USD price at that moment (cross-checked across exchanges) and hash it with the round id and token: <span className="font-mono text-amber-300">sha256(btc_price ｜ round_id ｜ token)</span>.
          </li>
          <li>
            <span className="text-zinc-300">Draw</span> — that seed (plus a per-place salt) deterministically picks a ticket index for 1st, 2nd, and 3rd. Same wallet can&apos;t win two places in the same round.
          </li>
          <li>
            <span className="text-zinc-300">Anyone can verify</span> — the seed is saved on every settled round. Reproduce the math with the public BTC close, the round id, the token name, and the entries list — you should get exactly the winners we paid.
          </li>
          <li>
            <span className="text-zinc-300">Payouts</span> — 60% / 25% / 10% to 1st / 2nd / 3rd. 5% to the facilitator.
          </li>
          <li>
            <span className="text-zinc-300">Edge cases</span> — if fewer than <span className="font-mono">3</span> unique wallets enter a round, every entry is fully refunded (no winners, no fee). If <em>no</em> one enters, the pool rolls forward into next round&apos;s jackpot. Nothing disappears.
          </li>
        </ol>
        <div className="mt-3 text-[11px] italic text-zinc-500">
          No house edge on the pool itself. No private RNG. No favoritism — your odds are exactly your tickets ÷ total tickets.
        </div>
      </div>
    </div>
  );
}

function CountdownBig({ endMs }: { endMs: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, endMs - Date.now());
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const cells = [
    { label: "h", v: h.toString().padStart(2, "0") },
    { label: "m", v: m.toString().padStart(2, "0") },
    { label: "s", v: sec.toString().padStart(2, "0") },
  ];
  return (
    <div className="mt-2 flex items-center justify-center gap-1 sm:gap-2">
      {cells.map((c, i) => (
        <div key={c.label} className="flex items-end gap-1">
          <span className="flex h-12 min-w-[2.25rem] items-center justify-center rounded-md border border-amber-400/60 bg-black/60 px-2 font-mono text-3xl font-black tabular-nums text-amber-300 shadow-[inset_0_0_10px_rgba(251,191,36,0.4)] sm:h-16 sm:min-w-[3.5rem] sm:text-5xl">
            {c.v}
          </span>
          <span className="pb-1 text-[10px] uppercase text-amber-400 sm:pb-2 sm:text-xs">{c.label}</span>
          {i < cells.length - 1 && <span className="hidden text-amber-400/50 sm:inline">:</span>}
        </div>
      ))}
    </div>
  );
}

function BankerCopy({ value, large = false }: { value: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={
        large
          ? "group flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-black/40 px-3 py-3 text-left hover:bg-amber-500/10 sm:flex-nowrap sm:gap-3 sm:px-4"
          : "flex w-full items-center justify-between gap-2 text-left"
      }
      title="click to copy"
    >
      <span
        className={
          large
            ? "min-w-0 break-all font-mono text-base font-semibold text-amber-200 sm:truncate sm:text-lg"
            : "truncate font-mono text-xs text-zinc-200"
        }
      >
        {value}
      </span>
      <span
        className={
          large
            ? "shrink-0 rounded border border-amber-500/50 px-2 py-1 text-xs text-amber-300 group-hover:bg-amber-500/20"
            : "text-[10px] text-zinc-500 hover:text-zinc-300"
        }
      >
        {copied ? "✓ copied!" : "📋 copy"}
      </span>
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{value}</div>
      {sub && <div className="text-[9px] text-zinc-600">{sub}</div>}
    </div>
  );
}
