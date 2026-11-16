"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtDate, fmtRp } from "@/lib/api";
import { ChevronRight, EmptyState, Logo, Logout, Plus, Receipt, Settings } from "@/lib/ui";

export default function Dashboard() {
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/bills")
      .then(setBills)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/login");
  };

  const total = bills.reduce((s, b) => s + (b.total || 0), 0);
  const thisMonth = bills.filter((b) =>
    String(b.created_at).slice(0, 7) === new Date().toISOString().slice(0, 7)
  ).length;

  return (
    <main className="page">
      <header className="topbar">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/settings" className="icon-btn" aria-label="Pengaturan">
            <Settings size={17} />
          </Link>
          <button onClick={logout} className="icon-btn" aria-label="Keluar">
            <Logout size={17} />
          </button>
        </div>
      </header>

      <section className="pt-2 pb-6">
        <p className="label">Total tagihan</p>
        <p className="money-xl mt-2">{fmtRp(total)}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {bills.length} bill tercatat{thisMonth ? ` · ${thisMonth} bulan ini` : ""}
        </p>
      </section>

      <Link href="/new" className="btn btn-primary btn-block mb-8">
        <Plus size={18} />
        Split bill baru
      </Link>

      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="label">Riwayat</h2>
        {bills.length > 0 && (
          <span className="text-[11px] text-zinc-600">{bills.length} bill</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[4.25rem]" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title="Belum ada bill"
          body="Foto struk pertama kamu, bagi ke teman-teman, lalu kirim link pembayarannya."
        />
      ) : (
        <ul className="space-y-2">
          {bills.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bill/${b.id}`}
                className="card flex items-center gap-3 px-4 py-3.5 transition-colors hover:border-zinc-700"
              >
                <span className="avatar">
                  <Receipt size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {b.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                    {fmtDate(b.created_at)}
                    {b.host_is_owner === 0 ? ` · host ${b.host_name}` : ""}
                  </span>
                </span>
                <span className="num shrink-0 text-sm font-semibold text-zinc-200">
                  {fmtRp(b.total)}
                </span>
                <ChevronRight size={16} className="shrink-0 text-zinc-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
