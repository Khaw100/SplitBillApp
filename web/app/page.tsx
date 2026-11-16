"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtDate, fmtRp } from "@/lib/api";
import { ChevronRight, EmptyState, Logo, Logout, Plus, Receipt } from "@/lib/ui";
import { SpotlightCard } from "@/components/spotlight-card";
import { NumberTicker } from "@/components/number-ticker";

export default function Dashboard() {
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api("/bills")
      .then(setBills)
      .catch((e) => setError(e.message || "Couldn't load your bills"))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    router.replace("/login");
  };

  const total = bills.reduce((s, b) => s + (b.total || 0), 0);
  const thisMonth = bills.filter(
    (b) => String(b.created_at).slice(0, 7) === new Date().toISOString().slice(0, 7)
  ).length;
  const q = query.trim().toLowerCase();
  const shown = q ? bills.filter((b) => String(b.title).toLowerCase().includes(q)) : bills;

  return (
    <main className="page page-wide">
      <header className="topbar">
        <Logo />
        <button onClick={logout} className="icon-btn" aria-label="Log out" title="Log out">
          <Logout size={17} />
        </button>
      </header>

      <div className="lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
        {/* Summary + CTA (sticky sidebar on desktop) */}
        <aside className="side-sticky mb-8 lg:mb-0">
          <SpotlightCard className="p-5">
            <div className="dot-grid mask-fade-b pointer-events-none absolute inset-0 opacity-80" />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(59,130,246,0.24), transparent 68%)",
                filter: "blur(4px)",
              }}
            />
            <div className="relative z-[1]">
              <div className="flex items-center justify-between">
                <p className="label">Total billed</p>
                <span className="tag">
                  {bills.length} {bills.length === 1 ? "bill" : "bills"}
                </span>
              </div>
              <NumberTicker value={total} format={fmtRp} className="money-xl mt-2 block" />
              <p className="mt-2 text-xs text-zinc-500">
                {bills.length === 0
                  ? "no bills yet"
                  : `${bills.length} recorded${thisMonth ? ` · ${thisMonth} this month` : ""}`}
              </p>
            </div>
          </SpotlightCard>

          <Link href="/new" className="btn btn-primary btn-shine btn-block">
            <Plus size={18} />
            New split
          </Link>
        </aside>

        {/* History */}
        <section className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="label">History</h2>
            {bills.length > 4 ? (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search bills"
                className="input !h-8 !w-40 text-xs sm:!w-56"
              />
            ) : (
              bills.length > 0 && <span className="text-[11px] text-zinc-600">{bills.length} bills</span>
            )}
          </div>

          {error && (
            <p className="mb-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="grid gap-2 xl:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-[4.25rem]" />
              ))}
            </div>
          ) : bills.length === 0 ? (
            <EmptyState
              icon={<Receipt size={26} />}
              title="No bills yet"
              body="Snap your first receipt, split it with friends, then send each of them their payment link."
            />
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No bills match “{query}”.</p>
          ) : (
            <ul className="grid gap-2 xl:grid-cols-2">
              {shown.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/bill/${b.id}`}
                    className="card flex items-center gap-3 px-4 py-3.5 transition-colors hover:border-zinc-700"
                  >
                    <span className="avatar">
                      <Receipt size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">{b.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                        {fmtDate(b.created_at)}
                        {b.host_is_owner === 0 ? ` · host ${b.host_name}` : ""}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-zinc-200">{fmtRp(b.total)}</span>
                    <ChevronRight size={16} className="shrink-0 text-zinc-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
