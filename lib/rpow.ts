import { tokenBySlug, type TokenSlug } from "./config";

export type ActivityItem = {
  type: "receive" | "send";
  amount_base_units: string;
  counterparty_email: string;
  at: string;
};

export type Side = "up" | "down" | "invalid";

function baseToDisplay(amountBase: string): number {
  // 1 rPOW = 10^9 base units. Use Number — safe up to ~9e6 rPOW.
  return Number(BigInt(amountBase)) / 1e9;
}

function buildSendBody(
  slug: TokenSlug,
  recipient: string,
  amountBase: string,
  idempotencyKey: string
): Record<string, unknown> {
  if (slug === "rpow2") {
    return { recipient_email: recipient, amount_base_units: amountBase, idempotency_key: idempotencyKey };
  }
  if (slug === "rpow3") {
    // rpow3 accepts integer rPOW amounts only; floor and let dust stay in the banker.
    return { recipient_email: recipient, amount: Math.floor(baseToDisplay(amountBase)), idempotency_key: idempotencyKey };
  }
  // rpow4: signed transfer with pubkey recipient
  const payload: Record<string, unknown> = {
    recipient_pubkey: recipient,
    amount_base_units: amountBase,
    idempotency_key: idempotencyKey,
  };
  // dynamic require to avoid forcing rpow4 deps at module load
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rpow4Sign } = require("./rpow4Sign") as typeof import("./rpow4Sign");
  return { ...payload, client_signature_base58: rpow4Sign("transfer", payload) };
}

function authHeaders(slug: TokenSlug): Record<string, string> {
  const t = tokenBySlug(slug);
  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (rpowMarket) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  };
  if (!t) return h;
  if (t.cookie) h["Cookie"] = t.cookie;
  if (t.token) h["Authorization"] = `Bearer ${t.token}`;
  return h;
}

export async function fetchActivity(slug: TokenSlug): Promise<ActivityItem[]> {
  const t = tokenBySlug(slug);
  if (!t || !t.enabled) return [];
  const r = await fetch(`${t.apiBase}/activity`, {
    cache: "no-store",
    headers: authHeaders(slug),
  });
  if (!r.ok) throw new Error(`${slug} activity ${r.status}`);
  const raw = (await r.json()) as unknown;
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] }).items)
    ? (raw as { items: any[] }).items
    : [];
  return list.map((it: any): ActivityItem => {
    const baseUnits =
      it.amount_base_units != null
        ? String(it.amount_base_units)
        : typeof it.amount === "number"
        ? BigInt(Math.round(it.amount * 1e9)).toString()
        : "0";
    const counterparty =
      it.counterparty_email ?? it.counterparty_pubkey ?? it.counterparty_display_name ?? "";
    return {
      type: it.type,
      amount_base_units: baseUnits,
      counterparty_email: counterparty,
      at: it.at,
    };
  });
}

// Bet side = parity of last NON-ZERO digit of amount_base_units.
export const RPOW_DECIMALS = 9;
export function sideFromAmount(amountBase: string): Side {
  if (!/^\d+$/.test(amountBase)) return "invalid";
  const trimmed = amountBase.replace(/0+$/, "");
  if (trimmed === "" || trimmed === "0") return "invalid";
  const lastDigit = Number(trimmed[trimmed.length - 1]);
  if (lastDigit % 2 === 1) return "up";
  return "down";
}

export function txKey(slug: TokenSlug, item: ActivityItem): string {
  return `${slug}|${item.counterparty_email}|${item.at}|${item.amount_base_units}`;
}

export async function sendRpow(
  slug: TokenSlug,
  toEmail: string,
  amountBase: string,
  idempotencyKey: string
): Promise<{ ok: boolean; transferId?: string; error?: string }> {
  const t = tokenBySlug(slug);
  if (!t || !t.enabled) return { ok: false, error: "token not configured" };
  if (!t.cookie && !t.token) return { ok: false, error: "no auth" };
  try {
    const r = await fetch(`${t.apiBase}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(slug),
      },
      body: JSON.stringify(buildSendBody(slug, toEmail, amountBase, idempotencyKey)),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, error: `${r.status} ${text}` };
    let j: { ok?: boolean; transfer_id?: string } = {};
    try {
      j = JSON.parse(text);
    } catch {}
    if (j.ok === false) return { ok: false, error: text };
    return { ok: true, transferId: j.transfer_id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
