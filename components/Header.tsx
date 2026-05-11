"use client";
import { useTheme } from "@/lib/useTheme";

export default function Header() {
  const [theme, setTheme] = useTheme();
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <img
          src="/rpowmarket.png"
          alt="rpowMarket"
          className="mb-1 h-10 w-auto object-contain"
        />
        <p className="text-sm text-zinc-400">a playground for rPOW</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded border border-border text-xs">
          <button
            onClick={() => setTheme("modern")}
            className={`px-3 py-1.5 ${theme === "modern" ? "bg-zinc-100 text-black" : "text-zinc-300 hover:text-zinc-100"}`}
          >
            modern
          </button>
          <button
            onClick={() => setTheme("terminal")}
            className={`px-3 py-1.5 ${theme === "terminal" ? "bg-zinc-100 text-black" : "text-zinc-300 hover:text-zinc-100"}`}
          >
            terminal
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <a href="https://rpow2.com" target="_blank" className="hover:text-zinc-300">rpow2.com →</a>
          <a href="https://rpow3.com" target="_blank" className="hover:text-zinc-300">rpow3.com →</a>
          <a href="https://rpow4.com" target="_blank" className="hover:text-zinc-300">rpow4.com →</a>
        </div>
      </div>
    </header>
  );
}
