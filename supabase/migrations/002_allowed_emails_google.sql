-- Email allowlist for Google (or other) login + shared household for allowed members.
-- Apply after 001_initial_schema.sql.

-- ---------------------------------------------------------------------------
-- Allowed emails (no client RLS policies = not readable from the browser)
-- ---------------------------------------------------------------------------

create table public.allowed_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.allowed_emails is
  'Only these emails may sign up / log in. Manage via Supabase SQL Editor (not from the app).';

alter table public.allowed_emails enable row level security;

-- Husband (owner). Add wife with:
--   insert into public.allowed_emails (email, note) values ('wife@gmail.com', '妻');
insert into public.allowed_emails (email, note)
values ('tsu4480@gmail.com', '夫');

-- ---------------------------------------------------------------------------
-- RPC: check allowlist (used by the browser after OAuth redirect)
-- ---------------------------------------------------------------------------

create or replace function public.is_email_allowed(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails where lower(email) = lower(check_email)
  );
$$;

revoke all on function public.is_email_allowed(text) from public;
grant execute on function public.is_email_allowed(text) to authenticated;
grant execute on function public.is_email_allowed(text) to service_role;

-- ---------------------------------------------------------------------------
-- Replace signup handler: allowlist + join existing shared household
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  existing_household_id uuid;
begin
  if not public.is_email_allowed(new.email) then
    raise exception 'Unauthorized email address: %', new.email
      using errcode = 'P0001';
  end if;

  -- If another allowed member already has a household, join it (couple sharing).
  select hm.household_id
  into existing_household_id
  from public.household_members hm
  inner join auth.users u on u.id = hm.user_id
  inner join public.allowed_emails ae on lower(ae.email) = lower(u.email)
  order by hm.created_at
  limit 1;

  if existing_household_id is not null then
    insert into public.household_members (household_id, user_id, role)
    values (existing_household_id, new.id, 'member')
    on conflict do nothing;
    return new;
  end if;

  insert into public.households default values returning id into new_household_id;
  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');
  return new;
end;
$$;
