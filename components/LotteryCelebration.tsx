"use client";
import { useEffect, useMemo, useState } from "react";

type Winner = { place: number; email: string; amount_base: string };
export type CelebrationProps = {
  token: string;
  label: string;
  roundId: number;
  pool_base: string;
  winners: Winner[];
  onClose: () => void;
};

function fmtRpow(base: string): string {
  try {
    const v = Number(BigInt(base)) / 1e9;
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return base;
  }
}

const PALETTE = ["#fbbf24", "#f59e0b", "#fde68a", "#ffffff", "#34d399", "#60a5fa", "#f472b6"];

export default function LotteryCelebration({ token, label, roundId, pool_base, winners, onClose }: CelebrationProps) {
  const [step, setStep] = useState(0);
  // pre-compute confetti to keep stable
  const confetti = useMemo(
    () =>
      Array.from({ length: 100 }).map(() => ({
        left: Math.random() * 100,
        bg: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        delay: Math.random() * 1.5,
        duration: 2.5 + Math.random() * 2.5,
        rot: Math.random() * 360,
      })),
    []
  );

  useEffect(() => {
    const order = [
      300,   // banner
      1400,  // 3rd
      2400,  // 2nd
      3500,  // 1st
      4800,  // facilitator
    ];
    const timers = order.map((t, i) => setTimeout(() => setStep(i + 1), t));
    return () => timers.forEach(clearTimeout);
  }, [roundId, token]);

  const first = winners.find((w) => w.place === 1);
  const second = winners.find((w) => w.place === 2);
  const third = winners.find((w) => w.place === 3);
  const fac = winners.find((w) => w.place === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      {confetti.map((c, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${c.left}vw`,
            background: c.bg,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            transform: `rotate(${c.rot}deg)`,
          }}
        />
      ))}

      <div className="relative max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto p-4 text-center sm:p-6">
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10"
        >
          ✕
        </button>

        {step >= 1 && (
          <div className="reveal-slide">
            <div className="text-[10px] uppercase tracking-[0.4em] text-amber-400">⚡ RPOWerball ⚡</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
              {label} draw · round #{roundId}
            </div>
            <div className="jackpot-pulse mt-3 inline-block rounded-2xl border-2 border-amber-400 bg-amber-500/10 px-8 py-4">
              <div className="text-[10px] uppercase tracking-widest text-amber-400">grand jackpot</div>
              <div className="break-all font-mono text-3xl font-black tabular-nums text-amber-300 sm:text-4xl">
                {fmtRpow(pool_base)}
              </div>
              <div className="text-[10px] text-zinc-400">{label}</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {step >= 2 && third && (
            <div className="reveal-slide flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 text-sm">
              <span className="text-lg">🥉</span>
              <span className="max-w-full truncate text-zinc-300">{third.email}</span>
              <span className="font-mono tabular-nums text-zinc-200">+{fmtRpow(third.amount_base)} {label}</span>
            </div>
          )}
          {step >= 3 && second && (
            <div className="reveal-slide flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-zinc-600 bg-zinc-800/80 p-3 text-base">
              <span className="text-xl">🥈</span>
              <span className="max-w-full truncate text-zinc-200">{second.email}</span>
              <span className="font-mono tabular-nums text-zinc-100">+{fmtRpow(second.amount_base)} {label}</span>
            </div>
          )}
          {step >= 4 && first && (
            <div className="reveal-slide jackpot-pulse rounded-xl border-2 border-amber-400 bg-amber-500/15 p-4 sm:p-5">
              <div className="text-xl sm:text-2xl">🥇 1st PLACE 🥇</div>
              <div className="mt-1 break-all font-semibold text-amber-200">{first.email}</div>
              <div className="mt-2 break-all font-mono text-2xl font-black tabular-nums text-amber-300 sm:text-3xl">
                +{fmtRpow(first.amount_base)} {label}
              </div>
            </div>
          )}
        </div>
        {step >= 5 && fac && (
          <div className="reveal-slide mt-3 text-[10px] italic text-zinc-600">
            5% facilitator fee · {fmtRpow(fac.amount_base)} {label}
          </div>
        )}

        {step >= 5 && (
          <button
            onClick={onClose}
            className="reveal-slide mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/20"
          >
            close
          </button>
        )}
      </div>
    </div>
  );
}
