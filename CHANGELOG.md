# Changelog

## 1.3.1 — 2026-10-29

- «QR check» is in the «+» menu and the profile for everyone, students included.
- One scanner for every code of the app: passes, bookings, certificates, dorm items, initiatives; a typed code works the same way.
- A student checking a pass sees whether it is valid now, whose it is and when, but not its reason or who allowed it (migration 0049).
- Dorm: cleanliness criteria with their point scales set in the dorm settings.

## 1.3.0 — 2026-10-29

Dormitory (profile → «Жатақхана», and on the class page):
- Tutor, «Overview»: term picker, room cards («312 · 3/4 · ⚠ 1 bed not chosen»), room head, boys without a room, boys of the class who do not live in the dorm, evening roll call room by room, today's cleanliness score, bed-swap approvals.
- Tutor, «Monitoring»: cleanliness scores for 30 days; linen-change answers (changed / later / won't / no answer) per room; send again to those who did not answer.
- Tutor, «Settings»: beds chosen by QR or given automatically; bed swaps off / with the tutor's confirmation / free; linen reminder every N days at a set time; rooms with their beds, wardrobes and nightstands (good / damaged, holder, last holders of damaged items), students' fault reports; QR stickers printed one sheet per room.
- Placement each term in 5 steps: who lives in the dorm → pin 1–2 boys by hand → how beds are given → random placement that avoids last terms' roommates (yellow mark) and rooms (blue mark), «Shuffle again» → publish (the boys are notified). Boys of other classes already in a room keep their beds.
- Student: room, roommates and room head, own items; takes a bed, wardrobe, nightstand by scanning its QR (it is then his responsibility); answers the linen reminder; offers a bed swap to a roommate; reports a fault.
- The «Dorm head» staff kind (set by the admin) sees and manages every class and room; guests from other schools in holidays are prepared in the database.
- Database: migration 0048 (run it in the SQL Editor before deploying).

## 1.2.1 — 2026-10-23

- «Publish» list: just the kinds, without the explanation lines.
- «Write in the feed» and the feed's publish button use a pen-on-square icon.

## 1.2.0 — 2026-10-23

Initiatives:
- Place and time are optional (switched off by default for contests, leagues, tournaments, challenges, communities and teams); without a time an initiative shows as «all day».
- The place is picked from the room list by category (floors, other) or typed by hand; a listed room is booked for every session when the initiative is approved, busy days are reported to the leader.
- A short description of every kind in the form (team, community and the rest).
- Joining by request: the student sends a request with a note, the leader or a responsible student accepts or declines.
- «Results» tab for contests: matches by round with scores, final places.
- Certificates: the leader issues them to participants; each has a QR that opens its check page; «Save as PDF»; students see «My certificates» in the profile.

- Roles inside an initiative (captain, minister, secretary) given to the leader or participants.
- Writing in the feed as yourself, as your subject («Информатика»), as an initiative you lead, or as a role you hold («Парламент командасы · Мәдениет министрі»); «Write in the feed» in the «+» menu for staff and responsible students.

Staff:
- Admins and deputies see Teachers, Tutors and Staff next to the classes, and set each person's kind, subject and title.

Notifications and privacy:
- System notifications are split into chats: sign-up requests, each room's booking requests, complaints per chat, the rest.
- A complaint goes to that chat's moderators (class teacher and tutor, initiative leader, channel owner); deputies only when the chat has none.
- Pickers show people's names only, not their titles and duties.

Database: migrations 0046 and 0047 (run by the owner in the SQL Editor, in this order).

## 1.1.0 — 2026-10-19

New look, after the lyceum logo:
- Navy and gold palette, light grey background, rounder cards; Unbounded for headings, Inter for text.
- Bottom bar: the active tab sits in a soft pill; the «+» button is navy with a gold plus.
- Sign-in: navy hero with the logo, the form on a white sheet below.
- Initiative page: navy hero with a gold subject tile, kind and grades in gold, counters on a card over its edge, segmented tabs, a gold «Join» button.
- Chat: navy header, gold send button.
- Roll call: «Келді / Кеш / Себ / Жоқ» text buttons with solid colours.
- Chips: navy when selected, outlined otherwise.

## 1.0.1 — 2026-10-19

- Home: a big «Initiatives» tile with Lost & Found, Places (was Cabinets), Canteen and Surveys next to it; the feed follows right away (no «Today» row).
- Proposals moved inside Surveys (two tabs).
- «+» menu: «New message» removed (it stays on the Chats page).
- Pinch and double-tap zoom are off.
- Chats: swipe right to mute or archive, swipe left to mark as read; muted and archived chats leave the badge.
- Admin can remove a student: the account is blocked, the student leaves the class; marks and messages stay.
- Telegram Mini App: the top «Back» button falls back to the parent screen when there is no page behind.
- Profile: General, Administration and System settings (language, Telegram, About: news, tips, feedback).
- QR: shown only after a leave or a booking is approved; teachers scan it with the camera (Telegram's scanner inside Telegram).

## 1.0.0 — 2026-10-18

The first numbered release of Key To Life, the app of Қостанай Білім-Инновация лицейі.

### Home
- Starts with the feed: Threads-style posts (news, announcements, projects, events) with likes, comments and reposts.
- Posts are written in one's own name or in the name of an initiative.
- Post settings (hide likes, turn comments off, pin, delete) sit behind the "…" menu.
- Open competitions, clubs and olympiads as Stories above the feed; sections as one row of chips.
- "Today" is one compact row: next items, tasks due soon, the class on duty.

### Plans, goals and habits
- Goal → plan → daily tasks, with progress bars.
- Habit tracker: a daily tick, the run of days in a row and a 30-day map.
- The "+" button opens "New plan" and "New habit" directly.
- The calendar shows the current week; other weeks open with the arrows.

### Initiatives
- Instagram-style profile: photo or subject icon with a colour, participants and awards counters, short description.
- Highlights: round pinned materials (rules, schedule, camp).
- Hall of Fame: results and awards by year.
- Syllabus and tasks in one "Study" tab: each topic shows its own tasks, today's topic is marked.
- Session types get a category (Camp, Çalışma, KBO / olympiad); the overview filters attendance by category.
- Quick roll call: a row of round faces, a tap steps through the marks.

### School life
- Rooms by floor with booking modes, visibility, hidden slots, approval and several responsible teachers.
- Timetables until 30.12.2026 with the autumn break; class plans (Etude).
- Canteen menu: six meals a day from the 10-day cycle with photos; up to 5 duty students a weekday correct it.
- Leaves, duty, surveys, proposals to the parliament, Lost & Found, chats, Telegram Mini App and bot.
- Four languages: Kazakh, English, Turkish, Russian.
