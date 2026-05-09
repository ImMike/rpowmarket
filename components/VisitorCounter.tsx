"use client";
import { useEffect, useState } from "react";

export default function VisitorCounter() {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    const seen = sessionStorage.getItem("rpow_view_counted");
    const url = "/api/views";
    if (seen) {
      fetch(url).then((r) => r.json()).then((j) => setViews(j.views)).catch(() => {});
    } else {
      fetch(url, { method: "POST" })
        .then((r) => r.json())
        .then((j) => {
          sessionStorage.setItem("rpow_view_counted", "1");
          setViews(j.views);
        })
        .catch(() => {});
    }
  }, []);

  const digits = (views ?? 0).toString().padStart(7, "0").split("");

  return (
    <div className="mt-12 flex flex-col items-center gap-2 pb-8 text-center text-xs text-zinc-500">
      <div className="font-mono uppercase tracking-widest">⛧ visitors since 2026 ⛧</div>
      <div className="flex gap-1">
        {digits.map((d, i) => (
          <span
            key={i}
            className="inline-flex h-7 w-5 items-center justify-center border border-amber-500/60 bg-black font-mono text-base font-bold text-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
