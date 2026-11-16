"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { fmtRp } from "@/lib/api";
import { copyText } from "@/lib/share";
import { Check, Copy, Logo, Spinner, Wallet } from "@/lib/ui";

export default function PayPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTotal, setDoneTotal] = useState(0);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/pay/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Link tidak valid");
        return r.json();
      })
      .then((d) => {
        setData(d);
        const q: Record<string, number> = {};
        for (const it of d.items) q[it.id] = it.my_qty || 0;
        setQty(q);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const picked = useCallback(
    (): { id: string; qty: number }[] =>
      Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => ({ id, qty: q })),
    [qty]
  );

  // Persist the checklist shortly after they stop tapping, so the host sees
  // progress live without the friend having to press "save".
  useEffect(() => {
    if (!data || done || data.paid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        const res = await fetch(`/api/pay/${token}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: picked() }),
        });
        if (res.ok) setSaved(true);
      } catch {
        /* offline: the confirm button retries */
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [qty, data, token, done, picked]);

  if (error)
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-zinc-300">{error}</p>
        <p className="text-xs text-zinc-500">Link pembayaran ini tidak ada atau sudah kedaluwarsa.</p>
      </main>
    );

  if (!data)
    return (
      <main className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size={20} />
      </main>
    );

  const host = data.host;
  const ratio = data.fee_ratio ?? 1;

  if (done || data.paid)
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-800 bg-emerald-950/60 text-emerald-400">
          <Check size={26} />
        </div>
        <h1 className="text-lg font-semibold">Pembayaran tercatat</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {data.participant} ·{" "}
          <span className="num font-semibold text-emerald-400">
            {fmtRp(done ? doneTotal : data.paid?.total ?? 0)}
          </span>
        </p>
        <p className="mt-3 max-w-[20rem] text-[11px] leading-relaxed text-zinc-600">
          {host?.is_owner
            ? `Terima kasih! ${host.name} akan cek mutasi rekeningnya.`
            : `Terima kasih! ${host?.name || "Host"} akan konfirmasi sendiri.`}
        </p>
      </main>
    );

  const myTotal = data.items.reduce((sum: number, it: any) => {
    const q = qty[it.id] || 0;
    if (q <= 0) return sum;
    return sum + it.price * q * (it.unit_scale ?? 1) * ratio;
  }, 0);

  const flash = (tag: string) => {
    setCopied(tag);
    setTimeout(() => setCopied(null), 1600);
  };

  const copyField = async (value: string, tag: string) => {
    await copyText(value);
    flash(tag);
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/pay/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: picked() }),
      });
      if (!res.ok) throw new Error("Gagal konfirmasi");
      const d = await res.json();
      setDoneTotal(d.total ?? Math.round(myTotal));
      setDone(true);
    } finally {
      setConfirming(false);
    }
  };

  const totalItems = data.items.length;
  const pickedCount = picked().length;

  return (
    <main className="page page-bar">
      <header className="topbar">
        <div className="min-w-0">
          <p className="label">Split bill</p>
          <h1 className="topbar-title truncate">{data.title}</h1>
        </div>
        <Logo compact />
      </header>

      {/* Hero */}
      <section className="card mb-3 p-5">
        <div className="flex items-start justify-between">
          <p className="label">Bagian {data.participant}</p>
          {(saving || saved) && (
            <span className="tag">{saving ? "menyimpan…" : "tersimpan"}</span>
          )}
        </div>
        <p className="money-xl mt-2">{fmtRp(myTotal)}</p>
        <p className="mt-2 text-[11px] text-zinc-500">
          {pickedCount === 0
            ? `centang item yang kamu makan di bawah (${totalItems} item)`
            : `${pickedCount} dari ${totalItems} item · total bill ${fmtRp(data.total)}`}
        </p>
      </section>

      {/* Host */}
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
              {host?.is_owner
                ? (host.accounts || []).length > 0 || host.phone
                  ? "pilih salah satu, lalu salin nomornya"
                  : "detail transfer belum dicantumkan"
                : "langsung ke orangnya, tidak lewat aplikasi"}
            </p>
          </div>
        </div>

        {host?.is_owner ? (
          <div className="border-t border-[var(--line)]">
            {(host.accounts || []).length === 0 && !host.phone && (
              <p className="px-4 py-3 text-[12px] leading-relaxed text-amber-400/90">
                Host belum mencantumkan rekening. Hubungi {host.name} untuk detail transfer.
              </p>
            )}
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
                  onClick={() => copyField(a.number, a.label + a.number)}
                  className="btn btn-secondary btn-sm"
                >
                  {copied === a.label + a.number ? "Disalin" : "Salin"}
                </button>
              </div>
            ))}
            {host.phone && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">Nomor HP / WA</p>
                  <a
                    href={`tel:${host.phone}`}
                    className="num mt-0.5 block truncate text-sm text-zinc-100"
                  >
                    {host.phone}
                  </a>
                </div>
                <button
                  onClick={() => copyField(host.phone, "phone")}
                  className="btn btn-secondary btn-sm"
                >
                  {copied === "phone" ? "Disalin" : "Salin"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-[var(--line)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              Bayar langsung ke <span className="text-zinc-100">{host?.name}</span> (transfer atau
              tunai). Aplikasi ini tidak menyimpan info rekening host.
            </p>
          </div>
        )}
      </section>

      {/* Checklist */}
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="label">Centang yang kamu makan</h2>
        <button
          onClick={() => {
            const next: Record<string, number> = {};
            for (const it of data.items) next[it.id] = 0;
            setQty(next);
          }}
          className="text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          kosongkan
        </button>
      </div>

      <div className="card mb-2 divide-y divide-[var(--line)] overflow-hidden">
        {data.items.map((it: any) => {
          const q = qty[it.id] || 0;
          const on = q > 0;
          const line = it.price * q * (it.unit_scale ?? 1) * ratio;
          return (
            <div key={it.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setQty((prev) => ({ ...prev, [it.id]: prev[it.id] > 0 ? 0 : 1 }))
                  }
                  className="check mt-0.5"
                  aria-label={`Tandai ${it.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={`truncate text-sm ${
                        on ? "text-zinc-100" : "text-zinc-500"
                      }`}
                    >
                      {it.name}
                    </p>
                    <p className="num shrink-0 text-[13px] text-zinc-300">
                      {on ? fmtRp(line) : <span className="text-zinc-600">—</span>}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-zinc-500">
                      {fmtRp(it.price * ratio)}/item
                      {it.qty > 1 && q > 0 ? ` · kamu ambil ${q} dari ${it.qty}` : ""}
                      {it.claimed_by_others > 0
                        ? ` · ${it.claimed_by_others} orang lain`
                        : ""}
                    </p>
                    {on && it.qty > 1 && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() =>
                            setQty((prev) => ({ ...prev, [it.id]: Math.max(1, prev[it.id] - 1) }))
                          }
                          disabled={q <= 1}
                          className="h-6 w-6 rounded-md border border-[var(--line)] text-[13px] leading-none text-zinc-400 disabled:opacity-35"
                          aria-label="Kurangi"
                        >
                          −
                        </button>
                        <span className="num w-5 text-center text-[12px] text-zinc-300">{q}</span>
                        <button
                          onClick={() =>
                            setQty((prev) => ({
                              ...prev,
                              [it.id]: Math.min(it.qty, prev[it.id] + 1),
                            }))
                          }
                          disabled={q >= it.qty}
                          className="h-6 w-6 rounded-md border border-[var(--line)] text-[13px] leading-none text-zinc-400 disabled:opacity-35"
                          aria-label="Tambah"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Centang item yang kamu makan, item bareng otomatis dihitung proporsional. Pilihanmu
        tersimpan sendiri, jadi bisa diubah kapan saja sebelum bayar. Harga sudah termasuk bagian
        pajak/service.
      </p>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] text-zinc-400">Total kamu</span>
            <span className="money-lg">{fmtRp(myTotal)}</span>
          </div>
          <button
            onClick={confirm}
            disabled={confirming || myTotal <= 0}
            className="btn btn-ok btn-block"
          >
            {confirming ? <Spinner size={16} /> : <Check size={17} />}
            {confirming ? "Menyimpan…" : "Saya sudah bayar"}
          </button>
        </div>
      </div>
    </main>
  );
}
