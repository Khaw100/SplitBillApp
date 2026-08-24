"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fmtRp } from "@/lib/api";

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/share/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Not found");
        return r.json();
      })
      .then(setSnap)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🧾</p>
          <p className="text-sm text-zinc-400">{error}</p>
          <p className="text-xs text-zinc-600 mt-1">This link is invalid or has expired.</p>
        </div>
      </main>
    );

  if (!snap)
    return <main className="min-h-screen flex items-center justify-center text-sm text-zinc-500">Loading…</main>;

  const perPerson = snap.total / Math.max(1, snap.result.length);

  return (
    <main className="min-h-screen max-w-xl mx-auto px-4 py-10">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-zinc-100">{snap.title}</h1>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5">
            shared
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">Split result · read-only</p>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card label="People" value={String(snap.result.length)} />
        <Card label="Grand total" value={fmtRp(snap.total)} accent />
        <Card label="Per person" value={fmtRp(perPerson)} />
      </div>

      <div className="space-y-4">
        {snap.result.map((p: any) => (
          <div key={p.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-200">{p.name}</h2>
              <p className="text-sm">
                <span className="text-zinc-500 text-xs mr-2">TOTAL</span>
                <span className="font-bold text-blue-400">{fmtRp(p.total)}</span>
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {p.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 text-zinc-300">
                      {l.name}
                      {l.shared_by > 1 && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/80">÷{l.shared_by}</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-zinc-500">{l.qty}×</td>
                    <td className="py-2 text-right text-zinc-400">{fmtRp(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-zinc-600 mt-2">
              subtotal {fmtRp(p.subtotal)} · others* {fmtRp(p.others)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-700 mt-4">*tax, service, discount etc.</p>

      <footer className="mt-10 text-center">
        <a href="/" className="text-xs text-blue-400 hover:text-blue-300">
          💵 Split your own bill →
        </a>
      </footer>
    </main>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-blue-950/20 border-blue-900/60" : "bg-zinc-900 border-zinc-800"}`}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">{label}</p>
      <p className={`font-bold ${accent ? "text-blue-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}
