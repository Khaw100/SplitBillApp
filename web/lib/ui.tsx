"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/* ── Icons (inline, 1.75 stroke) ─────────────────────────────────────────── */

type IconProps = { size?: number; className?: string };
const svg = (path: ReactNode) =>
  function Icon({ size = 20, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const ArrowLeft = svg(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>);
export const ArrowRight = svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
export const ChevronRight = svg(<path d="m9 18 6-6-6-6" />);
export const Plus = svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Check = svg(<path d="M20 6 9 17l-5-5" />);
export const Close = svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const Copy = svg(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </>
);
export const LinkIcon = svg(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>
);
export const Share = svg(
  <>
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <path d="M16 6l-4-4-4 4" />
    <path d="M12 2v13" />
  </>
);
export const Receipt = svg(
  <>
    <path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Z" />
    <path d="M9 8h6" /><path d="M9 12h6" />
  </>
);
export const Camera = svg(
  <>
    <path d="M14.5 4h-5L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-1.5-3Z" />
    <circle cx="12" cy="13" r="3.5" />
  </>
);
export const Upload = svg(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 9 5-5 5 5" /><path d="M12 4v12" />
  </>
);
export const Users = svg(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>
);
export const Settings = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </>
);
export const Wallet = svg(
  <>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5" />
    <circle cx="16" cy="12" r="1" />
  </>
);
export const Download = svg(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" /><path d="M12 15V3" />
  </>
);
export const Trash = svg(
  <>
    <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </>
);
export const Logout = svg(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
  </>
);
export const WhatsApp = svg(<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-5A8.4 8.4 0 1 1 21 11.5Z" />);

/* ── Bits ───────────────────────────────────────────────────────────────── */

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="SplitBill">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-zinc-100 text-[15px] font-bold text-zinc-900">
        ÷
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-zinc-100">splitbill</span>
      )}
    </Link>
  );
}

export function AppHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="flex min-w-0 items-center gap-2.5">
        {back && (
          <Link href={back} className="icon-btn" aria-label="Kembali">
            <ArrowLeft size={18} />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="topbar-title truncate">{title}</h1>
          {subtitle && <p className="topbar-sub truncate">{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-zinc-600">{icon}</div>}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {body && <p className="max-w-[22rem] text-xs leading-relaxed text-zinc-500">{body}</p>}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="spin inline-block rounded-full border-2 border-zinc-700 border-t-zinc-300"
      style={{ width: size, height: size }}
    />
  );
}
