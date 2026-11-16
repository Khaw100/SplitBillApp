"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fmtDate, fmtMoney } from "@/lib/api";
import type { PersonResult } from "@/lib/split";
import { CenterMessage, Container, Logo, PersonCard, Skeleton, SummaryPanel } from "@/components/ui";

type Snapshot = { title: string; currency: string; total: number; created_at: string; result: PersonResult[] };

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

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

  const header = (
    <header className="border-b border-zinc-900 pt-safe">
      <Container className="h-16 flex items-center gap-3">
        <Logo />
        <span className="font-semibold text-zinc-100">SplitBill</span>
        <span className="ml-auto text-[11px] font-medium text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-2.5 py-1">
          Read-only
        </span>
      </Container>
    </header>
  );

  if (error)
    return (
      <>
        {header}
        <CenterMessage title="Link not available">
          This share link is invalid or the bill was deleted.
        </CenterMessage>
      </>
    );

  if (!snap)
    return (
      <>
        {header}
        <Container className="py-8 max-w-3xl space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40" />
          <Skeleton className="h-48" />
        </Container>
      </>
    );

  const cur = snap.currency || "Rp";
  const visible = me ? snap.result.filter((p) => p.name === me) : snap.result;

  return (
    <>
      {header}
      <Container className="py-8 pb-16 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 break-words">{snap.title}</h1>
          <p className="text-sm text-zinc-500 mt-1">Split result · {fmtDate(snap.created_at)}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_300px] md:items-start">
          <aside className="space-y-4 md:sticky md:top-6 md:order-last">
            <SummaryPanel total={snap.total} people={snap.result.length} currency={cur} />
          </aside>

          <section className="min-w-0">
            {snap.result.length > 1 && (
              <div className="mb-4">
                <p className="text-xs text-zinc-500 mb-2">Find your name</p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                  {[null, ...snap.result.map((p) => p.name)].map((n) => (
                    <button
                      key={n ?? "__all"}
                      onClick={() => setMe(n)}
                      className={`shrink-0 h-9 rounded-full px-3.5 text-sm border transition-colors ${
                        me === n
                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-200"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {n ?? "Everyone"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {visible.map((p) => (
                <PersonCard key={p.name} p={p} currency={cur} />
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-4">
              Tax, service and discounts are split proportionally to what each person ordered.
            </p>

            {me && (
              <p className="mt-6 text-center text-sm text-zinc-400">
                You owe <span className="font-semibold text-emerald-300">{fmtMoney(visible[0]?.total || 0, cur)}</span>
              </p>
            )}
          </section>
        </div>

        <footer className="mt-12 text-center">
          <a href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            Split your own bill →
          </a>
        </footer>
      </Container>
    </>
  );
}
