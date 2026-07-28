-- Tests du référentiel de circuits (A4) : ajout client fermé, recherche
-- tolérante nom+ville, « Tes circuits » (pistes déjà courues, récentes d'abord),
-- retrait des pilotes suspendus de la recherche, retrait volontaire d'une course.

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

insert into auth.users (id, email) values
  ('cc000000-0000-0000-0000-00000000000a', 'a@t'),
  ('cc000000-0000-0000-0000-00000000000b', 'b@t'),
  ('cc000000-0000-0000-0000-00000000000c', 'c@t');
insert into public.profiles (id, username, elo) values
  ('cc000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('cc000000-0000-0000-0000-00000000000b', 'Bea', 1000),
  ('cc000000-0000-0000-0000-00000000000c', 'Cyril', 1000);
-- Noms « zébrés » uniques : le SEED (référentiel réel) tourne aussi sur cette
-- base — des noms réalistes fausseraient les comptages.
insert into public.circuits (id, name, city, is_official) values
  ('cc100000-0000-0000-0000-000000000001', 'Karting du Château-Zébu', 'Zébuville-sur-Test', true),
  ('cc100000-0000-0000-0000-000000000002', 'RKC Villezébon', 'Villezébon-sur-Yvette', true),
  ('cc100000-0000-0000-0000-000000000003', 'Speed Zébu Park', 'Lyonzeb', false);

-- ═══ Scénario 1 : plus aucun ajout client ═══
do $$
declare A uuid := 'cc000000-0000-0000-0000-00000000000a'; denied boolean := false;
begin
  perform tests.as_uid(A);
  set local role authenticated;
  begin
    insert into circuits (name, created_by) values ('Mon Circuit Pirate', A);
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un client a pu créer un circuit'; end if;
  raise notice 'Scénario 1 (ajout client fermé) ✔';
end $$;

-- ═══ Scénario 2 : recherche tolérante (accents, casse, ville) ═══
do $$
declare A uuid := 'cc000000-0000-0000-0000-00000000000a';
begin
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from search_circuits('chateau-zebu')), 1, '« chateau-zebu » trouve Château-Zébu (accents/tirets)');
  perform tests.eq((select count(*) from search_circuits('VILLEZÉBON')), 1, 'casse ignorée');
  perform tests.eq((select count(*) from search_circuits('lyonzeb')), 1, 'recherche par VILLE');
  perform tests.eq((select count(*) from search_circuits('zebuville')), 1, 'ville partielle');
  if (select count(*) from search_circuits('')) < 3 then
    raise exception 'ÉCHEC : requête vide → au moins le référentiel de test';
  end if;
  perform tests.eq((select count(*) from search_circuits('zzz-inexistant-zzz')), 0, 'aucun résultat fantaisiste');
  raise notice 'Scénario 2 (recherche tolérante) ✔';
end $$;

-- ═══ Scénario 3 : « Tes circuits » — mes pistes, récentes d'abord ═══
do $$
declare
  A uuid := 'cc000000-0000-0000-0000-00000000000a';
  B uuid := 'cc000000-0000-0000-0000-00000000000b';
  r1 uuid := 'cc200000-0000-0000-0000-000000000001';
  r2 uuid := 'cc200000-0000-0000-0000-000000000002';
  r3 uuid := 'cc200000-0000-0000-0000-000000000003';
  premier uuid;
begin
  -- A a couru à Villebon (il y a 10 j) puis à Château-Gontier (hier).
  insert into races (id, admin_id, circuit_id, scheduled_at) values
    (r1, A, 'cc100000-0000-0000-0000-000000000002', now() - interval '10 days'),
    (r2, A, 'cc100000-0000-0000-0000-000000000001', now() - interval '1 day'),
    -- B a couru ailleurs : ne doit PAS apparaître chez A.
    (r3, B, 'cc100000-0000-0000-0000-000000000003', now());
  insert into participations (race_id, profile_id) values (r1, A), (r2, A), (r3, B);

  perform tests.as_uid(A);
  perform tests.eq((select count(*) from my_recent_circuits()), 2, 'A retrouve SES deux circuits');
  select id into premier from my_recent_circuits() limit 1;
  if premier <> 'cc100000-0000-0000-0000-000000000001' then
    raise exception 'ÉCHEC : le circuit le plus récent (Château-Gontier) devrait être premier';
  end if;
  perform tests.as_uid('cc000000-0000-0000-0000-00000000000c');
  perform tests.eq((select count(*) from my_recent_circuits()), 0, 'Cyril (jamais couru) : aucune suggestion');
  raise notice 'Scénario 3 (Tes circuits) ✔';
end $$;

-- ═══ Scénario 4 : un pilote SUSPENDU disparaît de la recherche de pilotes ═══
do $$
declare
  A uuid := 'cc000000-0000-0000-0000-00000000000a';
  B uuid := 'cc000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from search_pilots('Bea')), 1, 'Bea visible avant suspension');
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = B;
  perform set_config('kartsquad.moderate_suspend', '', true);
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from search_pilots('Bea')), 0, 'Bea suspendue : introuvable');
  perform tests.eq((select count(*) from get_pilot(B)), 0, 'fiche pilote suspendue : masquée');
  raise notice 'Scénario 4 (suspendus hors recherche) ✔';
end $$;

-- ═══ Scénario 4bis : un suspendu n'est pas non plus INSCRIPTIBLE par id (M2) ═══
do $$
declare
  A uuid := 'cc000000-0000-0000-0000-00000000000a';
  B uuid := 'cc000000-0000-0000-0000-00000000000b';   -- suspendue au scénario 4
  r uuid := 'cc200000-0000-0000-0000-000000000004';
  denied boolean := false;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  perform tests.as_uid(A);
  set local role authenticated;
  begin
    insert into participations (race_id, profile_id) values (r, B);
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un admin a pu inscrire un pilote suspendu'; end if;
  raise notice 'Scénario 4bis (suspendu non inscriptible — RLS) ✔';
end $$;

-- ═══ Scénario 5 : quitter soi-même une course ouverte (et seulement ouverte) ═══
do $$
declare
  A uuid := 'cc000000-0000-0000-0000-00000000000a';
  C uuid := 'cc000000-0000-0000-0000-00000000000c';
  r uuid := 'cc200000-0000-0000-0000-000000000005';
  pc uuid := 'cc400000-0000-0000-0000-000000000051';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pc, r, C);

  -- C (non-admin, non bloqué) se retire lui-même.
  perform tests.as_uid(C);
  set local role authenticated;
  delete from participations where id = pc;
  reset role;
  perform tests.eq((select count(*) from participations where id = pc), 0, 'C a quitté la course');

  -- Grille clôturée : le retrait ne passe plus (filtré silencieusement).
  insert into participations (id, race_id, profile_id) values (pc, r, C);
  insert into participations (race_id, profile_id) values (r, A);
  perform tests.as_uid(A);
  perform public.lock_race(r);
  perform tests.as_uid(C);
  set local role authenticated;
  delete from participations where id = pc;
  reset role;
  perform tests.eq((select count(*) from participations where id = pc), 1, 'grille figée : impossible de quitter');
  raise notice 'Scénario 5 (quitter la course) ✔';
end $$;

do $$ begin raise notice 'Tous les tests circuits/invitations sont passés ✔'; end $$;

rollback;
