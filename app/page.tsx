import Header from "@/components/Header";
import Market from "@/components/Market";
import GithubBadge from "@/components/GithubBadge";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Header />
      <Market />
      <footer className="mt-12 border-t border-border pt-4 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>In memory of Hal Finney. RPOW lives on.</span>
          <div className="flex flex-wrap items-center gap-3">
            <GithubBadge />
            <a href="/disclaimer" className="underline-offset-2 hover:text-zinc-300 hover:underline">
              Disclaimer · parody · no value · for fun
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
