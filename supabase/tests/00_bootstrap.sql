-- Bootstrap de TEST LOCAL uniquement — émule l'environnement Supabase
-- (schéma auth, rôles, auth.uid()) pour exécuter les migrations et tester la
-- RLS avec un Postgres nu. NON appliqué sur Supabase (qui fournit déjà tout ça).

create extension if not exists "pgcrypto";

-- Rôles Supabase.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- Schéma auth minimal.
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- auth.uid() / auth.role() : lisent le claim JWT injecté par le test.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;
