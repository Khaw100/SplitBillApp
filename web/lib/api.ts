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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * SQLite `datetime('now')` is UTC without a zone marker → show in local time.
 * "2026-08-24 13:37:00" -> "24 Aug · 20:37" (in UTC+7)
 */
export function fmtDate(raw: string) {
  const s = String(raw || "");
  const d = new Date(s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
  if (isNaN(d.getTime())) return s.slice(0, 10);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:${mm}`;
}

/** RFC 4180 CSV cell. */
export function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  // BOM so Excel reads UTF-8 names correctly
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
