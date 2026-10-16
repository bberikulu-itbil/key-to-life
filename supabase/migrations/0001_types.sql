-- Lyceum Life: core schema. All state changes go through security definer RPCs below;
-- tables have SELECT policies only, so the client cannot write directly.

create type user_role as enum ('student','teacher','class_teacher','deputy','admin');
create type activity_type as enum ('olympiad_prep','club','course','event','competition','tournament');
create type activity_status as enum ('pending_class_teacher','pending_deputy','approved','rejected','cancelled');
create type schedule_kind as enum ('once','weekly');
create type attendance_status as enum ('present','late','excused','absent');
create type request_status as enum ('pending','approved','rejected');
