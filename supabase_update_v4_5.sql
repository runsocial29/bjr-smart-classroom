-- BJR Smart Classroom V4.5
-- แก้กรณีนักเรียนคนเดียวเรียนหลายรายวิชา
-- Run 1 ครั้งใน Supabase SQL Editor ต่อจาก V4.4

-- V4.4 ห้ามรหัสนักเรียนซ้ำทั้งบัญชีครู ซึ่งทำให้คนเดิมเพิ่มในวิชาอื่นไม่ได้
drop index if exists public.students_owner_code_unique;

-- ต่อไปห้ามซ้ำเฉพาะ "ห้อง/รายวิชาเดียวกัน" เท่านั้น
create unique index if not exists students_room_code_unique
on public.students(room_id, student_code)
where student_code is not null and btrim(student_code) <> '';

-- หน้ากรอกรหัสนักเรียน: แสดงทุกห้อง/ทุกรายวิชาของนักเรียนคนเดียวกัน
create or replace function public.student_portal_by_code(
  p_owner_id uuid,
  p_student_code text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with matched as (
    select
      st.id as student_id,
      st.name,
      st.student_no,
      st.student_code,
      st.room_id,
      r.name as room_name,
      r.subject_name,
      r.created_at as room_created_at
    from public.students st
    join public.rooms r on r.id = st.room_id
    where st.owner_id = p_owner_id
      and btrim(st.student_code) = btrim(p_student_code)
  ),
  person as (
    select name, student_code
    from matched
    order by room_created_at
    limit 1
  ),
  course_data as (
    select
      m.student_id,
      m.room_id,
      m.room_name,
      m.subject_name,
      m.student_no,
      m.room_created_at,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', a.name,
              'max_score', a.max_score,
              'score', sc.score
            )
            order by a.created_at
          )
          from public.assignments a
          left join public.scores sc
            on sc.assignment_id = a.id
           and sc.student_id = m.student_id
          where a.room_id = m.room_id
        ),
        '[]'::jsonb
      ) as assignments,
      (
        select jsonb_build_object(
          'midterm', e.midterm,
          'final', e.final
        )
        from public.exam_scores e
        where e.student_id = m.student_id
        limit 1
      ) as exams,
      coalesce(
        (
          select sum(coalesce(sc.score,0))
          from public.assignments a
          left join public.scores sc
            on sc.assignment_id = a.id
           and sc.student_id = m.student_id
          where a.room_id = m.room_id
        ),0
      )
      + coalesce((select e.midterm from public.exam_scores e where e.student_id=m.student_id limit 1),0)
      + coalesce((select e.final from public.exam_scores e where e.student_id=m.student_id limit 1),0)
      as total_score,
      coalesce(
        (
          select sum(a.max_score)
          from public.assignments a
          where a.room_id = m.room_id
        ),0
      ) + 40 as total_max
    from matched m
  ),
  courses as (
    select jsonb_agg(
      jsonb_build_object(
        'room_name', room_name,
        'subject_name', subject_name,
        'student_no', student_no,
        'assignments', assignments,
        'exams', coalesce(exams, jsonb_build_object('midterm',null,'final',null)),
        'summary', jsonb_build_object(
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
        )
      )
      order by subject_name, room_name
    ) as data
    from course_data
  )
  select
    case
      when not exists(select 1 from person) then null
      else jsonb_build_object(
        'student', (
          select jsonb_build_object(
            'name', name,
            'student_code', student_code
          )
          from person
        ),
        'courses', coalesce((select data from courses),'[]'::jsonb)
      )
    end;
$$;

revoke all on function public.student_portal_by_code(uuid,text) from public;
grant execute on function public.student_portal_by_code(uuid,text) to anon, authenticated;
