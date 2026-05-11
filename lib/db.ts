import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { cfg } from "./config";

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(cfg.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const d = new Database(cfg.dbPath);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY,
      strike REAL,
      settle REAL,
      status TEXT NOT NULL DEFAULT 'open',  -- open|locked|settled|refunded
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      amount_base TEXT NOT NULL,    -- decimal string
      side TEXT NOT NULL,            -- up|down|invalid
      at_ms INTEGER NOT NULL,
      tx_key TEXT NOT NULL UNIQUE,
      FOREIGN KEY (round_id) REFERENCES rounds(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
    CREATE TABLE IF NOT EXISTS payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      amount_base TEXT NOT NULL,
      kind TEXT NOT NULL,            -- win|refund
      status TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed
      transfer_id TEXT,
      idempotency_key TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
    CREATE TABLE IF NOT EXISTS prices (
      ts_ms INTEGER PRIMARY KEY,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // soft migrations for older DBs
  const cols = d.prepare(`PRAGMA table_info(payouts)`).all() as { name: string }[];
  const has = (n: string) => cols.some((c) => c.name === n);
  if (!has("transfer_id")) d.exec(`ALTER TABLE payouts ADD COLUMN transfer_id TEXT`);
  if (!has("idempotency_key")) d.exec(`ALTER TABLE payouts ADD COLUMN idempotency_key TEXT`);
  if (!has("last_error")) d.exec(`ALTER TABLE payouts ADD COLUMN last_error TEXT`);
  if (!has("attempts")) d.exec(`ALTER TABLE payouts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`);
  if (!has("next_attempt_at")) d.exec(`ALTER TABLE payouts ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0`);
  if (!has("token")) d.exec(`ALTER TABLE payouts ADD COLUMN token TEXT NOT NULL DEFAULT 'rpow2'`);

  const betCols = d.prepare(`PRAGMA table_info(bets)`).all() as { name: string }[];
  const betHas = (n: string) => betCols.some((c) => c.name === n);
  if (!betHas("token")) d.exec(`ALTER TABLE bets ADD COLUMN token TEXT NOT NULL DEFAULT 'rpow2'`);

  d.exec(`CREATE INDEX IF NOT EXISTS idx_prices_ts ON prices(ts_ms)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_bets_round_token ON bets(round_id, token)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_payouts_token ON payouts(token, status)`);

  // ── RPOWerball lottery ───────────────────────────────────────────
  d.exec(`
    CREATE TABLE IF NOT EXISTS lottery_rounds (
      id INTEGER NOT NULL,             -- start_ms / 1000
      token TEXT NOT NULL,             -- rpow2 | rpow3 | rpow4
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',   -- open | drawing | settled
      draw_seed TEXT,
      total_pool_base TEXT NOT NULL DEFAULT '0',
      ticket_total INTEGER NOT NULL DEFAULT 0,
      rolled_from INTEGER,             -- previous round id whose pool rolled into this one (no entries)
      settled_at INTEGER,
      PRIMARY KEY (id, token)
    );
    CREATE TABLE IF NOT EXISTS lottery_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      email TEXT NOT NULL,             -- handle or pubkey, same convention as bets
      amount_base TEXT NOT NULL,
      tickets INTEGER NOT NULL,
      at_ms INTEGER NOT NULL,
      tx_key TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_lot_entries_round ON lottery_entries(round_id, token);
    CREATE TABLE IF NOT EXISTS lottery_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      place INTEGER NOT NULL,           -- 1 | 2 | 3 | 0 = facilitator
      email TEXT NOT NULL,
      amount_base TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lot_winners_round ON lottery_winners(round_id, token);
  `);

  _db = d;
  return d;
}
