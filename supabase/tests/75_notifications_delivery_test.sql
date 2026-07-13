-- Tests des déclencheurs de notification (lot 2.4, Temps 2). Vérifie que chaque
-- événement émet le bon appel push (capturé par le stub net._calls du bootstrap).
-- Le respect prefs/silence est fait par l'Edge Function (hors SQL) : ici on
-- vérifie seulement QUI reçoit QUOI.

begin;

create schema tests;

create function tests.call_submit(p_uid uuid, p_race uuid, p_order uuid[]) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform public.submit_race_results(p_race, p_order);
  perform set_config('kartsquad.elo_engine', '', true);
end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

-- Compte les appels push d'un type vers un destinataire donné.
create function tests.calls(p_type text, p_recipient uuid) returns bigint language sql as $$
  select count(*) from net._calls
  where body ->> 'type' = p_type and body ->> 'recipient' = p_recipient::text;
$$;

-- Config renseignée → enqueue_push émet réellement (vers le stub).
update public.push_config set function_url = 'http://edge/push', hook_secret = 'shh' where id = 1;

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('d0000000-0000-0000-0000-00000000000b', 'b@t'),
  ('d0000000-0000-0000-0000-00000000000c', 'c@t');
insert into public.profiles (id, username, elo) values
  ('d0000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('d0000000-0000-0000-0000-00000000000b', 'Bea', 1000),
  ('d0000000-0000-0000-0000-00000000000c', 'Cyril', 1000);
insert into public.circuits (id, name, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'Karting Vaux', 'd0000000-0000-0000-0000-00000000000a');

-- ═══ Scénario 1 : invitation à une course ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a'; -- admin
  B uuid := 'd0000000-0000-0000-0000-00000000000b';
  r uuid := 'd2000000-0000-0000-0000-000000000001';
  g uuid := 'd3000000-0000-0000-0000-000000000001';
begin
  truncate net._calls;
  insert into races (id, admin_id, circuit_id, scheduled_at) values (r, A, 'd1000000-0000-0000-0000-000000000001', now());
  insert into participations (race_id, profile_id) values (r, A);   -- l'admin s'ajoute : pas de notif
  insert into participations (race_id, profile_id) values (r, B);   -- invitation à B
  insert into ghost_profiles (id, display_name, created_by) values (g, 'Fantôme', A);
  insert into participations (race_id, ghost_id) values (r, g);     -- fantôme : pas de notif

  perform tests.eq(tests.calls('invite', B), 1, 'B est invité');
  perform tests.eq(tests.calls('invite', A), 0, 'l''admin ne s''auto-invite pas');
  perform tests.eq((select count(*) from net._calls where body ->> 'type' = 'invite'), 1, 'une seule invitation (pas le fantôme)');
  perform tests.eq((select count(*) from net._calls where (body ->> 'url') like 'race/%'), 1, 'deep-link vers la course');
  raise notice 'Scénario 1 (invitation) ✔';
end $$;

-- ═══ Scénario 2 : résultat de course (chaque participant sauf l'admin) ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a';
  B uuid := 'd0000000-0000-0000-0000-00000000000b';
  C uuid := 'd0000000-0000-0000-0000-00000000000c';
  r uuid := 'd2000000-0000-0000-0000-000000000002';
  pa uuid := 'd4000000-0000-0000-0000-000000000001';
  pb uuid := 'd4000000-0000-0000-0000-000000000002';
  pc uuid := 'd4000000-0000-0000-0000-000000000003';
begin
  insert into races (id, admin_id, circuit_id, scheduled_at) values (r, A, 'd1000000-0000-0000-0000-000000000001', now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B), (pc, r, C);
  truncate net._calls;                                             -- on ignore les invitations du setup
  perform tests.call_submit(A, r, array[pa, pb, pc]);

  perform tests.eq(tests.calls('result', B), 1, 'B notifié du résultat');
  perform tests.eq(tests.calls('result', C), 1, 'C notifié du résultat');
  perform tests.eq(tests.calls('result', A), 0, 'l''admin (qui a saisi) n''est pas notifié');
  raise notice 'Scénario 2 (résultat) ✔';
end $$;

-- ═══ Scénario 3 : demande d'ami reçue puis acceptée ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a';
  B uuid := 'd0000000-0000-0000-0000-00000000000b';
  fid uuid := 'd5000000-0000-0000-0000-000000000001';
begin
  truncate net._calls;
  insert into friendships (id, requester_id, addressee_id, status) values (fid, A, B, 'pending');
  perform tests.eq(tests.calls('friend_request', B), 1, 'B reçoit la demande');
  perform tests.eq(tests.calls('friend_request', A), 0, 'le demandeur n''est pas notifié à l''envoi');

  truncate net._calls;
  update friendships set status = 'accepted' where id = fid;
  perform tests.eq(tests.calls('friend_request', A), 1, 'A notifié de l''acceptation');
  perform tests.eq(tests.calls('friend_request', B), 0, 'B (qui accepte) n''est pas re-notifié');
  raise notice 'Scénario 3 (demandes d''amis) ✔';
end $$;

-- ═══ Scénario 4 : config vide → aucun envoi (fail-safe) ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a';
  B uuid := 'd0000000-0000-0000-0000-00000000000b';
  r uuid := 'd2000000-0000-0000-0000-000000000003';
begin
  update public.push_config set function_url = null where id = 1;
  truncate net._calls;
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (race_id, profile_id) values (r, B);
  perform tests.eq((select count(*) from net._calls), 0, 'sans config, aucun appel réseau');
  raise notice 'Scénario 4 (fail-safe config vide) ✔';
end $$;

-- ═══ Scénario 5 : sécurité — un client ne peut pas forger un push ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a';
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.enqueue_push('invite', A, 'Faux', 'Hameçonnage', 'race/x');
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : enqueue_push exécutable par un client'; end if;
  raise notice 'Scénario 5 (enqueue_push non exposé) ✔';
end $$;

-- ═══ Scénario 6 : un fantôme dans le classement ne reçoit aucun push ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a';
  B uuid := 'd0000000-0000-0000-0000-00000000000b';
  r uuid := 'd2000000-0000-0000-0000-000000000006';
  g uuid := 'd3000000-0000-0000-0000-000000000006';
  pa uuid := 'd4000000-0000-0000-0000-000000000061';
  pb uuid := 'd4000000-0000-0000-0000-000000000062';
  pg uuid := 'd4000000-0000-0000-0000-000000000063';
begin
  update public.push_config set function_url = 'http://edge/push' where id = 1; -- réactive (scén. 4 l'avait vidée)
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into ghost_profiles (id, display_name, created_by) values (g, 'Sans-compte', A);
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  insert into participations (id, race_id, ghost_id) values (pg, r, g);
  truncate net._calls;
  perform tests.call_submit(A, r, array[pa, pb, pg]);

  perform tests.eq(tests.calls('result', B), 1, 'B (compte) notifié');
  perform tests.eq((select count(*) from net._calls where body ->> 'type' = 'result'), 1, 'un seul push résultat (ni admin ni fantôme)');
  raise notice 'Scénario 6 (fantôme sans push) ✔';
end $$;

-- ═══ Scénario 7 : un UPDATE d'amitié sur une autre colonne ne notifie pas ═══
do $$
declare
  A uuid := 'd0000000-0000-0000-0000-00000000000a';
  C uuid := 'd0000000-0000-0000-0000-00000000000c';
  fid uuid := 'd5000000-0000-0000-0000-000000000007';
begin
  insert into friendships (id, requester_id, addressee_id, status) values (fid, A, C, 'accepted');
  truncate net._calls;
  update friendships set status = 'accepted' where id = fid;   -- accepted→accepted : rien
  perform tests.eq((select count(*) from net._calls), 0, 'update sans passage pending→accepted : aucun push');
  raise notice 'Scénario 7 (update neutre : pas de notif) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de livraison des notifications sont passés ✔'; end $$;

rollback;
