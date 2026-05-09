import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import nacl from "tweetnacl";
import bs58 from "bs58";

let cachedKey: nacl.SignKeyPair | null = null;
let cachedMnemonic = "";

function loadKeypair(): nacl.SignKeyPair {
  const mnemonic = (process.env.RPOW4_SEED ?? "").trim();
  if (!mnemonic) throw new Error("RPOW4_SEED not set");
  if (cachedKey && cachedMnemonic === mnemonic) return cachedKey;
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const { key } = derivePath("m/44'/501'/0'/0'", seed.toString("hex"));
  cachedKey = nacl.sign.keyPair.fromSeed(key);
  cachedMnemonic = mnemonic;
  return cachedKey;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function canonicalJson(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "bigint") return JSON.stringify(v.toString());
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("non-finite");
    return JSON.stringify(v);
  }
  if (typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (isPlainObject(v)) {
    const keys = Object.keys(v).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const x = v[k];
      if (x === undefined || typeof x === "function" || typeof x === "symbol") continue;
      parts.push(JSON.stringify(k) + ":" + canonicalJson(x));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error("canonicalJson: unsupported");
}

export function rpow4Pubkey(): string {
  return bs58.encode(loadKeypair().publicKey);
}

export function rpow4Sign(domain: string, payload: Record<string, unknown>): string {
  const kp = loadKeypair();
  const msg = `rpow4.${domain}.v1\n${canonicalJson(payload)}`;
  const sig = nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey);
  return bs58.encode(sig);
}
