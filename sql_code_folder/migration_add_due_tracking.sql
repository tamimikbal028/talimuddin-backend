-- ========================================================
-- MIGRATION: ADD DUE TRACKING & PAYMENT RECORDS (টালীখাতা / বকেয়া হিসাব)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/svmblkpefpjcxohaxxly/sql
-- ========================================================

-- ১. branch_finances টেবিলে বকেয়া ও পেমেন্ট স্ট্যাটাস কলাম যোগ করা
alter table public.branch_finances 
  add column if not exists total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  add column if not exists paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  add column if not exists due_amount numeric(12, 2) not null default 0 check (due_amount >= 0),
  add column if not exists payment_status text not null default 'PAID' check (payment_status in ('PAID', 'PARTIAL', 'DUE'));

-- ২. আগের সমস্ত ডেটাকে পেইড হিসেবে আপডেট করা
update public.branch_finances
set total_amount = amount,
    paid_amount = amount,
    due_amount = 0,
    payment_status = 'PAID'
where total_amount = 0 and amount > 0;

-- ৩. কিস্তি ও বকেয়া আদায়ের জন্য Payments টেবিল তৈরি করা
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

-- ৪. ইনডেক্স তৈরি করা
create index if not exists idx_branch_finance_payments_finance_id on public.branch_finance_payments(finance_id);
create index if not exists idx_branch_finance_payments_branch_id on public.branch_finance_payments(branch_id);
create index if not exists idx_branch_finance_payments_date on public.branch_finance_payments(payment_date);

-- ৫. আগের লেনদেনগুলোর জন্য প্রারম্ভিক পেমেন্ট রেকর্ড যোগ করা
insert into public.branch_finance_payments (finance_id, branch_id, amount, payment_date, note, recorded_by)
select id, branch_id, amount, date, 'Initial Payment', recorded_by
from public.branch_finances
where amount > 0 
  and id not in (select finance_id from public.branch_finance_payments);
