import { fmtRp } from "./api";

export { copyText } from "./api";

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
    return ["", `Please pay ${host.name} directly (transfer or cash).`];
  }
  const rows: string[] = ["", `Transfer to ${host.name}:`];
  for (const a of host.accounts || []) {
    rows.push(`• ${a.label} ${a.number}${a.holder ? ` (${a.holder})` : ""}`);
  }
  if (host.phone) rows.push(`• Phone/WhatsApp: ${host.phone}`);
  if (rows.length === 2) rows.push("• (no payment details added yet)");
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
  const rows: string[] = [`Hi ${participant}! Here's the split for ${title}.`, ""];
  if (typeof total === "number" && total > 0) {
    rows.push(`Your share: ${fmtRp(total)}`);
  } else {
    rows.push("Tick what you had using the link below, your total will show up automatically.");
  }
  rows.push(...hostBlock(host), "", `Details: ${url}`, "", "Thanks!");
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
    `Split bill: ${title}`,
    `Total ${fmtRp(total)} · ${people.length} ${people.length === 1 ? "person" : "people"}`,
    "",
    ...people.map((p) => `• ${p.name}: ${fmtRp(p.total)}`),
    ...hostBlock(host),
    "",
    `Details: ${url}`,
  ].join("\n");
}

export function waLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
