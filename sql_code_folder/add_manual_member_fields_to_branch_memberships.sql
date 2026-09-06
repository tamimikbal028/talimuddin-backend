-- Migration: Support manual branch members (admin-entered members without user accounts)

-- 1. Make user_id nullable so offline/manual members don't require an auth user account
alter table public.branch_memberships alter column user_id drop not null;

-- 2. Add manual member fields
alter table public.branch_memberships 
  add column if not exists serial_no integer,
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists blood_group text,
  add column if not exists email text,
  add column if not exists note text;

-- 3. Ensure registered users cannot join the same branch multiple times, while allowing multiple manual members
create unique index if not exists branch_memberships_branch_user_unique_idx 
  on public.branch_memberships (branch_id, user_id) 
  where user_id is not null;
