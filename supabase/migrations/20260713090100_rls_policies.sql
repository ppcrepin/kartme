-- KartSquad — Row Level Security (lot 0.3)
-- Règles appliquées par la base elle-même (non contournables côté client).
-- Principe : lecture large pour la découverte (profils publics, courses,
-- circuits) ; écriture strictement encadrée (l'admin d'une course est le seul
-- à écrire ses participants/résultats ; l'Elo n'est jamais modifié à la main).
-- Le rôle service_role (serveur / fonctions SECURITY DEFINER) contourne la RLS.

-- Accès de base aux schémas.
grant usage on schema public to anon, authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

-- Lecture : profils publics visibles de tous les inscrits ; le sien toujours.
-- (La visibilité "amis uniquement" d'un profil privé sera étendue avec la
--  table friendships, lot 2.1.)
create policy profiles_select on public.profiles for select to authenticated
  using (not is_private or id = auth.uid());

create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── ghost_profiles ───────────────────────────────────────────────────────
alter table public.ghost_profiles enable row level security;
grant select, insert on public.ghost_profiles to authenticated;

-- Visibles de tous (ils apparaissent au classement Global).
create policy ghost_select on public.ghost_profiles for select to authenticated
  using (true);

-- Créés par l'admin qui ajoute un invité ; l'Elo (réclamation, fusion) est
-- géré par des fonctions serveur → pas d'update direct pour les inscrits.
create policy ghost_insert on public.ghost_profiles for insert to authenticated
  with check (created_by = auth.uid());

-- ── circuits ─────────────────────────────────────────────────────────────
alter table public.circuits enable row level security;
grant select, insert on public.circuits to authenticated;

create policy circuits_select on public.circuits for select to authenticated
  using (true);

-- Ajout libre (rejoint la liste commune). Impossible de se déclarer "officiel".
create policy circuits_insert on public.circuits for insert to authenticated
  with check (created_by = auth.uid() and is_official = false);

-- ── races ────────────────────────────────────────────────────────────────
alter table public.races enable row level security;
grant select, insert, update, delete on public.races to authenticated;

create policy races_select on public.races for select to authenticated
  using (true);

create policy races_insert_admin on public.races for insert to authenticated
  with check (admin_id = auth.uid());

create policy races_update_admin on public.races for update to authenticated
  using (admin_id = auth.uid()) with check (admin_id = auth.uid());

create policy races_delete_admin on public.races for delete to authenticated
  using (admin_id = auth.uid());

-- ── participations ───────────────────────────────────────────────────────
alter table public.participations enable row level security;
grant select, insert, update, delete on public.participations to authenticated;

create policy participations_select on public.participations for select to authenticated
  using (true);

-- Seul l'admin de la course gère ses participants.
create policy participations_write_admin on public.participations for all to authenticated
  using (exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid()))
  with check (exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid()));

-- ── results : la règle anti-triche centrale ──────────────────────────────
alter table public.results enable row level security;
grant select, insert, update on public.results to authenticated;

create policy results_select on public.results for select to authenticated
  using (true);

-- Seul l'admin de la course écrit/modifie le classement.
create policy results_insert_admin on public.results for insert to authenticated
  with check (exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid()));

create policy results_update_admin on public.results for update to authenticated
  using (exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid()))
  with check (exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid()));

-- ── elo_history ──────────────────────────────────────────────────────────
alter table public.elo_history enable row level security;
grant select on public.elo_history to authenticated;

-- Lecture : historique des fantômes + des profils publics (ou le sien).
-- L'insertion est réservée aux fonctions serveur (moteur Elo) → aucune
-- policy d'écriture pour les inscrits.
create policy elo_history_select on public.elo_history for select to authenticated
  using (
    ghost_id is not null
    or exists (
      select 1 from public.profiles p
      where p.id = profile_id and (not p.is_private or p.id = auth.uid())
    )
  );
