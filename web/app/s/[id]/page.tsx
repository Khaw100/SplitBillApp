"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fmtDate, fmtRp } from "@/lib/api";
import { copyText, generalMessage } from "@/lib/share";
import { Avatar, Check, Copy, Logo, Share, Spinner, Wallet } from "@/lib/ui";

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/share/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Invalid link");
        return r.json();
      })
      .then(setSnap)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-zinc-300">{error}</p>
        <p className="text-xs text-zinc-500">This link doesn&apos;t exist or the bill was deleted.</p>
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

  const flash = (tag: string) => {
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1600);
  };

  const copySummary = async () => {
    const ok = await copyText(
      generalMessage({
        title: snap.title,
        total: snap.total,
        people: people.map((p: any) => ({ name: p.name, total: p.total })),
        host,
        url: location.href,
      })
    );
    if (ok) flash("summary");
  };

  return (
    <main className="page page-wide">
      <header className="topbar">
        <div className="min-w-0">
          <p className="label">Split result</p>
          <h1 className="topbar-title truncate">{snap.title}</h1>
        </div>
        <Logo compact />
      </header>

      <div className="lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
        <aside className="side-sticky mb-5 lg:mb-0">
          <section className="card p-5">
            <p className="label">Bill total</p>
            <p className="money-xl mt-2">{fmtRp(snap.total)}</p>
            <p className="mt-2 text-[11px] text-zinc-500">
              {people.length} {people.length === 1 ? "person" : "people"} · {fmtDate(snap.created_at)}
            </p>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
                <Wallet size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">
                  {host?.is_owner ? "Transfer to " : "Pay "}
                  {host?.name || "the host"}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {host?.is_owner ? "payment details below" : "directly, in person"}
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
                      {a.holder && <p className="mt-0.5 text-[11px] text-zinc-600">{a.holder}</p>}
                    </div>
                    <button
                      onClick={async () => (await copyText(a.number)) && flash(a.number)}
                      className="btn btn-secondary btn-sm"
                    >
                      {copied === a.number ? <Check size={13} /> : <Copy size={13} />}
                      {copied === a.number ? "Copied" : "Copy"}
                    </button>
                  </div>
                ))}
                {host.phone && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">Phone / WhatsApp</p>
                      <p className="num mt-0.5 text-sm text-zinc-100">{host.phone}</p>
                    </div>
                    <button
                      onClick={async () => (await copyText(host.phone)) && flash("phone")}
                      className="btn btn-secondary btn-sm"
                    >
                      {copied === "phone" ? <Check size={13} /> : <Copy size={13} />}
                      {copied === "phone" ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-t border-[var(--line)] px-4 py-3">
                <p className="text-[12px] leading-relaxed text-zinc-400">
                  Pay <span className="text-zinc-100">{host?.name || "the host"}</span> directly.
                </p>
              </div>
            )}
          </section>

          <button onClick={copySummary} className="btn btn-secondary btn-block hidden lg:inline-flex">
            {copied === "summary" ? <Check size={15} /> : <Share size={15} />}
            {copied === "summary" ? "Summary copied" : "Copy summary"}
          </button>
        </aside>

        <section className="min-w-0">
          <h2 className="label mb-2">Breakdown</h2>
          <ul className="grid items-start gap-2 xl:grid-cols-2">
            {people.map((p: any) => (
              <li key={p.name} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {p.lines.length} {p.lines.length === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <p className="num shrink-0 text-[15px] font-semibold text-zinc-100">{fmtRp(p.total)}</p>
                </div>
                <details className="border-t border-[var(--line)]">
                  <summary className="cursor-pointer px-4 py-2 text-[11px] text-zinc-500 hover:text-zinc-300">
                    Show items
                  </summary>
                  <div className="px-4 pb-3">
                    {p.lines.map((l: any, i: number) => (
                      <div key={i} className="flex items-baseline justify-between gap-3 py-1">
                        <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-400">
                          {l.name}
                          {l.units > l.qty && (
                            <span className="ml-1.5 text-[10px] text-zinc-600">
                              ({l.qty}/{l.units})
                            </span>
                          )}
                        </p>
                        <p className="num text-[12px] text-zinc-500">{fmtRp(l.line_total)}</p>
                      </div>
                    ))}
                    <div className="mt-2 flex items-baseline justify-between border-t border-[var(--line)] pt-2">
                      <p className="text-[12px] text-zinc-500">Items {fmtRp(p.subtotal)}</p>
                      <p className="text-[12px] text-zinc-500">Tax/other {fmtRp(p.others)}</p>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>

          <button onClick={copySummary} className="btn btn-secondary btn-block mt-5 lg:hidden">
            {copied === "summary" ? <Check size={15} /> : <Share size={15} />}
            {copied === "summary" ? "Summary copied" : "Copy summary"}
          </button>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-600">
            Read-only page · made with splitbill
          </p>
        </section>
      </div>
    </main>
  );
}
