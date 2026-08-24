"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AssignPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  // assignments: participant -> Set of item ids
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("sb_draft");
    if (!raw) {
      router.replace("/new");
      return;
    }
    setDraft(JSON.parse(raw));
  }, [router]);

  if (!draft) return <main className="min-h-screen" />;

  const addParticipant = () => {
    const name = newName.trim();
    if (!name || participants.includes(name)) return;
    setParticipants((p) => [...p, name]);
    setAssignments((a) => ({ ...a, [name]: [] }));
    setNewName("");
  };

  const toggleItem = (participant: string, itemId: string) => {
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

  const unassigned = draft.items.filter(
    (it: any) => !Object.values(assignments).some((ids) => ids.includes(it.id))
  );

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          items: draft.items,
          subtotal: draft.subtotal,
          total: draft.total,
          participants,
          assignments,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
      sessionStorage.removeItem("sb_draft");
      router.push(`/bill/${d.id}`);
    } finally {
      setSaving(false);
    }
  };

  const canSave = participants.length > 0 && unassigned.length === 0;

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-zinc-100">Assign participants</h1>
        <a href="/new" className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg px-3 py-1.5">
          Back
        </a>
      </header>

      {/* Add participant */}
      <div className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addParticipant()}
          placeholder="Participant name..."
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={addParticipant}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg px-4"
        >
          + Add
        </button>
      </div>

      {participants.length > 0 && unassigned.length > 0 && (
        <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2 mb-4">
          ⚠ {unassigned.length} item(s) not yet assigned
        </p>
      )}

      {/* Participants × items matrix */}
      <div className="space-y-4">
        {participants.map((p) => (
          <div key={p} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-200">{p}</h2>
              <button
                onClick={() => {
                  setParticipants((ps) => ps.filter((x) => x !== p));
                  setAssignments(({ [p]: _, ...rest }) => rest);
                }}
                className="text-xs text-zinc-600 hover:text-red-400"
              >
                remove
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.items.map((it: any) => {
                const on = (assignments[p] || []).includes(it.id);
                return (
                  <button
                    key={it.id}
                    onClick={() => toggleItem(p, it.id)}
                    className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                      on
                        ? "bg-blue-600/20 border-blue-500 text-blue-300"
                        : "bg-zinc-950 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {it.name} · {it.qty}×
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!canSave || saving}
        className="w-full mt-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors"
      >
        {saving ? "Saving..." : "Save & see report"}
      </button>
    </main>
  );
}
