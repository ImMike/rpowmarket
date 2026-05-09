import { tokenBySlug, type TokenSlug } from "./config";

export type ActivityItem = {
  type: "receive" | "send";
  amount_base_units: string;
  counterparty_email: string;
  at: string;
};

export type Side = "up" | "down" | "invalid";

function authHeaders(slug: TokenSlug): Record<string, string> {
  const t = tokenBySlug(slug);
  const h: Record<string, string> = {};
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
  return (await r.json()) as ActivityItem[];
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
