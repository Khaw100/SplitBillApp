"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { avatarColor, fmtMoney, initials } from "@/lib/api";
import type { PersonResult } from "@/lib/split";

/* ── Icons (inline, lucide-style strokes) ─────────────────────────────────── */

const PATHS: Record<string, ReactNode> = {
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  pencil: <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  back: <path d="m15 18-6-6 6-6" />,
  arrow: <path d="M5 12h14m-7-7 7 7-7 7" />,
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  receipt: (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  sparkles: <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />,
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </>
  ),
};

export function Icon({ name, className = "size-4" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ── Buttons ───────────────────────────────────────────────────────────────── */

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60";

export const btn = {
  primary: `${BTN_BASE} bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-500/20 px-5 h-12 text-sm`,
  secondary: `${BTN_BASE} bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 px-4 h-11 text-sm`,
  ghost: `${BTN_BASE} text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 px-3 h-10 text-sm`,
  icon: `${BTN_BASE} size-10 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900`,
};

export const input =
  "w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 h-11 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20 transition-colors";

export const label = "block text-xs font-medium text-zinc-400 mb-1.5";

/* ── Layout ────────────────────────────────────────────────────────────────── */

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-12 rounded-2xl" : "size-9 rounded-xl";
  return (
    <span
      className={`${box} inline-grid place-items-center bg-gradient-to-br from-emerald-400 to-teal-600 text-emerald-950 shadow-lg shadow-emerald-500/20`}
    >
      <Icon name="receipt" className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

export function TopBar({
  title,
  subtitle,
  back,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-xl pt-safe">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-3">
        {back ? (
          <Link href={back} className={btn.icon} aria-label="Back">
            <Icon name="back" className="size-5" />
          </Link>
        ) : (
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base sm:text-lg font-semibold text-zinc-100">{title}</h1>
          {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  const width = /(^|\s)max-w-/.test(className) ? "" : "max-w-6xl";
  return <div className={`mx-auto ${width} px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Sticky action bar on mobile, plain inline block on desktop (lg+). */
export function ActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl px-4 pt-3 pb-safe-3 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none ${className}`}
    >
      {children}
    </div>
  );
}

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Scan receipt", "Assign people", "Report"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "todo";
        return (
          <li key={s} className="flex items-center gap-2 min-w-0">
            <span
              className={`size-6 shrink-0 rounded-full grid place-items-center font-semibold ${
                state === "done"
                  ? "bg-emerald-500 text-emerald-950"
                  : state === "now"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/50"
                    : "bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800"
              }`}
            >
              {state === "done" ? <Icon name="check" className="size-3.5" /> : n}
            </span>
            <span className={`truncate ${state === "now" ? "text-zinc-200 font-medium" : "text-zinc-500"} ${state !== "now" ? "hidden sm:inline" : ""}`}>
              {s}
            </span>
            {n < steps.length && <span className="w-4 sm:w-8 h-px bg-zinc-800 shrink-0" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────────────── */

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "warn" | "info" }) {
  const cls = {
    error: "text-red-300 bg-red-500/10 border-red-500/30",
    warn: "text-amber-300 bg-amber-500/10 border-amber-500/30",
    info: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 items-start text-sm border rounded-xl px-3.5 py-3 ${cls}`}>
      <Icon name="alert" className="size-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <span className={`${className} inline-block rounded-full border-2 border-current border-r-transparent animate-spin`} aria-hidden />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-zinc-900 ${className}`} />;
}

export function CenterMessage({ icon = "receipt", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <div className="text-center max-w-sm">
        <span className="inline-grid place-items-center size-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 mb-4">
          <Icon name={icon} className="size-6" />
        </span>
        <p className="text-base font-semibold text-zinc-200">{title}</p>
        {children && <div className="text-sm text-zinc-500 mt-1.5">{children}</div>}
      </div>
    </div>
  );
}

/* ── Data display ──────────────────────────────────────────────────────────── */

export function Avatar({ name, className = "size-9 text-xs" }: { name: string; className?: string }) {
  return (
    <span className={`${className} ${avatarColor(name)} shrink-0 inline-grid place-items-center rounded-full font-semibold ring-1`}>
      {initials(name) || "?"}
    </span>
  );
}

export function SummaryPanel({
  total,
  people,
  currency = "Rp",
}: {
  total: number;
  people: number;
  currency?: string;
}) {
  const per = total / Math.max(1, people);
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 p-5">
      <p className="text-xs font-medium text-emerald-300/80">Grand total</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-50 tabular-nums break-words">{fmtMoney(total, currency)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
        <div>
          <p className="text-xs text-zinc-500">People</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums">{people}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Average / person</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums truncate">{fmtMoney(per, currency)}</p>
        </div>
      </div>
    </div>
  );
}

export function PersonCard({ p, currency = "Rp" }: { p: PersonResult; currency?: string }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/80">
        <Avatar name={p.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100">{p.name}</h3>
          <p className="text-xs text-zinc-500">
            {p.lines.length} item{p.lines.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-base font-bold text-emerald-300 tabular-nums">{fmtMoney(p.total, currency)}</p>
      </header>
      {p.lines.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">No items assigned.</p>
      ) : (
        <ul className="divide-y divide-zinc-800/60 px-4">
          {p.lines.map((l, i) => (
            <li key={`${l.id}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-zinc-200 break-words">{l.name || "Untitled item"}</p>
                <p className="text-xs text-zinc-500">
                  {l.qty}× {fmtMoney(l.price, currency)}
                  {l.shared_by > 1 && (
                    <span className="ml-1.5 inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/20">
                      split ÷{l.shared_by}
                    </span>
                  )}
                </p>
              </div>
              <p className="text-zinc-300 tabular-nums whitespace-nowrap">{fmtMoney(l.line_total, currency)}</p>
            </li>
          ))}
        </ul>
      )}
      <footer className="flex justify-between gap-3 px-4 py-3 bg-zinc-950/40 text-xs text-zinc-500 tabular-nums">
        <span>Items {fmtMoney(p.subtotal, currency)}</span>
        <span>
          Tax/service {p.others >= 0 ? "+" : ""}
          {fmtMoney(p.others, currency)}
        </span>
      </footer>
    </article>
  );
}
