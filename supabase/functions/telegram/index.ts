// telegram: the Lyceum Life bot.
//  • internal hook (pg_net, x-hook-secret): mirrors each notification to the linked Telegram chat; leave requests get decision buttons
//  • Telegram webhook (secret token header): /start <code> links an account, buttons decide a leave, a reply gives the rejection reason
//  • Mini App calls: login (initData → session), link (initData + JWT), link_url (JWT → t.me deep link)
//  • GET ?setup=1 registers the webhook, menu button and commands (idempotent)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { checkInitData } from "./initdata.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://bberikulu-itbil.github.io/key-to-life/";
const SELF_URL = `${SB_URL}/functions/v1/telegram`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) console.error(method, j.description);
  return j;
}

let hookSecret = "";
async function secret() {
  if (!hookSecret) hookSecret = (await admin.from("app_secrets").select("value").eq("name", "hook").single()).data!.value;
  return hookSecret;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
// Telegram puts its own launch data in the URL hash, so the route travels in ?r=
const appButton = (link: string | null, text = "Lyceum Life ашу") => ({ text, web_app: { url: `${APP_URL}?r=${encodeURIComponent(link || "/")}` } });

/* ---------- notification → Telegram ---------- */
async function sendNotification(id: number) {
  const { data: p, error } = await admin.rpc("telegram_payload", { p_id: id });
  if (error || !p) return;
  let text = `<b>${esc(p.title)}</b>`;
  if (p.body) text += `\n${esc(p.body)}`;
  const rows: unknown[][] = [];
  if (p.leave) {
    text += `\n\n<i>Себебі:</i> ${esc(p.leave.reason)}`;
    const ct = p.leave.status === "pending_class_teacher";
    rows.push([
      { text: ct ? "✅ Келісемін" : "✅ Рұқсат беру", callback_data: `l:${p.leave.id}:1` },
      { text: ct ? "❌ Келіспеймін" : "❌ Бас тарту", callback_data: `l:${p.leave.id}:0` },
    ]);
  }
  rows.push([appButton(p.link, "Қосымшада ашу")]);
  await tg("sendMessage", { chat_id: p.tg_id, text, parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
}

const RESULT: Record<string, string> = {
  approved: "✅ Рұқсат берілді", rejected: "❌ Рұқсат берілмеді", pending_deputy: "↪️ Жауабыңыз орынбасарға жіберілді",
};

async function decide(tgId: number, leaveId: string, approve: boolean, note: string | null) {
  const { data, error } = await admin.rpc("telegram_decide_leave", { p_tg: tgId, p_leave: leaveId, p_approve: approve, p_note: note });
  if (error) throw new Error(error.message);
  return RESULT[data as string] ?? "Сақталды";
}

/* ---------- Telegram webhook ---------- */
// deno-lint-ignore no-explicit-any
async function onUpdate(u: any) {
  if (u.callback_query) {
    const q = u.callback_query;
    const [kind, leaveId, v] = String(q.data ?? "").split(":");
    if (kind !== "l") return tg("answerCallbackQuery", { callback_query_id: q.id });
    const msg = q.message;
    if (v === "1") {
      try {
        const res = await decide(q.from.id, leaveId, true, null);
        await tg("editMessageText", { chat_id: msg.chat.id, message_id: msg.message_id, text: `${msg.text}\n\n${res}`, reply_markup: { inline_keyboard: [] } });
        return tg("answerCallbackQuery", { callback_query_id: q.id, text: res });
      } catch (e) {
        return tg("answerCallbackQuery", { callback_query_id: q.id, text: (e as Error).message, show_alert: true });
      }
    }
    // rejection needs a reason: ask for it and wait for the reply
    await admin.from("telegram_pending").upsert({ tg_id: q.from.id, leave_id: leaveId, message_id: msg.message_id, created_at: new Date().toISOString() });
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    return tg("sendMessage", { chat_id: msg.chat.id, text: "Бас тарту себебін бір хабармен жазыңыз:", reply_markup: { force_reply: true, input_field_placeholder: "Себебі" } });
  }

  const m = u.message;
  if (!m?.text || m.chat?.type !== "private") return;
  const from = m.from;

  if (m.text.startsWith("/start")) {
    const code = m.text.split(" ")[1]?.trim();
    if (code) {
      const { data: c } = await admin.from("telegram_codes").select("user_id, expires_at").eq("code", code).maybeSingle();
      if (!c || new Date(c.expires_at) < new Date()) {
        return tg("sendMessage", { chat_id: m.chat.id, text: "Сілтеменің мерзімі өткен. Қосымшада Профиль → «Байланыстыру» батырмасын қайта басыңыз." });
      }
      await linkAccount(c.user_id, from.id, from.username);
      await admin.from("telegram_codes").delete().eq("code", code);
      const { data: prof } = await admin.from("profiles").select("full_name").eq("id", c.user_id).single();
      return tg("sendMessage", {
        chat_id: m.chat.id, text: `Сәлем, ${prof?.full_name ?? ""}! Аккаунтыңыз байланысты. Енді рұқсат сұраулары мен хабарламалар осында келеді.`,
        reply_markup: { inline_keyboard: [[appButton("/")]] },
      });
    }
    return tg("sendMessage", {
      chat_id: m.chat.id, text: "Lyceum Life — лицейдің іс-шаралары, рұқсаттар, бронь және чаттар.\n\nТөмендегі батырманы басып, бір рет ЖСН-мен кіріңіз — аккаунтыңыз осы Telegram-ға байланысады.",
      reply_markup: { inline_keyboard: [[appButton("/")]] },
    });
  }

  // a reply after «Бас тарту»
  const { data: pend } = await admin.from("telegram_pending").select("leave_id, message_id, created_at").eq("tg_id", from.id).maybeSingle();
  if (pend && Date.now() - new Date(pend.created_at).getTime() < 15 * 60_000) {
    await admin.from("telegram_pending").delete().eq("tg_id", from.id);
    try {
      const res = await decide(from.id, pend.leave_id, false, m.text);
      if (pend.message_id) await tg("editMessageReplyMarkup", { chat_id: m.chat.id, message_id: pend.message_id, reply_markup: { inline_keyboard: [] } });
      return tg("sendMessage", { chat_id: m.chat.id, text: `${res}. Себебі: ${m.text}` });
    } catch (e) {
      return tg("sendMessage", { chat_id: m.chat.id, text: (e as Error).message });
    }
  }
  return tg("sendMessage", { chat_id: m.chat.id, text: "Қосымшаны ашу үшін төмендегі батырманы басыңыз.", reply_markup: { inline_keyboard: [[appButton("/")]] } });
}

async function linkAccount(userId: string, tgId: number, username?: string) {
  await admin.from("telegram_links").update({ tg_id: null, tg_username: null }).eq("tg_id", tgId).neq("user_id", userId);
  await admin.from("telegram_links").upsert({ user_id: userId, tg_id: tgId, tg_username: username ?? null, linked_at: new Date().toISOString() });
}

async function userFromJwt(req: Request) {
  const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const { data } = await admin.auth.getUser(jwt);
  return data.user;
}

let botName = "";
async function botUsername() {
  if (!botName) botName = (await tg("getMe", {})).result?.username ?? "";
  return botName;
}

/* ---------- entry ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN орнатылмаған" }, 503);
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("setup")) {
    const webhook = await tg("setWebhook", { url: SELF_URL, secret_token: await secret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    const menu = await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Lyceum Life", web_app: { url: APP_URL } } });
    const cmds = await tg("setMyCommands", { commands: [{ command: "start", description: "Бастау" }] });
    return json({ webhook: webhook.ok, menu: menu.ok, commands: cmds.ok, bot: await botUsername() });
  }

  if (req.headers.get("x-telegram-bot-api-secret-token")) {
    if (req.headers.get("x-telegram-bot-api-secret-token") !== await secret()) return new Response("forbidden", { status: 403 });
    try { await onUpdate(await req.json()); } catch (e) { console.error(e); }
    return new Response("ok");   // always 200, or Telegram retries the update forever
  }

  const body = await req.json().catch(() => ({}));

  if (req.headers.get("x-hook-secret")) {
    if (req.headers.get("x-hook-secret") !== await secret()) return new Response("forbidden", { status: 403 });
    if (body.type === "notification") await sendNotification(Number(body.id));
    return json({ ok: true });
  }

  try {
    if (body.action === "login") {
      const tgUser = await checkInitData(String(body.initData ?? ""), TOKEN);
      if (!tgUser) return json({ error: "Telegram деректері расталмады" }, 401);
      const { data: link } = await admin.from("telegram_links").select("user_id").eq("tg_id", tgUser.id).maybeSingle();
      if (!link) return json({});
      const { data: u } = await admin.auth.admin.getUserById(link.user_id);
      if (!u.user?.email) return json({});
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      if (error) throw error;
      return json({ token_hash: data.properties.hashed_token });
    }
    if (body.action === "link") {
      const tgUser = await checkInitData(String(body.initData ?? ""), TOKEN);
      const user = await userFromJwt(req);
      if (!tgUser || !user) return json({ error: "Расталмады" }, 401);
      await linkAccount(user.id, tgUser.id, tgUser.username);
      return json({ ok: true });
    }
    if (body.action === "link_url") {
      const user = await userFromJwt(req);
      if (!user) return json({ error: "Кіріңіз" }, 401);
      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
      await admin.from("telegram_codes").insert({ code, user_id: user.id });
      return json({ url: `https://t.me/${await botUsername()}?start=${code}` });
    }
    return json({ error: "Белгісіз әрекет" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
