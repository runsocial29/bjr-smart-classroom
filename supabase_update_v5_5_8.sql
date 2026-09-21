-- BJR Smart Classroom V5.5.8
-- เพิ่มสถานะ 'กิจกรรม' (activity) ใน attendance
-- รันครั้งเดียวใน Supabase SQL Editor ก่อนใช้ปุ่มกิจกรรม

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid='public.attendance'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.attendance drop constraint %I',c.conname);
  end loop;
end $$;

alter table public.attendance add constraint attendance_status_check check (status in ('present','late','leave','absent','activity'));
