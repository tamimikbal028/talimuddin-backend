-- ========================================================
-- MIGRATION: ADD BRANCH MODERATOR SUPPORT
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ========================================================

-- ১. branch_memberships টেবিলে is_moderator কলাম যোগ করা
alter table public.branch_memberships 
  add column if not exists is_moderator boolean not null default false;

-- ২. ইনডেক্স তৈরি করা
create index if not exists idx_branch_memberships_moderator 
  on public.branch_memberships(branch_id, is_moderator) 
  where is_moderator = true;
