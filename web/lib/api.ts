export async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.href = "/login";
    throw new Error("Not authenticated");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export function fmtRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-08-24 13:37" -> "24 Agu · 13:37" */
export function fmtDate(raw: string) {
  const s = String(raw || "");
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return s.slice(0, 10);
  const [, , mo, d, hh, mm] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} · ${hh}:${mm}`;
}
