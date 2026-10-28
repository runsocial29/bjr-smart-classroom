-- BJR Smart Classroom V5.6.0: แยกข้อมูลตามปีการศึกษาและภาคเรียน
-- สำรองข้อมูลก่อนรัน SQL นี้ และรันเพียงครั้งเดียวใน Supabase SQL Editor
-- ข้อมูลเดิมจะถูกกำหนดให้อยู่ปีการศึกษา 2569 ภาคเรียนที่ 2 เพื่อให้เปิดดูได้ทันที

begin;

alter table public.assignments add column if not exists academic_year integer not null default 2569;
alter table public.assignments add column if not exists semester smallint not null default 2;
alter table public.scores add column if not exists academic_year integer not null default 2569;
alter table public.scores add column if not exists semester smallint not null default 2;
alter table public.attendance add column if not exists academic_year integer not null default 2569;
alter table public.attendance add column if not exists semester smallint not null default 2;
alter table public.exam_scores add column if not exists academic_year integer not null default 2569;
alter table public.exam_scores add column if not exists semester smallint not null default 2;

alter table public.assignments drop constraint if exists assignments_semester_check;
alter table public.assignments add constraint assignments_semester_check check (semester in (1,2));
alter table public.scores drop constraint if exists scores_semester_check;
alter table public.scores add constraint scores_semester_check check (semester in (1,2));
alter table public.attendance drop constraint if exists attendance_semester_check;
alter table public.attendance add constraint attendance_semester_check check (semester in (1,2));
alter table public.exam_scores drop constraint if exists exam_scores_semester_check;
alter table public.exam_scores add constraint exam_scores_semester_check check (semester in (1,2));

-- คีย์เดิมของการเช็กชื่อและคะแนนสอบต้องรองรับนักเรียนคนเดิมหลายภาคเรียน
alter table public.attendance drop constraint if exists attendance_student_id_day_period_key;
alter table public.attendance add constraint attendance_student_day_period_term_key
  unique(student_id, day, period, academic_year, semester);
alter table public.exam_scores drop constraint if exists exam_scores_student_id_key;
alter table public.exam_scores add constraint exam_scores_student_term_key
  unique(student_id, academic_year, semester);

create index if not exists assignments_room_term_idx on public.assignments(room_id, academic_year, semester);
create index if not exists scores_room_term_idx on public.scores(room_id, academic_year, semester);
create index if not exists attendance_room_term_day_idx on public.attendance(room_id, academic_year, semester, day);
create index if not exists exam_scores_room_term_idx on public.exam_scores(room_id, academic_year, semester);

-- Student portal token: shows the selected term only. Defaults preserve compatibility with the app's initial term.
drop function if exists public.student_portal(text);
create or replace function public.student_portal(
  p_token text,
  p_academic_year integer default 2569,
  p_semester smallint default 2
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select st.id, st.name, st.student_no, st.room_id, r.name as room_name
    from public.students st join public.rooms r on r.id = st.room_id
    where st.access_token = p_token limit 1
  ),
  a as (
    select a.id, a.name, a.max_score, sc.score
    from public.assignments a join s on s.room_id = a.room_id
    left join public.scores sc on sc.assignment_id = a.id and sc.student_id = s.id
      and sc.academic_year = p_academic_year and sc.semester = p_semester
    where a.academic_year = p_academic_year and a.semester = p_semester
    order by a.created_at
  ),
  ex as (
    select e.midterm, e.final from public.exam_scores e join s on s.id = e.student_id
    where e.academic_year = p_academic_year and e.semester = p_semester limit 1
  ),
  sums as (
    select coalesce((select sum(coalesce(score,0)) from a),0)
      + coalesce((select midterm from ex),0) + coalesce((select final from ex),0) as total_score,
      coalesce((select sum(max_score) from a),0) + 40 as total_max
  )
  select case when not exists(select 1 from s) then null else jsonb_build_object(
    'student',(select jsonb_build_object('name',name,'student_no',student_no,'room_name',room_name) from s),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('name',name,'max_score',max_score,'score',score)) from a),'[]'::jsonb),
    'exams',jsonb_build_object('midterm',(select midterm from ex),'final',(select final from ex)),
    'summary',(select jsonb_build_object(
      'total_score',total_score,'total_max',total_max,
      'percent',case when total_max>0 then round((total_score/total_max)*100,1) else 0 end,
      'grade',case when total_score>=80 then 4 when total_score>=75 then 3.5 when total_score>=70 then 3
        when total_score>=65 then 2.5 when total_score>=60 then 2 when total_score>=55 then 1.5
        when total_score>=50 then 1 else 0 end
    ) from sums)
  ) end;
$$;
revoke all on function public.student_portal(text, integer, smallint) from public;
grant execute on function public.student_portal(text, integer, smallint) to anon, authenticated;

-- Student code portal: selected term only.
drop function if exists public.student_portal_by_code(uuid,text);
create or replace function public.student_portal_by_code(
  p_owner_id uuid,
  p_student_code text,
  p_academic_year integer default 2569,
  p_semester smallint default 2
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select st.id, st.name, st.student_no, st.student_code, st.room_id,
      r.name as room_name, r.subject_name
    from public.students st join public.rooms r on r.id = st.room_id
    where st.owner_id = p_owner_id and btrim(st.student_code) = btrim(p_student_code) limit 1
  ),
  a as (
    select a.id, a.name, a.max_score, sc.score
    from public.assignments a join s on s.room_id = a.room_id
    left join public.scores sc on sc.assignment_id = a.id and sc.student_id = s.id
      and sc.academic_year = p_academic_year and sc.semester = p_semester
    where a.academic_year = p_academic_year and a.semester = p_semester
    order by a.created_at
  ),
  ex as (
    select e.midterm, e.final from public.exam_scores e join s on s.id = e.student_id
    where e.academic_year = p_academic_year and e.semester = p_semester limit 1
  ),
  sums as (
    select coalesce((select sum(coalesce(score,0)) from a),0)
      + coalesce((select midterm from ex),0) + coalesce((select final from ex),0) as total_score,
      coalesce((select sum(max_score) from a),0) + 40 as total_max
  )
  select case when not exists(select 1 from s) then null else jsonb_build_object(
    'student',(select jsonb_build_object('name',name,'student_no',student_no,'student_code',student_code,'room_name',room_name,'subject_name',subject_name) from s),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('name',name,'max_score',max_score,'score',score)) from a),'[]'::jsonb),
    'exams',jsonb_build_object('midterm',(select midterm from ex),'final',(select final from ex)),
    'summary',(select jsonb_build_object(
      'total_score',total_score,'total_max',total_max,
      'percent',case when total_max>0 then round((total_score/total_max)*100,1) else 0 end,
      'grade',case when total_score>=80 then 4 when total_score>=75 then 3.5 when total_score>=70 then 3
        when total_score>=65 then 2.5 when total_score>=60 then 2 when total_score>=55 then 1.5
        when total_score>=50 then 1 else 0 end
    ) from sums)
  ) end;
$$;
revoke all on function public.student_portal_by_code(uuid,text,integer,smallint) from public;
grant execute on function public.student_portal_by_code(uuid,text,integer,smallint) to anon, authenticated;

commit;
