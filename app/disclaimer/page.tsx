import Link from "next/link";

export const metadata = { title: "Disclaimer · rpowMarket" };

export default function Disclaimer() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-zinc-300">
      <div className="mb-6">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← back
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold">Disclaimer & Terms</h1>
      <p className="mb-8 text-sm text-zinc-500">Last updated: 2026-05-09</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">TL;DR</h2>
          <p>
            <strong>rpowMarket is a free, open-source parody experiment built for fun.</strong> It
            is a tribute to{" "}
            <a
              href="https://x.com/dotkrueger"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              @dotkrueger
            </a>
            &apos;s{" "}
            <a
              href="https://rpow2.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              rpow2.com
            </a>{" "}
            project — itself a tribute to Hal Finney&apos;s original Reusable Proofs of Work
            (RPOW). It is a community joke project parodying Polymarket using rpow2&apos;s in-game
            tokens. <strong>rPOW has no monetary value.</strong> It cannot be exchanged for cash,
            cryptocurrency, securities, goods, or services. Nothing here is investment advice,
            gambling, financial product, or anything regulated. Use it the way you&apos;d use a
            free flash game.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">No real-world value</h2>
          <p>
            rPOW tokens are play tokens issued by the third-party rpow2 service. They are not
            money, currency, securities, commodities, derivatives, or any regulated instrument.
            They have no redemption value, no exchange rate, no backing, and no issuer obligation.
            We do not buy, sell, custody, or facilitate the exchange of rPOW for anything of
            value. If you treat rPOW as having value, that is your own subjective belief — we
            disclaim it entirely.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">No gambling</h2>
          <p>
            Because no money or thing of value is staked, won, lost, or wagered on this site, the
            activity here does not constitute gambling, gaming, betting, wagering, lotteries,
            sweepstakes, contests of chance, prediction markets, or any analogous regulated
            activity under any jurisdiction&apos;s laws. The use of words like &quot;bet&quot;,
            &quot;UP&quot;, &quot;DOWN&quot;, &quot;pool&quot;, &quot;payout&quot;, &quot;winner&quot;,
            &quot;rake&quot;, or &quot;market&quot; is purely thematic — chosen to mirror the
            Polymarket interface as parody. They do not signify anything of value being staked
            or won.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">Parody / fan project</h2>
          <p>
            This site is a fan parody. It is not affiliated with, endorsed by, sponsored by, or
            associated with Polymarket, Polymarket Inc., Polymarket Labs, Coinbase, Kraken,
            Binance, Bitcoin, the Bitcoin Project, the Hal Finney estate, or any other entity
            referenced. All trademarks, names, and likenesses belong to their respective owners
            and are used only for nominative reference. No commercial relationship is implied.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">Open source, no warranties</h2>
          <p>
            The source for rpowMarket is published free on GitHub for anyone to fork, modify,
            run, sell, embed, mock, satirize, ignore, or do anything else with under a permissive
            open-source license. The software is provided <strong>&quot;AS IS&quot;</strong>,
            without warranty of any kind, express or implied, including merchantability, fitness
            for a particular purpose, non-infringement, or any other warranty. The author makes
            no representation that the site will be available, accurate, secure, or bug-free.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">No liability</h2>
          <p>
            To the maximum extent permitted by applicable law, the author, contributors,
            operators, hosts, and any associated parties shall not be liable for any direct,
            indirect, incidental, special, consequential, exemplary, punitive, or any other
            damages arising out of or related to your use of, inability to use, or interaction
            with this site, including but not limited to: loss of rPOW tokens, lost time, lost
            opportunity, lost feelings, lost faith in humanity, embarrassment, software bugs,
            settlement errors, payout failures, oracle disagreements, third-party service
            outages (rpow2, Coinbase, Kraken, Bitcoin network, your ISP, your power grid,
            etc.), session compromise, or anything else. <strong>You assume all risk</strong> of
            using this site.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">Third-party services</h2>
          <p>
            rpowMarket interacts with third-party services that we do not control: rpow2 (token
            issuance, send/receive), Coinbase Exchange (price data and ws stream), and Kraken
            (price fallback). These services are subject to their own terms, may go down, may
            change behavior, and may rate-limit or ban us at any time. We are not responsible
            for their availability, accuracy, or actions. If a price oracle disagrees,
            disconnects, or returns wrong data, settlement may be delayed, refunded, or
            incorrect.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">No tax / financial advice</h2>
          <p>
            Nothing on this site is financial, investment, accounting, legal, or tax advice. You
            should not rely on this site for any such purpose. Consult a qualified professional
            for actual advice. The author is a hobbyist building a meme.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">No KYC / AML</h2>
          <p>
            This site collects no personal information. The only identifier used is the email
            address associated with your rpow2 account, which is supplied by the rpow2 service
            and used solely to route token transfers. We do not perform identity verification,
            anti-money-laundering checks, sanctions screening, or know-your-customer procedures
            because none of those are applicable to a play-token parody.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">Eligibility</h2>
          <p>
            Don&apos;t use this site if your jurisdiction prohibits parody-token games, or if you
            are under whatever age your local laws say you must be to play with internet toys.
            Don&apos;t use this site if you cannot agree to the terms above. Don&apos;t use this
            site if you mistakenly believe rPOW has any monetary value.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">Indemnity</h2>
          <p>
            You agree to indemnify, defend, and hold harmless the author and any contributors
            from and against any claims, damages, losses, liabilities, costs, and expenses
            (including reasonable attorneys&apos; fees) arising out of or related to your use of
            this site or violation of these terms. If somebody sues us because of your use of
            our parody, you cover it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">Severability</h2>
          <p>
            If any part of this disclaimer is found unenforceable in any jurisdiction, the rest
            remains in full effect. The unenforceable part shall be deemed modified to the
            minimum extent necessary to make it enforceable, with the original spirit preserved.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-zinc-100">In summary</h2>
          <p>
            <strong>This is a free, open-source parody. rPOW has no value. Nothing is at stake.
            Don&apos;t sue me.</strong> Built with love as a tribute to Hal Finney and a tip of
            the hat to{" "}
            <a
              href="https://x.com/dotkrueger"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              @dotkrueger
            </a>
            &apos;s rpow2 — a centralized homage to the first cryptographic money based on
            proof-of-work, four years before Bitcoin existed.
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-border pt-4 text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-300">
          ← back to market
        </Link>
      </div>
    </main>
  );
}
