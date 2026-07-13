-- KartSquad — schéma cœur (lot 0.3)
-- Tables nécessaires jusqu'à la fin de la Phase 1. Les tables sociales /
-- modération (friendships, badges, reports, notifications) arriveront avec
-- leur lot. Conçu pour Supabase (schéma auth, rôles anon/authenticated,
-- auth.uid() déjà présents côté cloud).

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ── Fonctions utilitaires ────────────────────────────────────────────────
-- Horodatage de mise à jour.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Empêche la modification directe de l'Elo par un utilisateur : seul le
-- service (fonction SECURITY DEFINER du moteur Elo, lot 1.3) ou le rôle
-- service_role peut le changer. Socle anti-triche.
create or replace function public.guard_elo()
returns trigger language plpgsql as $$
begin
  if new.elo is distinct from old.elo
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Elo non modifiable directement (réservé au moteur Elo)';
  end if;
  return new;
end;
$$;

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  elo           integer not null default 1000,
  is_private    boolean not null default false, -- public par défaut (découverte)
  account_type  text not null default 'player', -- garde la porte au futur compte "circuit pro"
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_len check (char_length(username) between 3 and 20),
  constraint profiles_account_type check (account_type in ('player', 'circuit_pro')),
  constraint profiles_elo_range check (elo between 100 and 2500)
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger profiles_guard_elo before update on public.profiles
  for each row execute function public.guard_elo();

-- ── ghost_profiles : invités sans compte, avec leur propre Elo ────────────
create table public.ghost_profiles (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  elo           integer not null default 1000,
  created_by    uuid not null references public.profiles (id) on delete set null,
  claimed_by    uuid references public.profiles (id) on delete set null, -- rattachement à la réclamation
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ghost_name_len check (char_length(display_name) between 1 and 40),
  constraint ghost_elo_range check (elo between 100 and 2500)
);

create trigger ghost_updated_at before update on public.ghost_profiles
  for each row execute function public.set_updated_at();
create trigger ghost_guard_elo before update on public.ghost_profiles
  for each row execute function public.guard_elo();

-- ── circuits : liste commune, enrichie librement (dédoublonnage au fil de l'eau) ──
create table public.circuits (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  is_official   boolean not null default false, -- true = circuit du seed
  created_by    uuid references public.profiles (id) on delete set null, -- null pour le seed
  report_count  integer not null default 0, -- signalable
  created_at    timestamptz not null default now(),
  constraint circuit_name_len check (char_length(name) between 2 and 80)
);

create index circuits_name_idx on public.circuits (lower(name));

-- ── races ────────────────────────────────────────────────────────────────
create table public.races (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.profiles (id) on delete cascade,
  circuit_id    uuid references public.circuits (id) on delete set null,
  scheduled_at  timestamptz not null,
  status        text not null default 'upcoming',
  invite_token  uuid not null default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint race_status check (status in ('upcoming', 'completed'))
);

create index races_admin_idx on public.races (admin_id);
create trigger races_updated_at before update on public.races
  for each row execute function public.set_updated_at();

-- ── participations : un pilote (compte OU fantôme) dans une course ────────
create table public.participations (
  id            uuid primary key default gen_random_uuid(),
  race_id       uuid not null references public.races (id) on delete cascade,
  profile_id    uuid references public.profiles (id) on delete cascade,
  ghost_id      uuid references public.ghost_profiles (id) on delete cascade,
  present       boolean not null default true, -- confirmation des présents (écran C6b)
  created_at    timestamptz not null default now(),
  -- exactement un des deux : compte OU fantôme
  constraint participation_one_racer check (num_nonnulls(profile_id, ghost_id) = 1)
);

create unique index participation_profile_uniq on public.participations (race_id, profile_id)
  where profile_id is not null;
create unique index participation_ghost_uniq on public.participations (race_id, ghost_id)
  where ghost_id is not null;

-- ── results : classement final saisi par l'admin ─────────────────────────
create table public.results (
  id                uuid primary key default gen_random_uuid(),
  race_id           uuid not null references public.races (id) on delete cascade,
  participation_id  uuid not null references public.participations (id) on delete cascade,
  position          integer not null,
  elo_before        integer not null,
  elo_after         integer not null,
  elo_delta         integer not null,
  created_at        timestamptz not null default now(),
  constraint result_position_pos check (position >= 1)
);

create unique index result_participation_uniq on public.results (race_id, participation_id);
create unique index result_position_uniq on public.results (race_id, position);

-- ── elo_history : une ligne par variation (courbe du profil) ──────────────
create table public.elo_history (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles (id) on delete cascade,
  ghost_id      uuid references public.ghost_profiles (id) on delete cascade,
  race_id       uuid references public.races (id) on delete set null,
  elo           integer not null, -- valeur après la course
  delta         integer not null,
  created_at    timestamptz not null default now(),
  constraint elo_history_one_racer check (num_nonnulls(profile_id, ghost_id) = 1)
);

create index elo_history_profile_idx on public.elo_history (profile_id, created_at);
create index elo_history_ghost_idx on public.elo_history (ghost_id, created_at);
