# AGENTS.md — rules for AI agents working on Key To Life

Key To Life (folder name `lyceum-life`) is the school app of Қостанай Білім-Инновация лицейі: activities with roll call,
plans and tasks, chats, permissions, bookings, surveys, canteen menu. Owner: Bagdaulet (informatics teacher, 7B).
Talk to the owner in Kazakh.

## Access
- Only people and agents the owner invites as GitHub collaborators may push. Never add collaborators, change repo
  settings, branch protection or secrets yourself.
- Never put secrets in the repo, in chat or in commits: Supabase `service_role` key, `TELEGRAM_BOT_TOKEN`,
  the `app_secrets` hook value, people's ЖСН (IIN) or passwords. The web app uses only the public anon key.
- Real student data (names, ЖСН, photos) must not be copied into files, tests, issues or prompts.

## Stack
- `web/` — Vite + React 18 + TypeScript + Tailwind v4, hash router. Target ES2020 (no `.at()`).
- `supabase/migrations/` — numbered SQL files, applied in order. Security lives in the database:
  RLS policies and `security definer` RPCs with `revoke … from public, anon`.
- `supabase/functions/telegram` (bot, Mini App login, roll call to groups) and `supabase/functions/admin-users`
  (accounts, sign-up). Both `verify_jwt = false`; they check the user themselves.
- Deploy: push to `main` → GitHub Actions runs tests and build → GitHub Pages.

## How to work
1. Work on a branch and open a pull request. Do not push to `main` directly; the owner merges.
2. Before a PR: `cd web && npm ci && npm run build && npm run lint` and the tests:
   `npx tsx src/lib/time.test.ts && TZ=Asia/Almaty npx tsx src/lib/ics.test.ts &&
   npx tsx ../supabase/functions/telegram/initdata.test.ts && npx tsx ../supabase/functions/telegram/rollcall.test.ts`
3. Migrations: take the next free number (check `supabase/migrations/` on `main` first; last used: 0051).
   Never edit a migration that was already applied; add a new one.
   SQL with `delete`/`drop` is run by the owner by hand in the Supabase SQL Editor — say so in the PR.
4. Keep changes small; reuse existing helpers (`lib/api.ts`, `components/ui.tsx`, `lib/time.ts`).

## Translations (4 languages: kk, en, tr, ru)
- Kazakh text is the source. Every UI string goes through `tx('Қазақша мәтін', …args)` from `lib/i18n.ts`;
  `{0}`, `{1}` are placeholders.
- After adding text: `node scripts/i18n-wrap.cjs` wraps new Kazakh strings, `npm run i18n` lists the missing
  ones; add them to `web/src/i18n/{en,tr,ru}.json`. Errors raised by SQL (Kazakh) are translated the same way.
- Bot texts: `web/scripts/i18n-bot.tsv` → `node scripts/i18n-bot.cjs` regenerates `supabase/functions/telegram/bot-i18n.ts`.

## Roles
student, teacher, class_teacher, deputy, admin. Login = ЖСН (`<iin>@users.lyceum-life.app` in auth).
Sign-up requests: a student is approved by the class teacher or an admin, a teacher only by an admin.
