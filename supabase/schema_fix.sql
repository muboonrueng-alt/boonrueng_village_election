-- ============================================================
-- schema_fix.sql
-- รันต่อจาก schema.sql (ใน Supabase SQL Editor) เพื่อให้ฐานข้อมูลตรงกับโค้ดปัจจุบัน
-- รันซ้ำได้ ไม่พัง
-- ============================================================

-- 1) settings: โค้ดใช้ subdistrict / district / province แทน org_name
alter table public.settings add column if not exists subdistrict text not null default 'สาธิต';
alter table public.settings add column if not exists district    text not null default 'สาธิต';
alter table public.settings add column if not exists province    text not null default 'สาธิต';

-- 2) ballot_stats: โค้ดใช้ no_vote_count (บัตรไม่ประสงค์ลงคะแนน)
alter table public.ballot_stats add column if not exists no_vote_count int not null default 0;

-- 3) Storage bucket สำหรับรูปถ่าย (แทนการกดสร้างเองในหน้า Storage)
insert into storage.buckets (id, name, public)
values ('submission-photos', 'submission-photos', true)
on conflict (id) do nothing;

-- 4) สิทธิ์อัปโหลดรูป: เฉพาะ staff/admin ที่ login แล้ว
drop policy if exists "staff/admin อัปโหลดรูปผลคะแนน" on storage.objects;
create policy "staff/admin อัปโหลดรูปผลคะแนน"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'submission-photos'
    and public.current_role_name() in ('staff', 'admin')
  );
