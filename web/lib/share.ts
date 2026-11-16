import { fmtRp } from "./api";

export type Host = {
  name: string;
  is_owner: boolean;
  phone?: string;
  accounts?: { label: string; number: string; holder?: string }[];
};

/** Payment instructions block. Bank details only ever appear for the owner. */
export function hostBlock(host?: Host | null): string[] {
  if (!host) return [];
  if (!host.is_owner) {
    return ["", `Bayar langsung ke ${host.name} ya (transfer atau tunai ke dia).`];
  }
  const rows: string[] = ["", `Transfer ke ${host.name}:`];
  for (const a of host.accounts || []) {
    rows.push(`• ${a.label} ${a.number}${a.holder ? ` a/n ${a.holder}` : ""}`);
  }
  if (host.phone) rows.push(`• Hubungi/WA: ${host.phone}`);
  if (rows.length === 2) rows.push("• (info rekening belum diisi)");
  return rows;
}

export function payMessage({
  title,
  participant,
  total,
  host,
  url,
}: {
  title: string;
  participant: string;
  total?: number;
  host?: Host | null;
  url: string;
}) {
  type Row = string;
  const rows: Row[] = [`Halo ${participant}! Ini split bill ${title}.`, ""];
  if (typeof total === "number" && total > 0) {
    rows.push(`Bagian kamu: ${fmtRp(total)}`);
  } else {
    rows.push("Centang item yang kamu makan di link bawah ya, nanti totalnya muncul sendiri.");
  }
  rows.push(...hostBlock(host), "", `Rincian: ${url}`, "", "Makasih ya!");
  return rows.join("\n");
}

export function generalMessage({
  title,
  total,
  people,
  host,
  url,
}: {
  title: string;
  total: number;
  people: { name: string; total: number }[];
  host?: Host | null;
  url: string;
}) {
  return [
    `Split bill ${title}`,
    `Total ${fmtRp(total)} · ${people.length} orang`,
    "",
    ...people.map((p) => `• ${p.name}: ${fmtRp(p.total)}`),
    ...hostBlock(host),
    "",
    `Rincian: ${url}`,
  ].join("\n");
}

export function waLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  }
}
