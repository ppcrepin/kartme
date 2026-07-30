-- Tests analytics & observabilité (lot 3.2) : RLS des journaux, accès réservé
-- au modérateur, calcul de get_metrics.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

-- M = modérateur ; A, B = joueurs.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000e', 'm@t'),
  ('a0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('a0000000-0000-0000-0000-00000000000b', 'b@t');
insert into public.profiles (id, username, elo, is_moderator) values
  ('a0000000-0000-0000-0000-00000000000e', 'Mod', 1000, true);
insert into public.profiles (id, username, elo) values
  ('a0000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('a0000000-0000-0000-0000-00000000000b', 'Bea', 1000);

-- ═══ Scénario 1 : RLS des événements (chacun les siens, pas de lecture) ═══
do $$
declare
  A uuid := 'a0000000-0000-0000-0000-00000000000a';
  B uuid := 'a0000000-0000-0000-0000-00000000000b';
  denied boolean := false;
  read_denied boolean := false;
begin
  perform tests.as_uid(A);
  set local role authenticated;
  insert into analytics_events (profile_id, name) values (A, 'app_open');   -- le sien : OK
  begin insert into analytics_events (profile_id, name) values (B, 'app_open');   -- celui d'un autre : refusé
  exception when others then denied := true; end;
  -- Aucun droit SELECT accordé au client → toute lecture est refusée.
  begin perform count(*) from analytics_events;
  exception when others then read_denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un client a pu écrire l''événement d''autrui'; end if;
  if not read_denied then raise exception 'ÉCHEC : un client a pu lire les événements'; end if;
  raise notice 'Scénario 1 (RLS événements) ✔';
end $$;

-- ═══ Scénario 2 : get_metrics réservé au modérateur ═══
do $$
declare A uuid := 'a0000000-0000-0000-0000-00000000000a'; denied boolean := false;
begin
  perform tests.as_uid(A);
  begin perform public.get_metrics();
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un non-modérateur a lu les métriques'; end if;
  raise notice 'Scénario 2 (get_metrics réservé) ✔';
end $$;

-- ═══ Scénario 3 : calcul des métriques ═══
do $$
declare
  M uuid := 'a0000000-0000-0000-0000-00000000000e';
  A uuid := 'a0000000-0000-0000-0000-00000000000a';
  B uuid := 'a0000000-0000-0000-0000-00000000000b';
  r uuid := 'a2000000-0000-0000-0000-000000000031';
  pa uuid := 'a4000000-0000-0000-0000-000000000311';
  pb uuid := 'a4000000-0000-0000-0000-000000000312';
  met jsonb;
begin
  -- Ouvertures d'app (A déjà une au scénario 1) → actifs 7j = A + B.
  insert into analytics_events (profile_id, name) values (B, 'app_open');
  -- Inscriptions : A parrainé par B (profil réel, ≠ filleul) → compte ;
  -- B « parrainé » par lui-même (auto-parrainage) → NE compte pas (M1).
  insert into analytics_events (profile_id, name, props) values (A, 'signup', jsonb_build_object('ref', B::text));
  insert into analytics_events (profile_id, name, props) values (B, 'signup', jsonb_build_object('ref', B::text));
  -- Partages.
  insert into analytics_events (profile_id, name) values (A, 'share_clicked'), (A, 'share_clicked'), (B, 'share_clicked');
  -- Une course terminée (active A et B).
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.as_uid(A);
  perform public.submit_race_results(r, array[pa, pb]);
  perform set_config('kartsquad.elo_engine', '', true);
  -- Une erreur applicative.
  insert into error_logs (profile_id, message) values (A, 'TypeError: boom');

  perform tests.as_uid(M);
  met := public.get_metrics();

  perform tests.eq((met ->> 'users_total')::bigint, 3, 'inscrits');
  perform tests.eq((met ->> 'active_7d')::bigint, 2, 'actifs 7j');
  perform tests.eq((met ->> 'races_completed')::bigint, 1, 'courses terminées');
  perform tests.eq((met ->> 'signups_tracked')::bigint, 2, 'inscriptions suivies');
  perform tests.eq((met ->> 'referred_signups')::bigint, 1, 'inscriptions parrainées');
  perform tests.eq((met ->> 'shares')::bigint, 3, 'partages');
  perform tests.eq((met ->> 'errors_7d')::bigint, 1, 'erreurs 7j');
  if (met ->> 'k_factor')::numeric <> 0.5 then raise exception 'ÉCHEC : k_factor (attendu 0.50, obtenu %)', met ->> 'k_factor'; end if;
  perform tests.eq(jsonb_array_length(met -> 'recent_errors')::bigint, 1, 'erreurs récentes listées');
  raise notice 'Scénario 3 (calcul des métriques) ✔';
end $$;

-- ═══ Scénario 4 : le lien d'ami est MESURÉ, et mesuré JUSTE ═══
-- A19 en fait le canal d'acquisition n°1. L'écran d'arrivée émettait bien
-- `friend_invite_accepted`, mais `get_metrics` ne le lisait pas : l'événement
-- était écrit et jamais relu, donc le lot suivant se serait décidé sans savoir
-- si le lien convertit.
do $$
declare
  M uuid := 'a0000000-0000-0000-0000-00000000000e';
  A uuid := 'a0000000-0000-0000-0000-00000000000a';  -- inscrit AVEC parrain (scénario 3)
  B uuid := 'a0000000-0000-0000-0000-00000000000b';  -- inscrit SANS parrain valable
  met jsonb;
begin
  -- Les deux acceptent un lien d'ami. A a été parrainé par B (scénario 3) ET
  -- c'est bien le lien de B qu'il accepte → conversion réelle. B, lui, est un
  -- habitué qui accepte un lien : un tap, pas une acquisition.
  insert into analytics_events (profile_id, name, props) values
    (A, 'friend_invite_accepted', jsonb_build_object('inviter', B::text)),
    (B, 'friend_invite_accepted', jsonb_build_object('inviter', A::text));

  perform tests.as_uid(M);
  met := public.get_metrics();

  perform tests.eq((met ->> 'invite_accepts')::bigint, 2, 'les deux taps sont comptés');
  -- LE chiffre à ne pas confondre avec le précédent : une soirée entre
  -- habitués ne doit pas se lire comme de la croissance.
  perform tests.eq((met ->> 'invite_signups')::bigint, 1,
    'un seul est un compte réellement gagné par le lien');
  raise notice 'Scénario 4 (mesure du lien d''ami) ✔';
end $$;

-- ═══ Scénario 4bis : l'inscription doit venir du lien QU'ON A ACCEPTÉ ═══
-- Le défaut que ce scénario verrouille : la première version exigeait seulement
-- qu'un `friend_invite_accepted` existe pour le profil, SANS le relier au
-- parrain. Un pilote inscrit via un lien de COURSE `?ref=B`, qui acceptait plus
-- tard le lien d'ami d'un tiers, était compté comme une conversion du lien
-- d'ami — le tableau de bord gonflait le chiffre même sur lequel se décide le
-- lot suivant.
do $$
declare
  M uuid := 'a0000000-0000-0000-0000-00000000000e';
  B uuid := 'a0000000-0000-0000-0000-00000000000b';
  D uuid := 'a0000000-0000-0000-0000-00000000000d';  -- filleul de B
  T uuid := 'a0000000-0000-0000-0000-00000000000f';  -- un TIERS, jamais parrain
  met jsonb; avant bigint;
begin
  insert into auth.users (id, email) values (D, 'd@t'), (T, 'f@t');
  insert into public.profiles (id, username, elo) values (D, 'Filleul', 1000), (T, 'Tiers', 1000);

  perform tests.as_uid(M);
  avant := (public.get_metrics() ->> 'invite_signups')::bigint;

  -- D s'inscrit parrainé par B (un lien de COURSE), puis accepte le lien d'ami
  -- de T. Les deux événements existent, mais ils ne parlent pas du même pilote.
  insert into analytics_events (profile_id, name, props) values
    (D, 'signup', jsonb_build_object('ref', B::text)),
    (D, 'friend_invite_accepted', jsonb_build_object('inviter', T::text));

  met := public.get_metrics();
  perform tests.eq((met ->> 'invite_signups')::bigint, avant,
    'une inscription venue d''un lien de COURSE n''est pas créditée au lien d''ami');

  -- La même inscription, cette fois avec le bon invitant : elle compte.
  update analytics_events set props = jsonb_build_object('inviter', B::text)
   where profile_id = D and name = 'friend_invite_accepted';
  met := public.get_metrics();
  perform tests.eq((met ->> 'invite_signups')::bigint, avant + 1,
    'l''inscription compte quand le parrain EST l''invitant');
  raise notice 'Scénario 4bis (attribution vérifiée) ✔';
end $$;

-- ═══ Scénario 4ter : le compteur de taps résiste au matraquage ═══
-- La policy `analytics_insert_self` laisse un client insérer n'importe quel nom
-- d'événement : cinquante appels faisaient passer le compteur de 1 à 51. On
-- compte donc des PILOTES DISTINCTS — falsifier exige alors autant de comptes
-- que de points, c'est-à-dire le travail que la métrique prétend mesurer.
do $$
declare
  M uuid := 'a0000000-0000-0000-0000-00000000000e';
  T uuid := 'a0000000-0000-0000-0000-00000000000f';
  met jsonb; avant bigint; i int;
begin
  perform tests.as_uid(M);
  avant := (public.get_metrics() ->> 'invite_accepts')::bigint;

  perform tests.as_uid(T);
  for i in 1..50 loop
    insert into analytics_events (profile_id, name, props) values
      (T, 'friend_invite_accepted', jsonb_build_object('inviter', M::text));
  end loop;

  perform tests.as_uid(M);
  met := public.get_metrics();
  perform tests.eq((met ->> 'invite_accepts')::bigint, avant + 1,
    'cinquante insertions d''un même pilote ne valent qu''UN point');
  raise notice 'Scénario 4ter (matraquage sans effet) ✔';
end $$;

-- ═══ Scénario 5 : un compte supprimé ne gonfle pas le compteur ═══
-- Un compte supprimé est ANONYMISÉ et non effacé (leçon A5/A13) : ses
-- événements restent en base. Sans le filtre, le compteur ne redescendait
-- jamais et la mesure dérivait mois après mois.
do $$
declare
  M uuid := 'a0000000-0000-0000-0000-00000000000e';
  B uuid := 'a0000000-0000-0000-0000-00000000000b';
  avant bigint; apres bigint;
begin
  perform tests.as_uid(M);
  avant := (public.get_metrics() ->> 'invite_accepts')::bigint;
  -- Delta et non valeur absolue : le compteur dépend des scénarios précédents,
  -- et un test qui fige un total casse dès qu'on en ajoute un — sans rien dire
  -- de la propriété vérifiée.
  update profiles set deleted_at = now() where id = B;
  apres := (public.get_metrics() ->> 'invite_accepts')::bigint;
  perform tests.eq(apres, avant - 1,
    'le tap d''un compte supprimé sort du compteur');
  raise notice 'Scénario 5 (comptes supprimés exclus : % → %) ✔', avant, apres;
end $$;

do $$ begin raise notice 'Tous les tests analytics sont passés ✔'; end $$;

rollback;
