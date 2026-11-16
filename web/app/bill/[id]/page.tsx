"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, copyText, fmtDate, fmtMoney } from "@/lib/api";
import type { Item, PersonResult } from "@/lib/split";
import {
  ActionBar,
  Alert,
  CenterMessage,
  Container,
  Icon,
  PersonCard,
  Skeleton,
  Spinner,
  Stepper,
  SummaryPanel,
  TopBar,
  btn,
} from "@/components/ui";

type Bill = {
  id: string;
  title: string;
  currency: string;
  items: Item[];
  subtotal: number;
  total: number;
  participants: string[];
  created_at: string;
  result: PersonResult[];
};

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function BillReport() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api(`/bills/${id}`)
      .then(setBill)
      .catch((e) => setLoadError(e.message));
  }, [id]);

  if (loadError) {
    return (
      <>
        <TopBar title="Bill" back="/" />
        <CenterMessage title="Couldn't load this bill">
          <p>{loadError}</p>
          <Link href="/" className={`${btn.secondary} mt-5`}>
            Back to bills
          </Link>
        </CenterMessage>
      </>
    );
  }

  if (!bill) {
    return (
      <>
        <TopBar title="Loading…" back="/" />
        <Container className="py-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-56 order-first lg:order-none" />
        </Container>
      </>
    );
  }

  const cur = bill.currency || "Rp";
  const result = bill.result || [];

  const flash = (tag: string) => {
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1800);
  };

  const buildText = () => {
    const lines: string[] = [`🧾 ${bill.title} — split result`, ""];
    for (const p of result) {
      lines.push(`👤 ${p.name}: ${fmtMoney(p.total, cur)}`);
      for (const l of p.lines) {
        const shared = l.shared_by > 1 ? ` (÷${l.shared_by})` : "";
        lines.push(`   • ${l.name} ${l.qty}× — ${fmtMoney(l.line_total, cur)}${shared}`);
      }
      if (p.others) lines.push(`   + tax/service ${fmtMoney(p.others, cur)}`);
      lines.push("");
    }
    lines.push(`TOTAL: ${fmtMoney(bill.total, cur)}`);
    if (shareUrl) lines.push(`Details: ${shareUrl}`);
    return lines.join("\n");
  };

  const copyResult = async () => {
    if (await copyText(buildText())) flash("text");
    else setError("Couldn't access the clipboard.");
  };

  const downloadCsv = () => {
    const rows = [["participant", "item", "qty", "unit_price", "shared_by", "line_total"].join(",")];
    for (const p of result) {
      for (const l of p.lines) rows.push([p.name, l.name, l.qty, l.price, l.shared_by, l.line_total].map(csvCell).join(","));
      rows.push([p.name, "tax/service/discount", "", "", "", p.others].map(csvCell).join(","));
      rows.push([p.name, "TOTAL", "", "", "", p.total].map(csvCell).join(","));
    }
    // BOM so Excel opens UTF-8 names correctly
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bill.title.replace(/[^\w-]+/g, "_") || "bill"}_split.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getShareUrl = async () => {
    if (shareUrl) return shareUrl;
    const s = await api(`/bills/${id}/share`, { method: "POST" });
    const url = `${location.origin}/s/${s.share_id}`;
    setShareUrl(url);
    return url;
  };

  const share = async () => {
    setSharing(true);
    setError(null);
    try {
      const url = await getShareUrl();
      // Native share sheet on phones (WhatsApp, LINE, …); clipboard elsewhere
      if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: bill.title, text: `Split result for ${bill.title}`, url }).catch(() => {});
      } else if (await copyText(url)) {
        flash("link");
      }
    } catch (e: any) {
      setError(e.message || "Couldn't create a share link");
    } finally {
      setSharing(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${bill.title}"? Shared links will stop working.`)) return;
    try {
      await api(`/bills/${id}`, { method: "DELETE" });
      router.replace("/");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const actions = (
    <div className="grid grid-cols-[1fr_1fr_1.4fr] lg:grid-cols-1 gap-2">
      <button onClick={copyResult} className={`${btn.secondary} lg:justify-start`}>
        <Icon name={copied === "text" ? "check" : "copy"} />
        <span className="truncate">{copied === "text" ? "Copied" : <>Copy<span className="hidden lg:inline"> as text</span></>}</span>
      </button>
      <button onClick={downloadCsv} className={`${btn.secondary} lg:justify-start`}>
        <Icon name="download" /> CSV
      </button>
      <button onClick={share} disabled={sharing} className={`${btn.primary} !h-11 lg:!h-12`}>
        {sharing ? <Spinner className="size-4" /> : <Icon name={copied === "link" ? "check" : "share"} />}
        {copied === "link" ? "Link copied" : "Share"}
      </button>
    </div>
  );

  return (
    <>
      <TopBar
        title={bill.title}
        subtitle={fmtDate(bill.created_at)}
        back="/"
        right={
          <button onClick={remove} className={btn.icon} aria-label="Delete bill" title="Delete bill">
            <Icon name="trash" />
          </button>
        }
      />

      <Container className="py-6 pb-32 lg:pb-12">
        <div className="mb-6">
          <Stepper step={3} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
          {/* Sidebar first on mobile (summary on top), right column on desktop */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:order-last">
            <SummaryPanel total={bill.total} people={result.length} currency={cur} />

            {/* compact ranking */}
            <div className="hidden lg:block rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800/60">
              {result.map((p) => (
                <div key={p.name} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate text-zinc-400">{p.name}</span>
                  <span className="tabular-nums font-medium text-zinc-200">{fmtMoney(p.total, cur)}</span>
                </div>
              ))}
            </div>

            {error && <Alert>{error}</Alert>}

            {shareUrl && (
              <button
                onClick={async () => (await copyText(shareUrl)) && flash("url")}
                className="w-full flex items-center gap-2 text-left rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-3 text-xs text-emerald-300"
                title="Copy link"
              >
                <Icon name={copied === "url" ? "check" : "link"} className="size-4 shrink-0" />
                <span className="truncate">{copied === "url" ? "Link copied — send it to your friends!" : shareUrl}</span>
              </button>
            )}

            <div className="hidden lg:block">{actions}</div>
          </aside>

          <section className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Per person</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 items-start">
              {result.map((p) => (
                <PersonCard key={p.name} p={p} currency={cur} />
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-4">
              Tax, service and discounts are split proportionally to what each person ordered.
            </p>
          </section>
        </div>
      </Container>

      <ActionBar className="lg:hidden">{actions}</ActionBar>
    </>
  );
}
