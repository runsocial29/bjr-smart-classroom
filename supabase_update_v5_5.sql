-- BJR Smart Classroom V5.5
-- เพิ่มคาบเรียน 1-9 ให้ระบบเช็กชื่อ (รันครั้งเดียวใน Supabase SQL Editor)

alter table public.attendance
  add column if not exists period smallint;

update public.attendance
set period = 1
where period is null;

alter table public.attendance
  alter column period set default 1;

alter table public.attendance
  alter column period set not null;

alter table public.attendance
  drop constraint if exists attendance_student_id_day_key;

alter table public.attendance
  drop constraint if exists attendance_student_day_period_unique;

alter table public.attendance
  add constraint attendance_student_day_period_unique unique (student_id, day, period);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_period_check'
  ) then
    alter table public.attendance
      add constraint attendance_period_check check (period between 1 and 9);
  end if;
end $$;
