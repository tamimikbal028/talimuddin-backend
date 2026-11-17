alter table public.branch_finances
  add column if not exists salary_month text
  check (salary_month is null or salary_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
