export function maskHandle(h: string): string {
  if (!h) return h;
  if (h.includes("@")) {
    const [u, d] = h.split("@");
    return `${u.slice(0, 2)}***@${d}`;
  }
  // pubkey / non-email handle — show head…tail
  if (h.length > 10) return `${h.slice(0, 4)}…${h.slice(-4)}`;
  return h;
}
