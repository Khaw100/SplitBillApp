"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtDate, fmtMoney } from "@/lib/api";
import { Alert, Container, Icon, Skeleton, TopBar, btn } from "@/components/ui";

type BillRow = { id: string; title: string; currency: string; total: number; created_at: string; people?: number };

export default function Dashboard() {
  const router = useRouter();
  const [bills, setBills] = useState<BillRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    api("/bills")
      .then(setBills)
      .catch((e) => {
        setError(e.message);
        setBills([]);
      });
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    router.replace("/login");
  };

  const remove = async (b: BillRow) => {
    if (!confirm(`Delete "${b.title}"? Shared links for this bill will stop working.`)) return;
    setDeleting(b.id);
    try {
      await api(`/bills/${b.id}`, { method: "DELETE" });
      setBills((prev) => (prev || []).filter((x) => x.id !== b.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const filtered = useMemo(
    () => (bills || []).filter((b) => b.title.toLowerCase().includes(query.trim().toLowerCase())),
    [bills, query]
  );
  const totalSpent = (bills || []).reduce((a, b) => a + (b.total || 0), 0);

  return (
    <>
      <TopBar
        title="SplitBill"
        subtitle="Split receipts with friends"
        right={
          <button onClick={logout} className={btn.ghost} aria-label="Log out">
            <Icon name="logout" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        }
      />

      <Container className="py-6 sm:py-10 pb-28 lg:pb-10">
        {/* Hero / CTA */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr] mb-8">
          <Link
            href="/new"
            className="group relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-zinc-900 p-6 sm:p-8 transition-colors hover:border-emerald-400/60"
          >
            <span className="inline-grid place-items-center size-12 rounded-2xl bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/30 mb-5">
              <Icon name="camera" className="size-6" />
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-50">New split</h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-sm">
              Snap or upload a receipt — AI reads the items, you pick who ordered what.
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 group-hover:gap-2.5 transition-all">
              Start now <Icon name="arrow" />
            </span>
          </Link>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col justify-between">
              <Icon name="receipt" className="size-5 text-zinc-500" />
              <div className="mt-6">
                <p className="text-2xl sm:text-3xl font-bold text-zinc-50 tabular-nums">{bills ? bills.length : "–"}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Bills split</p>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col justify-between min-w-0">
              <Icon name="sparkles" className="size-5 text-zinc-500" />
              <div className="mt-6 min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-zinc-50 tabular-nums truncate">{bills ? fmtMoney(totalSpent) : "–"}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Total tracked</p>
              </div>
            </div>
          </div>
        </section>

        {/* List */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">Past bills</h2>
            {bills && bills.length > 3 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bills…"
                className="w-full sm:w-64 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 h-10 text-base sm:text-sm placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60"
              />
            )}
          </div>

          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}

          {bills === null ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[84px]" />
              ))}
            </div>
          ) : bills.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-800 p-10 text-center">
              <Icon name="receipt" className="size-8 mx-auto text-zinc-700" />
              <p className="text-sm text-zinc-400 mt-3">No bills yet</p>
              <p className="text-xs text-zinc-600 mt-1">Upload your first receipt to get started.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center">No bills match “{query}”.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((b) => (
                <li key={b.id} className="group relative">
                  <Link
                    href={`/bill/${b.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700 pl-4 pr-14 py-3.5 transition-colors"
                  >
                    <span className="size-10 shrink-0 grid place-items-center rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500">
                      <Icon name="receipt" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">{b.title}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {fmtDate(b.created_at)}
                        {typeof b.people === "number" && ` · ${b.people} ${b.people === 1 ? "person" : "people"}`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300 tabular-nums whitespace-nowrap">
                      {fmtMoney(b.total, b.currency)}
                    </p>
                  </Link>
                  <button
                    onClick={() => remove(b)}
                    disabled={deleting === b.id}
                    aria-label={`Delete ${b.title}`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 size-9 grid place-items-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>

      {/* Mobile floating CTA */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-4 pb-safe-3 pt-3 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent">
        <Link href="/new" className={`${btn.primary} w-full`}>
          <Icon name="plus" /> New split
        </Link>
      </div>
    </>
  );
}
