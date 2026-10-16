-- 0021: student photos for roll calls. Private bucket, readable inside the school, written by the class teacher or tutor.
alter table profiles add column photo text check (photo is null or length(photo) <= 200);

create function can_edit_photo(p_student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from profiles p join classes k on k.id = p.class_id
    where p.id = p_student and p.school_id = my_school() and auth.uid() in (k.teacher_id, k.tutor_id))
$$;

create function set_student_photo(p_student uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_photo(p_student) then raise exception 'Суретті сынып жетекшісі немесе тәрбиеші қояды'; end if;
  if p_path is not null and p_path not like p_student::text || '/%' then raise exception 'Сурет қате'; end if;
  update profiles set photo = p_path where id = p_student;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 1048576, array['image/jpeg']) on conflict (id) do nothing;
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from profiles p where p.id::text = (storage.foldername(name))[1] and p.school_id = my_school()));
create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and can_edit_photo(((storage.foldername(name))[1])::uuid));

revoke execute on function can_edit_photo, set_student_photo from public, anon;
grant execute on function can_edit_photo, set_student_photo to authenticated;
