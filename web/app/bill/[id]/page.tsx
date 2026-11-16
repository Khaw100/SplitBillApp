"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, fmtDate, fmtRp } from "@/lib/api";
import { copyText, generalMessage, payMessage, waLink } from "@/lib/share";
import {
  AppHeader,
  Avatar,
  Check,
  Copy,
  Download,
  Share,
  Spinner,
  Trash,
  WhatsApp,
} from "@/lib/ui";

export default function BillReport() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<any>(null);
  const [result, setResult] = useState<any[]>([]);
  const [status, setStatus] = useState<
    Record<string, { chosen: boolean; total: number; paid: any }>
  >({});
  const [unclaimed, setUnclaimed] = useState(0);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [busyShare, setBusyShare] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    api(`/bills/${id}`).then(async (b) => {
      setBill(b);
      api(`/bills/${id}/result`)
        .then((r) => {
          setResult(r.result || []);
          setUnclaimed(r.unclaimed || 0);
        })
        .catch(() => {});
      api(`/bills/${id}/status`)
        .then((s: any) => {
          const map: Record<string, any> = {};
          for (const p of s.participants || []) map[p.name] = p;
          setStatus(map);
          setUnclaimed(s.unclaimed || 0);
        })
        .catch(() => {});
      // pay links are idempotent server-side
      const entries = await Promise.all(
        (b.participants as string[]).map(async (p) => {
          try {
            const r = await api(`/bills/${id}/paylink/${encodeURIComponent(p)}`, {
              method: "POST",
            });
            return [p, `${location.origin}${r.url}`] as const;
          } catch {
            return [p, ""] as const;
          }
        })
      );
      setLinks(Object.fromEntries(entries.filter(([, u]) => u)));
    });
  }, [id]);

  if (!bill)
    return (
      <main className="page flex min-h-[60dvh] items-center justify-center">
        <Spinner size={20} />
      </main>
    );

  const host = bill.host;
  const grand = bill.total;
  const participants: string[] = bill.participants || [];
  const rows = result;
  const rowByName = Object.fromEntries(rows.map((p) => [p.name, p]));
  const paidTotal = Object.values(status).reduce((s, p) => s + (p?.paid?.total || 0), 0);
  const chosenCount = Object.values(status).filter((p) => p?.chosen).length;
  const date = fmtDate(bill.created_at);

  const flash = (tag: string) => {
    setCopied(tag);
    setTimeout(() => setCopied(null), 1600);
  };

  const copyPay = async (name: string) => {
    const url = links[name] || `${location.origin}/`;
    const row = rowByName[name];
    await copyText(
      payMessage({ title: bill.title, participant: name, total: row?.total, host, url })
    );
    flash(`pay-${name}`);
  };

  const copyGeneral = async () => {
    setBusyShare(true);
    try {
      let url = shareUrl;
      if (!url) {
        const s = await api(`/bills/${id}/share`, { method: "POST" });
        url = `${location.origin}/s/${s.share_id}`;
        setShareUrl(url);
      }
      await copyText(
        generalMessage({
          title: bill.title,
          total: grand,
          people: rows.map((p) => ({ name: p.name, total: p.total })),
          host,
          url,
        })
      );
      flash("general");
    } finally {
      setBusyShare(false);
    }
  };

  const downloadCsv = () => {
    const out = ["peserta,item,qty,harga,subtotal"];
    for (const p of rows)
      for (const l of p.lines) out.push(`"${p.name}","${l.name}",${l.qty},${l.price},${l.line_total}`);
    const blob = new Blob([out.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${bill.title.replace(/\W+/g, "_")}_split.csv`;
    a.click();
  };

  const remove = async () => {
    await api(`/bills/${id}`, { method: "DELETE" });
    router.replace("/");
  };

  const openLink = (name: string) => links[name] || "#";

  return (
    <main className="page page-bar">
      <AppHeader
        title={bill.title}
        subtitle={`${date} · ${participants.length} orang`}
        back="/"
        right={
          <button onClick={copyGeneral} className="icon-btn" aria-label="Bagikan hasil" disabled={busyShare}>
            {copied === "general" ? <Check size={17} /> : <Share size={17} />}
          </button>
        }
      />

      {/* Host */}
      <section className="card mb-3 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={host?.name || "?"} size={34} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <span className="truncate">{host?.name}</span>
              {host?.is_owner && <span className="tag tag-accent">kamu</span>}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {host?.is_owner
                ? "rekening & nomor kamu dilampirkan di pesan pembayaran"
                : "host lain · info rekening tidak dibagikan"}
            </p>
          </div>
        </div>

        {host?.is_owner && (host.accounts?.length > 0 || host.phone) && (
          <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
            {(host.accounts || []).map((a: any) => (
              <div key={a.label + a.number} className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-zinc-300">
                  <span className="text-zinc-500">{a.label}</span>{" "}
                  <span className="num">{a.number}</span>
                  {a.holder && <span className="text-zinc-600"> · {a.holder}</span>}
                </p>
                <button
                  onClick={async () => {
                    await copyText(a.number);
                    flash(`acc-${a.number}`);
                  }}
                  className="text-zinc-500 transition-colors hover:text-zinc-200"
                  aria-label="Salin nomor"
                >
                  {copied === `acc-${a.number}` ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            ))}
            {host.phone && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-zinc-300">
                  <span className="text-zinc-500">WA</span> <span className="num">{host.phone}</span>
                </p>
                <button
                  onClick={async () => {
                    await copyText(host.phone);
                    flash("phone");
                  }}
                  className="text-zinc-500 transition-colors hover:text-zinc-200"
                  aria-label="Salin nomor HP"
                >
                  {copied === "phone" ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            )}
          </div>
        )}
        {host?.is_owner && host.accounts?.length === 0 && !host.phone && (
          <p className="mt-3 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-amber-400/90">
            Rekening belum diisi. Isi <code className="text-amber-300/80">owner_accounts</code> di
            App Config Hub{" "}
            <a
              href="https://dashboard.rakhawiratama.com/projects/2"
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              di sini
            </a>
            .
          </p>
        )}
      </section>

      {/* Totals */}
      <section className="mb-5 grid grid-cols-3 gap-2">
        <div className="card px-3 py-2.5">
          <p className="label">Total</p>
          <p className="num mt-1 text-[15px] font-semibold">{fmtRp(grand)}</p>
        </div>
        <div className="card px-3 py-2.5">
          <p className="label">Masuk</p>
          <p
            className={`num mt-1 text-[15px] font-semibold ${
              paidTotal > 0 ? "text-emerald-400" : "text-zinc-400"
            }`}
          >
            {fmtRp(paidTotal)}
          </p>
        </div>
        <div className="card px-3 py-2.5">
          <p className="label">Bagianmu</p>
          <p className="num mt-1 text-[15px] font-semibold text-zinc-300">{fmtRp(unclaimed)}</p>
        </div>
      </section>

      {/* Participants */}
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="label">Pembagian</h2>
        <span className="text-[11px] text-zinc-500">
          {chosenCount}/{participants.length} sudah pilih
        </span>
      </div>

      <ul className="space-y-2">
        {participants.map((name) => {
          const st = status[name];
          const row = rowByName[name];
          const chosen = st?.chosen ?? !!row;
          const paid = st?.paid;
          return (
            <li key={name} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <span className="truncate">{name}</span>
                    {paid ? (
                      <span className="tag tag-ok">lunas</span>
                    ) : chosen ? (
                      <span className="tag tag-accent">sudah pilih</span>
                    ) : (
                      <span className="tag">belum pilih</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {row
                      ? `${row.lines.length} jenis item${row.others > 0 ? ` · termasuk pajak ${fmtRp(row.others)}` : ""}`
                      : "menunggu dia centang itemnya"}
                  </p>
                </div>
                <p
                  className={`num shrink-0 text-[15px] font-semibold ${
                    row ? "text-zinc-100" : "text-zinc-600"
                  }`}
                >
                  {row ? fmtRp(row.total) : "—"}
                </p>
              </div>

              <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2">
                <button
                  onClick={() => copyPay(name)}
                  className="btn btn-secondary btn-sm flex-1"
                >
                  {copied === `pay-${name}` ? (
                    <>
                      <Check size={14} /> Pesan disalin
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Kirim tagihan
                    </>
                  )}
                </button>
                {links[name] && (
                  <>
                    <a
                      href={waLink(payMessage({ title: bill.title, participant: name, host, url: links[name] }))}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm !px-2.5"
                      aria-label="Kirim WhatsApp"
                    >
                      <WhatsApp size={15} />
                    </a>
                    <a
                      href={openLink(name)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm !px-2.5 text-[11px]"
                    >
                      Buka
                    </a>
                  </>
                )}
              </div>

              {row && (
                <details className="border-t border-[var(--line)]">
                  <summary className="cursor-pointer px-4 py-2 text-[11px] text-zinc-500 hover:text-zinc-300">
                    Lihat rincian item
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
                        </p>
                        <p className="num text-[12px] text-zinc-500">{fmtRp(l.line_total)}</p>
                      </div>
                    ))}
                    <div className="mt-2 flex items-baseline justify-between border-t border-[var(--line)] pt-2">
                      <p className="text-[12px] text-zinc-500">Item {fmtRp(row.subtotal)}</p>
                      <p className="text-[12px] text-zinc-500">Pajak/lainnya {fmtRp(row.others)}</p>
                    </div>
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Bagianmu {fmtRp(unclaimed)} mencakup item yang tidak dicentang siapa pun dan item yang kamu
        makan sendiri.
      </p>

      {/* Actions */}
      <section className="mt-6 space-y-2">
        <div className="flex gap-2">
          <button onClick={downloadCsv} className="btn btn-secondary btn-block">
            <Download size={15} /> CSV
          </button>
          <button
            onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
            className="btn btn-ghost btn-block"
          >
            <Trash size={15} /> {confirmDelete ? "Yakin hapus?" : "Hapus"}
          </button>
        </div>
      </section>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <button onClick={copyGeneral} disabled={busyShare} className="btn btn-primary btn-block">
            {copied === "general" ? <Check size={16} /> : <Share size={16} />}
            {copied === "general" ? "Ringkasan disalin" : "Salin ringkasan + link"}
          </button>
        </div>
      </div>
    </main>
  );
}
