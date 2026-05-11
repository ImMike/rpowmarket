"use client";

import { useEffect, useState } from "react";
import Market from "./Market";
import Hiscores from "./Hiscores";
import Lottery from "./Lottery";
import VisitorCounter from "./VisitorCounter";

type Tab = "market" | "hiscores" | "lottery";

export default function HomeView() {
  const [tab, setTab] = useState<Tab>("lottery");

  // sync tab from URL hash so links/refresh persist
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "hiscores" || h === "market" || h === "lottery") setTab(h);
    const onHash = () => {
      const x = window.location.hash.replace("#", "");
      if (x === "hiscores" || x === "market" || x === "lottery") setTab(x);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const change = (t: Tab) => {
    setTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${t}`);
    }
  };

  return (
    <div className="space-y-6">
      <nav className="inline-flex overflow-hidden rounded-xl border border-border bg-panel text-sm">
        <button
          onClick={() => change("market")}
          className={`px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${
            tab === "market" ? "bg-zinc-100 text-black font-medium" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Market
        </button>
        <button
          onClick={() => change("hiscores")}
          className={`px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${
            tab === "hiscores" ? "bg-zinc-100 text-black font-medium" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Hiscores
        </button>
        <button
          onClick={() => change("lottery")}
          className={`px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${
            tab === "lottery" ? "bg-zinc-100 text-black font-medium" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          RPOWerball
        </button>
      </nav>

      {tab === "market" ? <Market /> : tab === "hiscores" ? <Hiscores /> : <Lottery />}

      <VisitorCounter />
    </div>
  );
}
