-- KartSquad — le lien d'ami devient MESURABLE.
--
-- A19 fait du lien d'amitié le canal d'acquisition n°1 du produit, et l'écran
-- d'arrivée émet bien `friend_invite_accepted`. Mais `get_metrics` ne lisait pas
-- cet événement : il était écrit et jamais relu. Le tableau de bord ne pouvait
-- donc pas répondre à la seule question qui compte sur ce lot — « est-ce que le
-- lien convertit ? » — et le lot suivant se serait décidé à l'aveugle.
--
-- Deux compteurs, pas un :
--   · `invite_accepts`   — des taps aboutis, tous pilotes confondus (un inscrit
--     de longue date qui accepte un lien compte ici) ;
--   · `invite_signups`   — des COMPTES CRÉÉS avec ce lien pour parrain. C'est la
--     conversion réelle : quelqu'un qui n'avait pas l'app l'a installée.
-- Les confondre aurait fait passer une soirée entre habitués pour de la
-- croissance.

begin;

create or replace function public.get_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  n_users int; n_active7 int; n_signup int; n_ref int; n_created7 int; n_retained7 int;
  n_activated int; n_raced int; n_inv_accept int; n_inv_signup int;
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

  -- ── Lien d'ami (A19) ────────────────────────────────────────────────────
  -- Taps aboutis. Comptés sur des comptes vivants, comme partout ailleurs :
  -- un compte supprimé est ANONYMISÉ et non effacé, ses événements restent
  -- en base et gonfleraient indéfiniment le compteur.
  select count(*) into n_inv_accept from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'friend_invite_accepted';

  -- Inscriptions ATTRIBUÉES au lien d'ami : le parrain mémorisé est aussi
  -- celui dont le filleul a accepté l'invitation. Mêmes garde-fous que le
  -- K-factor (parrain réel, pas d'auto-parrainage) — sinon un `?ref=` forgé
  -- suffirait à fabriquer de la croissance.
  select count(*) into n_inv_signup from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'signup'
      and (e.props ->> 'ref') is distinct from null
      and (e.props ->> 'ref') <> e.profile_id::text
      and exists (select 1 from profiles rp where rp.id::text = e.props ->> 'ref')
      and exists (select 1 from analytics_events a
                  where a.profile_id = e.profile_id
                    and a.name = 'friend_invite_accepted');

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
    'invite_accepts', n_inv_accept,
    'invite_signups', n_inv_signup,
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

commit;
