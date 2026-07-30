-- KartSquad — `invite_signups` mesure enfin ce que son commentaire annonce.
--
-- Le collage précédent affirmait : « le parrain mémorisé est aussi celui dont le
-- filleul a accepté l'invitation ». La requête ne le vérifiait pas — elle
-- exigeait seulement qu'un `friend_invite_accepted` existe pour ce profil, sans
-- aucun lien avec le parrain. Et elle ne POUVAIT pas le vérifier : l'événement
-- ne portait aucun prop, l'invitant n'était nulle part.
--
-- Scénario mesuré : A s'inscrit via un lien de COURSE `?ref=B`, puis accepte
-- plus tard le lien d'ami d'un tiers C → l'inscription était créditée au lien
-- d'ami. Le tableau de bord gonflait précisément le chiffre sur lequel se
-- décide le lot suivant, ce qui est l'inverse du but affiché.
--
-- L'écran d'arrivée joint désormais l'invitant à l'événement
-- (`props->>'inviter'`), ce qui rend le rapprochement possible. Deux
-- conséquences honnêtes de la correction :
--   · le chiffre BAISSE, et c'est le signe qu'il devient juste ;
--   · les événements émis AVANT ce collage n'ont pas de prop `inviter` : ils
--     sortent du compte. Sur une base de quinze pilotes en bêta, l'historique
--     perdu est négligeable devant une mesure qui ne mentait plus.
--
-- Au passage, `invite_accepts` compte des PILOTES DISTINCTS. Il comptait des
-- lignes, or la policy `analytics_insert_self` laisse n'importe quel client
-- insérer n'importe quel nom d'événement : cinquante appels suffisaient à
-- faire passer le compteur de 1 à 51. Compter les pilotes ne rend pas la
-- falsification impossible (rien ne le peut, côté client), mais elle exige
-- alors autant de comptes que de points — c'est-à-dire le travail réel que la
-- métrique prétend mesurer.

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
  -- Des PILOTES DISTINCTS, pas des lignes : voir l'en-tête de ce fichier.
  -- Comptés sur des comptes vivants, comme partout ailleurs — un compte
  -- supprimé est ANONYMISÉ et non effacé, ses événements restent en base.
  select count(distinct e.profile_id) into n_inv_accept from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'friend_invite_accepted';

  -- Inscriptions RÉELLEMENT dues au lien d'ami : le parrain mémorisé à
  -- l'inscription est CELUI DONT le filleul a accepté le lien. C'est cette
  -- égalité — `inviter` de l'acceptation = `ref` de l'inscription — qui manquait
  -- et faisait passer une inscription venue d'un lien de course pour une
  -- conversion du lien d'ami. Mêmes garde-fous que le K-factor par ailleurs
  -- (parrain réel, pas d'auto-parrainage).
  select count(*) into n_inv_signup from analytics_events e
    join profiles p on p.id = e.profile_id and p.deleted_at is null
    where e.name = 'signup'
      and (e.props ->> 'ref') is distinct from null
      and (e.props ->> 'ref') <> e.profile_id::text
      and exists (select 1 from profiles rp where rp.id::text = e.props ->> 'ref')
      and exists (select 1 from analytics_events a
                  where a.profile_id = e.profile_id
                    and a.name = 'friend_invite_accepted'
                    and (a.props ->> 'inviter') = (e.props ->> 'ref'));

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
