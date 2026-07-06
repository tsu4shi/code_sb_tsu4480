-- Kakeibo ledger schema (Pattern B: full transactions + marks in Supabase)
-- Apply via Supabase Dashboard → SQL Editor, or `supabase db push` if using CLI.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public.households is
  'One household groups shared ledger data. Single-user today; couple sharing adds members later.';

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

create table public.transactions (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  date date not null,
  month text not null,
  content text not null default '',
  amount numeric not null,
  institution text not null default '',
  major_category text not null default '',
  minor_category text not null default '',
  memo text not null default '',
  is_transfer boolean not null default false,
  is_calc_target boolean not null default true,
  mark text check (mark is null or mark in ('me', 'spouse', 'shared', 'excluded')),
  source_label text not null default '',
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index transactions_household_month_idx on public.transactions (household_id, month);
create index transactions_household_date_idx on public.transactions (household_id, date);

-- ---------------------------------------------------------------------------
-- Auto-provision a household when a new auth user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.households default values returning id into new_household_id;
  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on every change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions enable row level security;

-- Helper: household ids the current user belongs to.
create or replace function public.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

-- households: members can read their own household row
create policy households_select on public.households
  for select using (id in (select public.my_household_ids()));

-- household_members: users see memberships for households they belong to
create policy household_members_select on public.household_members
  for select using (household_id in (select public.my_household_ids()));

-- transactions: full CRUD scoped to the user's household(s)
create policy transactions_select on public.transactions
  for select using (household_id in (select public.my_household_ids()));

create policy transactions_insert on public.transactions
  for insert with check (household_id in (select public.my_household_ids()));

create policy transactions_update on public.transactions
  for update using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));

create policy transactions_delete on public.transactions
  for delete using (household_id in (select public.my_household_ids()));
