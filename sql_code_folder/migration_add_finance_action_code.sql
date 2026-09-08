-- ========================================================
-- MIGRATION: ADD FINANCE ACTION CODE TO BRANCHES
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ========================================================

-- ১. branches টেবিলে finance_action_code কলাম যোগ করা
alter table public.branches 
  add column if not exists finance_action_code text not null default '1234';

-- ২. কমেন্ট যোগ করা
comment on column public.branches.finance_action_code is 
  'Branch security passcode required for moderators to edit or delete finance entries';
