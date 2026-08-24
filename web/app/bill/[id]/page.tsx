"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, fmtRp } from "@/lib/api";

export default function BillReport() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<any>(null);
  const [result, setResult] = useState<any[] | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // fetch bill, then compute result via a temp share (server-side math)
  useEffect(() => {
    if (!id) return;
    api(`/bills/${id}`).then(async (b) => {
      setBill(b);
      const s = await api(`/bills/${id}/share`, { method: "POST" });
      const snap = await fetch(`/api/share/${s.share_id}`).then((r) => r.json());
      setResult(snap.result);
    });
  }, [id]);

  if (!bill) {
    return <main className="min-h-screen flex items-center justify-center text-sm text-zinc-500">Loading…</main>;
  }

  const itemsById = Object.fromEntries(bill.items.map((i: any) => [i.id, i]));
  const grand = bill.total;
  const perPerson = grand / Math.max(1, (result || bill.participants).length);

  const buildText = () => {
    const lines: string[] = [`💵 ${bill.title} — SPLIT RESULT`, ""];
    for (const p of result || []) {
      lines.push(`👤 ${p.name} — total ${fmtRp(p.total)}`);
      for (const l of p.lines) {
        const shared = l.shared_by > 1 ? ` (split ${l.shared_by}x)` : "";
        lines.push(`   • ${l.name} ${l.qty}× : ${fmtRp(l.line_total)}${shared}`);
      }
      lines.push(`   subtotal ${fmtRp(p.subtotal)} + others* ${fmtRp(p.others)}`);
      lines.push("");
    }
    lines.push("TOTAL: " + fmtRp(grand));
    lines.push("*tax/service/discount");
    return lines.join("\n");
  };

  const copy = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  const downloadCsv = () => {
    const rows = ["participant,item,qty,price_per_unit,line_total"];
    for (const p of result || [])
      for (const l of p.lines)
        rows.push(`"${p.name}","${l.name}",${l.qty},${l.price},${l.line_total}`);
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${bill.title.replace(/\W+/g, "_")}_split.csv`;
    a.click();
  };

  const makeShare = async () => {
    const s = await api(`/bills/${id}/share`, { method: "POST" });
    setShareUrl(`${location.origin}/s/${s.share_id}`);
  };

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{bill.title}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Split report</p>
        </div>
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg px-3 py-1.5">
          ← Bills
        </a>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card label="People" value={String((result || bill.participants).length)} />
        <Card label="Grand total" value={fmtRp(grand)} accent />
        <Card label="Per person" value={fmtRp(perPerson)} />
      </div>

      {/* Export bar */}
      <div className="flex gap-2 mb-8">
        <button onClick={() => copy(buildText(), "copy")} className="flex-1 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg py-2.5 font-medium text-zinc-300 transition-colors">
          {copied === "copy" ? "✓ Copied!" : "📋 Copy result"}
        </button>
        <button onClick={downloadCsv} className="flex-1 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg py-2.5 font-medium text-zinc-300 transition-colors">
          ⬇️ CSV
        </button>
        <button onClick={makeShare} className="flex-1 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg py-2.5 font-semibold text-white transition-colors">
          🔗 Share link
        </button>
      </div>

      {shareUrl && (
        <div
          onClick={() => copy(shareUrl, "url")}
          className="cursor-pointer bg-blue-950/30 border border-blue-900 rounded-xl px-4 py-3 mb-8 text-xs text-blue-300 truncate"
          title="Click to copy"
        >
          {copied === "url" ? "✓ Link copied — send it to your friends!" : shareUrl}
        </div>
      )}

      {/* Per-participant breakdown */}
      <div className="space-y-4">
        {(result || []).map((p) => (
          <div key={p.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-200">{p.name}</h2>
              <p className="text-sm"><span className="text-zinc-500 text-xs mr-2">TOTAL</span>
                <span className="font-bold text-blue-400">{fmtRp(p.total)}</span></p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {p.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2 text-zinc-300">{l.name}{l.shared_by > 1 &&
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/80">÷{l.shared_by}</span>}
                    </td>
                    <td className="py-2 text-right text-zinc-500">{l.qty}×</td>
                    <td className="py-2 text-right text-zinc-400">{fmtRp(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-zinc-600 mt-2">
              subtotal {fmtRp(p.subtotal)} · others* {fmtRp(p.others)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-700 mt-4">*tax, service, discount etc.</p>
    </main>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-blue-950/20 border-blue-900/60" : "bg-zinc-900 border-zinc-800"}`}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1">{label}</p>
      <p className={`font-bold ${accent ? "text-blue-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}
