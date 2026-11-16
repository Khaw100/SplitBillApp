"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtRp } from "@/lib/api";
import { AppHeader, Close, Plus, Spinner, Users, Wallet } from "@/lib/ui";

const DRAFT_KEY = "sb_draft";
const HUB_CONFIG_URL = "https://dashboard.rakhawiratama.com/projects/2";

export default function AssignPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [settings, setSettings] = useState<{ name: string; phone: string; accounts: any[] }>({
    name: "you",
    phone: "",
    accounts: [],
  });
  const [participants, setParticipants] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [hostMode, setHostMode] = useState<"me" | "other">("me");
  const [hostName, setHostName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let d: any = null;
    try {
      d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    } catch {}
    if (!d?.items?.length) {
      router.replace("/new");
      return;
    }
    setDraft(d);
    setParticipants(Array.isArray(d.participants) ? d.participants : []);
    if (d.hostMode === "other") setHostMode("other");
    if (typeof d.hostName === "string") setHostName(d.hostName);
    api("/settings")
      .then((s) => setSettings(s))
      .catch(() => {});
  }, [router]);

  // Keep people/host in the draft so "Back" → edit items → "Next" doesn't lose them.
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, participants, hostMode, hostName }));
    } catch {}
  }, [draft, participants, hostMode, hostName]);

  if (!draft)
    return (
      <main className="page flex min-h-[60dvh] items-center justify-center">
        <Spinner size={20} />
      </main>
    );

  const addParticipant = () => {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (participants.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNameError(`“${name}” is already on the list`);
      return;
    }
    setParticipants((p) => [...p, name]);
    setNewName("");
    setNameError(null);
  };

  const hostOk = hostMode === "me" || hostName.trim().length > 0;
  const canSave = participants.length > 0 && hostOk && !saving;
  const hint = participants.length === 0 ? "Add at least one person" : !hostOk ? "Enter the host's name" : null;

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
      // Pre-create pay links (idempotent); the bill page creates any that fail here.
      await Promise.all(
        participants.map((p) =>
          api(`/bills/${bill.id}/paylink/${encodeURIComponent(p)}`, { method: "POST" }).catch(() => null)
        )
      );
      sessionStorage.removeItem(DRAFT_KEY);
      router.replace(`/bill/${bill.id}`);
    } catch (e: any) {
      setError(e.message || "Couldn't save the bill");
      setSaving(false);
    }
  };

  const hostCard = (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Wallet size={14} className="text-zinc-500" />
        <h2 className="label">Who gets paid (host)</h2>
      </div>
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setHostMode("me")} className={`pill ${hostMode === "me" ? "pill-on" : ""}`}>
            Me · {settings.name}
          </button>
          <button onClick={() => setHostMode("other")} className={`pill ${hostMode === "other" ? "pill-on" : ""}`}>
            Someone else
          </button>
        </div>

        {hostMode === "other" && (
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="Host's name, e.g. Budi"
            className="input mt-3 !h-10 text-sm"
          />
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          {hostMode === "me" ? (
            settings.accounts.length > 0 ? (
              <>
                Your payment details are included:{" "}
                <span className="text-zinc-300">{settings.accounts.map((a: any) => a.label).join(", ")}</span>
                {settings.phone ? ` · WhatsApp ${settings.phone}` : ""}.{" "}
                <a href={HUB_CONFIG_URL} target="_blank" rel="noreferrer" className="link">
                  Edit in Hub
                </a>
              </>
            ) : (
              <>
                No payment accounts in Wipiii Hub yet, so friends will only see your name.{" "}
                <a href={HUB_CONFIG_URL} target="_blank" rel="noreferrer" className="link">
                  Fill in app config
                </a>
              </>
            )
          ) : (
            <>Payment details aren&apos;t shared. Friends only see the host&apos;s name and their own total.</>
          )}
        </p>
      </div>
    </section>
  );

  const peopleCard = (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Users size={14} className="text-zinc-500" />
        <h2 className="label">People ({participants.length})</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addParticipant();
        }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setNameError(null);
          }}
          placeholder="Friend's name…"
          enterKeyHint="done"
          autoCapitalize="words"
          className="input flex-1"
        />
        <button type="submit" disabled={!newName.trim()} className="btn btn-secondary !px-4" aria-label="Add person">
          <Plus size={17} />
        </button>
      </form>
      {nameError && <p className="mt-2 text-[11px] text-amber-400">{nameError}</p>}
      {participants.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {participants.map((p) => (
            <span key={p} className="pill pill-on cursor-default">
              {p}
              <button onClick={() => setParticipants((ps) => ps.filter((x) => x !== p))} aria-label={`Remove ${p}`}>
                <Close size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
          Add your friends&apos; names. Each of them gets a personal link to tick what they had, so you don&apos;t
          have to split anything by hand.
        </p>
      )}
    </section>
  );

  return (
    <main className="page page-bar page-wide">
      <AppHeader title="Who's in?" subtitle={draft.title} back="/new" />

      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-8">
        <div className="space-y-5">
          {hostCard}
          {peopleCard}
        </div>

        <aside className="side-sticky mt-5 lg:mt-0">
          <section className="card p-4">
            <h2 className="label mb-2">What happens next</h2>
            <ol className="space-y-1.5 text-[12px] leading-relaxed text-zinc-400">
              <li>1. Each friend opens their personal link (no login).</li>
              <li>2. They tick what they had; shared items are split automatically.</li>
              <li>3. They see their total and pay {hostMode === "me" ? "you" : hostName.trim() || "the host"}.</li>
            </ol>
            <p className="mt-3 border-t border-[var(--line)] pt-3 text-[11px] text-zinc-500">
              Anything nobody ticks counts as your share.
            </p>
          </section>

          {error && (
            <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-300">
              {error}
            </p>
          )}

          <div className="bottom-bar">
            <div className="bottom-bar-inner">
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="text-zinc-500">
                  {participants.length} {participants.length === 1 ? "person" : "people"}
                  {hint && <span className="text-amber-400/90"> · {hint}</span>}
                </span>
                <span className="num text-zinc-300">{fmtRp(draft.total)}</span>
              </div>
              <button onClick={save} disabled={!canSave} className="btn btn-primary btn-block">
                {saving ? <Spinner size={16} /> : null}
                {saving ? "Saving…" : "Create bill & links"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
