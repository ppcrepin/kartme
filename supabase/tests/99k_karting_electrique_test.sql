-- C13 — les badges du karting ÉLECTRIQUE (2026-08-01). Transaction annulée.
--
-- Le badge est un outil de PROMOTION : il doit se déclencher au bon endroit et
-- nulle part ailleurs. Trois façons de le rater, toutes couvertes ici :
--   · sur un circuit « mixte », qui loue aussi des karts thermiques ;
--   · au retour d'une soirée thermique, parce qu'on a compté un historique
--     sans regarder la course en cours ;
--   · en solo, en fabriquant cinq courses fantômes dans la soirée.
--
-- Toutes les courses sont planifiées l'APRÈS-MIDI (15 h) : le matin
-- déclencherait « Midi moins le kart » et brouillerait les comptes.

begin;

create schema tests;

create function tests.mk_user(p uuid, e int) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo, races)
    values (p, 'U' || substr(replace(p::text, '-', ''), 1, 6), e, 100);
end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.has_badge(p uuid, k text) returns bigint language sql as $$
  select count(*) from public.user_badges where profile_id = p and badge_key = k;
$$;

create function tests.call_submit(p_uid uuid, p_race uuid, p_order uuid[]) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform public.submit_race_results(p_race, p_order);
  perform set_config('kartsquad.elo_engine', '', true);
end $$;

/**
 * Une course à deux inscrits sur un circuit donné, validée dans la foulée.
 * Deux inscrits = course CLASSÉE, donc les badges peuvent tomber.
 */
create function tests.course(p_race uuid, p_circuit uuid, a uuid, b uuid) returns void
language plpgsql as $$
declare pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
begin
  insert into races (id, admin_id, circuit_id, scheduled_at)
    values (p_race, a, p_circuit, '2026-06-15 15:00:00+02');
  insert into participations (id, race_id, profile_id) values (pa, p_race, a), (pb, p_race, b);
  perform tests.call_submit(a, p_race, array[pa, pb]);
end $$;

-- Trois circuits, un par motorisation.
insert into public.circuits (id, name, city, is_official, motor_kind) values
  ('c0000000-0000-0000-0000-0000000000e1', 'Volt Kart', 'Brest', true, 'electrique'),
  ('c0000000-0000-0000-0000-0000000000d1', 'Essence Kart', 'Lyon', true, 'thermique'),
  ('c0000000-0000-0000-0000-0000000000c1', 'Kart Mixte', 'Nantes', true, 'mixte');

-- ═══ 1 · Une course électrique suffit pour « Sous tension » ════════════════
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-000000000001';
  B uuid := 'e0000000-0000-0000-0000-000000000002';
begin
  perform tests.mk_user(A, 1000); perform tests.mk_user(B, 1000);
  perform tests.course('e2220000-0000-0000-0000-000000000001',
                       'c0000000-0000-0000-0000-0000000000e1', A, B);

  perform tests.eq(tests.has_badge(A, 'sous_tension'), 1, 'A : Sous tension dès la 1re course électrique');
  perform tests.eq(tests.has_badge(B, 'sous_tension'), 1, 'B : Sous tension aussi (le badge n''est pas une victoire)');
  perform tests.eq(tests.has_badge(A, 'haute_tension'), 0, 'A : pas encore Haute tension à 1 course');
  raise notice 'Scénario 1 (Sous tension dès la 1re course électrique) ✔';
end $$;

-- ═══ 2 · Ni le thermique, ni le MIXTE ne le déclenchent ════════════════════
-- Le mixte est le piège : le circuit loue aussi des karts électriques, donc
-- rien ne prouve qu'on en a pris un. Un badge qui se décroche sans avoir fait
-- ce qu'il annonce ne vaut rien.
do $$
declare
  C uuid := 'e0000000-0000-0000-0000-000000000003';
  D uuid := 'e0000000-0000-0000-0000-000000000004';
begin
  perform tests.mk_user(C, 1000); perform tests.mk_user(D, 1000);
  perform tests.course('e2220000-0000-0000-0000-000000000002',
                       'c0000000-0000-0000-0000-0000000000d1', C, D);
  perform tests.eq(tests.has_badge(C, 'sous_tension'), 0, 'C : le thermique ne donne rien');

  perform tests.course('e2220000-0000-0000-0000-000000000003',
                       'c0000000-0000-0000-0000-0000000000c1', C, D);
  perform tests.eq(tests.has_badge(C, 'sous_tension'), 0, 'C : le circuit MIXTE ne donne rien non plus');
  raise notice 'Scénario 2 (ni thermique ni mixte) ✔';
end $$;

-- ═══ 3 · Cinq courses électriques → « Haute tension » ══════════════════════
-- Et la 6e, jouée en THERMIQUE, ne doit rien décrocher de neuf : le bandeau
-- post-course annoncerait « badge gagné sur cette course » à propos d'une
-- course qui n'y est pour rien.
do $$
declare
  E uuid := 'e0000000-0000-0000-0000-000000000005';
  F uuid := 'e0000000-0000-0000-0000-000000000006';
  i int;
begin
  perform tests.mk_user(E, 1000); perform tests.mk_user(F, 1000);
  for i in 1..4 loop
    perform tests.course(('e2230000-0000-0000-0000-00000000000' || i)::uuid,
                         'c0000000-0000-0000-0000-0000000000e1', E, F);
    perform tests.eq(tests.has_badge(E, 'haute_tension'), 0,
                     'E : pas de Haute tension avant la 5e (' || i || ' courses)');
  end loop;

  perform tests.course('e2230000-0000-0000-0000-000000000005',
                       'c0000000-0000-0000-0000-0000000000e1', E, F);
  perform tests.eq(tests.has_badge(E, 'haute_tension'), 1, 'E : Haute tension à la 5e');
  raise notice 'Scénario 3 (Haute tension à la 5e, pas avant) ✔';
end $$;

-- ═══ 4 · En SOLO, rien ne tombe (anti-triche) ══════════════════════════════
-- Une course à un seul inscrit n'est pas classée : sans cette garde, un pilote
-- seul fabriquait cinq courses sur une piste électrique et repartait avec les
-- deux badges sans avoir touché un kart.
do $$
declare
  G uuid := 'e0000000-0000-0000-0000-000000000007';
  r uuid := 'e2240000-0000-0000-0000-000000000001';
  pg uuid := 'e2250000-0000-0000-0000-000000000001';
  gh uuid := 'e2260000-0000-0000-0000-000000000001';
  pf uuid := 'e2250000-0000-0000-0000-000000000002';
begin
  perform tests.mk_user(G, 1000);
  -- Un fantôme en face : la course a deux partants, mais UN SEUL inscrit.
  insert into races (id, admin_id, circuit_id, scheduled_at)
    values (r, G, 'c0000000-0000-0000-0000-0000000000e1', '2026-06-15 15:00:00+02');
  insert into ghost_profiles (id, display_name, elo, created_by) values (gh, 'Tonton', 1000, G);
  insert into participations (id, race_id, profile_id) values (pg, r, G);
  insert into participations (id, race_id, ghost_id) values (pf, r, gh);
  perform tests.call_submit(G, r, array[pg, pf]);

  perform tests.eq(tests.has_badge(G, 'sous_tension'), 0,
                   'G : course non classée (un seul inscrit) → aucun badge électrique');
  raise notice 'Scénario 4 (anti-triche : course non classée) ✔';
end $$;

-- ═══ 5 · La carte reçoit la motorisation ══════════════════════════════════
do $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'e0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
  update public.circuits set lat = 48.39, lon = -4.48
   where id = 'c0000000-0000-0000-0000-0000000000e1';
  select motor_kind into v
    from public.nearby_circuits(48.39, -4.48, 5, 50) limit 1;
  if v is distinct from 'electrique' then
    raise exception 'ÉCHEC : nearby_circuits ne rend pas motor_kind (obtenu « % »)', v;
  end if;
  raise notice 'Scénario 5 (la carte reçoit motor_kind) ✔';
end $$;

rollback;
