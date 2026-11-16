"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fmtRp } from "@/lib/api";
import { copyText, generalMessage } from "@/lib/share";
import { Avatar, Check, Copy, Logo, Share, Spinner, Wallet } from "@/lib/ui";

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/share/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Link tidak valid");
        return r.json();
      })
      .then(setSnap)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-zinc-300">{error}</p>
        <p className="text-xs text-zinc-500">Link ini tidak ada atau sudah kedaluwarsa.</p>
      </main>
    );

  if (!snap)
    return (
      <main className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size={20} />
      </main>
    );

  const host = snap.host;
  const people = snap.result || [];

  const copySummary = async () => {
    await copyText(
      generalMessage({
        title: snap.title,
        total: snap.total,
        people: people.map((p: any) => ({ name: p.name, total: p.total })),
        host,
        url: location.href,
      })
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="page">
      <header className="topbar">
        <div className="min-w-0">
          <p className="label">Hasil split</p>
          <h1 className="topbar-title truncate">{snap.title}</h1>
        </div>
        <Logo compact />
      </header>

      <section className="card mb-3 p-5">
        <p className="label">Total bill</p>
        <p className="money-xl mt-2">{fmtRp(snap.total)}</p>
        <p className="mt-2 text-[11px] text-zinc-500">
          {people.length} orang · {String(snap.created_at || "").slice(0, 10)}
        </p>
      </section>

      <section className="card mb-5 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
            <Wallet size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">
              {host?.is_owner ? "Transfer ke " : "Bayar ke "}
              {host?.name || "host"}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {host?.is_owner ? "info rekening di bawah" : "langsung ke orangnya"}
            </p>
          </div>
        </div>

        {host?.is_owner && ((host.accounts || []).length > 0 || host.phone) ? (
          <div className="border-t border-[var(--line)]">
            {(host.accounts || []).map((a: any) => (
              <div
                key={a.label + a.number}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">{a.label}</p>
                  <p className="num mt-0.5 truncate text-sm text-zinc-100">{a.number}</p>
                  {a.holder && <p className="mt-0.5 text-[11px] text-zinc-600">a/n {a.holder}</p>}
                </div>
                <button
                  onClick={() => copyText(a.number)}
                  className="btn btn-secondary btn-sm"
                  aria-label="Salin"
                >
                  <Copy size={13} /> Salin
                </button>
              </div>
            ))}
            {host.phone && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Nomor HP / WA</p>
                  <p className="num mt-0.5 text-sm text-zinc-100">{host.phone}</p>
                </div>
                <button onClick={() => copyText(host.phone)} className="btn btn-secondary btn-sm">
                  <Copy size={13} /> Salin
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-[var(--line)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              Bayar langsung ke <span className="text-zinc-100">{host?.name || "host"}</span>.
            </p>
          </div>
        )}
      </section>

      <h2 className="label mb-2">Pembagian</h2>
      <ul className="space-y-2">
        {people.map((p: any) => (
          <li key={p.name} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar name={p.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{p.lines.length} item</p>
              </div>
              <p className="num shrink-0 text-[15px] font-semibold text-zinc-100">
                {fmtRp(p.total)}
              </p>
            </div>
            <details className="border-t border-[var(--line)]">
              <summary className="cursor-pointer px-4 py-2 text-[11px] text-zinc-500 hover:text-zinc-300">
                Lihat rincian item
              </summary>
              <div className="px-4 pb-3">
                {p.lines.map((l: any, i: number) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-1">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-400">
                      {l.name}
                      {l.shared_by > 1 && (
                        <span className="ml-1.5 text-[10px] text-zinc-600">÷{l.shared_by}</span>
                      )}
                    </p>
                    <p className="num text-[12px] text-zinc-500">{fmtRp(l.line_total)}</p>
                  </div>
                ))}
                <div className="mt-2 flex items-baseline justify-between border-t border-[var(--line)] pt-2">
                  <p className="text-[12px] text-zinc-500">Item {fmtRp(p.subtotal)}</p>
                  <p className="text-[12px] text-zinc-500">Pajak/lainnya {fmtRp(p.others)}</p>
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <button onClick={copySummary} className="btn btn-secondary btn-block mt-5">
        {copied ? <Check size={15} /> : <Share size={15} />}
        {copied ? "Ringkasan disalin" : "Salin ringkasan"}
      </button>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-600">
        Halaman ini hanya bisa dilihat, tidak bisa diubah. Dibuat dengan splitbill.
      </p>
    </main>
  );
}
