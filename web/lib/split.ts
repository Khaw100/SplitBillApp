// Client-side mirror of api/main.py::compute_result — used for the live
// preview while assigning. The server stays authoritative for saved bills.

export type Item = { id: string; name: string; qty: number; price: number };

export type Line = Item & { line_total: number; shared_by: number };

export type PersonResult = {
  name: string;
  lines: Line[];
  subtotal: number;
  total: number;
  others: number;
};

export type Draft = {
  title: string;
  currency?: string;
  items: Item[];
  subtotal: number;
  total: number;
  participants?: string[];
  assignments?: Record<string, string[]>;
};

export const DRAFT_KEY = "sb_draft";

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function computeSplit(items: Item[], assignments: Record<string, string[]>, total: number): PersonResult[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const shareCount = new Map<string, number>();
  for (const ids of Object.values(assignments))
    for (const id of new Set(ids)) shareCount.set(id, (shareCount.get(id) || 0) + 1);

  const people = Object.entries(assignments).map(([name, ids]) => {
    let sub = 0;
    const lines: Line[] = [];
    for (const id of new Set(ids)) {
      const it = byId.get(id);
      if (!it) continue;
      const n = shareCount.get(id) || 1;
      const lt = ((Number(it.price) || 0) * (Number(it.qty) || 0)) / n;
      sub += lt;
      lines.push({ ...it, line_total: Math.round(lt), shared_by: n });
    }
    return { name, lines, sub };
  });

  const assignedSum = people.reduce((a, p) => a + p.sub, 0);
  const grand = Math.round(Number(total) || 0);
  const raw = people.map((p) => (assignedSum ? (p.sub / assignedSum) * grand : 0));
  const totals = raw.map(Math.floor);
  let leftover = grand - totals.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - totals[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (leftover <= 0) break;
    totals[i] += 1;
    leftover -= 1;
  }

  return people.map((p, i) => ({
    name: p.name,
    lines: p.lines,
    subtotal: Math.round(p.sub),
    total: totals[i],
    others: totals[i] - Math.round(p.sub),
  }));
}

export function itemsSum(items: Item[]) {
  return items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
}
