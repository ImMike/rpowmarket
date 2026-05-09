import { cfg } from "./config";

export type RoundWindows = {
  id: number;        // unix seconds of round start
  startMs: number;
  lockoutMs: number; // accept ends
  endMs: number;     // settle time
};

export function roundIdAt(tsMs: number): number {
  const sec = Math.floor(tsMs / 1000);
  return sec - (sec % cfg.roundSec);
}

export function windowsFor(roundId: number): RoundWindows {
  const startMs = roundId * 1000;
  return {
    id: roundId,
    startMs,
    lockoutMs: startMs + cfg.acceptSec * 1000,
    endMs: startMs + cfg.roundSec * 1000,
  };
}

export function currentRound(now = Date.now()): RoundWindows {
  return windowsFor(roundIdAt(now));
}

export function inAcceptWindow(atMs: number, w: RoundWindows): boolean {
  return atMs >= w.startMs && atMs < w.lockoutMs;
}
