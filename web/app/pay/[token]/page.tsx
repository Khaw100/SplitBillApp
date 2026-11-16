"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { fmtRp } from "@/lib/api";
import { copyText } from "@/lib/share";
import { Check, Close, Logo, Spinner, Upload, Wallet } from "@/lib/ui";

type PayStatus = "pending" | "approved" | "rejected";

export default function PayPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  // Only autosave after the friend actually changes something. Saving on page
  // load would record an empty checklist and mark them as "picked" before they
  // ticked anything.
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/pay/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Invalid link");
        return r.json();
      })
      .then((d) => {
        setData(d);
        const q: Record<string, number> = {};
        for (const it of d.items) q[it.id] = it.my_qty || 0;
        setQty(q);
        if (d.payment?.method) setMethod(d.payment.method);
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

  const changeQty = (fn: (prev: Record<string, number>) => Record<string, number>) => {
    setDirty(true);
    setSaved(false);
    setQty(fn);
  };

  // Persist the checklist shortly after they stop tapping, so the host sees
  // progress live without the friend having to press "save".
  useEffect(() => {
    if (!data || !dirty) return;
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
        /* offline: submitting the payment saves too */
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [qty, data, dirty, token, picked]);

  const host = data?.host;
  const ratio = data?.fee_ratio ?? 1;
  const payment: { status: PayStatus; method?: string; total?: number; note?: string; has_proof?: boolean } | null =
    data?.payment ?? null;

  const methods = useMemo(() => {
    const labels = (host?.accounts || []).map((a: any) => a.label).filter(Boolean);
    return [...labels, "Tunai"];
  }, [host]);

  if (error)
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-zinc-300">{error}</p>
        <p className="text-xs text-zinc-500">This payment link doesn&apos;t exist or the bill was deleted.</p>
      </main>
    );

  if (!data)
    return (
      <main className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size={20} />
      </main>
    );

  if (payment?.status === "approved")
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-800 bg-emerald-950/60 text-emerald-400">
          <Check size={26} />
        </div>
        <h1 className="text-lg font-semibold">Payment confirmed</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {data.participant} ·{" "}
          <span className="num font-semibold text-emerald-400">{fmtRp(payment.total ?? 0)}</span>
        </p>
        <p className="mt-3 max-w-[20rem] text-[11px] leading-relaxed text-zinc-500">
          {host?.name || "The host"} verified your payment{payment.method ? ` via ${payment.method}` : ""}. You are all
          settled.
        </p>
      </main>
    );

  const myTotal = data.items.reduce((sum: number, it: any) => {
    const q = qty[it.id] || 0;
    if (q <= 0) return sum;
    return sum + it.price * q * (it.unit_scale ?? 1) * ratio;
  }, 0);

  const copyField = async (value: string, tag: string) => {
    if (await copyText(value)) {
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1600);
    }
  };

  const pickProof = (file: File | null) => {
    setProof(file);
    setProofUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      const fd = new FormData();
      fd.append("items", JSON.stringify(picked()));
      fd.append("method", method);
      fd.append("note", note);
      if (proof) fd.append("proof", proof);
      const res = await fetch(`/api/pay/${token}/submit`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Couldn't send your confirmation.");
      setData({
        ...data,
        payment: {
          status: "pending",
          method: body.method,
          total: body.total,
          has_proof: body.has_proof,
        },
      });
      setSheet(false);
      pickProof(null);
    } catch (e: any) {
      setActionError(e.message || "Couldn't send your confirmation.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = data.items.length;
  const pickedCount = picked().length;
  const isPending = payment?.status === "pending";
  const isRejected = payment?.status === "rejected";

  const hero = (
    <section className="card p-5">
      <div className="flex items-start justify-between">
        <p className="label">{data.participant}&apos;s share</p>
        {(saving || saved) && <span className="tag">{saving ? "saving…" : "saved"}</span>}
      </div>
      <p className="money-xl mt-2">{fmtRp(myTotal)}</p>
      <p className="mt-2 text-[11px] text-zinc-500">
        {pickedCount === 0
          ? `tick what you had below (${totalItems} ${totalItems === 1 ? "item" : "items"})`
          : `${pickedCount} of ${totalItems} items · bill total ${fmtRp(data.total)}`}
      </p>
    </section>
  );

  const hostCard = (
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
            {host?.is_owner
              ? (host.accounts || []).length > 0 || host.phone
                ? "pick one and copy the number"
                : "no transfer details listed"
              : "directly, not through this app"}
          </p>
        </div>
      </div>

      {host?.is_owner ? (
        <div className="border-t border-[var(--line)]">
          {(host.accounts || []).length === 0 && !host.phone && (
            <p className="px-4 py-3 text-[12px] leading-relaxed text-amber-400/90">
              The host hasn&apos;t listed any accounts. Ask {host.name} for transfer details.
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
                {a.holder && <p className="mt-0.5 text-[11px] text-zinc-600">{a.holder}</p>}
              </div>
              <button onClick={() => copyField(a.number, a.label + a.number)} className="btn btn-secondary btn-sm">
                {copied === a.label + a.number ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
          {host.phone && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">Phone / WhatsApp</p>
                <a href={`tel:${host.phone}`} className="num mt-0.5 block truncate text-sm text-zinc-100">
                  {host.phone}
                </a>
              </div>
              <button onClick={() => copyField(host.phone, "phone")} className="btn btn-secondary btn-sm">
                {copied === "phone" ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="border-t border-[var(--line)] px-4 py-3">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            Pay <span className="text-zinc-100">{host?.name}</span> directly (transfer or cash). This app doesn&apos;t
            store the host&apos;s payment details.
          </p>
        </div>
      )}
    </section>
  );

  const statusBanner = payment && (
    <div
      className={`card px-4 py-3 ${
        isPending ? "border-amber-900/60 bg-amber-950/20" : "border-red-900/60 bg-red-950/20"
      }`}
    >
      <p className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
        {isPending ? "Waiting for the host to confirm" : "The host couldn't verify this payment"}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
        {fmtRp(payment.total ?? 0)}
        {payment.method ? ` · ${payment.method}` : ""}
        {payment.has_proof ? " · proof attached" : ""}
        {isPending
          ? `. ${host?.name || "The host"} will check it and approve.`
          : ". Send it again with the right amount or a clear proof."}
      </p>
    </div>
  );

  return (
    <main className="page page-bar page-wide">
      <header className="topbar">
        <div className="min-w-0">
          <p className="label">Split bill</p>
          <h1 className="topbar-title truncate">{data.title}</h1>
        </div>
        <Logo compact />
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-8">
        {/* On mobile the hero + host come first; on desktop they sit in the right sidebar. */}
        <div className="mb-5 space-y-3 lg:hidden">
          {hero}
          {statusBanner}
          {hostCard}
        </div>

        <section className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label">Tick what you had</h2>
            <button
              onClick={() =>
                changeQty(() => Object.fromEntries(data.items.map((it: any) => [it.id, 0])))
              }
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              clear all
            </button>
          </div>

          <div className="card mb-2 divide-y divide-[var(--line)] overflow-hidden">
            {data.items.map((it: any) => {
              const q = qty[it.id] || 0;
              const on = q > 0;
              const line = it.price * q * (it.unit_scale ?? 1) * ratio;
              return (
                <label key={it.id} className="block cursor-pointer px-4 py-3 hover:bg-white/[0.015]">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => changeQty((prev) => ({ ...prev, [it.id]: prev[it.id] > 0 ? 0 : 1 }))}
                      className="check mt-0.5"
                      aria-label={`I had ${it.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-sm ${on ? "text-zinc-100" : "text-zinc-500"}`}>{it.name}</p>
                        <p className="num shrink-0 text-[13px] text-zinc-300">
                          {on ? fmtRp(line) : <span className="text-zinc-600">—</span>}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] text-zinc-500">
                          {fmtRp(it.price * ratio)} each
                          {it.qty > 1 && q > 0 ? ` · you had ${q} of ${it.qty}` : ""}
                          {it.claimed_by_others > 0
                            ? ` · ${it.claimed_by_others} other${it.claimed_by_others === 1 ? "" : "s"}`
                            : ""}
                        </p>
                        {on && it.qty > 1 && (
                          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.preventDefault()}>
                            <button
                              onClick={() => changeQty((prev) => ({ ...prev, [it.id]: Math.max(1, prev[it.id] - 1) }))}
                              disabled={q <= 1}
                              className="h-7 w-7 rounded-md border border-[var(--line)] text-[13px] leading-none text-zinc-400 disabled:opacity-35"
                              aria-label="Less"
                            >
                              −
                            </button>
                            <span className="num w-5 text-center text-[12px] text-zinc-300">{q}</span>
                            <button
                              onClick={() =>
                                changeQty((prev) => ({ ...prev, [it.id]: Math.min(it.qty, prev[it.id] + 1) }))
                              }
                              disabled={q >= it.qty}
                              className="h-7 w-7 rounded-md border border-[var(--line)] text-[13px] leading-none text-zinc-400 disabled:opacity-35"
                              aria-label="More"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Shared items are split automatically. Your picks save as you go, so you can change them any time before
            paying. Prices already include your part of tax/service.
          </p>
        </section>

        <aside className="side-sticky mt-5 lg:mt-0">
          <div className="hidden space-y-3 lg:block">
            {hero}
            {statusBanner}
            {hostCard}
          </div>

          {actionError && (
            <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-300">
              {actionError}
            </p>
          )}

          <div className="bottom-bar">
            <div className="bottom-bar-inner">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[13px] text-zinc-400">Your total</span>
                <span className="money-lg">{fmtRp(myTotal)}</span>
              </div>
              <button
                onClick={() => setSheet(true)}
                disabled={myTotal <= 0 || isPending}
                className="btn btn-ok btn-block"
              >
                {isPending ? <Spinner size={16} /> : <Check size={17} />}
                {isPending
                  ? "Waiting for approval"
                  : isRejected
                    ? "Send confirmation again"
                    : "I've paid, tell the host"}
              </button>
              {isPending && (
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  Sent {fmtRp(payment?.total ?? 0)}
                  {payment?.method ? ` via ${payment.method}` : ""} · host will verify
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => (submitting ? null : setSheet(false))}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between">
              <p className="label">Confirm your payment</p>
              <button
                onClick={() => setSheet(false)}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Close"
              >
                <Close size={16} />
              </button>
            </div>
            <p className="money-lg">{fmtRp(myTotal)}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {host?.name || "The host"} will get this and approve it.
            </p>

            <p className="label mt-4 mb-2">How did you pay?</p>
            <div className="flex flex-wrap gap-1.5">
              {methods.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`pill ${method === m ? "pill-on" : ""}`}
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="label mb-2 mt-4">Transfer proof (optional)</p>
            <div className="flex items-center gap-3">
              <label className="btn btn-secondary btn-sm cursor-pointer">
                <Upload size={14} />
                {proof ? "Change" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickProof(e.target.files?.[0] ?? null)}
                />
              </label>
              {proofUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proofUrl} alt="proof" className="proof-thumb" />
              )}
              {proof && (
                <button onClick={() => pickProof(null)} className="text-[11px] text-zinc-500 hover:text-red-400">
                  remove
                </button>
              )}
            </div>

            <p className="label mb-2 mt-4">Note (optional)</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. transfer from my wife's account"
              className="input !h-10 text-sm"
            />

            {actionError && <p className="mt-3 text-[12px] text-red-400">{actionError}</p>}

            <button onClick={submit} disabled={submitting} className="btn btn-ok btn-block mt-4">
              {submitting ? <Spinner size={16} /> : <Check size={16} />}
              {submitting ? "Sending…" : `Send to ${host?.name || "host"}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-600">
              Nothing is marked paid until your host approves it.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
