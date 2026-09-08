-- ========================================================
-- BIDDA DATABASE SETUP (MASTER SCRIPT)
-- এটি রান করলে আপনার সব একবারে সেটআপ হবে।

-- ========================================================

-- সম্পূর্ণ ডেটাবেস রিসেট (সকল টেবিল, ইনাম, ভিউ ও ফাংশন মুছে ফেলা)
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres;
grant all on schema public to public;

-- পুরনো ট্রিগার এবং ফাংশন মুছে ফেলা (যদি থাকে)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ১. এক্সটেনশন সেটাপ
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ২. কাস্টম টাইপস (Enums) তৈরি
do $$
begin
  -- User Enums
  if not exists (select 1 from pg_type where typname = 'account_status') then create type public.account_status as enum ('ACTIVE', 'DELETED'); end if;
  if not exists (select 1 from pg_type where typname = 'user_type') then create type public.user_type as enum ('ADMIN', 'USER'); end if;

  -- Branch Enums
  if not exists (select 1 from pg_type where typname = 'branch_type') then create type public.branch_type as enum ('MAIN', 'SUB'); end if;

  -- Finance Enums
  if not exists (select 1 from pg_type where typname = 'finance_type') then create type public.finance_type as enum ('INCOME', 'EXPENSE'); end if;
exception when others then null; end $$;

-- ৩. ইউটিলিটি ফাংশন
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ৪. টেবিল তৈরি (Dependency সিরিয়াল অনুযায়ী)

-- [Table: Users]
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  password_changed_at timestamptz,
  user_name text not null unique check (user_name ~* '^[a-z0-9_.]+$'),
  avatar text default null,
  user_type public.user_type not null default 'USER',
  account_status public.account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========================================================
-- BRANCHES & BRANCH MEMBERSHIPS
-- ========================================================
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default null,
  location_name text default null,
  location_url text default null,
  admin_info jsonb default '[]'::jsonb,
  cover_image text default null,
  branch_type public.branch_type not null default 'MAIN',
  parent_branch_id uuid references public.branches(id) on delete set null,
  is_deleted boolean not null default false,
  members_count integer not null default 0 check (members_count >= 0),
  finance_action_code text not null default '1234',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branch_memberships (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  serial_no integer,
  name text,
  phone text,
  address text,
  blood_group text,
  email text,
  note text,
  is_admin boolean not null default false,
  is_moderator boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists branch_memberships_branch_user_unique_idx on public.branch_memberships (branch_id, user_id) where user_id is not null;

-- [Table: Branch Finance Categories]
create table if not exists public.branch_finance_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  type public.finance_type not null,
  created_at timestamptz not null default now(),
  constraint branch_finance_categories_branch_name_type_unique unique (branch_id, name, type)
);

-- [Table: Branch Finances]
create table if not exists public.branch_finances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  type public.finance_type not null,
  amount numeric(12, 2) not null check (amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  due_amount numeric(12, 2) not null default 0 check (due_amount >= 0),
  payment_status text not null default 'PAID' check (payment_status in ('PAID', 'PARTIAL', 'DUE')),
  category_id uuid not null references public.branch_finance_categories(id) on delete restrict,
  note text default '',
  date timestamptz not null default now(),
  recorded_by uuid not null references public.users(id) on delete restrict,
  person_name text default '',
  person_phone text default '',
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [Table: Branch Finance Payments (বকেয়া আদায় ও কিস্তির খাতা)]
create table if not exists public.branch_finance_payments (
  id uuid primary key default gen_random_uuid(),
  finance_id uuid not null references public.branch_finances(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  note text default '',
  recorded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- [Table: Notices (সেন্ট্রাল নোটিশ বোর্ড)]
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

-- ৫. ইনডেক্স সেটাপ
create index if not exists users_user_name_trgm_idx on public.users using gin (user_name gin_trgm_ops);
create index if not exists branch_finance_categories_branch_id_idx on public.branch_finance_categories (branch_id);
create index if not exists branch_finances_branch_id_idx on public.branch_finances (branch_id);
create index if not exists branch_finances_date_idx on public.branch_finances (date);
create index if not exists idx_branch_finance_payments_finance_id on public.branch_finance_payments(finance_id);
create index if not exists idx_branch_finance_payments_branch_id on public.branch_finance_payments(branch_id);
create index if not exists idx_branch_finance_payments_date on public.branch_finance_payments(payment_date);
create index if not exists idx_branch_memberships_moderator on public.branch_memberships(branch_id, is_moderator) where is_moderator = true;
create index if not exists idx_notices_status_created on public.notices(is_active, is_deleted, created_at desc);
create index if not exists idx_notices_pinned on public.notices(is_pinned) where is_pinned = true and is_active = true and is_deleted = false;
create index if not exists idx_notices_created_by on public.notices(created_by);

-- ৬. ট্রিগার ফাংশনসমূহ

-- Updated At ট্রিগার্স
drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();

drop trigger if exists set_notices_updated_at on public.notices;
create trigger set_notices_updated_at before update on public.notices for each row execute function public.set_updated_at();

-- Auth ট্রিগার (অটো প্রোফাইল ক্রিয়েশন এবং ইউজারনেম জেনারেটর)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  final_username text;
begin
  -- ইমেইলের প্রথম অংশ থেকে বেস ইউজারনেম তৈরি
  base_username := lower(split_part(new.email, '@', 1));
  base_username := regexp_replace(base_username, '[^a-z0-9]', '', 'g');
  final_username := base_username;

  -- ইউনিক হওয়া পর্যন্ত লুপ চালাচ্ছি
  while exists (select 1 from public.users where user_name = final_username) loop
    final_username := base_username || floor(random() * 10000)::text;
  end loop;

  insert into public.users (id, full_name, email, user_name, user_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    final_username,
    coalesce((new.raw_user_meta_data->>'user_type')::public.user_type, 'USER')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ৭. সিকিউরিটি (RLS & Grants)
alter table public.users enable row level security;
alter table public.branches enable row level security;
alter table public.branch_memberships enable row level security;
alter table public.branch_finance_categories enable row level security;
alter table public.branch_finances enable row level security;
alter table public.notices enable row level security;

grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

grant select on all tables in schema public to authenticated;
revoke insert, update on public.users from authenticated;
grant insert (id, full_name, email, user_name, user_type) on public.users to authenticated;
grant update (full_name, avatar) on public.users to authenticated;

-- ==========================================
-- GRANT PRIVILEGES
-- ==========================================
GRANT ALL ON public.branches TO authenticated, anon;
GRANT ALL ON public.branch_memberships TO authenticated, anon;
