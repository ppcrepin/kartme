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

do $$ begin raise notice 'Tous les tests analytics sont passés ✔'; end $$;

rollback;
