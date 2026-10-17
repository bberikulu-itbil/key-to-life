// The roll call message the bot posts to an activity's Telegram group, in the sender's language.
import { bt, type Lang } from "./bot-i18n.ts";
export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

export type Roll = {
  title: string; date: string; start: string; end: string; type: string | null; lang?: Lang | null
  rows: { name: string; status: "present" | "late" | "excused" | "absent" | null; late_min: number | null; excuse: "sick" | "other" | null }[]
};

const SQ = { present: "🟩", late: "🟦", excused: "🟨", absent: "🟥" } as const;

// shortcut: one message (Telegram limit 4096 chars ≈ 90 participants); split into several when a group gets bigger
export function rollcallText(p: Roll) {
  const L = p.lang ?? "kk", t = (s: string, ...v: unknown[]) => bt(L, s, ...v);
  const n = (s: string | null) => p.rows.filter((r) => r.status === s).length;
  const [y, m, d] = p.date.split("-");
  const lines = p.rows.map((r, i) => {
    const extra = r.status === "late" && r.late_min ? ` (${t("{0} мин", r.late_min)})`
      : r.status === "excused" && r.excuse ? ` (${t(r.excuse === "sick" ? "ауырып қалды" : "басқа себеп")})` : "";
    return `${i + 1}. ${r.status ? SQ[r.status] : "⬜"} ${esc(r.name)}${extra}`;
  });
  const unmarked = n(null);
  return [
    `<b>${t("Түгелдеу")} · ${esc(p.title)}</b>`,
    `${d}.${m}.${y} · ${p.start}–${p.end}${p.type ? ` · ${esc(p.type)}` : ""}`,
    "",
    `🟩 ${t("келді")} — ${n("present")}   🟦 ${t("кешікті")} — ${n("late")}`,
    `🟨 ${t("себепті")} — ${n("excused")}   🟥 ${t("келмеді")} — ${n("absent")}${unmarked ? `   ⬜ ${t("белгісіз")} — ${unmarked}` : ""}`,
    "",
    ...lines,
  ].join("\n");
}
