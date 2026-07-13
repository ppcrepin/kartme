-- Tests des préférences & abonnements de notification (lot 2.4). Rollback final.

begin;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tests.as_super() returns void language plpgsql as $$
begin reset role; end $$;

create function tests.rows_as(p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.as_user(p_uid);
  execute p_sql into n;
  perform tests.as_super();
  return n;
end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.expect_denied(p_uid uuid, p_sql text, msg text) returns void language plpgsql as $$
declare denied boolean := false;
begin
  perform tests.as_user(p_uid);
  begin execute p_sql; exception when others then denied := true; end;
  perform tests.as_super();
  if not denied then raise exception 'ÉCHEC (aurait dû être refusé) : %', msg; end if;
end $$;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('c0000000-0000-0000-0000-00000000000b', 'b@t');
insert into public.profiles (id, username, elo) values
  ('c0000000-0000-0000-0000-00000000000a', 'Alice', 1000),
  ('c0000000-0000-0000-0000-00000000000b', 'Bruno', 1000);

-- ═══ Scénario 1 : préférences — chacun n'écrit/lit que les siennes ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a';
        B uuid := 'c0000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_user(A);
  insert into notification_preferences (profile_id, results) values (A, false);
  perform tests.as_super();

  perform tests.eq(tests.rows_as(A, $q$ select count(*) from notification_preferences where not results $q$),
                   1, 'A lit sa préférence (résultats coupés)');
  perform tests.eq(tests.rows_as(B, $q$ select count(*) from notification_preferences $q$),
                   0, 'B ne voit pas les préférences de A');
  -- B ne peut pas écrire une préférence au nom de A.
  perform tests.expect_denied(B, $q$ insert into notification_preferences (profile_id) values ('c0000000-0000-0000-0000-00000000000a') $q$,
                              'B insère une préférence pour A');
  raise notice 'Scénario 1 (préférences privées) ✔';
end $$;

-- ═══ Scénario 2 : plage de silence par défaut 22→8, bornes validées ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a';
begin
  perform tests.eq((select quiet_start from notification_preferences where profile_id = A), 22, 'silence débute à 22h');
  perform tests.eq((select quiet_end from notification_preferences where profile_id = A), 8, 'silence finit à 8h');
  perform tests.expect_denied(A, $q$ update notification_preferences set quiet_start = 25 where profile_id = 'c0000000-0000-0000-0000-00000000000a' $q$,
                              'heure de silence hors [0,23]');
  raise notice 'Scénario 2 (plage de silence) ✔';
end $$;

-- ═══ Scénario 3 : abonnements push — propriété, unicité endpoint ═══
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000a';
        B uuid := 'c0000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_user(A);
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
    values (A, 'https://push.example/aaa', 'p256_a', 'auth_a', 'Firefox');
  perform tests.as_super();

  perform tests.eq(tests.rows_as(A, $q$ select count(*) from push_subscriptions $q$), 1, 'A voit son abonnement');
  perform tests.eq(tests.rows_as(B, $q$ select count(*) from push_subscriptions $q$), 0, 'B ne voit pas l''abonnement de A');

  -- B ne peut pas s'attribuer un abonnement au nom de A.
  perform tests.expect_denied(B, $q$ insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ('c0000000-0000-0000-0000-00000000000a', 'https://push.example/bbb', 'x', 'y') $q$,
                              'B insère un abonnement pour A');

  -- Endpoint unique globalement (le même navigateur ne s'inscrit qu'une fois).
  perform tests.expect_denied(B, $q$ insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ('c0000000-0000-0000-0000-00000000000b', 'https://push.example/aaa', 'x', 'y') $q$,
                              'endpoint dupliqué refusé');

  -- A peut supprimer le sien (désabonnement).
  perform tests.as_user(A);
  delete from push_subscriptions where endpoint = 'https://push.example/aaa';
  perform tests.as_super();
  perform tests.eq((select count(*) from push_subscriptions), 0, 'désabonnement effectif');
  raise notice 'Scénario 3 (abonnements push) ✔';
end $$;

-- ═══ Scénario 4 : suppression du compte → abonnements & préférences purgés ═══
do $$
declare B uuid := 'c0000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_user(B);
  insert into notification_preferences (profile_id) values (B);
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values (B, 'https://push.example/ccc', 'x', 'y');
  perform tests.as_super();

  delete from public.profiles where id = B;
  perform tests.eq((select count(*) from notification_preferences where profile_id = B), 0, 'préférences purgées (cascade)');
  perform tests.eq((select count(*) from push_subscriptions where profile_id = B), 0, 'abonnements purgés (cascade)');
  raise notice 'Scénario 4 (cascade suppression) ✔';
end $$;

-- ═══ Scénario 5 : register_push_subscription — l'endpoint suit le navigateur ═══
-- (cœur du correctif « fuite entre comptes sur appareil partagé »)
do $$
declare A uuid := 'c0000000-0000-0000-0000-00000000000e';
        B uuid := 'c0000000-0000-0000-0000-00000000000f';
        e text := 'https://push.example/shared';
begin
  -- Deux comptes neufs (B du scénario 1 a été supprimé au scénario 4).
  insert into auth.users (id, email) values (A, 'e@t'), (B, 'f@t');
  insert into public.profiles (id, username, elo) values (A, 'Eve', 1000), (B, 'Finn', 1000);
  perform tests.as_user(A);
  perform public.register_push_subscription(e, 'pA', 'aA', 'Chrome');
  perform tests.as_super();
  perform tests.eq((select count(*) from push_subscriptions where endpoint = e and profile_id = A), 1, 'endpoint d''abord chez A');

  -- B (même navigateur, autre compte) enregistre le même endpoint → réattribué.
  perform tests.as_user(B);
  perform public.register_push_subscription(e, 'pB', 'aB', 'Chrome');
  perform tests.as_super();
  perform tests.eq((select count(*) from push_subscriptions where endpoint = e and profile_id = B), 1, 'endpoint réattribué à B');
  perform tests.eq((select count(*) from push_subscriptions where endpoint = e and profile_id = A), 0, 'A n''a plus l''endpoint');
  perform tests.eq((select count(*) from push_subscriptions where endpoint = e), 1, 'un seul propriétaire par endpoint');
  raise notice 'Scénario 5 (endpoint réattribué au bon compte) ✔';
end $$;

do $$ begin raise notice 'Tous les tests notifications sont passés ✔'; end $$;

rollback;
