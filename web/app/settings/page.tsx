"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AppHeader, Check, Close, Plus, Spinner } from "@/lib/ui";

type Account = { label: string; number: string; holder: string };

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/settings")
      .then((s: any) => {
        setName(s.name || "");
        setPhone(s.phone || "");
        setAccounts(s.accounts || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (i: number, field: keyof Account, value: string) =>
    setAccounts((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const s = await api("/settings", {
        method: "PUT",
        body: JSON.stringify({ name, phone, accounts }),
      });
      setName(s.name);
      setPhone(s.phone);
      setAccounts(s.accounts);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page page-bar">
      <AppHeader title="Pengaturan" subtitle="profil host" back="/" />

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="label mb-3">Nama & kontak</h2>
            <div className="space-y-3">
              <div>
                <label className="label mb-1.5 block" htmlFor="n">Nama kamu</label>
                <input
                  id="n"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Wipiii"
                  className="input"
                />
                <p className="mt-1.5 text-[11px] text-zinc-600">
                  Muncul sebagai &quot;host&quot; default dan nama penerima di link pembayaran.
                </p>
              </div>
              <div>
                <label className="label mb-1.5 block" htmlFor="p">Nomor HP / WhatsApp</label>
                <input
                  id="p"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812xxxxxxx"
                  inputMode="tel"
                  className="input"
                />
                <p className="mt-1.5 text-[11px] text-zinc-600">
                  Dikirim bersama link supaya temanmu bisa konfirmasi.
                </p>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label">Rekening & e-wallet</h2>
              <button
                onClick={() => setAccounts((a) => [...a, { label: "", number: "", holder: name }])}
                className="flex items-center gap-1 text-[12px] font-medium text-blue-400"
              >
                <Plus size={13} /> Tambah
              </button>
            </div>

            {accounts.length === 0 && (
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
                Belum ada rekening. Kalau kosong, temanmu cuma dapat nama kamu tanpa info transfer.
              </p>
            )}

            <div className="space-y-3">
              {accounts.map((a, i) => (
                <div key={i} className="rounded-xl border border-[var(--line)] p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={a.label}
                      onChange={(e) => update(i, "label", e.target.value)}
                      placeholder="BCA / GoPay / Jago"
                      className="input !h-9 !text-[13px]"
                    />
                    <button
                      onClick={() => setAccounts((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-zinc-600 transition-colors hover:text-red-400"
                      aria-label="Hapus rekening"
                    >
                      <Close size={16} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      value={a.number}
                      onChange={(e) => update(i, "number", e.target.value)}
                      placeholder="Nomor rekening"
                      inputMode="numeric"
                      className="input num !h-9 !text-[13px]"
                    />
                    <input
                      value={a.holder}
                      onChange={(e) => update(i, "holder", e.target.value)}
                      placeholder="Atas nama"
                      className="input !h-9 !text-[13px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error && (
            <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-300">
              {error}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-zinc-600">
            Info ini privat. Hanya muncul di link pembayaran yang kamu buat sendiri sebagai host.
            Kalau host-nya orang lain, tidak ada info rekening yang dibagikan.
          </p>
        </div>
      )}

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <button onClick={save} disabled={saving || loading} className="btn btn-primary btn-block">
            {saving ? <Spinner size={16} /> : saved ? <Check size={16} /> : null}
            {saving ? "Menyimpan…" : saved ? "Tersimpan" : "Simpan"}
          </button>
        </div>
      </div>
    </main>
  );
}
