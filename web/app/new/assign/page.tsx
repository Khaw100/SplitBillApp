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
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
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
    setAssignments((a) => ({ ...a, [name]: [] }));
    setNewName("");
  };

  const removeParticipant = (name: string) => {
    setParticipants((ps) => ps.filter((x) => x !== name));
    setAssignments(({ [name]: _drop, ...rest }) => rest);
  };

  const toggle = (participant: string, itemId: string) => {
    setAssignments((prev) => {
      const cur = prev[participant] || [];
      return {
        ...prev,
        [participant]: cur.includes(itemId)
          ? cur.filter((i) => i !== itemId)
          : [...cur, itemId],
      };
    });
  };

  const assignAll = (mode: "all" | "clear") => {
    setAssignments(() => {
      const next: Record<string, string[]> = {};
      for (const p of participants) {
        next[p] = mode === "all" ? draft.items.map((it: any) => it.id) : [];
      }
      return next;
    });
  };

  const unassigned = draft.items.filter(
    (it: any) => !Object.values(assignments).some((ids) => ids.includes(it.id))
  );

  const hostOk = hostMode === "me" || hostName.trim().length > 0;
  const canSave = participants.length > 0 && unassigned.length === 0 && hostOk && !saving;

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
          assignments,
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
      <AppHeader title="Pilih peserta" subtitle={draft.title} back="/new" />

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
        {participants.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {participants.map((p) => (
              <span key={p} className="pill pill-on cursor-default">
                {p}
                <button onClick={() => removeParticipant(p)} aria-label={`Hapus ${p}`}>
                  <Close size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Items */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label">Siapa makan apa</h2>
          {participants.length > 1 && (
            <div className="flex gap-3 text-[11px]">
              <button onClick={() => assignAll("all")} className="text-blue-400">
                Bagi rata
              </button>
              <button onClick={() => assignAll("clear")} className="text-zinc-500">
                Kosongkan
              </button>
            </div>
          )}
        </div>

        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {draft.items.map((it: any) => {
            const picked = participants.filter((p) => (assignments[p] || []).includes(it.id));
            return (
              <div key={it.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                    {it.name} <span className="text-zinc-500">· {it.qty}×</span>
                  </p>
                  <p className="num shrink-0 text-sm text-zinc-300">{fmtRp(it.price * it.qty)}</p>
                </div>
                {participants.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-zinc-600">tambah peserta dulu</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {participants.map((p) => {
                      const on = (assignments[p] || []).includes(it.id);
                      return (
                        <button
                          key={p}
                          onClick={() => toggle(p, it.id)}
                          className={`pill !h-7 !text-[12px] ${on ? "pill-on" : ""}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {picked.length > 1 && (
                      <span className="tag tag-accent self-center">
                        dibagi {picked.length}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {unassigned.length > 0 && participants.length > 0 && (
          <p className="mt-2.5 text-[11px] text-amber-400/90">
            {unassigned.length} item belum ada yang tanggung:{" "}
            {unassigned.map((u: any) => u.name).join(", ")}
          </p>
        )}
        {error && <p className="mt-2.5 text-[13px] text-red-400">{error}</p>}
      </section>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-zinc-500">
              {participants.length} peserta
              {unassigned.length > 0 ? ` · ${unassigned.length} item belum` : ""}
            </span>
            <span className="num text-zinc-300">{fmtRp(draft.total)}</span>
          </div>
          <button onClick={save} disabled={!canSave} className="btn btn-primary btn-block">
            {saving ? <Spinner size={16} /> : null}
            {saving ? "Menyimpan…" : "Simpan & buat link"}
          </button>
        </div>
      </div>
    </main>
  );
}
