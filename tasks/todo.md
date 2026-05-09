# rpowMarket Hardening + Scale Plan

Goal: ship to public under rpow2.com tribute. Survive 30k concurrent users, resist abuse, never double-pay or lose payouts.

---

## Phase A — Correctness & abuse (P0, must ship before public)

### Settlement / payout integrity
- [x] Atomic round settle claim (`UPDATE WHERE status IN ('open','locked')`)
- [x] Atomic payout claim (`UPDATE WHERE status='pending'`)
- [x] Stable idempotency key per payout id (rpow-side dedupe)
- [ ] **Stop running `tick()` from `/api/state`** — only worker. Removes process race entirely.
- [ ] Auto-retry failed payouts with exponential backoff (5s, 30s, 5m, 30m, 2h) up to N tries
- [ ] Cap `last_error` clearing on success
- [ ] Refund any payout whose rpow API returns `EXACT_SUM_REQUIRED` after retries → log + alert (operator must mint smaller denominations)
- [ ] Settlement uses BigInt throughout (verify no float drift on division)

### Bet ingest hardening
- [ ] **Minimum bet = 1 rPOW.** Anything below dropped silently (no refund — dust attack mitigation)
- [ ] **Maximum bet cap** per email per round (configurable, default 1000 rPOW) — whale guard
- [ ] Reject bets where `at_ms` is more than ±5min off server clock (clock skew sanity)
- [ ] Tx-key already dedupes; verify no replay paths via `idempotency_key` collision

### Privacy
- [ ] Mask `counterparty_email` server-side in `/api/state` (return only `m1***@pongpong.org` form)
- [ ] Add internal-only endpoint `/api/admin/...` for full-fidelity views (auth required)

### Auth / secret hygiene
- [ ] Move `RPOW_SESSION_COOKIE` out of `.env` checked-in path → runtime secret (Doppler / Vercel env / `.env.local` only, gitignored ✓)
- [ ] Cookie rotation runbook (current expires ~Jul 2026)
- [ ] Add `RPOW_API_TOKEN` support if rpow2 ever exposes long-lived tokens
- [ ] Reject /send if cookie expired (parse `exp` from JWT, alert operator)

### Price oracle
- [ ] Snapshot strike at `startMs` AND record sample every ~10s into `prices` table during round
- [ ] On settle: fall back to median of last 3 samples if Coinbase fails at endMs
- [ ] Add second source (Kraken / Binance.US) as cross-check; if delta > 0.5%, refund round

### Operational
- [ ] Health endpoint `/api/health` with: db open, last tick age, worker heartbeat, pending payouts count
- [ ] Structured logs (JSON) for tick / settle / payout; rotate file
- [ ] Sentry or equivalent for exceptions

---

## Phase B — Scale to 30k concurrent (P1)

### Read path (the hot path)
- [ ] `/api/state` cached server-side at 1s TTL (one DB read serves N requests)
- [ ] HTTP `Cache-Control: public, max-age=1` so CDN edge caches
- [ ] Front the site with Cloudflare / Vercel edge so origin sees ~1 req/s/region
- [ ] Switch client polling → **SSE stream** from `/api/state/stream` (one persistent connection per user, server pushes deltas) — far cheaper than polling at scale

### Data layer
- [ ] **Postgres** swap-in (better-sqlite3 → pg). SQLite locks under multi-writer. Schema port is direct.
- [ ] Connection pool, prepared statements
- [ ] Read replicas for `/api/state` reads
- [ ] WAL backups every minute → S3

### Worker layer
- [ ] One worker = single point of failure. Move to **leader-election** model: N workers, only one settles each round (advisory lock or `INSERT INTO leader_lease`)
- [ ] Worker writes only — Next process never writes
- [ ] Worker dedicated to: ingest (every 5s), settle (every 1s scan), payout flush (every 2s)

### BTC price stream
- [ ] One server-side ws to Coinbase + fanout to clients via SSE / our ws (avoid 30k direct connections to Coinbase)
- [ ] Record every tick into `prices` table (1s buckets) for chart history → consistent chart everyone

### Frontend
- [ ] Backfill chart from our own `/api/prices?round=N` (consistent) instead of each client hitting Coinbase candles
- [ ] Reduce React re-renders during ws stream (refs + rAF, not setState every tick)
- [ ] Batch /api/state diff updates over SSE

---

## Phase C — Production polish (P2)

- [ ] Onboarding modal explaining bet encoding (1=UP, 2=DOWN, etc) + exact-sum / denomination caveat
- [ ] Show banker email + a copy-with-amount button (`mailto:$BANKER_EMAIL?subject=BET&body=...`) — lower friction than manual rpow CLI
- [ ] Audit log page: every settlement, every payout, transfer_ids, public-verifiable
- [ ] House dashboard (admin): banker balance, denomination breakdown, pending payouts, alerts
- [ ] Limits dashboard: rate-limits per IP, per email
- [ ] Terms page: parimutuel rules, lockout, refund policy, no-refund-on-dust

---

## Open questions for operator
1. Hosting target? (Vercel / Fly / dedicated VPS / your own box)
2. Domain for the market? subpath of rpow2 or new?
3. Banker wallet denomination plan — who mints small change for payouts?
4. Tolerance for ~30s settle delay if Coinbase momentarily fails (refund round vs retry)?
5. Want to keep RAKE_BPS=0 forever or re-enable once we have a small-change workflow?

---

## Review
_(filled after implementation)_
