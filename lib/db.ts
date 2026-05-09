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
  d.exec(`CREATE INDEX IF NOT EXISTS idx_prices_ts ON prices(ts_ms)`);
  _db = d;
  return d;
}
