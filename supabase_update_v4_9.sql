-- BJR Smart Classroom V4.9
-- เพิ่มหมายเหตุสำหรับการเช็กชื่อ โดยเฉพาะสถานะ "ลา"
alter table public.attendance
add column if not exists note text not null default '';

comment on column public.attendance.note is
'หมายเหตุการเข้าเรียน เช่น ซ้อมกีฬา ไปกิจกรรม วงโยธวาทิต ลาป่วย ลากิจ';
