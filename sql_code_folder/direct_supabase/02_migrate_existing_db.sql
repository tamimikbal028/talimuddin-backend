-- ============================================================================
-- TALIMUDDIN / BIDDA: MIGRATE EXISTING DATABASE TO DIRECT SUPABASE
-- ============================================================================
-- কখন ব্যবহার করবেন:
-- আপনার বর্তমান Supabase প্রজেক্টে যদি আগে থেকেই ডেটা ও টেবিল থাকে (অর্থাৎ রিসেট
-- না করে শুধু Direct Supabase সাপোর্ট যোগ করতে চান), তাহলে এই ফাইলটি রান করুন।
--
-- দ্রষ্টব্য: এতে কোনো DROP SCHEMA বা Storage SQL কোড নেই।
-- Storage সেটআপের জন্য STORAGE_SETUP_GUIDE.md দেখুন।
-- ============================================================================

-- ১. নতুন/অপশনাল কলামগুলো নিশ্চিত করা (Safe Idempotent)
alter table public.branch_memberships
  add column if not exists allowed_category_ids jsonb default null;

alter table public.branch_finances
  add column if not exists total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  add column if not exists paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  add column if not exists due_amount numeric(12, 2) not null default 0 check (due_amount >= 0),
  add column if not exists payment_status text not null default 'PAID' check (payment_status in ('PAID', 'PARTIAL', 'DUE')),
  add column if not exists member_id uuid references public.branch_memberships(id) on delete set null,
  add column if not exists salary_month text check (salary_month is null or salary_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ২. handle_new_user ট্রিগার আপডেট (নিরাপত্তা: সাইন-আপ মেটাডাটা থেকে কেউ যেন ADMIN হতে না পারে)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := lower(split_part(new.email, '@', 1));
  base_username := regexp_replace(base_username, '[^a-z0-9]', '', 'g');
  if base_username = '' then
    base_username := 'user';
  end if;
  final_username := base_username;

  while exists (select 1 from public.users where user_name = final_username) loop
    final_username := base_username || floor(random() * 10000)::text;
  end loop;

  insert into public.users (id, full_name, email, user_name, user_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    final_username,
    'USER'
  );
  return new;
end;
$$;

-- ৩. সকল টেবিলে RLS চালু করা
alter table public.users enable row level security;
alter table public.branches enable row level security;
alter table public.branch_memberships enable row level security;
alter table public.branch_finance_categories enable row level security;
alter table public.branch_finances enable row level security;
alter table public.branch_finance_payments enable row level security;
alter table public.notices enable row level security;

-- ৪. Principle of Least Privilege: Table & Column Grants
grant usage on schema public to anon, authenticated;

revoke all on public.users from anon;
grant select on public.users to authenticated;
revoke insert, update, delete on public.users from authenticated;
grant insert (id, full_name, email, user_name, user_type) on public.users to authenticated;
grant update (full_name, avatar, password_changed_at) on public.users to authenticated;

-- Branches: finance_action_code সরাসরি SELECT করা যাবে না
revoke all on public.branches from anon, authenticated;
grant select (
  id, name, description, location_name, location_url, admin_info,
  cover_image, branch_type, parent_branch_id, is_deleted,
  members_count, created_at, updated_at
) on public.branches to anon, authenticated;
grant insert (
  name, description, location_name, location_url, admin_info,
  cover_image, branch_type, parent_branch_id, is_deleted, members_count
) on public.branches to authenticated;
grant update (
  name, description, location_name, location_url, admin_info,
  cover_image, branch_type, parent_branch_id, is_deleted, members_count
) on public.branches to authenticated;

revoke all on public.branch_memberships from anon;
grant select, insert, update, delete on public.branch_memberships to authenticated;

revoke all on public.branch_finance_categories from anon;
grant select, insert, update, delete on public.branch_finance_categories to authenticated;

revoke all on public.branch_finances from anon;
grant select, insert, update, delete on public.branch_finances to authenticated;

revoke all on public.branch_finance_payments from anon;
grant select, insert on public.branch_finance_payments to authenticated;

revoke all on public.notices from anon;
grant select, insert, update, delete on public.notices to authenticated;

-- ৫. Security Definer Helper Functions
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and user_type = 'ADMIN'
      and account_status = 'ACTIVE'
  );
$$;

create or replace function public.is_branch_admin(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branch_memberships
    where branch_id = p_branch_id
      and user_id = auth.uid()
      and is_admin = true
      and is_deleted = false
  );
$$;

create or replace function public.is_branch_moderator(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branch_memberships
    where branch_id = p_branch_id
      and user_id = auth.uid()
      and is_moderator = true
      and is_deleted = false
  );
$$;

create or replace function public.is_branch_member(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branch_memberships
    where branch_id = p_branch_id
      and user_id = auth.uid()
      and is_deleted = false
  );
$$;

create or replace function public.is_branch_staff(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_branch_admin(p_branch_id)
      or public.is_branch_moderator(p_branch_id);
$$;

create or replace function public.can_access_branch_finance(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
      or public.is_branch_admin(p_branch_id)
      or public.is_branch_moderator(p_branch_id);
$$;

create or replace function public.can_moderator_create_category(p_branch_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed jsonb;
begin
  if public.is_branch_admin(p_branch_id) then
    return true;
  end if;

  if not public.is_branch_moderator(p_branch_id) then
    return false;
  end if;

  select allowed_category_ids
  into v_allowed
  from public.branch_memberships
  where branch_id = p_branch_id
    and user_id = auth.uid()
    and is_moderator = true
    and is_deleted = false
  limit 1;

  return v_allowed is null or jsonb_array_length(v_allowed) = 0;
end;
$$;

create or replace function public.can_moderator_use_category(p_branch_id uuid, p_category_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed jsonb;
begin
  if public.is_branch_admin(p_branch_id) then
    return true;
  end if;

  if not public.is_branch_moderator(p_branch_id) then
    return false;
  end if;

  select allowed_category_ids
  into v_allowed
  from public.branch_memberships
  where branch_id = p_branch_id
    and user_id = auth.uid()
    and is_moderator = true
    and is_deleted = false
  limit 1;

  if v_allowed is null or jsonb_array_length(v_allowed) = 0 then
    return true;
  end if;

  return v_allowed ? p_category_id::text;
end;
$$;

-- ৬. Automatic Member Count Sync Trigger + Backfill
create or replace function public.sync_branch_members_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  v_branch_id := coalesce(new.branch_id, old.branch_id);
  if v_branch_id is not null then
    update public.branches
    set members_count = (
      select count(*)::integer
      from public.branch_memberships
      where branch_id = v_branch_id
        and is_deleted = false
        and is_admin = false
        and is_moderator = false
    )
    where id = v_branch_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_branch_members_count on public.branch_memberships;
create trigger trg_sync_branch_members_count
  after insert or update or delete on public.branch_memberships
  for each row execute function public.sync_branch_members_count();

update public.branches b
set members_count = (
  select count(*)::integer
  from public.branch_memberships m
  where m.branch_id = b.id
    and m.is_deleted = false
    and m.is_admin = false
    and m.is_moderator = false
);

-- ৭. RLS Policies
drop policy if exists "users_select_authenticated" on public.users;
create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (account_status = 'ACTIVE' or id = auth.uid() or public.is_app_admin());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "branches_select_active" on public.branches;
create policy "branches_select_active"
  on public.branches for select
  to anon, authenticated
  using (is_deleted = false);

drop policy if exists "branches_insert_admin" on public.branches;
create policy "branches_insert_admin"
  on public.branches for insert
  to authenticated
  with check (public.is_app_admin());

drop policy if exists "branches_update_admins" on public.branches;
create policy "branches_update_admins"
  on public.branches for update
  to authenticated
  using (is_deleted = false and (public.is_app_admin() or public.is_branch_admin(id)))
  with check (
    public.is_app_admin()
    or (public.is_branch_admin(id) and is_deleted = false)
  );

drop policy if exists "memberships_select" on public.branch_memberships;
create policy "memberships_select"
  on public.branch_memberships for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_app_admin()
    or public.is_branch_member(branch_id)
  );

drop policy if exists "memberships_insert" on public.branch_memberships;
create policy "memberships_insert"
  on public.branch_memberships for insert
  to authenticated
  with check (
    (is_admin = true and public.is_app_admin())
    or (is_moderator = true and is_admin = false and public.is_branch_admin(branch_id))
    or (
      is_admin = false
      and is_moderator = false
      and (public.is_app_admin() or public.is_branch_admin(branch_id))
    )
  );

drop policy if exists "memberships_update" on public.branch_memberships;
create policy "memberships_update"
  on public.branch_memberships for update
  to authenticated
  using (
    public.is_app_admin()
    or (public.is_branch_admin(branch_id) and is_admin = false)
  )
  with check (
    public.is_app_admin()
    or (public.is_branch_admin(branch_id) and is_admin = false)
  );

drop policy if exists "memberships_delete" on public.branch_memberships;
create policy "memberships_delete"
  on public.branch_memberships for delete
  to authenticated
  using (
    public.is_app_admin()
    or (public.is_branch_admin(branch_id) and is_admin = false)
  );

drop policy if exists "finance_categories_select" on public.branch_finance_categories;
create policy "finance_categories_select"
  on public.branch_finance_categories for select
  to authenticated
  using (public.can_access_branch_finance(branch_id));

drop policy if exists "finance_categories_insert" on public.branch_finance_categories;
create policy "finance_categories_insert"
  on public.branch_finance_categories for insert
  to authenticated
  with check (public.can_moderator_create_category(branch_id));

drop policy if exists "branch_finances_select" on public.branch_finances;
create policy "branch_finances_select"
  on public.branch_finances for select
  to authenticated
  using (
    public.can_access_branch_finance(branch_id)
    or exists (
      select 1
      from public.branch_memberships bm
      where bm.id = branch_finances.member_id
        and bm.user_id = auth.uid()
        and bm.is_deleted = false
    )
  );

drop policy if exists "branch_finances_insert" on public.branch_finances;
create policy "branch_finances_insert"
  on public.branch_finances for insert
  to authenticated
  with check (
    recorded_by = auth.uid()
    and public.can_moderator_use_category(branch_id, category_id)
  );

drop policy if exists "branch_finances_update" on public.branch_finances;
drop policy if exists "branch_finances_delete" on public.branch_finances;

drop policy if exists "finance_payments_select" on public.branch_finance_payments;
create policy "finance_payments_select"
  on public.branch_finance_payments for select
  to authenticated
  using (public.can_access_branch_finance(branch_id));

drop policy if exists "finance_payments_insert" on public.branch_finance_payments;
create policy "finance_payments_insert"
  on public.branch_finance_payments for insert
  to authenticated
  with check (
    recorded_by = auth.uid()
    and public.is_branch_staff(branch_id)
    and exists (
      select 1
      from public.branch_finances bf
      where bf.id = branch_finance_payments.finance_id
        and bf.branch_id = branch_finance_payments.branch_id
        and bf.recorded_by = auth.uid()
    )
  );

drop policy if exists "notices_select" on public.notices;
create policy "notices_select"
  on public.notices for select
  to authenticated
  using (
    is_deleted = false
    and (
      public.is_app_admin()
      or (
        is_active = true
        and exists (
          select 1
          from public.branch_memberships bm
          where bm.user_id = auth.uid()
            and bm.is_admin = true
            and bm.is_deleted = false
        )
      )
    )
  );

drop policy if exists "notices_insert_admin" on public.notices;
create policy "notices_insert_admin"
  on public.notices for insert
  to authenticated
  with check (public.is_app_admin() and created_by = auth.uid());

drop policy if exists "notices_update_admin" on public.notices;
create policy "notices_update_admin"
  on public.notices for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "notices_delete_admin" on public.notices;
create policy "notices_delete_admin"
  on public.notices for delete
  to authenticated
  using (public.is_app_admin());

-- ৮. Security Definer RPC Functions
create or replace function public.soft_delete_branch_rpc(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean;
begin
  if not public.is_app_admin() then
    raise exception 'Only app administrator can delete branch';
  end if;

  select is_deleted into v_deleted
  from public.branches
  where id = p_branch_id;

  if not found then
    raise exception 'Branch not found';
  end if;

  if v_deleted then
    raise exception 'Branch already deleted';
  end if;

  update public.branches set is_deleted = true where id = p_branch_id;
  update public.branch_memberships set is_deleted = true where branch_id = p_branch_id;

  return jsonb_build_object('branch_id', p_branch_id);
end;
$$;

create or replace function public.promote_or_add_branch_admin_rpc(
  p_branch_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_user record;
  v_existing record;
begin
  if not public.is_app_admin() then
    raise exception 'Only app administrators can add branch admins';
  end if;

  select id, is_deleted into v_branch from public.branches where id = p_branch_id;
  if not found or v_branch.is_deleted then
    raise exception 'Branch not found or has been deleted';
  end if;

  select id, full_name, user_name, email, avatar, account_status, user_type
  into v_user from public.users where id = p_target_user_id;
  if not found or v_user.account_status <> 'ACTIVE' then
    raise exception 'Target user not found or inactive';
  end if;

  if v_user.user_type = 'ADMIN' then
    raise exception 'App administrator cannot be added as a branch admin';
  end if;

  select id, is_admin, is_moderator, is_deleted
  into v_existing
  from public.branch_memberships
  where branch_id = p_branch_id and user_id = p_target_user_id;

  if found then
    if v_existing.is_admin and not v_existing.is_deleted then
      raise exception 'This user is already an admin of this branch';
    end if;

    update public.branch_memberships
    set is_admin = true,
        is_moderator = false,
        is_deleted = false,
        name = v_user.full_name,
        email = v_user.email,
        updated_at = now()
    where id = v_existing.id;
  else
    insert into public.branch_memberships (
      branch_id, user_id, name, email, is_admin, is_moderator, is_deleted
    ) values (
      p_branch_id, p_target_user_id, v_user.full_name, v_user.email, true, false, false
    );
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'full_name', v_user.full_name,
      'user_name', v_user.user_name,
      'email', v_user.email,
      'avatar', v_user.avatar
    )
  );
end;
$$;

create or replace function public.assign_branch_moderator_rpc(
  p_branch_id uuid,
  p_target_user_id uuid,
  p_allowed_category_ids jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_user record;
  v_existing record;
  v_normalized jsonb := null;
  v_cat_count integer;
  v_req_count integer;
begin
  if not public.is_branch_admin(p_branch_id) then
    raise exception 'Only branch administrators can add moderators to this branch';
  end if;

  select id, is_deleted into v_branch from public.branches where id = p_branch_id;
  if not found or v_branch.is_deleted then
    raise exception 'Branch not found or has been deleted';
  end if;

  select id, full_name, user_name, email, avatar, account_status, user_type
  into v_user from public.users where id = p_target_user_id;
  if not found or v_user.account_status <> 'ACTIVE' then
    raise exception 'Target user not found or inactive';
  end if;

  if v_user.user_type = 'ADMIN' then
    raise exception 'App administrator cannot be added as a branch moderator';
  end if;

  if p_allowed_category_ids is not null
     and jsonb_typeof(p_allowed_category_ids) = 'array'
     and jsonb_array_length(p_allowed_category_ids) > 0 then
    v_req_count := jsonb_array_length(p_allowed_category_ids);

    select count(*)::integer into v_cat_count
    from public.branch_finance_categories
    where branch_id = p_branch_id
      and id::text in (select jsonb_array_elements_text(p_allowed_category_ids));

    if v_cat_count <> v_req_count then
      raise exception 'One or more selected categories are invalid or do not belong to this branch';
    end if;

    v_normalized := p_allowed_category_ids;
  end if;

  select id, is_admin, is_moderator, is_deleted
  into v_existing
  from public.branch_memberships
  where branch_id = p_branch_id and user_id = p_target_user_id;

  if found then
    if v_existing.is_admin and not v_existing.is_deleted then
      raise exception 'This user is already an admin of this branch';
    end if;
    if v_existing.is_moderator and not v_existing.is_deleted then
      raise exception 'This user is already a moderator of this branch';
    end if;

    update public.branch_memberships
    set is_moderator = true,
        is_deleted = false,
        name = v_user.full_name,
        email = v_user.email,
        allowed_category_ids = v_normalized,
        updated_at = now()
    where id = v_existing.id;
  else
    insert into public.branch_memberships (
      branch_id, user_id, name, email, is_admin, is_moderator, allowed_category_ids, is_deleted
    ) values (
      p_branch_id, p_target_user_id, v_user.full_name, v_user.email, false, true, v_normalized, false
    );
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'full_name', v_user.full_name,
      'user_name', v_user.user_name,
      'email', v_user.email,
      'avatar', v_user.avatar
    ),
    'allowed_category_ids', v_normalized
  );
end;
$$;

create or replace function public.get_branch_action_code(p_branch_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_branch_admin(p_branch_id) then
    raise exception 'শুধুমাত্র ব্রাঞ্চ এডমিন এই সিকিউরিটি কোড দেখতে পারবেন';
  end if;

  select coalesce(finance_action_code, '1234')
  into v_code
  from public.branches
  where id = p_branch_id and is_deleted = false;

  if not found then
    raise exception 'Branch not found or has been deleted';
  end if;

  return v_code;
end;
$$;

create or replace function public.update_branch_action_code(
  p_branch_id uuid,
  p_new_code text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text;
begin
  if not public.is_branch_admin(p_branch_id) then
    raise exception 'শুধুমাত্র ব্রাঞ্চ এডমিন সিকিউরিটি কোড পরিবর্তন করতে পারবেন';
  end if;

  v_trimmed := trim(coalesce(p_new_code, ''));
  if char_length(v_trimmed) < 4 or char_length(v_trimmed) > 20 then
    raise exception 'কোড অবশ্যই ৪ থেকে ২০ অক্ষরের মধ্যে হতে হবে';
  end if;

  update public.branches
  set finance_action_code = v_trimmed, updated_at = now()
  where id = p_branch_id and is_deleted = false;

  if not found then
    raise exception 'Branch not found or has been deleted';
  end if;

  return v_trimmed;
end;
$$;

create or replace function public.update_finance_entry_rpc(
  p_branch_id uuid,
  p_entry_id uuid,
  p_type public.finance_type,
  p_total_amount numeric,
  p_paid_amount numeric,
  p_due_amount numeric,
  p_payment_status text,
  p_category_id uuid,
  p_note text,
  p_date timestamptz,
  p_person_name text,
  p_person_phone text,
  p_member_id uuid,
  p_salary_month text,
  p_details jsonb,
  p_action_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_existing record;
  v_cat record;
  v_is_admin boolean;
  v_is_mod boolean;
  v_is_app_admin boolean;
  v_allowed jsonb;
begin
  select id, is_deleted, coalesce(finance_action_code, '1234') as finance_action_code
  into v_branch from public.branches where id = p_branch_id;
  if not found or v_branch.is_deleted then
    raise exception 'Branch not found or has been deleted';
  end if;

  v_is_admin := public.is_branch_admin(p_branch_id);
  v_is_mod := public.is_branch_moderator(p_branch_id);
  v_is_app_admin := public.is_app_admin();

  if not v_is_admin and not v_is_mod then
    raise exception 'Only branch administrators or moderators can perform this action';
  end if;

  select id, category_id, recorded_by into v_existing
  from public.branch_finances where id = p_entry_id and branch_id = p_branch_id;
  if not found then
    raise exception 'Finance entry not found or does not belong to this branch';
  end if;

  if not v_is_app_admin and v_existing.recorded_by <> auth.uid() then
    raise exception 'শুধুমাত্র যিনি এন্ট্রি করেছেন তিনিই এটি এডিট করতে পারবেন';
  end if;

  if not v_is_admin then
    if trim(coalesce(p_action_code, '')) <> v_branch.finance_action_code then
      raise exception 'ভুল সিকিউরিটি কোড! এন্ট্রি এডিট করতে ব্রাঞ্চ এডমিনের অনুমোদিত কোড প্রয়োজন।';
    end if;

    select allowed_category_ids into v_allowed
    from public.branch_memberships
    where branch_id = p_branch_id and user_id = auth.uid() and is_moderator = true and is_deleted = false
    limit 1;

    if v_allowed is not null and jsonb_array_length(v_allowed) > 0 then
      if not (v_allowed ? p_category_id::text) or not (v_allowed ? v_existing.category_id::text) then
        raise exception 'আপনার এই ক্যাটাগরির এন্ট্রি পরিবর্তন করার অনুমতি নেই।';
      end if;
    end if;
  end if;

  select id, type into v_cat from public.branch_finance_categories
  where id = p_category_id and branch_id = p_branch_id;
  if not found then
    raise exception 'Invalid category selected for this branch';
  end if;
  if v_cat.type <> p_type then
    raise exception 'Category type mismatch';
  end if;

  update public.branch_finances
  set type = p_type,
      amount = p_total_amount,
      total_amount = p_total_amount,
      paid_amount = p_paid_amount,
      due_amount = p_due_amount,
      payment_status = p_payment_status,
      category_id = p_category_id,
      note = coalesce(p_note, ''),
      date = coalesce(p_date, now()),
      person_name = coalesce(p_person_name, ''),
      person_phone = coalesce(p_person_phone, ''),
      member_id = p_member_id,
      salary_month = p_salary_month,
      details = coalesce(p_details, '[]'::jsonb),
      updated_at = now()
  where id = p_entry_id and branch_id = p_branch_id;

  return p_entry_id;
end;
$$;

create or replace function public.delete_finance_entry_rpc(
  p_branch_id uuid,
  p_entry_id uuid,
  p_action_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_existing record;
  v_is_admin boolean;
  v_is_mod boolean;
  v_is_app_admin boolean;
  v_allowed jsonb;
begin
  select id, is_deleted, coalesce(finance_action_code, '1234') as finance_action_code
  into v_branch from public.branches where id = p_branch_id;
  if not found or v_branch.is_deleted then
    raise exception 'Branch not found or has been deleted';
  end if;

  v_is_admin := public.is_branch_admin(p_branch_id);
  v_is_mod := public.is_branch_moderator(p_branch_id);
  v_is_app_admin := public.is_app_admin();

  if not v_is_admin and not v_is_mod then
    raise exception 'Only branch administrators or moderators can perform this action';
  end if;

  select id, category_id, recorded_by into v_existing
  from public.branch_finances where id = p_entry_id and branch_id = p_branch_id;
  if not found then
    raise exception 'Finance entry not found or does not belong to this branch';
  end if;

  if not v_is_app_admin and v_existing.recorded_by <> auth.uid() then
    raise exception 'শুধুমাত্র যিনি এন্ট্রি করেছেন তিনিই এটি ডিলিট করতে পারবেন';
  end if;

  if not v_is_admin then
    select allowed_category_ids into v_allowed
    from public.branch_memberships
    where branch_id = p_branch_id and user_id = auth.uid() and is_moderator = true and is_deleted = false
    limit 1;

    if v_allowed is not null and jsonb_array_length(v_allowed) > 0 then
      if not (v_allowed ? v_existing.category_id::text) then
        raise exception 'আপনার এই ক্যাটাগরির এন্ট্রি ডিলিট করার অনুমতি নেই।';
      end if;
    end if;

    if trim(coalesce(p_action_code, '')) <> v_branch.finance_action_code then
      raise exception 'ভুল সিকিউরিটি কোড! এন্ট্রি ডিলিট করতে ব্রাঞ্চ এডমিনের অনুমোদিত কোড প্রয়োজন।';
    end if;
  end if;

  delete from public.branch_finances where id = p_entry_id and branch_id = p_branch_id;
  return p_entry_id;
end;
$$;

create or replace function public.record_finance_payment_rpc(
  p_branch_id uuid,
  p_entry_id uuid,
  p_amount numeric,
  p_payment_date timestamptz default now(),
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_new_paid numeric;
  v_new_due numeric;
  v_new_status text;
  v_payment_id uuid;
  v_is_app_admin boolean;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  if not public.is_branch_staff(p_branch_id) then
    raise exception 'Only branch administrators or moderators can perform this action';
  end if;

  v_is_app_admin := public.is_app_admin();

  select id, branch_id, amount, total_amount, paid_amount, due_amount, recorded_by
  into v_entry
  from public.branch_finances
  where id = p_entry_id and branch_id = p_branch_id
  for update;

  if not found then
    raise exception 'Finance entry not found or does not belong to this branch';
  end if;

  if not v_is_app_admin and v_entry.recorded_by <> auth.uid() then
    raise exception 'শুধুমাত্র যিনি এন্ট্রি করেছেন তিনিই বকেয়া আদায় বা পরিশোধ করতে পারবেন';
  end if;

  if coalesce(v_entry.due_amount, 0) <= 0 then
    raise exception 'This transaction has already been fully paid';
  end if;

  if p_amount > v_entry.due_amount + 0.01 then
    raise exception 'Payment amount (%) exceeds the remaining due (%)', p_amount, v_entry.due_amount;
  end if;

  v_new_paid := coalesce(v_entry.paid_amount, 0) + p_amount;
  v_new_due := greatest(0, v_entry.due_amount - p_amount);
  v_new_status := case when v_new_due <= 0.001 then 'PAID' else 'PARTIAL' end;

  insert into public.branch_finance_payments (
    finance_id, branch_id, amount, payment_date, note, recorded_by
  ) values (
    p_entry_id, p_branch_id, p_amount, coalesce(p_payment_date, now()), trim(coalesce(p_note, '')), auth.uid()
  )
  returning id into v_payment_id;

  update public.branch_finances
  set paid_amount = v_new_paid, due_amount = v_new_due, payment_status = v_new_status, updated_at = now()
  where id = p_entry_id;

  return jsonb_build_object('entry_id', p_entry_id, 'payment_id', v_payment_id);
end;
$$;

grant execute on function public.soft_delete_branch_rpc(uuid) to authenticated;
grant execute on function public.promote_or_add_branch_admin_rpc(uuid, uuid) to authenticated;
grant execute on function public.assign_branch_moderator_rpc(uuid, uuid, jsonb) to authenticated;
grant execute on function public.get_branch_action_code(uuid) to authenticated;
grant execute on function public.update_branch_action_code(uuid, text) to authenticated;
grant execute on function public.update_finance_entry_rpc(uuid, uuid, public.finance_type, numeric, numeric, numeric, text, uuid, text, timestamptz, text, text, uuid, text, jsonb, text) to authenticated;
grant execute on function public.delete_finance_entry_rpc(uuid, uuid, text) to authenticated;
grant execute on function public.record_finance_payment_rpc(uuid, uuid, numeric, timestamptz, text) to authenticated;
