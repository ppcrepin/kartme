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
-- Colonnes/table supplémentaires pour émuler le nettoyage RGPD (delete_my_account
-- neutralise l'identité de connexion). Supabase les fournit déjà en vrai.
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists raw_user_meta_data jsonb;

create table if not exists auth.identities (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users (id) on delete cascade,
  provider text
);

-- auth.uid() / auth.role() : lisent le claim JWT injecté par le test.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), 'anon');
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- Émulation de pg_net (Supabase le fournit). En local on capture les appels
-- http_post dans une table pour pouvoir tester la logique des déclencheurs de
-- notification sans réseau. La signature reproduit celle de pg_net.
create schema if not exists net;
grant usage on schema net to anon, authenticated, service_role;

create table if not exists net._calls (
  id       bigserial primary key,
  url      text,
  headers  jsonb,
  body     jsonb,
  created_at timestamptz not null default now()
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000
) returns bigint language sql as $$
  insert into net._calls (url, headers, body) values (url, headers, body) returning id;
$$;
