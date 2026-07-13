-- Tests du moteur de badges (lot 2.3). Transaction annulée.
-- On passe par le vrai moteur (submit_race_results → award_badges) sauf pour
-- le badge « après minuit », testé en appelant award_badges avec une heure
-- contrôlée.

begin;

create schema tests;

create function tests.mk_user(p uuid, e int) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo) values (p, 'U' || substr(replace(p::text, '-', ''), 1, 6), e);
end $$;

-- Tout le test tourne dans UNE transaction, donc now() (et results.created_at
-- par défaut) est figé : identique pour toutes les courses. En prod chaque
-- validation est sa propre transaction et created_at avance réellement. On
-- simule cet ordre de validation en estampillant chaque course validée avec un
-- created_at strictement croissant — c'est ce que « d'affilée » lit.
create sequence tests.val_seq;

create function tests.call_submit(p_uid uuid, p_race uuid, p_order uuid[]) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform public.submit_race_results(p_race, p_order);
  perform set_config('kartsquad.elo_engine', '', true);
  update public.results
    set created_at = timestamptz 'epoch' + (nextval('tests.val_seq') * interval '1 minute')
    where race_id = p_race;
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

-- ═══ Scénario 1 : première course → Kart d'identité pour tous, Champagne
--     pour le vainqueur, Lanterne rouge pour le dernier (course à 3+),
--     David contre Goliath pour un écart ≥ 300 ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001'; -- 1000, gagne
  B uuid := 'b0000000-0000-0000-0000-000000000002'; -- 1350 (Goliath battu par A)
  C uuid := 'b0000000-0000-0000-0000-000000000003'; -- 1000, dernier
  r uuid := '22220000-0000-0000-0000-000000000001';
  pa uuid := 'ba000000-0000-0000-0000-000000000001';
  pb uuid := 'ba000000-0000-0000-0000-000000000002';
  pc uuid := 'ba000000-0000-0000-0000-000000000003';
begin
  perform tests.mk_user(A, 1000); perform tests.mk_user(B, 1350); perform tests.mk_user(C, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, A, now() - interval '10 day');
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B), (pc, r, C);
  perform tests.call_submit(A, r, array[pa, pb, pc]);

  perform tests.eq(tests.has_badge(A, 'kart_didentite'), 1, 'A : Kart d''identité');
  perform tests.eq(tests.has_badge(C, 'kart_didentite'), 1, 'C : Kart d''identité');
  perform tests.eq(tests.has_badge(A, 'champagne'), 1, 'A (vainqueur) : Champagne !');
  perform tests.eq(tests.has_badge(B, 'champagne'), 0, 'B (2e) : pas de Champagne');
  perform tests.eq(tests.has_badge(C, 'lanterne_rouge'), 1, 'C (dernier de 3) : Lanterne rouge');
  perform tests.eq(tests.has_badge(A, 'david_goliath'), 1, 'A a battu B (+350) : David contre Goliath');
  perform tests.eq(tests.has_badge(C, 'david_goliath'), 0, 'C (derrière B) : pas de David contre Goliath');
  -- C part de 1000 pile (borne Rookie) et perd ~25 : palier perdu dès ici.
  perform tests.eq(tests.has_badge(C, 'tete_a_queue'), 1, 'C (1000 → ~975) : Tête-à-queue');
  -- 3×identité + champagne + lanterne + goliath + tête-à-queue = 7.
  perform tests.eq((select count(*) from user_badges where race_id = r), 7, '7 badges sur cette course');
  raise notice 'Scénario 1 (première course, victoire, lanterne, Goliath) ✔';
end $$;

-- ═══ Scénario 2 : un duel à 2 ne donne PAS la Lanterne rouge, et un badge
--     déjà débloqué ne se re-débloque pas ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  C uuid := 'b0000000-0000-0000-0000-000000000003';
  r uuid := '22220000-0000-0000-0000-000000000002';
  pa uuid := 'bb000000-0000-0000-0000-000000000001';
  pc uuid := 'bb000000-0000-0000-0000-000000000002';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now() - interval '9 day');
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pc, r, C);
  perform tests.call_submit(A, r, array[pa, pc]);

  perform tests.eq(tests.has_badge(C, 'lanterne_rouge'), 1, 'C : Lanterne rouge toujours unique');
  perform tests.eq((select count(*) from user_badges where profile_id = C and badge_key = 'lanterne_rouge' and race_id = r), 0,
                   'perdre un duel à 2 ne donne pas la Lanterne rouge');
  perform tests.eq((select count(*) from user_badges where profile_id = A and badge_key = 'champagne'), 1,
                   'Champagne reste unique après une 2e victoire');
  raise notice 'Scénario 2 (duel sans lanterne, unicité) ✔';
end $$;

-- ═══ Scénario 3 : Tête-à-queue (perte d'un palier) et Kart-astrophe (Δ ≤ −48) ═══
do $$
declare
  W uuid := 'b0000000-0000-0000-0000-000000000010'; -- 610, gagne
  L uuid := 'b0000000-0000-0000-0000-000000000011'; -- 1010, favori battu
  r uuid := '22220000-0000-0000-0000-000000000003';
  pw uuid := 'bc000000-0000-0000-0000-000000000001';
  pl uuid := 'bc000000-0000-0000-0000-000000000002';
begin
  -- Écart 400 : l'attendu du favori est ~0,76 → défaite = −64×0,76 ≈ −49.
  perform tests.mk_user(W, 610); perform tests.mk_user(L, 1010);
  insert into races (id, admin_id, scheduled_at) values (r, W, now() - interval '8 day');
  insert into participations (id, race_id, profile_id) values (pw, r, W), (pl, r, L);
  perform tests.call_submit(W, r, array[pw, pl]);

  perform tests.eq(tests.has_badge(L, 'kart_astrophe'), 1, 'L (Δ ≈ −49) : Kart-astrophe');
  perform tests.eq(tests.has_badge(L, 'tete_a_queue'), 1, 'L (1010 → sous 1000) : Tête-à-queue');
  perform tests.eq(tests.has_badge(W, 'kart_astrophe'), 0, 'W (gagnant) : pas de Kart-astrophe');
  perform tests.eq(tests.has_badge(W, 'tete_a_queue'), 0, 'W (monte) : pas de Tête-à-queue');
  perform tests.eq(tests.has_badge(W, 'david_goliath'), 1, 'W a battu L (+400) : David contre Goliath');
  raise notice 'Scénario 3 (Tête-à-queue, Kart-astrophe) ✔';
end $$;

-- ═══ Scénario 4 : « Il est 2h moins le kart » — heure contrôlée ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  r uuid := '22220000-0000-0000-0000-000000000002'; -- course déjà validée (scén. 2)
begin
  -- Validation à 14h Paris : rien.
  perform public.award_badges(r, '2026-07-12 14:00:00+02'::timestamptz);
  perform tests.eq(tests.has_badge(A, 'deux_h_moins_le_kart'), 0, '14h : pas de badge');
  -- Validation à 01h45 Paris : badge pour les participants inscrits.
  perform public.award_badges(r, '2026-07-13 01:45:00+02'::timestamptz);
  perform tests.eq(tests.has_badge(A, 'deux_h_moins_le_kart'), 1, '01h45 : badge débloqué');
  raise notice 'Scénario 4 (après minuit, heure contrôlée) ✔';
end $$;

-- ═══ Scénario 5 : Habitué des stands (10 courses) et Chef d'écurie
--     (10 courses organisées) — même pilote admin+participant, en boucle ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  C uuid := 'b0000000-0000-0000-0000-000000000003';
  g int;
  r uuid;
  pa uuid;
  pc uuid;
begin
  -- A et C ont déjà 2 courses (scénarios 1-2) ; on en ajoute 8 → 10.
  for g in 1..8 loop
    r  := ('22220000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid;
    pa := ('bd000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid;
    pc := ('be000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, A, now() - interval '7 day' + (g || ' hour')::interval);
    insert into participations (id, race_id, profile_id) values (pa, r, A), (pc, r, C);
    if g < 8 then
      perform tests.call_submit(A, r, array[pc, pa]); -- C gagne les 7 premières
    else
      perform tests.call_submit(A, r, array[pa, pc]); -- A gagne la dernière
    end if;
  end loop;

  perform tests.eq(tests.has_badge(A, 'habitue_stands'), 1, 'A : Habitué des stands (10 courses)');
  perform tests.eq(tests.has_badge(C, 'habitue_stands'), 1, 'C : Habitué des stands (10 courses)');
  perform tests.eq(tests.has_badge(A, 'chef_ecurie'), 1, 'A : Chef d''écurie (10 courses organisées)');
  perform tests.eq(tests.has_badge(C, 'chef_ecurie'), 0, 'C : pas Chef d''écurie');
  raise notice 'Scénario 5 (Habitué des stands, Chef d''écurie) ✔';
end $$;

-- ═══ Scénario 6 : Sur les chapeaux de roues (3 victoires d'affilée) ═══
do $$
declare
  C uuid := 'b0000000-0000-0000-0000-000000000003';
begin
  -- C a gagné les courses 1..7 du scénario 5 (d'affilée) : badge présent.
  perform tests.eq(tests.has_badge(C, 'chapeaux_de_roues'), 1, 'C : 3 victoires d''affilée');
  -- A n'a jamais aligné 3 victoires consécutives.
  perform tests.eq(tests.has_badge('b0000000-0000-0000-0000-000000000001', 'chapeaux_de_roues'), 0,
                   'A : pas de série de 3');
  raise notice 'Scénario 6 (chapeaux de roues) ✔';
end $$;

-- ═══ Scénario 7 : RLS — badges d'un profil privé invisibles aux non-amis ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  C uuid := 'b0000000-0000-0000-0000-000000000003';
  S uuid := 'b0000000-0000-0000-0000-000000000020'; -- spectateur sans lien
  nvis bigint;
begin
  perform tests.mk_user(S, 1000);
  update profiles set is_private = true where id = C;

  perform set_config('request.jwt.claims', json_build_object('sub', S, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nvis from user_badges where profile_id = C;
  reset role;
  perform tests.eq(nvis, 0, 'privé : badges de C invisibles pour un inconnu');

  perform set_config('request.jwt.claims', json_build_object('sub', S, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nvis from user_badges where profile_id = A;
  reset role;
  if nvis = 0 then raise exception 'ÉCHEC : badges du profil public A invisibles'; end if;

  -- Un AMI ACCEPTÉ, lui, voit bien les badges du profil privé (A6).
  insert into public.friendships (requester_id, addressee_id, status) values (S, C, 'accepted');
  perform set_config('request.jwt.claims', json_build_object('sub', S, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nvis from user_badges where profile_id = C;
  reset role;
  if nvis = 0 then raise exception 'ÉCHEC : un ami accepté ne voit pas les badges du privé C'; end if;

  -- Un inscrit ne peut pas s'auto-attribuer un badge.
  perform set_config('request.jwt.claims', json_build_object('sub', S, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into user_badges (profile_id, badge_key) values (S, 'champagne');
    reset role;
    raise exception 'ÉCHEC : insertion directe de badge autorisée';
  exception when insufficient_privilege then
    reset role;
  end;
  raise notice 'Scénario 7 (RLS badges : privé masqué, ami accepté voit, écriture bloquée) ✔';
end $$;

-- ═══ Scénario 8 : Chef d'écurie pour un organisateur qui NE PILOTE PAS ═══
do $$
declare
  ORG uuid := 'b0000000-0000-0000-0000-000000000030'; -- admin, ne court jamais
  P1 uuid := 'b0000000-0000-0000-0000-000000000031';
  P2 uuid := 'b0000000-0000-0000-0000-000000000032';
  g int;
  r uuid;
  p1p uuid;
  p2p uuid;
begin
  perform tests.mk_user(ORG, 1000); perform tests.mk_user(P1, 1000); perform tests.mk_user(P2, 1000);
  for g in 1..10 loop
    r   := ('22223000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    p1p := ('bf100000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    p2p := ('bf200000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, ORG, now() - interval '5 day' + (g || ' hour')::interval);
    insert into participations (id, race_id, profile_id) values (p1p, r, P1), (p2p, r, P2);
    perform tests.call_submit(ORG, r, array[p1p, p2p]);
  end loop;

  perform tests.eq(tests.has_badge(ORG, 'chef_ecurie'), 1, 'ORG : Chef d''écurie (10 courses organisées, 0 pilotée)');
  perform tests.eq((select count(*) from user_badges where profile_id = ORG), 1, 'ORG : uniquement Chef d''écurie (aucun badge de pilote)');
  raise notice 'Scénario 8 (Chef d''écurie sans piloter) ✔';
end $$;

-- ═══ Scénario 9 : « chapeaux de roues » suit l'ordre de VALIDATION, pas
--     scheduled_at — même date pour toutes, défaite intercalée ═══
do $$
declare
  P uuid := 'b0000000-0000-0000-0000-000000000040'; -- V, D, V, V → jamais 3 d'affilée
  Q uuid := 'b0000000-0000-0000-0000-000000000041'; -- l'adversaire (V, V, D, D)
  fixed timestamptz := now() - interval '2 day'; -- MÊME scheduled_at pour les 4
  g int;
  r uuid;
  pp uuid;
  pq uuid;
  outcome int[] := array[1, 2, 1, 1]; -- position de P à chaque manche
begin
  perform tests.mk_user(P, 1000); perform tests.mk_user(Q, 1000);
  for g in 1..4 loop
    r  := ('22224000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    pp := ('bf300000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    pq := ('bf400000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, P, fixed);
    insert into participations (id, race_id, profile_id) values (pp, r, P), (pq, r, Q);
    if outcome[g] = 1 then
      perform tests.call_submit(P, r, array[pp, pq]); -- P gagne
    else
      perform tests.call_submit(P, r, array[pq, pp]); -- P perd
    end if;
  end loop;

  -- Par ordre de validation P a fait V,D,V,V : à aucun instant 3 victoires
  -- consécutives → pas de badge (l'ancien tri sur scheduled_at égaux aurait pu
  -- l'accorder au hasard des uuid).
  perform tests.eq(tests.has_badge(P, 'chapeaux_de_roues'), 0, 'chapeaux : pas de badge sur V,D,V,V (dates égales)');
  raise notice 'Scénario 9 (chapeaux : ordre de validation, dates égales) ✔';
end $$;

do $$ begin raise notice 'Tous les tests badges sont passés ✔'; end $$;

rollback;
