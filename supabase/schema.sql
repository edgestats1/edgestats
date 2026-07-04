-- EdgeStats Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  role text not null default 'free' check (role in ('free', 'premium')),
  stripe_customer_id text,
  stripe_session_id text,
  premium_since timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Profiles insertable by owner" on public.profiles;
create policy "Profiles insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, lower(new.email), 'free')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Backfill profiles for any auth users created before this migration
insert into public.profiles (id, email, role)
select id, lower(email), 'free'
from auth.users
where email is not null
on conflict (id) do update
  set email = excluded.email,
      updated_at = timezone('utc', now());

-- Required privileges for Supabase API roles
grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update on table public.profiles to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select, insert, update on tables to authenticated;
