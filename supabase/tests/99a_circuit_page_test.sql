-- Tests de la fiche circuit (A11) — décisions PO 2026-07-29/30 :
-- tous les pilotes sont NOMMÉS (le masque « Pilote privé » a été retiré :
-- l'anonymat n'était qu'une protection d'écran, on ne promet pas ce qu'on ne
-- tient pas) · courses ≥ 2 inscrits seulement · invités hors tableau ·
-- record harmonisé sur les mêmes règles.

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
  ('ab000000-0000-0000-0000-00000000000a', 'a@t'),
  ('ab000000-0000-0000-0000-00000000000b', 'b@t'),
  ('ab000000-0000-0000-0000-00000000000c', 'c@t');
insert into public.profiles (id, username, elo, is_private) values
  ('ab000000-0000-0000-0000-00000000000a', 'Aroa', 1000, false),
  ('ab000000-0000-0000-0000-00000000000b', 'Bela', 1000, true),   -- PRIVÉE
  ('ab000000-0000-0000-0000-00000000000c', 'Cody', 1000, false);
insert into public.ghost_profiles (id, display_name, elo, created_by) values
  ('ab000000-0000-0000-0000-0000000000f1', 'Invité Max', 1000, 'ab000000-0000-0000-0000-00000000000a');

insert into public.circuits (id, name, city, is_official, lat, lon) values
  ('ab000000-0000-0000-0000-0000000000c1', 'Circuit du Test', 'Testville', true, 47.0, 2.0);

-- Trois courses TERMINÉES sur le circuit :
--   r1 (avant-hier)  : A, B, C inscrits + un invité — compte (3 inscrits).
--   r2 (avant-hier)  : C seul inscrit + un invité — NE compte PAS (1 inscrit).
--   r3 (il y a 2 ans): A et B — compte, mais hors période « année ».
insert into public.races (id, admin_id, circuit_id, scheduled_at, status, completed_at) values
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-00000000000a',
   'ab000000-0000-0000-0000-0000000000c1', now() - interval '2 days', 'completed', now() - interval '2 days'),
  ('ab000000-0000-0000-0000-0000000000e2', 'ab000000-0000-0000-0000-00000000000c',
   'ab000000-0000-0000-0000-0000000000c1', now() - interval '2 days', 'completed', now() - interval '2 days'),
  ('ab000000-0000-0000-0000-0000000000e3', 'ab000000-0000-0000-0000-00000000000a',
   'ab000000-0000-0000-0000-0000000000c1', now() - interval '2 years', 'completed', now() - interval '2 years');

insert into public.participations (id, race_id, profile_id, ghost_id) values
  ('ab000000-0000-0000-0000-0000000000a1', 'ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-00000000000a', null),
  ('ab000000-0000-0000-0000-0000000000b1', 'ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-00000000000b', null),
  ('ab000000-0000-0000-0000-0000000000c2', 'ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-00000000000c', null),
  ('ab000000-0000-0000-0000-0000000000d1', 'ab000000-0000-0000-0000-0000000000e1', null, 'ab000000-0000-0000-0000-0000000000f1'),
  ('ab000000-0000-0000-0000-0000000000c3', 'ab000000-0000-0000-0000-0000000000e2', 'ab000000-0000-0000-0000-00000000000c', null),
  ('ab000000-0000-0000-0000-0000000000d2', 'ab000000-0000-0000-0000-0000000000e2', null, 'ab000000-0000-0000-0000-0000000000f1'),
  ('ab000000-0000-0000-0000-0000000000a2', 'ab000000-0000-0000-0000-0000000000e3', 'ab000000-0000-0000-0000-00000000000a', null),
  ('ab000000-0000-0000-0000-0000000000b2', 'ab000000-0000-0000-0000-0000000000e3', 'ab000000-0000-0000-0000-00000000000b', null);

-- Chronos : l'invité signe le meilleur temps ABSOLU (40 s) — il ne doit
-- jamais apparaître au tableau. Le solo de C (30 s) non plus.
insert into public.results (race_id, participation_id, position, elo_before, elo_after, elo_delta, best_lap_ms) values
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-0000000000a1', 1, 1000, 1000, 0, 52000),
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-0000000000b1', 2, 1000, 1000, 0, 47000),
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-0000000000c2', 3, 1000, 1000, 0, 49000),
  ('ab000000-0000-0000-0000-0000000000e1', 'ab000000-0000-0000-0000-0000000000d1', 4, 1000, 1000, 0, 40000),
  ('ab000000-0000-0000-0000-0000000000e2', 'ab000000-0000-0000-0000-0000000000c3', 1, 1000, 1000, 0, 30000),
  ('ab000000-0000-0000-0000-0000000000e2', 'ab000000-0000-0000-0000-0000000000d2', 2, 1000, 1000, 0, 31000),
  ('ab000000-0000-0000-0000-0000000000e3', 'ab000000-0000-0000-0000-0000000000a2', 1, 1000, 1000, 0, 45000),
  ('ab000000-0000-0000-0000-0000000000e3', 'ab000000-0000-0000-0000-0000000000b2', 2, 1000, 1000, 0, 60000);

-- ═══ Scénario 1 : le tableau applique les quatre règles ═══
do $$
declare
  A uuid := 'ab000000-0000-0000-0000-00000000000a';
  X uuid := 'ab000000-0000-0000-0000-0000000000c1';
  r record;
begin
  perform tests.as_uid(A);

  -- « Toujours » : A 45.000 (course d'il y a 2 ans), Bela 47.000, Cody 49.000.
  perform tests.eq((select count(*) from get_circuit_top_times(X, 'all')), 3,
                   'trois pilotes au tableau — ni l''invité (40 s) ni le solo (30 s)');
  select * into r from get_circuit_top_times(X, 'all') where rank = 1;
  perform tests.eq(r.best_lap_ms, 45000, 'le record vient de la vieille course qui compte');
  perform tests.eq((r.is_me)::int, 1, 'et c''est moi');

  -- Bela est privée : elle est NOMMÉE comme tout le monde (décision PO
  -- 2026-07-30 — pas de fausse promesse d'anonymat).
  select * into r from get_circuit_top_times(X, 'all') where rank = 2;
  perform tests.eq(r.best_lap_ms, 47000, 'le temps de la privée est affiché');
  if r.username is distinct from 'Bela' then
    raise exception 'ÉCHEC : Bela devrait être nommée (obtenu %)', r.username;
  end if;

  -- « Cette année » : la course d'il y a 2 ans sort → mon meilleur devient 52.000.
  select * into r from get_circuit_top_times(X, 'year') where is_me;
  perform tests.eq(r.best_lap_ms, 52000, 'la période « année » écarte la vieille course');

  -- Période inconnue : refusée.
  begin
    perform get_circuit_top_times(X, 'week');
    raise exception 'ÉCHEC : période « week » acceptée';
  exception when others then
    if sqlerrm like '%ÉCHEC%' then raise; end if;
  end;
  raise notice 'Scénario 1 (tableau : quatre règles) ✔';
end $$;

-- ═══ Scénario 2 : la fiche agrège juste ═══
do $$
declare
  A uuid := 'ab000000-0000-0000-0000-00000000000a';
  X uuid := 'ab000000-0000-0000-0000-0000000000c1';
  r record;
begin
  perform tests.as_uid(A);
  select * into r from get_circuit_page(X);
  perform tests.eq(r.races_count, 3, 'trois courses jouées ici (même celle qui ne compte pas)');
  perform tests.eq(r.pilots_count, 3, 'trois pilotes inscrits distincts');
  perform tests.eq(r.my_races_count, 2, 'mes courses ici');
  perform tests.eq(r.my_best_lap_ms, 45000, 'mon meilleur tour perso');
  perform tests.eq(r.laps_all, 3, 'pilotes éligibles toutes périodes');
  -- Les trois ont un chrono récent (r1 date d'avant-hier) : la distinction de
  -- période sur les TEMPS, elle, est prouvée au scénario 1 (45 s → 52 s).
  perform tests.eq(r.laps_year, 3, 'éligibles sur l''année');
  perform tests.eq(r.laps_month, 3, 'éligibles sur le mois');
  raise notice 'Scénario 2 (agrégats de la fiche) ✔';
end $$;

-- ═══ Scénario 3 : le record existant suit les mêmes règles ═══
do $$
declare
  C uuid := 'ab000000-0000-0000-0000-00000000000c';
  X uuid := 'ab000000-0000-0000-0000-0000000000c1';
  r record;
begin
  -- Vu par Cody : le record est 45.000 (Aroa, publique) — PAS les 40.000 de
  -- l'invité, PAS les 30.000 du solo. Avant l'harmonisation, l'invité
  -- détenait le record.
  perform tests.as_uid(C);
  select * into r from get_circuit_record(X);
  perform tests.eq(r.best_lap_ms, 45000, 'record harmonisé : inscrits, courses qui comptent');
  if r.holder is distinct from 'Aroa' then
    raise exception 'ÉCHEC : détenteur attendu Aroa, obtenu %', r.holder;
  end if;

  -- Une détentrice privée reste nommée (décision PO 2026-07-30).
  update profiles set is_private = true where id = 'ab000000-0000-0000-0000-00000000000a';
  select * into r from get_circuit_record(X);
  perform tests.eq(r.best_lap_ms, 45000, 'le record d''une privée reste affiché');
  if r.holder is distinct from 'Aroa' then
    raise exception 'ÉCHEC : détentrice attendue Aroa, obtenu %', r.holder;
  end if;
  update profiles set is_private = false where id = 'ab000000-0000-0000-0000-00000000000a';
  raise notice 'Scénario 3 (record harmonisé) ✔';
end $$;

-- ═══ Scénario 4 : un suspendu quitte les tableaux ═══
do $$
declare
  A uuid := 'ab000000-0000-0000-0000-00000000000a';
  X uuid := 'ab000000-0000-0000-0000-0000000000c1';
begin
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = 'ab000000-0000-0000-0000-00000000000c';
  perform set_config('kartsquad.moderate_suspend', '', true);

  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_circuit_top_times(X, 'all')), 2,
                   'le suspendu quitte le tableau');
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = null where id = 'ab000000-0000-0000-0000-00000000000c';
  perform set_config('kartsquad.moderate_suspend', '', true);
  raise notice 'Scénario 4 (suspendu hors tableaux) ✔';
end $$;

-- ═══ Scénario 5 : le pratique importé, borné et sain ═══
do $$
begin
  perform tests.as_uid('ab000000-0000-0000-0000-00000000000a');
  -- Le référentiel réel est en base : l'import du pratique a dû toucher des
  -- circuits (137 sites mesurés à la source).
  perform tests.eq((select (count(*) > 100)::int from circuits where website is not null), 1,
                   'plus de 100 circuits ont un site web');
  perform tests.eq((select count(*) from circuits
                     where website is not null and website !~ '^https?://'), 0,
                   'tous les sites sont des URL http(s)');
  perform tests.eq((select count(*) from circuits
                     where website is not null and website ~ '[*?#]$'), 0,
                   'aucune URL ne traîne un caractère parasite final');
  perform tests.eq((select count(*) from circuits
                     where phone is not null and phone !~ '^\+?[0-9]'), 0,
                   'tous les téléphones commencent par un chiffre ou +');
  raise notice 'Scénario 5 (pratique importé) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de la fiche circuit sont passés ✔'; end $$;
