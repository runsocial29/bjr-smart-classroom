-- BJR Smart Classroom V4.3 - เพิ่มคะแนนกลางภาค/ปลายภาคและเกรด
-- ให้ Run ไฟล์นี้ 1 ครั้งใน Supabase SQL Editor

create table if not exists public.exam_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  midterm numeric null check (midterm is null or (midterm >= 0 and midterm <= 20)),
  final numeric null check (final is null or (final >= 0 and final <= 20)),
  updated_at timestamptz not null default now(),
  unique(student_id)
);

alter table public.exam_scores enable row level security;
revoke all on public.exam_scores from anon, authenticated;
grant select, insert, update, delete on public.exam_scores to authenticated;

drop policy if exists exam_scores_owner_select on public.exam_scores;
drop policy if exists exam_scores_owner_insert on public.exam_scores;
drop policy if exists exam_scores_owner_update on public.exam_scores;
drop policy if exists exam_scores_owner_delete on public.exam_scores;

create policy exam_scores_owner_select on public.exam_scores for select to authenticated
using ((select auth.uid()) = owner_id);
create policy exam_scores_owner_insert on public.exam_scores for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy exam_scores_owner_update on public.exam_scores for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy exam_scores_owner_delete on public.exam_scores for delete to authenticated
using ((select auth.uid()) = owner_id);

create index if not exists exam_scores_room_idx on public.exam_scores(room_id);

-- อัปเดต Student Portal ให้แสดงกลางภาค ปลายภาค คะแนนรวม และเกรด
create or replace function public.student_portal(p_token text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select st.id, st.name, st.student_no, st.room_id, r.name as room_name
    from public.students st
    join public.rooms r on r.id = st.room_id
    where st.access_token = p_token
    limit 1
  ),
  a as (
    select a.id, a.name, a.max_score, sc.score
    from public.assignments a
    join s on s.room_id = a.room_id
    left join public.scores sc on sc.assignment_id = a.id and sc.student_id = s.id
    order by a.created_at
  ),
  ex as (
    select e.midterm, e.final
    from public.exam_scores e
    join s on s.id = e.student_id
    limit 1
  ),
  sums as (
    select
      coalesce((select sum(coalesce(score,0)) from a),0) + coalesce((select midterm from ex),0) + coalesce((select final from ex),0) as total_score,
      coalesce((select sum(max_score) from a),0) + 40 as total_max
  )
  select case when not exists(select 1 from s) then null else
    jsonb_build_object(
      'student', (select jsonb_build_object('name',name,'student_no',student_no,'room_name',room_name) from s),
      'assignments', coalesce((select jsonb_agg(jsonb_build_object('name',name,'max_score',max_score,'score',score)) from a),'[]'::jsonb),
      'exams', jsonb_build_object(
        'midterm', (select midterm from ex),
        'final', (select final from ex)
      ),
      'summary', (select jsonb_build_object(
        'total_score', total_score,
        'total_max', total_max,
        'percent', case when total_max > 0 then round((total_score/total_max)*100,1) else 0 end,
        'grade', case
          when total_score >= 80 then 4
          when total_score >= 75 then 3.5
          when total_score >= 70 then 3
          when total_score >= 65 then 2.5
          when total_score >= 60 then 2
          when total_score >= 55 then 1.5
          when total_score >= 50 then 1
          else 0
        end
      ) from sums)
    )
  end;
$$;

revoke all on function public.student_portal(text) from public;
grant execute on function public.student_portal(text) to anon, authenticated;
