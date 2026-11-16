"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtRp } from "@/lib/api";
import { AppHeader, Close, Plus, Spinner, Users, Wallet } from "@/lib/ui";

export default function AssignPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [settings, setSettings] = useState<{ name: string; phone: string; accounts: any[] }>({
    name: "kamu",
    phone: "",
    accounts: [],
  });
  const [participants, setParticipants] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [hostMode, setHostMode] = useState<"me" | "other">("me");
  const [hostName, setHostName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("sb_draft");
    if (!raw) {
      router.replace("/new");
      return;
    }
    setDraft(JSON.parse(raw));
    api("/settings")
      .then((s) => setSettings(s))
      .catch(() => {});
  }, [router]);

  if (!draft) return <main className="page" />;

  const addParticipant = () => {
    const name = newName.trim();
    if (!name || participants.some((p) => p.toLowerCase() === name.toLowerCase())) return;
    setParticipants((p) => [...p, name]);
    setNewName("");
  };

  const hostOk = hostMode === "me" || hostName.trim().length > 0;
  const canSave = participants.length > 0 && hostOk && !saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const bill = await api("/bills", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          items: draft.items,
          subtotal: draft.subtotal,
          total: draft.total,
          participants,
          assignments: {},
          host_is_owner: hostMode === "me",
          host_name: hostMode === "me" ? settings.name : hostName.trim(),
        }),
      });
      await Promise.all(
        participants.map((p) =>
          api(`/bills/${bill.id}/paylink/${encodeURIComponent(p)}`, { method: "POST" }).catch(
            () => null
          )
        )
      );
      sessionStorage.removeItem("sb_draft");
      router.replace(`/bill/${bill.id}`);
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
      setSaving(false);
    }
  };

  return (
    <main className="page page-bar">
      <AppHeader title="Siapa saja yang ikut" subtitle={draft.title} back="/new" />

      {/* Host */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={14} className="text-zinc-500" />
          <h2 className="label">Yang nagih (host)</h2>
        </div>
        <div className="card p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setHostMode("me")}
              className={`pill ${hostMode === "me" ? "pill-on" : ""}`}
            >
              Saya · {settings.name}
            </button>
            <button
              onClick={() => setHostMode("other")}
              className={`pill ${hostMode === "other" ? "pill-on" : ""}`}
            >
              Orang lain
            </button>
          </div>

          {hostMode === "other" && (
            <input
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Nama host, misal Budi"
              className="input mt-3 !h-10 text-sm"
            />
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            {hostMode === "me" ? (
              settings.accounts.length > 0 ? (
                <>
                  Rekening kamu ikut terkirim:{" "}
                  <span className="text-zinc-300">
                    {settings.accounts.map((a: any) => a.label).join(", ")}
                  </span>
                  {settings.phone ? ` · WA ${settings.phone}` : ""}.{" "}
                  <a
                    href="https://dashboard.rakhawiratama.com/projects/2"
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    Ubah di Hub
                  </a>
                </>
              ) : (
                <>
                  Belum ada rekening di Wipiii Hub. Temanmu hanya akan lihat nama kamu.{" "}
                  <a
                    href="https://dashboard.rakhawiratama.com/projects/2"
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    Isi app config
                  </a>
                </>
              )
            ) : (
              <>Info rekening tidak dibagikan. Temanmu cuma dapat nama host dan total bagiannya.</>
            )}
          </p>
        </div>
      </section>

      {/* Participants */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <Users size={14} className="text-zinc-500" />
          <h2 className="label">Peserta ({participants.length})</h2>
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())}
            placeholder="Nama teman…"
            className="input flex-1"
          />
          <button onClick={addParticipant} className="btn btn-secondary !px-4" aria-label="Tambah">
            <Plus size={17} />
          </button>
        </div>
        {participants.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {participants.map((p) => (
              <span key={p} className="pill pill-on cursor-default">
                {p}
                <button
                  onClick={() => setParticipants((ps) => ps.filter((x) => x !== p))}
                  aria-label={`Hapus ${p}`}
                >
                  <Close size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
            Tambahkan nama temanmu. Nanti mereka yang centang sendiri item yang mereka makan lewat
            link masing-masing, kamu tidak perlu bagi-bagi manual.
          </p>
        )}
      </section>

      {/* What they'll see */}
      <section className="card p-4">
        <h2 className="label mb-2">Yang mereka lakukan</h2>
        <ol className="space-y-1.5 text-[12px] leading-relaxed text-zinc-400">
          <li>1. Buka link pribadinya (tanpa login).</li>
          <li>2. Centang item yang dia makan, item bareng otomatis dibagi.</li>
          <li>3. Lihat totalnya, transfer ke {hostMode === "me" ? "kamu" : hostName || "host"}.</li>
        </ol>
        <p className="mt-3 border-t border-[var(--line)] pt-3 text-[11px] text-zinc-500">
          Item yang tidak dicentang siapa pun tetap dihitung sebagai bagianmu.
        </p>
      </section>

      {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-zinc-500">{participants.length} peserta</span>
            <span className="num text-zinc-300">{fmtRp(draft.total)}</span>
          </div>
          <button onClick={save} disabled={!canSave} className="btn btn-primary btn-block">
            {saving ? <Spinner size={16} /> : null}
            {saving ? "Menyimpan…" : "Buat bill & link"}
          </button>
        </div>
      </div>
    </main>
  );
}
