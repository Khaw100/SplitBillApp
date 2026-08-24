"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtRp } from "@/lib/api";

export default function Dashboard() {
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);

  useEffect(() => {
    api("/bills").then(setBills).catch(() => {});
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
  };

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">SplitBillApp</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Split receipts with friends</p>
        </div>
        <button
          onClick={logout}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg px-3 py-1.5"
        >
          Logout
        </button>
      </header>

      <Link
        href="/new"
        className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 mb-8 transition-colors"
      >
        + New Split
      </Link>

      <h2 className="text-sm uppercase tracking-widest text-zinc-500 font-semibold mb-3">
        Past bills
      </h2>
      {bills.length === 0 ? (
        <p className="text-sm text-zinc-600 border border-dashed border-zinc-800 rounded-xl p-8 text-center">
          No bills yet — upload your first receipt.
        </p>
      ) : (
        <ul className="space-y-2">
          {bills.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bill/${b.id}`}
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{b.title}</p>
                  <p className="text-xs text-zinc-500">{String(b.created_at).slice(0, 16).replace("T", " ")}</p>
                </div>
                <p className="text-sm font-semibold text-blue-400">{fmtRp(b.total)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
