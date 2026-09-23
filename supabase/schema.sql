-- ============================================================
-- schema.sql
-- รันไฟล์นี้ทั้งหมดใน Supabase SQL Editor (Run ครั้งเดียว)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) โปรไฟล์ผู้ใช้ + role (เชื่อมกับ auth.users ของ Supabase)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'public' check (role in ('staff', 'admin', 'public')),
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 2) การตั้งค่าทั่วไปของงาน (ชื่อตำบล/อำเภอ/วันที่ ฯลฯ ที่แอดมินแก้ได้)
-- ------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1,
  org_name text not null default 'ตำบลสาธิต อำเภอสาธิต',
  count_date text not null default '8 สิงหาคม 2569',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3) หมู่บ้าน
-- ------------------------------------------------------------
create table if not exists public.villages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2F6F62',
  order_no int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) ใบเลือกตั้ง (จำนวนไม่ fix ตายตัว แอดมินเพิ่ม/ลบได้)
-- ------------------------------------------------------------
create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  order_no int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5) ผู้สมัคร/ตัวเลือกในแต่ละใบเลือกตั้ง
-- ------------------------------------------------------------
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  name text not null,
  number int,
  color text not null default '#B08D3E',
  order_no int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6) การกรอกคะแนนของ 1 หมู่บ้าน (กรอกทีเดียวรวมทุกใบ, บังคับแนบรูป)
--    1 หมู่บ้าน มีได้แค่ 1 submission (unique village_id)
-- ------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  village_id uuid not null unique references public.villages (id) on delete cascade,
  submitted_by uuid references public.profiles (id),
  photo_url text not null,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7) สถิติของแต่ละใบเลือกตั้ง ภายใน submission เดียวกัน
--    (ผู้มาใช้สิทธิ์ / บัตรเสีย ต่อ 1 ใบ ต่อ 1 หมู่บ้าน)
-- ------------------------------------------------------------
create table if not exists public.ballot_stats (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  turnout int not null default 0,
  invalid_votes int not null default 0,
  unique (submission_id, ballot_id)
);

-- ------------------------------------------------------------
-- 8) คะแนนของผู้สมัครแต่ละคน ภายในแต่ละใบ/แต่ละหมู่บ้าน
-- ------------------------------------------------------------
create table if not exists public.candidate_votes (
  id uuid primary key default gen_random_uuid(),
  ballot_stat_id uuid not null references public.ballot_stats (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  votes int not null default 0,
  unique (ballot_stat_id, candidate_id)
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.villages enable row level security;
alter table public.ballots enable row level security;
alter table public.candidates enable row level security;
alter table public.submissions enable row level security;
alter table public.ballot_stats enable row level security;
alter table public.candidate_votes enable row level security;

-- ---------- profiles ----------
create policy "ดูโปรไฟล์ตัวเอง หรือแอดมินดูได้ทุกคน"
  on public.profiles for select
  using (auth.uid() = id or public.current_role_name() = 'admin');

create policy "แอดมินจัดการโปรไฟล์คนอื่น"
  on public.profiles for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- ---------- settings ----------
create policy "ทุกคนอ่านการตั้งค่าได้" on public.settings for select using (true);
create policy "แอดมินแก้การตั้งค่า" on public.settings for update
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- ---------- villages / ballots / candidates : ใครก็อ่านได้ (แดชบอร์ดสาธารณะ) ----------
create policy "ทุกคนอ่านหมู่บ้านได้" on public.villages for select using (true);
create policy "ทุกคนอ่านใบเลือกตั้งได้" on public.ballots for select using (true);
create policy "ทุกคนอ่านผู้สมัครได้" on public.candidates for select using (true);

create policy "แอดมินจัดการหมู่บ้าน" on public.villages for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

create policy "แอดมินจัดการใบเลือกตั้ง" on public.ballots for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

create policy "แอดมินจัดการผู้สมัคร" on public.candidates for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- ---------- submissions ----------
create policy "ทุกคนอ่านผลคะแนนได้ (แดชบอร์ดสาธารณะ)"
  on public.submissions for select using (true);

create policy "เจ้าหน้าที่กรอกคะแนนของตัวเองได้"
  on public.submissions for insert
  with check (public.current_role_name() = 'staff' and submitted_by = auth.uid());

create policy "เฉพาะแอดมินแก้ไข/ปลดล็อกคะแนนที่กรอกแล้ว"
  on public.submissions for update
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

create policy "เฉพาะแอดมินลบคะแนนได้"
  on public.submissions for delete
  using (public.current_role_name() = 'admin');

-- ---------- ballot_stats ----------
create policy "ทุกคนอ่านสถิติได้" on public.ballot_stats for select using (true);

create policy "เจ้าหน้าที่กรอกสถิติของ submission ตัวเอง"
  on public.ballot_stats for insert
  with check (
    public.current_role_name() = 'staff'
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.submitted_by = auth.uid()
    )
  );

create policy "เฉพาะแอดมินแก้ไขสถิติ"
  on public.ballot_stats for update
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

create policy "เฉพาะแอดมินลบสถิติ"
  on public.ballot_stats for delete
  using (public.current_role_name() = 'admin');

-- ---------- candidate_votes ----------
create policy "ทุกคนอ่านคะแนนผู้สมัครได้" on public.candidate_votes for select using (true);

create policy "เจ้าหน้าที่กรอกคะแนนผู้สมัครของ submission ตัวเอง"
  on public.candidate_votes for insert
  with check (
    public.current_role_name() = 'staff'
    and exists (
      select 1
      from public.ballot_stats bs
      join public.submissions s on s.id = bs.submission_id
      where bs.id = ballot_stat_id and s.submitted_by = auth.uid()
    )
  );

create policy "เฉพาะแอดมินแก้ไขคะแนนผู้สมัคร"
  on public.candidate_votes for update
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

create policy "เฉพาะแอดมินลบคะแนนผู้สมัคร"
  on public.candidate_votes for delete
  using (public.current_role_name() = 'admin');

-- ============================================================
-- เปิด Realtime ให้ตารางที่แดชบอร์ดต้องฟังการเปลี่ยนแปลงสด
-- ============================================================
alter publication supabase_realtime add table public.submissions;
alter publication supabase_realtime add table public.ballot_stats;
alter publication supabase_realtime add table public.candidate_votes;

-- ============================================================
-- ข้อมูลตัวอย่าง (ลบทิ้งได้ถ้าไม่ต้องการ ทดสอบระบบก่อนได้)
-- ============================================================
insert into public.villages (name, color, order_no) values
  ('หมู่ 1 บ้านสันติสุข', '#2F6F62', 1),
  ('หมู่ 2 บ้านโนนงาม', '#C2542D', 2),
  ('หมู่ 3 บ้านท่าใหม่', '#435B7A', 3),
  ('หมู่ 4 บ้านหนองบัว', '#6B4E71', 4),
  ('หมู่ 5 บ้านโคกสูง', '#C79A2E', 5),
  ('หมู่ 6 บ้านดอนแดง', '#7A8B69', 6)
on conflict do nothing;

insert into public.ballots (title, order_no) values
  ('เลือกตั้งผู้ใหญ่บ้าน', 1),
  ('เลือกตั้งกรรมการหมู่บ้าน', 2),
  ('ประชามติกองทุนหมู่บ้าน', 3)
on conflict do nothing;

-- หมายเหตุ: หลังรัน ให้ไปเพิ่ม candidates เองผ่าน Table Editor
-- โดยเลือก ballot_id จากตาราง ballots ที่เพิ่งสร้าง (ดูวิธีใน README ข้อ 3)

-- การสร้างบัญชี staff/admin: สร้างผ่าน Supabase Auth ก่อน (Authentication > Users)
-- แล้วค่อย insert แถวใน profiles ให้ role ตรง เช่น:
-- insert into public.profiles (id, full_name, role) values ('<user-uuid>', 'เจ้าหน้าที่ 1', 'staff');
