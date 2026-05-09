import { cfg } from "./config";

export type ActivityItem = {
  type: "receive" | "send";
  amount_base_units: string;
  counterparty_email: string;
  at: string; // ISO
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.rpowCookie) h["Cookie"] = cfg.rpowCookie;
  if (cfg.rpowToken) h["Authorization"] = `Bearer ${cfg.rpowToken}`;
  return h;
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const r = await fetch(`${cfg.rpowBase}/activity`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`rpow activity ${r.status}`);
  return (await r.json()) as ActivityItem[];
}

export type Side = "up" | "down" | "invalid";

// Bet side = parity of last NON-ZERO digit of amount_base_units.
// Works for whole or fractional rPOW (e.g. 0.001247 base=1247000 → last non-zero "7" → odd → UP).
export const RPOW_DECIMALS = 9;
export function sideFromAmount(amountBase: string): Side {
  if (!/^\d+$/.test(amountBase)) return "invalid";
  const trimmed = amountBase.replace(/0+$/, "");
  if (trimmed === "" || trimmed === "0") return "invalid";
  const lastDigit = Number(trimmed[trimmed.length - 1]);
  if (lastDigit % 2 === 1) return "up";
  return "down";
}

export function txKey(item: ActivityItem): string {
  return `${item.counterparty_email}|${item.at}|${item.amount_base_units}`;
}

// POST /send  body: { recipient_email, amount_base_units, idempotency_key }
// resp: { ok, transferred_base_units, recipient_email, transfer_id }
export async function sendRpow(
  toEmail: string,
  amountBase: string,
  idempotencyKey: string
): Promise<{ ok: boolean; transferId?: string; error?: string }> {
  if (!cfg.rpowToken && !cfg.rpowCookie) return { ok: false, error: "no auth" };
  try {
    const r = await fetch(`${cfg.rpowBase}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        recipient_email: toEmail,
        amount_base_units: amountBase,
        idempotency_key: idempotencyKey,
      }),
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
