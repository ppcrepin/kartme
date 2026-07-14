-- KartSquad — lot 3.2 : analytics & observabilité (100 % maison, aucun tiers).
--
-- Décisions PO 2026-07-14 : tout dans Supabase (pas de PostHog/Sentry), tableau
-- de bord in-app réservé au modérateur, 4 familles de métriques (viralité/
-- K-factor, activation, rétention, engagement). Principe : DÉRIVER le maximum
-- des tables existantes ; n' INSTRUMENTER côté client que ce qu'elles ignorent
-- (app_open, signup + parrain, share_clicked, rematch) + capturer les erreurs.

-- ── Journal d'événements (1re partie, sans PII au-delà du profile_id) ───────
create table public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles (id) on delete set null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint analytics_name_len check (char_length(name) between 1 and 60)
);
create index analytics_events_name_idx on public.analytics_events (name, created_at);
create index analytics_events_profile_idx on public.analytics_events (profile_id, created_at);

alter table public.analytics_events enable row level security;
grant insert on public.analytics_events to authenticated;
-- Écriture seule (chacun ses propres événements) ; lecture réservée à la
-- modération via get_metrics (SECURITY DEFINER). Aucune policy de select.
create policy analytics_insert_self on public.analytics_events for insert to authenticated
  with check (profile_id = auth.uid());

-- ── Journal d'erreurs (garde-fou global côté client) ───────────────────────
create table public.error_logs (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles (id) on delete set null,
  message     text not null,
  context     text,
  created_at  timestamptz not null default now(),
  constraint error_message_len check (char_length(message) between 1 and 500),
  constraint error_context_len check (context is null or char_length(context) <= 200)
);
create index error_logs_created_idx on public.error_logs (created_at);

alter table public.error_logs enable row level security;
grant insert on public.error_logs to anon, authenticated;
-- Une erreur peut survenir déconnecté (profile_id NULL) ; sinon elle doit
-- correspondre à l'auteur. Lecture réservée à la modération.
create policy error_insert on public.error_logs for insert to anon, authenticated
  with check (profile_id is null or profile_id = auth.uid());

-- ── Tableau de bord (modérateur only) ──────────────────────────────────────
create or replace function public.get_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  n_users int; n_active7 int; n_signup int; n_ref int; n_created7 int; n_retained7 int;
  n_activated int; n_raced int;
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;

  select count(*) into n_users from profiles where deleted_at is null;
  -- Actifs 7j : seulement des comptes NON supprimés (cohérence avec users_total).
  select count(distinct e.profile_id) into n_active7 from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'app_open' and e.created_at > now() - interval '7 days';

  -- Activation : a créé OU rejoint une course / a réellement couru.
  select count(*) into n_activated from profiles p
    where p.deleted_at is null
      and exists (select 1 from participations pp where pp.profile_id = p.id);
  select count(*) into n_raced from profiles p
    where p.deleted_at is null
      and exists (select 1 from results rr join participations pp on pp.id = rr.participation_id
                  where pp.profile_id = p.id);

  -- Rétention glissante J+7 : parmi les comptes de plus de 7 jours, combien
  -- ont rouvert l'app dans les 7 derniers jours.
  select count(*) into n_created7 from profiles where deleted_at is null and created_at < now() - interval '7 days';
  select count(*) into n_retained7 from profiles p
    where p.deleted_at is null and p.created_at < now() - interval '7 days'
      and exists (select 1 from analytics_events e where e.profile_id = p.id
                  and e.name = 'app_open' and e.created_at > now() - interval '7 days');

  -- Viralité : partages, inscriptions parrainées. Un parrain n'est compté que
  -- s'il correspond à un VRAI profil et diffère du filleul (anti-auto-parrainage
  -- / ref forgé → K-factor non falsifiable).
  select count(*) into n_signup from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'signup';
  select count(*) into n_ref from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'signup'
      and (e.props ->> 'ref') is distinct from null
      and (e.props ->> 'ref') <> e.profile_id::text
      and exists (select 1 from profiles rp where rp.id::text = e.props ->> 'ref');

  v := jsonb_build_object(
    'users_total', n_users,
    'active_7d', n_active7,
    'races_completed', (select count(*) from races where status = 'completed'),
    'ghosts_total', (select count(*) from ghost_profiles),
    -- Activation
    'activation_rate', case when n_users > 0 then round(100.0 * n_activated / n_users) else null end,
    'raced_rate', case when n_users > 0 then round(100.0 * n_raced / n_users) else null end,
    -- Rétention
    'retention_7d', case when n_created7 > 0 then round(100.0 * n_retained7 / n_created7) else null end,
    'cohort_7d', n_created7,
    -- Viralité / K-factor
    'shares', (select count(*) from analytics_events where name = 'share_clicked'),
    'signups_tracked', n_signup,
    'referred_signups', n_ref,
    'k_factor', case when n_signup > 0 then round((n_ref::numeric / n_signup), 2) else null end,
    -- Engagement
    'rematches', (select count(*) from analytics_events where name = 'rematch'),
    'friends_accepted', (select count(*) from friendships where status = 'accepted'),
    'badges_unlocked', (select count(*) from user_badges),
    -- Observabilité
    'errors_7d', (select count(*) from error_logs where created_at > now() - interval '7 days'),
    -- On n'affiche QUE les erreurs de comptes authentifiés : l'insert anon (erreurs
    -- hors-session) est autorisé mais son texte n'est pas exposé au tableau de
    -- bord (surface d'injection de texte arbitraire par un client non connecté).
    'recent_errors', coalesce((
      select jsonb_agg(e) from (
        select message, context, created_at from error_logs
        where profile_id is not null
        order by created_at desc limit 5
      ) e
    ), '[]'::jsonb)
  );
  return v;
end $$;
revoke all on function public.get_metrics() from public, anon;
grant execute on function public.get_metrics() to authenticated;
