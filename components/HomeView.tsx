"use client";

import { useEffect, useState } from "react";
import Market from "./Market";
import Hiscores from "./Hiscores";
import VisitorCounter from "./VisitorCounter";

type Tab = "market" | "hiscores";

export default function HomeView() {
  const [tab, setTab] = useState<Tab>("market");

  // sync tab from URL hash so links/refresh persist
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "hiscores" || h === "market") setTab(h);
    const onHash = () => {
      const x = window.location.hash.replace("#", "");
      if (x === "hiscores" || x === "market") setTab(x);
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
          className={`px-4 py-2 transition ${
            tab === "market" ? "bg-zinc-100 text-black font-medium" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Market
        </button>
        <button
          onClick={() => change("hiscores")}
          className={`px-4 py-2 transition ${
            tab === "hiscores" ? "bg-zinc-100 text-black font-medium" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          Hiscores
        </button>
      </nav>

      {tab === "market" ? <Market /> : <Hiscores />}

      <VisitorCounter />
    </div>
  );
}
