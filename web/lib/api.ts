export async function api(path: string, opts: RequestInit = {}) {
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...opts,
    // merge AFTER spreading opts so caller headers don't wipe the defaults;
    // never force a JSON content-type on multipart uploads
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(opts.headers || {}) },
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.href = "/login";
    throw new Error("Not authenticated");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : null;
    throw new Error(detail || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export function fmtMoney(n: number, currency = "Rp") {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(v).toLocaleString("id-ID")}`;
}

/** Back-compat alias */
export const fmtRp = (n: number) => fmtMoney(n, "Rp");

/** SQLite `datetime('now')` is UTC without a zone marker → show in local time. */
export function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Clipboard API is unavailable on plain-http origins → fall back to execCommand. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "bg-teal-500/15 text-teal-300 ring-teal-500/30",
  "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  "bg-lime-500/15 text-lime-300 ring-lime-500/30",
];

export function avatarColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
