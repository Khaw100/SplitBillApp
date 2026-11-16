"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, downloadCsv, fmtDate, fmtRp } from "@/lib/api";
import { copyText, generalMessage, payMessage, waLink } from "@/lib/share";
import { AppHeader, Avatar, Check, Copy, Download, Pencil, Share, Spinner, Trash, WhatsApp } from "@/lib/ui";

const HUB_CONFIG_URL = "https://dashboard.rakhawiratama.com/projects/2";

export default function BillReport() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any[]>([]);
  const [status, setStatus] = useState<
    Record<string, { chosen: boolean; total: number; paid: any; payment: any }>
  >({});
  const [unclaimed, setUnclaimed] = useState(0);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busyShare, setBusyShare] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const loadStatus = async () => {
    const s: any = await api(`/bills/${id}/status`);
    const map: Record<string, any> = {};
    for (const p of s.participants || []) map[p.name] = p;
    setStatus(map);
    setUnclaimed(s.unclaimed || 0);
  };

  useEffect(() => {
    if (!id) return;
    api(`/bills/${id}`)
      .then(async (b) => {
        setBill(b);
        api(`/bills/${id}/result`)
          .then((r) => {
            setResult(r.result || []);
            setUnclaimed(r.unclaimed || 0);
          })
          .catch(() => {});
        loadStatus().catch(() => {});
        // pay links are idempotent server-side
        const entries = await Promise.all(
          (b.participants as string[]).map(async (p) => {
            try {
              const r = await api(`/bills/${id}/paylink/${encodeURIComponent(p)}`, { method: "POST" });
              return [p, `${location.origin}${r.url}`] as const;
            } catch {
              return [p, ""] as const;
            }
          })
        );
        setLinks(Object.fromEntries(entries.filter(([, u]) => u)));
      })
      .catch((e) => setLoadError(e.message || "Couldn't load this bill"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const review = async (name: string, action: "approve" | "reject") => {
    setReviewing(name);
    setError(null);
    try {
      await api(`/bills/${id}/review/${encodeURIComponent(name)}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadStatus();
    } catch (e: any) {
      setError(e.message || "Couldn't update the payment");
    } finally {
      setReviewing(null);
    }
  };

  if (loadError)
    return (
      <main className="page">
        <AppHeader title="Bill" back="/" />
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-300">Couldn&apos;t load this bill</p>
          <p className="text-xs text-zinc-500">{loadError}</p>
          <Link href="/" className="btn btn-secondary btn-sm mt-3">
            Back to bills
          </Link>
        </div>
      </main>
    );

  if (!bill)
    return (
      <main className="page flex min-h-[60dvh] items-center justify-center">
        <Spinner size={20} />
      </main>
    );

  const host = bill.host;
  const grand = bill.total;
  const participants: string[] = bill.participants || [];
  const rowByName = Object.fromEntries(result.map((p) => [p.name, p]));
  const paidTotal = Object.values(status).reduce((s, p) => s + (p?.paid?.total || 0), 0);
  const chosenCount = Object.values(status).filter((p) => p?.chosen).length;
  const paidCount = Object.values(status).filter((p) => p?.paid).length;

  const flash = (tag: string) => {
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1600);
  };

  const copyOrFail = async (text: string, tag: string) => {
    if (await copyText(text)) flash(tag);
    else setError("Couldn't access the clipboard.");
  };

  const msgFor = (name: string) =>
    payMessage({
      title: bill.title,
      participant: name,
      total: rowByName[name]?.total,
      host,
      url: links[name] || `${location.origin}/`,
    });

  const copyGeneral = async () => {
    setBusyShare(true);
    setError(null);
    try {
      let url = shareUrl;
      if (!url) {
        const s = await api(`/bills/${id}/share`, { method: "POST" });
        url = `${location.origin}/s/${s.share_id}`;
        setShareUrl(url);
      }
      await copyOrFail(
        generalMessage({
          title: bill.title,
          total: grand,
          people: result.map((p) => ({ name: p.name, total: p.total })),
          host,
          url,
        }),
        "general"
      );
    } catch (e: any) {
      setError(e.message || "Couldn't create a share link");
    } finally {
      setBusyShare(false);
    }
  };

  const exportCsv = () => {
    const rows: unknown[][] = [["participant", "item", "qty", "unit_price", "line_total"]];
    for (const p of result) {
      for (const l of p.lines) rows.push([p.name, l.name, l.qty, l.price, l.line_total]);
      rows.push([p.name, "tax/service/discount", "", "", p.others]);
      rows.push([p.name, "TOTAL", "", "", p.total]);
    }
    if (unclaimed) rows.push(["(host)", "unclaimed items", "", "", unclaimed]);
    downloadCsv(`${bill.title.replace(/[^\w-]+/g, "_") || "bill"}_split.csv`, rows);
  };

  const remove = async () => {
    try {
      await api(`/bills/${id}`, { method: "DELETE" });
      router.replace("/");
    } catch (e: any) {
      setError(e.message || "Couldn't delete the bill");
      setConfirmDelete(false);
    }
  };

  const startRename = () => {
    setTitleDraft(bill.title);
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === bill.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    setError(null);
    try {
      await api(`/bills/${id}`, { method: "PATCH", body: JSON.stringify({ title: next }) });
      setBill({ ...bill, title: next });
      setEditingTitle(false);
    } catch (e: any) {
      setError(e.message || "Couldn't rename the bill");
    } finally {
      setSavingTitle(false);
    }
  };

  const hostCard = (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={host?.name || "?"} size={34} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <span className="truncate">{host?.name}</span>
            {host?.is_owner && <span className="tag tag-accent">you</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {host?.is_owner
              ? "your accounts & number are included in payment messages"
              : "another host · payment details aren't shared"}
          </p>
        </div>
      </div>

      {host?.is_owner && (host.accounts?.length > 0 || host.phone) && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
          {(host.accounts || []).map((a: any) => (
            <div key={a.label + a.number} className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] text-zinc-300">
                <span className="text-zinc-500">{a.label}</span> <span className="num">{a.number}</span>
                {a.holder && <span className="text-zinc-600"> · {a.holder}</span>}
              </p>
              <button
                onClick={() => copyOrFail(a.number, `acc-${a.number}`)}
                className="text-zinc-500 transition-colors hover:text-zinc-200"
                aria-label="Copy account number"
              >
                {copied === `acc-${a.number}` ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          ))}
          {host.phone && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-zinc-300">
                <span className="text-zinc-500">WhatsApp</span> <span className="num">{host.phone}</span>
              </p>
              <button
                onClick={() => copyOrFail(host.phone, "phone")}
                className="text-zinc-500 transition-colors hover:text-zinc-200"
                aria-label="Copy phone number"
              >
                {copied === "phone" ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          )}
        </div>
      )}
      {host?.is_owner && host.accounts?.length === 0 && !host.phone && (
        <p className="mt-3 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-amber-400/90">
          No payment accounts yet. Add <code className="text-amber-300/80">owner_accounts</code> in the Hub app config{" "}
          <a href={HUB_CONFIG_URL} target="_blank" rel="noreferrer" className="link">
            here
          </a>
          .
        </p>
      )}
    </section>
  );

  const totals = (
    <section className="grid grid-cols-3 gap-2">
      <div className="card px-3 py-2.5">
        <p className="label">Total</p>
        <p className="num mt-1 truncate text-[15px] font-semibold">{fmtRp(grand)}</p>
      </div>
      <div className="card px-3 py-2.5">
        <p className="label">Received</p>
        <p className={`num mt-1 truncate text-[15px] font-semibold ${paidTotal > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
          {fmtRp(paidTotal)}
        </p>
      </div>
      <div className="card px-3 py-2.5">
        <p className="label">Your share</p>
        <p className="num mt-1 truncate text-[15px] font-semibold text-zinc-300">{fmtRp(unclaimed)}</p>
      </div>
    </section>
  );

  const actions = (
    <div className="flex gap-2">
      <button onClick={exportCsv} className="btn btn-secondary btn-block">
        <Download size={15} /> CSV
      </button>
      <button
        onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
        onBlur={() => setConfirmDelete(false)}
        className={`btn btn-ghost btn-block ${confirmDelete ? "!border-red-900 !text-red-400" : ""}`}
      >
        <Trash size={15} /> {confirmDelete ? "Really delete?" : "Delete"}
      </button>
    </div>
  );

  return (
    <main className="page page-bar page-wide">
      <AppHeader
        title={bill.title}
        subtitle={`${fmtDate(bill.created_at)} · ${participants.length} ${participants.length === 1 ? "person" : "people"}`}
        back="/"
        wrap
        right={
          <div className="flex items-center gap-2">
            <button onClick={startRename} className="icon-btn" aria-label="Rename bill">
              <Pencil size={16} />
            </button>
            <button
              onClick={copyGeneral}
              className="icon-btn lg:hidden"
              aria-label="Share summary"
              disabled={busyShare}
            >
              {copied === "general" ? <Check size={17} /> : <Share size={17} />}
            </button>
          </div>
        }
      />

      {editingTitle && (
        <div className="card mb-3 p-3">
          <input
            autoFocus
            value={titleDraft}
            maxLength={120}
            onFocus={(e) => {
              const el = e.currentTarget;
              el.select();
              requestAnimationFrame(() => {
                el.scrollLeft = 0;
              });
            }}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            placeholder="Bill name"
            className="input !h-10 w-full text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveTitle} disabled={savingTitle} className="btn btn-primary btn-sm flex-1">
              {savingTitle ? "Saving…" : "Save name"}
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="btn btn-ghost btn-sm"
              aria-label="Cancel rename"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
        {/* Sidebar on desktop; stacked on top on mobile */}
        <aside className="side-sticky mb-5 lg:mb-0">
          {hostCard}
          {totals}
          {error && (
            <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-300">
              {error}
            </p>
          )}
          <div className="hidden lg:block">{actions}</div>
          <div className="bottom-bar">
            <div className="bottom-bar-inner">
              <button onClick={copyGeneral} disabled={busyShare} className="btn btn-primary btn-block">
                {busyShare ? <Spinner size={16} /> : copied === "general" ? <Check size={16} /> : <Share size={16} />}
                {copied === "general" ? "Summary copied" : "Copy summary + link"}
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label">Breakdown</h2>
            <span className="text-[11px] text-zinc-500">
              {chosenCount}/{participants.length} picked · {paidCount} paid
            </span>
          </div>

          <ul className="grid items-start gap-2 xl:grid-cols-2">
            {participants.map((name) => {
              const st = status[name];
              const row = rowByName[name];
              const chosen = st?.chosen ?? !!row;
              const paid = st?.paid;
              const payment = st?.payment;
              const pending = payment?.status === "pending";
              const rejected = payment?.status === "rejected";
              return (
                <li key={name} className="card overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={name} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                        <span className="truncate">{name}</span>
                        {paid ? (
                          <span className="tag tag-ok">paid</span>
                        ) : pending ? (
                          <span className="tag tag-warn">needs approval</span>
                        ) : rejected ? (
                          <span className="tag tag-danger">rejected</span>
                        ) : chosen ? (
                          <span className="tag tag-accent">picked</span>
                        ) : (
                          <span className="tag">not yet</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                        {row
                          ? `${row.lines.length} ${row.lines.length === 1 ? "item" : "items"}${
                              row.others > 0 ? ` · incl. ${fmtRp(row.others)} tax/service` : ""
                            }`
                          : "waiting for them to tick their items"}
                      </p>
                    </div>
                    <p className={`num shrink-0 text-[15px] font-semibold ${row ? "text-zinc-100" : "text-zinc-600"}`}>
                      {row ? fmtRp(row.total) : "—"}
                    </p>
                  </div>

                  {(pending || rejected) && payment && (
                    <div className="border-t border-[var(--line)] px-4 py-3">
                      <p className="text-[12px] text-zinc-300">
                        {rejected ? "Claimed" : "Says they paid"} {fmtRp(payment.total ?? 0)}
                        {payment.method ? ` via ${payment.method}` : ""}
                      </p>
                      {payment.note && (
                        <p className="mt-1 text-[11px] italic text-zinc-500">&ldquo;{payment.note}&rdquo;</p>
                      )}
                      {payment.proof_url && (
                        <a
                          href={payment.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block"
                          title="Open transfer proof"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={payment.proof_url} alt="transfer proof" className="proof-thumb" />
                        </a>
                      )}
                      {!payment.has_proof && (
                        <p className="mt-2 text-[11px] text-zinc-600">No transfer proof attached.</p>
                      )}
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={() => review(name, "approve")}
                          disabled={reviewing === name}
                          className="btn btn-ok btn-sm flex-1"
                        >
                          <Check size={14} /> {rejected ? "Approve anyway" : "Approve"}
                        </button>
                        <button
                          onClick={() => review(name, "reject")}
                          disabled={reviewing === name}
                          className="btn btn-ghost btn-sm"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2">
                    <button onClick={() => copyOrFail(msgFor(name), `pay-${name}`)} className="btn btn-secondary btn-sm flex-1">
                      {copied === `pay-${name}` ? (
                        <>
                          <Check size={14} /> Message copied
                        </>
                      ) : (
                        <>
                          <Copy size={14} /> Copy payment message
                        </>
                      )}
                    </button>
                    {links[name] && (
                      <>
                        <a
                          href={waLink(msgFor(name))}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm !px-2.5"
                          aria-label={`Send to ${name} on WhatsApp`}
                          title="Send via WhatsApp"
                        >
                          <WhatsApp size={15} />
                        </a>
                        <a
                          href={links[name]}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm !px-2.5 text-[11px]"
                        >
                          Open
                        </a>
                      </>
                    )}
                  </div>

                  {row && (
                    <details className="border-t border-[var(--line)]">
                      <summary className="cursor-pointer px-4 py-2 text-[11px] text-zinc-500 hover:text-zinc-300">
                        Show items
                      </summary>
                      <div className="px-4 pb-3">
                        {row.lines.map((l: any, i: number) => (
                          <div key={i} className="flex items-baseline justify-between gap-3 py-1">
                            <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-400">
                              {l.name}
                              {l.units > l.qty && (
                                <span className="ml-1.5 text-[10px] text-zinc-600">
                                  ({l.qty}/{l.units})
                                </span>
                              )}
                              {l.shared_by > 1 && <span className="ml-1.5 text-[10px] text-zinc-600">÷{l.shared_by}</span>}
                            </p>
                            <p className="num text-[12px] text-zinc-500">{fmtRp(l.line_total)}</p>
                          </div>
                        ))}
                        <div className="mt-2 flex items-baseline justify-between border-t border-[var(--line)] pt-2">
                          <p className="text-[12px] text-zinc-500">Items {fmtRp(row.subtotal)}</p>
                          <p className="text-[12px] text-zinc-500">Tax/other {fmtRp(row.others)}</p>
                        </div>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Your share of {fmtRp(unclaimed)} covers anything nobody ticked, including what you had yourself.
          </p>

          <div className="mt-6 lg:hidden">{actions}</div>
        </section>
      </div>
    </main>
  );
}
