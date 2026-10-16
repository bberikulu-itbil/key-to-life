// admin-users: creates accounts (staff only) and seeds a demo school once.
// Login = ЖСН + password. ЖСН lives only in the auth email, never in profiles.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const emailFor = (iin: string) => `${iin}@users.lyceum-life.app`;

const WORDS = ["алма","бота","дала","егіс","жұлдыз","көл","күн","қала","мұз","нұр","өзен","сая","тау","тұлпар","ұшқын","шың",
  "арна","бүркіт","жел","жиде","қайың","қыран","марал","орман","сақ","тамыр","теңіз","үкі","шабыт","ізгі","нар","бұлақ"];
const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
export const makePassword = () =>
  `${WORDS[rnd(WORDS.length)]}-${WORDS[rnd(WORDS.length)]}-${WORDS[rnd(WORDS.length)]}-${10 + rnd(90)}`;

type Role = "student" | "teacher" | "class_teacher" | "deputy" | "admin";

async function createAccount(o: { iin: string; full_name: string; role: Role; school_id: string; class_id?: string | null; title?: string }) {
  if (!/^\d{12}$/.test(o.iin)) throw new Error("ЖСН 12 саннан тұруы керек");
  const name = o.full_name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Аты-жөнін толық жазыңыз");
  const password = makePassword();
  const { data, error } = await admin.auth.admin.createUser({ email: emailFor(o.iin), password, email_confirm: true });
  if (error) throw new Error(error.message.includes("already") ? "Бұл ЖСН-мен пайдаланушы бар" : error.message);
  const { error: pe } = await admin.from("profiles").insert({
    id: data.user.id, school_id: o.school_id, full_name: name, role: o.role, class_id: o.class_id ?? null, title: o.title ?? null,
  });
  if (pe) { await admin.auth.admin.deleteUser(data.user.id); throw new Error(pe.message); }
  return { id: data.user.id, full_name: name, role: o.role, iin: o.iin, password };
}

async function bootstrap() {
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return json({ error: "Жүйе бұрыннан бапталған" }, 409);

  const { data: school, error } = await admin.from("schools").insert({ name: "Демо лицей", city: "Астана" }).select().single();
  if (error) return json({ error: error.message }, 500);
  const { data: classes } = await admin.from("classes").insert([
    { school_id: school.id, name: "9А", grade: 9 }, { school_id: school.id, name: "10Ә", grade: 10 },
  ]).select();
  const c9 = classes!.find((c) => c.grade === 9)!, c10 = classes!.find((c) => c.grade === 10)!;

  const s = school.id;
  const people = [
    await createAccount({ iin: "100000000001", full_name: "Сәрсенова Ләззат", role: "deputy", school_id: s, title: "Тәрбие ісі жөніндегі орынбасар" }),
    await createAccount({ iin: "100000000002", full_name: "Қасымов Ерлан", role: "class_teacher", school_id: s, title: "9А сынып жетекшісі, математика" }),
    await createAccount({ iin: "100000000003", full_name: "Әбенова Айгерім", role: "teacher", school_id: s, title: "Информатика" }),
    await createAccount({ iin: "100000000011", full_name: "Амангелді Санжар", role: "student", school_id: s, class_id: c9.id }),
    await createAccount({ iin: "100000000012", full_name: "Болат Аружан", role: "student", school_id: s, class_id: c9.id }),
    await createAccount({ iin: "100000000013", full_name: "Серікұлы Нұрислам", role: "student", school_id: s, class_id: c10.id }),
  ];
  const [deputy, ct, teacher, sanzhar, aruzhan] = people;
  await admin.from("classes").update({ teacher_id: ct.id }).eq("id", c9.id);

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (n: number) => iso(new Date(today.getTime() + n * 86400000));
  const base = { school_id: s, schedule: "weekly", weekdays: [1, 3], date_from: plus(-21), date_to: plus(60) };
  const { data: acts } = await admin.from("activities").insert([
    { ...base, type: "olympiad_prep", title: "Информатика олимпиадасына дайындық", place: "402-кабинет",
      description: "C++, динамикалық бағдарламалау және графтар. Әр сабақта ACMP мен Codeforces есептерін талдаймыз.",
      author_id: teacher.id, supervisor_id: teacher.id, audience_grades: [8, 9, 10], capacity: 20,
      start_time: "15:00", end_time: "16:30", status: "approved" },
    { ...base, weekdays: [2, 4], type: "club", title: "Робототехника үйірмесі", place: "Технопарк, 105",
      description: "Arduino мен датчиктер арқылы шағын роботтар құрастырамыз, көктемде қалалық жарысқа қатысамыз.",
      author_id: deputy.id, supervisor_id: teacher.id, audience_grades: [], capacity: 12,
      start_time: "16:00", end_time: "17:30", status: "approved" },
    { school_id: s, schedule: "once", on_date: plus(9), type: "tournament", title: "Лицей ішілік шахмат турнирі", place: "Акт залы",
      description: "Швейцар жүйесімен 5 тур, әр ойынға 15 минут. Жеңімпаздар облыстық турнирге жолдама алады.",
      author_id: sanzhar.id, supervisor_id: ct.id, audience_grades: [], capacity: 32,
      start_time: "14:00", end_time: "18:00", status: "pending_class_teacher" },
  ]).select();
  const [olymp, , chess] = acts!;
  await admin.from("approvals").insert([
    { activity_id: olymp.id, step: "pending_deputy", actor_id: teacher.id, decision: "submitted" },
    { activity_id: olymp.id, step: "pending_deputy", actor_id: deputy.id, decision: "approved" },
    { activity_id: chess.id, step: "pending_class_teacher", actor_id: sanzhar.id, decision: "submitted" },
  ]);
  await admin.from("enrollments").insert([
    { activity_id: olymp.id, student_id: sanzhar.id }, { activity_id: olymp.id, student_id: aruzhan.id },
  ]);
  await admin.from("notifications").insert(
    { user_id: ct.id, title: "Жаңа ұсыныс", body: `${sanzhar.full_name}: ${chess.title}`, link: `/a/${chess.id}` });

  return json({ school: school.name, accounts: people.map(({ full_name, role, iin, password }) => ({ full_name, role, iin, password })) });
}

async function createByStaff(req: Request, body: Record<string, string>) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: who } = await admin.auth.getUser(token);
  if (!who.user) return json({ error: "Кіру қажет" }, 401);
  const { data: me } = await admin.from("profiles").select("*").eq("id", who.user.id).single();
  if (!me || me.role === "student" || me.role === "teacher") return json({ error: "Пайдаланушы қосуға құқығыңыз жоқ" }, 403);

  const role = (body.role ?? "student") as Role;
  if (!["student", "teacher", "class_teacher", "deputy"].includes(role)) return json({ error: "Рөл қате" }, 400);
  const isDeputy = me.role === "deputy" || me.role === "admin";
  if (role !== "student" && !isDeputy) return json({ error: "Мұғалімді тек орынбасар қоса алады" }, 403);

  let classId: string | null = body.class_id || null;
  if (role === "student") {
    const { data: cls } = await admin.from("classes").select("*").eq("id", classId ?? "").eq("school_id", me.school_id).maybeSingle();
    if (!cls) return json({ error: "Сыныпты таңдаңыз" }, 400);
    if (!isDeputy && cls.teacher_id !== me.id) return json({ error: "Тек өз сыныбыңызға оқушы қоса аласыз" }, 403);
  } else classId = null;

  try {
    const acc = await createAccount({ iin: String(body.iin ?? ""), full_name: String(body.full_name ?? ""), role,
      school_id: me.school_id, class_id: classId, title: body.title });
    return json(acc);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { return json({ error: "JSON қате" }, 400); }
  if (body.action === "bootstrap") return bootstrap();
  if (body.action === "create") return createByStaff(req, body);
  return json({ error: "Белгісіз әрекет" }, 400);
});
