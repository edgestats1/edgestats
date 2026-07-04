-- Fix: permission denied for table profiles (error 42501)
-- Run in Supabase SQL Editor for project vhhjigshwkahfzgporvg
-- Dashboard → SQL → New query → paste → Run

grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update on table public.profiles to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select, insert, update on tables to authenticated;
