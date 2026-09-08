-- ========================================================
-- MIGRATION: CREATE NOTICES TABLE
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ========================================================

-- ১. নোটিশ টেবিল তৈরি
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  content text not null check (char_length(trim(content)) > 0),
  is_pinned boolean not null default false,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ২. ইনডেক্স তৈরি
create index if not exists idx_notices_status_created 
  on public.notices(is_active, is_deleted, created_at desc);

create index if not exists idx_notices_pinned 
  on public.notices(is_pinned) 
  where is_pinned = true and is_active = true and is_deleted = false;

create index if not exists idx_notices_created_by 
  on public.notices(created_by);

-- ৩. Updated At ট্রিগার যোগ করা
drop trigger if exists set_notices_updated_at on public.notices;
create trigger set_notices_updated_at 
  before update on public.notices 
  for each row 
  execute function public.set_updated_at();

-- ৪. RLS (Row Level Security) চালু রাখা (যাতে সরাসরি ফ্রন্টএন্ড/এনন কী দিয়ে এক্সেস না পায়)
-- ব্যাকএন্ড সার্ভিস রোল কী (SUPABASE_SERVICE_ROLE_KEY) দিয়ে স্বয়ংক্রিয়ভাবে RLS বাইপাস করবে, তাই কোনো পলিসির প্রয়োজন নেই।
alter table public.notices enable row level security;

