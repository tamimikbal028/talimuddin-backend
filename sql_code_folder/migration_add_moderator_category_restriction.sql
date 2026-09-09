-- ========================================================
-- MIGRATION: ADD MODERATOR CATEGORY RESTRICTIONS
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ========================================================

-- ১. branch_memberships টেবিলে allowed_category_ids কলাম যোগ করা (jsonb)
-- null বা ফাঁকা array [] থাকলে মডারেটর সব ক্যাটাগরিতে অ্যাক্সেস পাবে
-- ক্যাটাগরি আইডি (UUID) দেওয়া থাকলে শুধুমাত্র ওই ক্যাটাগরিগুলোতে এন্ট্রি দিতে পারবে
alter table public.branch_memberships 
  add column if not exists allowed_category_ids jsonb default null;
