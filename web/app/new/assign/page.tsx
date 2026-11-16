"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtMoney } from "@/lib/api";
import { type Draft, clearDraft, computeSplit, loadDraft, saveDraft } from "@/lib/split";
import { ActionBar, Alert, Avatar, Container, Icon, Spinner, Stepper, TopBar, btn, input } from "@/components/ui";

export default function AssignPage() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = loadDraft();
    if (!d || !d.items?.length) {
      router.replace("/new");
      return;
    }
    setDraft(d);
    const ps = d.participants || [];
    setParticipants(ps);
    setAssignments(Object.fromEntries(ps.map((p) => [p, d.assignments?.[p] || []])));
  }, [router]);

  // Persist progress so "Back" → edit → "Next" doesn't lose who's in the bill
  useEffect(() => {
    if (draft) saveDraft({ ...draft, participants, assignments });
  }, [draft, participants, assignments]);

  const currency = draft?.currency || "Rp";
  const items = draft?.items || [];

  const preview = useMemo(
    () => (draft ? computeSplit(items, Object.fromEntries(participants.map((p) => [p, assignments[p] || []])), draft.total) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, participants, assignments]
  );

  if (!draft) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <Spinner className="size-6 text-zinc-600" />
      </main>
    );
  }

  const owners = (itemId: string) => participants.filter((p) => (assignments[p] || []).includes(itemId));
  const unassigned = items.filter((it) => owners(it.id).length === 0);

  const addParticipant = () => {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (participants.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNameError(`"${name}" is already added`);
      return;
    }
    setParticipants((p) => [...p, name]);
    setAssignments((a) => ({ ...a, [name]: [] }));
    setNewName("");
    setNameError(null);
    nameRef.current?.focus();
  };

  const removeParticipant = (p: string) => {
    setParticipants((ps) => ps.filter((x) => x !== p));
    setAssignments(({ [p]: _, ...rest }) => rest);
  };

  const toggle = (participant: string, itemId: string) =>
    setAssignments((prev) => {
      const cur = prev[participant] || [];
      return { ...prev, [participant]: cur.includes(itemId) ? cur.filter((i) => i !== itemId) : [...cur, itemId] };
    });

  /** Item → everyone, or nobody if everyone already has it. */
  const toggleEveryone = (itemId: string) => {
    const all = owners(itemId).length === participants.length;
    setAssignments((prev) =>
      Object.fromEntries(
        participants.map((p) => {
          const cur = (prev[p] || []).filter((i) => i !== itemId);
          return [p, all ? cur : [...cur, itemId]];
        })
      )
    );
  };

  const splitAllEqually = () =>
    setAssignments(Object.fromEntries(participants.map((p) => [p, items.map((i) => i.id)])));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const d = await api("/bills", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          currency,
          items: draft.items,
          subtotal: draft.subtotal,
          total: draft.total,
          participants,
          assignments: Object.fromEntries(participants.map((p) => [p, assignments[p] || []])),
        }),
      });
      clearDraft();
      router.push(`/bill/${d.id}`);
    } catch (e: any) {
      setError(e.message || "Couldn't save the bill");
      setSaving(false);
    }
  };

  const canSave = participants.length > 0 && unassigned.length === 0 && !saving;
  const hint =
    participants.length === 0
      ? "Add at least one person"
      : unassigned.length > 0
        ? `${unassigned.length} item${unassigned.length > 1 ? "s" : ""} not assigned yet`
        : null;

  return (
    <>
      <TopBar title="Who ordered what?" subtitle={draft.title} back="/new" />

      <Container className="py-6 pb-36 lg:pb-12">
        <div className="mb-6">
          <Stepper step={2} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-6 min-w-0">
            {/* ── People ─────────────────────────────────────────────── */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h2 className="text-sm font-semibold text-zinc-200 mb-3">People</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addParticipant();
                }}
                className="flex gap-2"
              >
                <input
                  ref={nameRef}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="Add a name, e.g. Budi"
                  enterKeyHint="done"
                  autoCapitalize="words"
                  className={input}
                />
                <button type="submit" disabled={!newName.trim()} className={`${btn.secondary} shrink-0`}>
                  <Icon name="plus" /> <span className="hidden sm:inline">Add</span>
                </button>
              </form>
              {nameError && <p className="text-xs text-amber-400 mt-2">{nameError}</p>}

              {participants.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {participants.map((p) => (
                    <span key={p} className="inline-flex items-center gap-2 rounded-full bg-zinc-950 border border-zinc-800 pl-1 pr-1 py-1">
                      <Avatar name={p} className="size-7 text-[10px]" />
                      <span className="text-sm text-zinc-200 max-w-[10rem] truncate">{p}</span>
                      <button
                        onClick={() => removeParticipant(p)}
                        aria-label={`Remove ${p}`}
                        className="size-6 grid place-items-center rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Icon name="x" className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {participants.length > 1 && (
                <button onClick={splitAllEqually} className="mt-4 text-sm font-medium text-emerald-400 hover:text-emerald-300">
                  Everyone shares everything (split equally)
                </button>
              )}
            </section>

            {/* ── Items ──────────────────────────────────────────────── */}
            {participants.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
                <Icon name="users" className="size-7 mx-auto text-zinc-700" />
                <p className="text-sm text-zinc-400 mt-3">Add the people who joined this bill</p>
                <p className="text-xs text-zinc-600 mt-1">Then tap their names on each item they ordered.</p>
              </div>
            ) : (
              <section>
                <div className="flex items-end justify-between mb-3 gap-3">
                  <h2 className="text-sm font-semibold text-zinc-200">
                    Items <span className="text-zinc-500 font-normal">· tap names to assign</span>
                  </h2>
                  <span className={`text-xs tabular-nums ${unassigned.length ? "text-amber-400" : "text-emerald-400"}`}>
                    {items.length - unassigned.length}/{items.length} assigned
                  </span>
                </div>

                {/* Mobile / tablet: one card per item with name chips */}
                <ul className="space-y-3 lg:hidden">
                  {items.map((it) => {
                    const own = owners(it.id);
                    const lineTotal = it.qty * it.price;
                    return (
                      <li
                        key={it.id}
                        className={`rounded-2xl border p-4 transition-colors ${
                          own.length ? "border-zinc-800 bg-zinc-900/60" : "border-amber-500/30 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-100 break-words">{it.name}</p>
                            <p className="text-xs text-zinc-500 tabular-nums">
                              {it.qty}× {fmtMoney(it.price, currency)}
                              {own.length > 1 && (
                                <span className="text-amber-300/90"> · {fmtMoney(lineTotal / own.length, currency)} each</span>
                              )}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-200 tabular-nums whitespace-nowrap">{fmtMoney(lineTotal, currency)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {participants.map((p) => {
                            const on = own.includes(p);
                            return (
                              <button
                                key={p}
                                onClick={() => toggle(p, it.id)}
                                aria-pressed={on}
                                className={`inline-flex items-center gap-1.5 h-9 rounded-full px-3.5 text-sm border transition-colors ${
                                  on
                                    ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-200"
                                    : "bg-zinc-950 border-zinc-800 text-zinc-400 active:bg-zinc-900"
                                }`}
                              >
                                {on && <Icon name="check" className="size-3.5" />}
                                <span className="max-w-[8rem] truncate">{p}</span>
                              </button>
                            );
                          })}
                          {participants.length > 1 && (
                            <button
                              onClick={() => toggleEveryone(it.id)}
                              className="h-9 rounded-full px-3.5 text-sm text-zinc-500 hover:text-zinc-300 border border-dashed border-zinc-800"
                            >
                              {own.length === participants.length ? "Clear" : "Everyone"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Desktop: items × people matrix */}
                <div className="hidden lg:block rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                        <th className="text-left font-medium px-4 py-3 sticky left-0 bg-zinc-900 min-w-[200px]">Item</th>
                        <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Amount</th>
                        {participants.map((p) => (
                          <th key={p} className="px-2 py-3 font-medium">
                            <div className="flex flex-col items-center gap-1">
                              <Avatar name={p} className="size-7 text-[10px]" />
                              <span className="max-w-[5.5rem] truncate text-zinc-400">{p}</span>
                            </div>
                          </th>
                        ))}
                        <th className="px-3 py-3 font-medium">All</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const own = owners(it.id);
                        return (
                          <tr key={it.id} className={`border-b border-zinc-800/60 last:border-0 ${own.length ? "" : "bg-amber-500/5"}`}>
                            <td className="px-4 py-2.5 sticky left-0 bg-zinc-900">
                              <p className="text-zinc-100">{it.name}</p>
                              <p className="text-xs text-zinc-500 tabular-nums">
                                {it.qty}× {fmtMoney(it.price, currency)}
                                {!own.length && <span className="text-amber-400"> · unassigned</span>}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                              {fmtMoney(it.qty * it.price, currency)}
                            </td>
                            {participants.map((p) => {
                              const on = own.includes(p);
                              return (
                                <td key={p} className="px-2 py-2.5 text-center">
                                  <button
                                    onClick={() => toggle(p, it.id)}
                                    aria-pressed={on}
                                    aria-label={`${p} had ${it.name}`}
                                    className={`size-8 rounded-lg border inline-grid place-items-center transition-colors ${
                                      on
                                        ? "bg-emerald-500 border-emerald-500 text-emerald-950"
                                        : "border-zinc-700 text-transparent hover:border-zinc-500"
                                    }`}
                                  >
                                    <Icon name="check" className="size-4" />
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => toggleEveryone(it.id)}
                                className="text-xs text-zinc-500 hover:text-emerald-300 whitespace-nowrap"
                              >
                                {own.length === participants.length ? "Clear" : "All"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          {/* ── Live preview (sidebar on desktop) ───────────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-200">Preview</h2>
                <span className="text-xs text-zinc-500">incl. tax/service</span>
              </div>
              {preview.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500 text-center">Totals per person show up here.</p>
              ) : (
                <ul className="divide-y divide-zinc-800/60">
                  {preview.map((p) => (
                    <li key={p.name} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={p.name} className="size-7 text-[10px]" />
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{p.name}</span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-100">{fmtMoney(p.total, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between px-4 py-3 border-t border-zinc-800 text-sm">
                <span className="text-zinc-500">Grand total</span>
                <span className="font-bold text-emerald-300 tabular-nums">{fmtMoney(draft.total, currency)}</span>
              </div>
            </div>

            {error && <Alert>{error}</Alert>}

            <ActionBar>
              {hint && <p className="text-center text-xs text-amber-400/90 mb-2">{hint}</p>}
              <button onClick={save} disabled={!canSave} className={`${btn.primary} w-full`}>
                {saving ? (
                  <>
                    <Spinner className="size-4" /> Saving…
                  </>
                ) : (
                  <>
                    Save & see report <Icon name="arrow" />
                  </>
                )}
              </button>
            </ActionBar>
          </aside>
        </div>
      </Container>
    </>
  );
}
