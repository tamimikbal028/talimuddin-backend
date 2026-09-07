-- Run this query in your Supabase SQL Editor to add location columns to branches table:
ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS location_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS location_url text DEFAULT NULL;
