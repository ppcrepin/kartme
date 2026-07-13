-- Tests du moteur de badges — 12 badges (refonte 2026-07-13). Transaction
-- annulée. On passe par le vrai moteur (submit_race_results → award_badges).
--
-- IMPORTANT : « Midi moins le kart » lit l'heure PRÉVUE de la course
-- (scheduled_at). Les courses qui ne doivent PAS le déclencher sont donc
-- planifiées l'après-midi (15h, heure fixe et déterministe) — surtout pas
-- now()-Xj dont l'heure dépendrait du moment d'exécution du test.

begin;

create schema tests;

create function tests.mk_user(p uuid, e int) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo) values (p, 'U' || substr(replace(p::text, '-', ''), 1, 6), e);
end $$;

-- Estampille les results d'une course validée avec un created_at croissant
-- (l'ordre de validation, que « 3 victoires d'affilée » lit).
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

-- Base de dates : toujours l'APRÈS-MIDI (15h) sauf test « midi ».
-- (constante réutilisée : 2026-06-15 15:00 heure de Paris)

-- ═══ Scénario 1 : 1ère course à 3 → identité×3, Champagne (1er), Voiture
--     balai (dernier), DRS (écart 300+), Tête-à-queue (palier), Push (>30) ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001'; -- 1000, gagne (+~39 → Push)
  B uuid := 'b0000000-0000-0000-0000-000000000002'; -- 1350 (Goliath battu par A)
  C uuid := 'b0000000-0000-0000-0000-000000000003'; -- 1000, dernier
  r uuid := '22220000-0000-0000-0000-000000000001';
  pa uuid := 'ba000000-0000-0000-0000-000000000001';
  pb uuid := 'ba000000-0000-0000-0000-000000000002';
  pc uuid := 'ba000000-0000-0000-0000-000000000003';
begin
  perform tests.mk_user(A, 1000); perform tests.mk_user(B, 1350); perform tests.mk_user(C, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, A, '2026-06-15 15:00:00+02');
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B), (pc, r, C);
  perform tests.call_submit(A, r, array[pa, pb, pc]);

  perform tests.eq(tests.has_badge(A, 'kart_didentite'), 1, 'A : Kart d''identité');
  perform tests.eq(tests.has_badge(C, 'kart_didentite'), 1, 'C : Kart d''identité');
  perform tests.eq(tests.has_badge(A, 'champagne'), 1, 'A (vainqueur) : Champagne !');
  perform tests.eq(tests.has_badge(B, 'champagne'), 0, 'B (2e) : pas de Champagne');
  perform tests.eq(tests.has_badge(C, 'voiture_balai'), 1, 'C (dernier de 3) : Voiture balai');
  perform tests.eq(tests.has_badge(A, 'drs'), 1, 'A a battu B (+350) : DRS');
  perform tests.eq(tests.has_badge(C, 'drs'), 0, 'C (derrière B) : pas de DRS');
  perform tests.eq(tests.has_badge(C, 'tete_a_queue'), 1, 'C (1000 → ~975) : Tête-à-queue');
  perform tests.eq(tests.has_badge(A, 'push'), 1, 'A (+~39) : Push');
  perform tests.eq(tests.has_badge(C, 'push'), 0, 'C (perd) : pas de Push');
  -- 3×identité + champagne + voiture_balai + drs + tête-à-queue + push = 8.
  perform tests.eq((select count(*) from user_badges where race_id = r), 8, '8 badges sur cette course');
  raise notice 'Scénario 1 (1ère course : Champagne, Voiture balai, DRS, Push) ✔';
end $$;

-- ═══ Scénario 2 : un duel à 2 ne donne PAS Voiture balai ; unicité ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  C uuid := 'b0000000-0000-0000-0000-000000000003';
  r uuid := '22220000-0000-0000-0000-000000000002';
  pa uuid := 'bb000000-0000-0000-0000-000000000001';
  pc uuid := 'bb000000-0000-0000-0000-000000000002';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, '2026-06-15 15:01:00+02');
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pc, r, C);
  perform tests.call_submit(A, r, array[pa, pc]);

  perform tests.eq((select count(*) from user_badges where profile_id = C and badge_key = 'voiture_balai' and race_id = r), 0,
                   'perdre un duel à 2 ne donne pas la Voiture balai');
  perform tests.eq((select count(*) from user_badges where profile_id = A and badge_key = 'champagne'), 1,
                   'Champagne reste unique après une 2e victoire');
  raise notice 'Scénario 2 (duel sans voiture balai, unicité) ✔';
end $$;

-- ═══ Scénario 3 : Kart-astrophe (perdre > 30) + Push (gagner > 30) + Tête-à-queue ═══
do $$
declare
  W uuid := 'b0000000-0000-0000-0000-000000000010'; -- 610, gagne (+~49 → Push)
  L uuid := 'b0000000-0000-0000-0000-000000000011'; -- 1010, battu (−~49 → Kart-astrophe)
  r uuid := '22220000-0000-0000-0000-000000000003';
  pw uuid := 'bc000000-0000-0000-0000-000000000001';
  pl uuid := 'bc000000-0000-0000-0000-000000000002';
begin
  perform tests.mk_user(W, 610); perform tests.mk_user(L, 1010);
  insert into races (id, admin_id, scheduled_at) values (r, W, '2026-06-15 15:02:00+02');
  insert into participations (id, race_id, profile_id) values (pw, r, W), (pl, r, L);
  perform tests.call_submit(W, r, array[pw, pl]);

  perform tests.eq(tests.has_badge(L, 'kart_astrophe'), 1, 'L (Δ ≈ −49) : Kart-astrophe (> 30 perdus)');
  perform tests.eq(tests.has_badge(L, 'tete_a_queue'), 1, 'L (1010 → sous 1000) : Tête-à-queue');
  perform tests.eq(tests.has_badge(W, 'push'), 1, 'W (Δ ≈ +49) : Push (> 30 gagnés)');
  perform tests.eq(tests.has_badge(W, 'kart_astrophe'), 0, 'W (gagnant) : pas de Kart-astrophe');
  perform tests.eq(tests.has_badge(L, 'push'), 0, 'L (perd) : pas de Push');
  perform tests.eq(tests.has_badge(W, 'drs'), 1, 'W a battu L (+400) : DRS');
  raise notice 'Scénario 3 (Kart-astrophe, Push, Tête-à-queue) ✔';
end $$;

-- ═══ Scénario 4 : Midi moins le kart — course du MATIN (heure prévue) ═══
do $$
declare
  M1 uuid := 'b0000000-0000-0000-0000-000000000050';
  M2 uuid := 'b0000000-0000-0000-0000-000000000051';
  M3 uuid := 'b0000000-0000-0000-0000-000000000052';
  M4 uuid := 'b0000000-0000-0000-0000-000000000053';
  rm uuid := '22225000-0000-0000-0000-000000000001'; -- 9h : matin
  ra uuid := '22225000-0000-0000-0000-000000000002'; -- 15h : après-midi
  q1 uuid := 'ca000000-0000-0000-0000-000000000001';
  q2 uuid := 'ca000000-0000-0000-0000-000000000002';
  q3 uuid := 'ca000000-0000-0000-0000-000000000003';
  q4 uuid := 'ca000000-0000-0000-0000-000000000004';
begin
  perform tests.mk_user(M1, 1000); perform tests.mk_user(M2, 1000);
  perform tests.mk_user(M3, 1000); perform tests.mk_user(M4, 1000);
  -- Course du matin (9h Paris) : les 2 participants inscrits obtiennent le badge.
  insert into races (id, admin_id, scheduled_at) values (rm, M1, '2026-06-16 09:00:00+02');
  insert into participations (id, race_id, profile_id) values (q1, rm, M1), (q2, rm, M2);
  perform tests.call_submit(M1, rm, array[q1, q2]);
  perform tests.eq(tests.has_badge(M1, 'midi_moins_le_kart'), 1, 'M1 : course du matin → Midi moins le kart');
  perform tests.eq(tests.has_badge(M2, 'midi_moins_le_kart'), 1, 'M2 : course du matin → Midi moins le kart');
  -- Course de l'après-midi (15h) : pas de badge.
  insert into races (id, admin_id, scheduled_at) values (ra, M3, '2026-06-16 15:00:00+02');
  insert into participations (id, race_id, profile_id) values (q3, ra, M3), (q4, ra, M4);
  perform tests.call_submit(M3, ra, array[q3, q4]);
  perform tests.eq(tests.has_badge(M3, 'midi_moins_le_kart'), 0, 'M3 : après-midi → pas de badge');
  raise notice 'Scénario 4 (Midi moins le kart : matin oui, après-midi non) ✔';
end $$;

-- ═══ Scénario 5 : Habitué des stands (10 courses) + Chef d'écurie (10 courses
--     QUI COMPTENT organisées) ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  C uuid := 'b0000000-0000-0000-0000-000000000003';
  g int; r uuid; pa uuid; pc uuid;
begin
  -- A et C ont déjà 2 courses (scén. 1-2) ; on en ajoute 8 → 10.
  for g in 1..8 loop
    r  := ('22220000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid;
    pa := ('bd000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid;
    pc := ('be000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, A, '2026-06-15 15:00:00+02'::timestamptz + (g || ' minute')::interval);
    insert into participations (id, race_id, profile_id) values (pa, r, A), (pc, r, C);
    if g < 8 then perform tests.call_submit(A, r, array[pc, pa]);  -- C gagne les 7 premières
    else perform tests.call_submit(A, r, array[pa, pc]); end if;   -- A gagne la dernière
  end loop;

  perform tests.eq(tests.has_badge(A, 'habitue_stands'), 1, 'A : Habitué des stands (10 courses)');
  perform tests.eq(tests.has_badge(C, 'habitue_stands'), 1, 'C : Habitué des stands (10 courses)');
  perform tests.eq(tests.has_badge(A, 'chef_ecurie'), 1, 'A : Chef d''écurie (10 courses qui comptent)');
  perform tests.eq(tests.has_badge(C, 'chef_ecurie'), 0, 'C : pas Chef d''écurie');
  raise notice 'Scénario 5 (Habitué des stands, Chef d''écurie) ✔';
end $$;

-- ═══ Scénario 6 : Sur les chapeaux de roues (3 victoires d'affilée) ═══
do $$
declare C uuid := 'b0000000-0000-0000-0000-000000000003';
begin
  perform tests.eq(tests.has_badge(C, 'chapeaux_de_roues'), 1, 'C : 3 victoires d''affilée');
  perform tests.eq(tests.has_badge('b0000000-0000-0000-0000-000000000001', 'chapeaux_de_roues'), 0, 'A : pas de série de 3');
  raise notice 'Scénario 6 (chapeaux de roues) ✔';
end $$;

-- ═══ Scénario 7 : RLS — badges d'un profil privé invisibles aux non-amis ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-000000000001';
  C uuid := 'b0000000-0000-0000-0000-000000000003';
  S uuid := 'b0000000-0000-0000-0000-000000000020';
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

  insert into public.friendships (requester_id, addressee_id, status) values (S, C, 'accepted');
  perform set_config('request.jwt.claims', json_build_object('sub', S, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into nvis from user_badges where profile_id = C;
  reset role;
  if nvis = 0 then raise exception 'ÉCHEC : un ami accepté ne voit pas les badges du privé C'; end if;

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
  ORG uuid := 'b0000000-0000-0000-0000-000000000030';
  P1 uuid := 'b0000000-0000-0000-0000-000000000031';
  P2 uuid := 'b0000000-0000-0000-0000-000000000032';
  g int; r uuid; p1p uuid; p2p uuid;
begin
  perform tests.mk_user(ORG, 1000); perform tests.mk_user(P1, 1000); perform tests.mk_user(P2, 1000);
  for g in 1..10 loop
    r   := ('22223000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    p1p := ('bf100000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    p2p := ('bf200000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, ORG, '2026-06-15 15:00:00+02'::timestamptz + (g || ' minute')::interval);
    insert into participations (id, race_id, profile_id) values (p1p, r, P1), (p2p, r, P2);
    perform tests.call_submit(ORG, r, array[p1p, p2p]);
  end loop;

  perform tests.eq(tests.has_badge(ORG, 'chef_ecurie'), 1, 'ORG : Chef d''écurie (10 organisées, 0 pilotée)');
  perform tests.eq((select count(*) from user_badges where profile_id = ORG), 1, 'ORG : uniquement Chef d''écurie');
  raise notice 'Scénario 8 (Chef d''écurie sans piloter) ✔';
end $$;

-- ═══ Scénario 9 : « chapeaux » suit l'ordre de VALIDATION (dates égales) ═══
do $$
declare
  P uuid := 'b0000000-0000-0000-0000-000000000040';
  Q uuid := 'b0000000-0000-0000-0000-000000000041';
  fixed timestamptz := '2026-06-15 15:00:00+02';
  g int; r uuid; pp uuid; pq uuid;
  outcome int[] := array[1, 2, 1, 1];
begin
  perform tests.mk_user(P, 1000); perform tests.mk_user(Q, 1000);
  for g in 1..4 loop
    r  := ('22224000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    pp := ('bf300000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    pq := ('bf400000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, P, fixed);
    insert into participations (id, race_id, profile_id) values (pp, r, P), (pq, r, Q);
    if outcome[g] = 1 then perform tests.call_submit(P, r, array[pp, pq]);
    else perform tests.call_submit(P, r, array[pq, pp]); end if;
  end loop;

  perform tests.eq(tests.has_badge(P, 'chapeaux_de_roues'), 0, 'chapeaux : pas de badge sur V,D,V,V (dates égales)');
  raise notice 'Scénario 9 (chapeaux : ordre de validation) ✔';
end $$;

-- ═══ Scénario 10 : Safety car — 10 courses qui comptent SANS jamais finir dernier ═══
do $$
declare
  Y uuid := 'b0000000-0000-0000-0000-000000000060'; -- toujours 1er
  Z uuid := 'b0000000-0000-0000-0000-000000000061'; -- toujours 2e (jamais dernier)
  L uuid := 'b0000000-0000-0000-0000-000000000062'; -- toujours dernier
  g int; r uuid; py uuid; pz uuid; pl uuid;
begin
  perform tests.mk_user(Y, 1000); perform tests.mk_user(Z, 1000); perform tests.mk_user(L, 1000);
  for g in 1..10 loop
    r  := ('22226000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    py := ('cb100000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    pz := ('cb200000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    pl := ('cb300000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    insert into races (id, admin_id, scheduled_at) values (r, Y, '2026-06-15 15:00:00+02'::timestamptz + (g || ' minute')::interval);
    insert into participations (id, race_id, profile_id) values (py, r, Y), (pz, r, Z), (pl, r, L);
    perform tests.call_submit(Y, r, array[py, pz, pl]); -- Y 1er, Z 2e, L dernier
  end loop;

  perform tests.eq(tests.has_badge(Y, 'safety_car'), 1, 'Y : Safety car (10 courses, jamais dernier)');
  perform tests.eq(tests.has_badge(Z, 'safety_car'), 1, 'Z : Safety car (toujours 2e, jamais dernier)');
  perform tests.eq(tests.has_badge(L, 'safety_car'), 0, 'L : pas de Safety car (toujours dernier)');
  raise notice 'Scénario 10 (Safety car) ✔';
end $$;

-- ═══ Scénario 11 : DRS n'est PAS donné pour avoir battu un FANTÔME +300 ═══
do $$
declare
  R1 uuid := 'b0000000-0000-0000-0000-000000000070'; -- 1000, 1er
  R2 uuid := 'b0000000-0000-0000-0000-000000000071'; -- 1000, 2e (rend la course « qui compte »)
  gh uuid := 'b0000000-0000-0000-0000-0000000000f0'; -- fantôme 1400 (300+ au-dessus)
  r uuid := '22227000-0000-0000-0000-000000000001';
  p1 uuid := 'cc000000-0000-0000-0000-000000000001';
  p2 uuid := 'cc000000-0000-0000-0000-000000000002';
  pg uuid := 'cc000000-0000-0000-0000-000000000003';
begin
  perform tests.mk_user(R1, 1000); perform tests.mk_user(R2, 1000);
  insert into ghost_profiles (id, display_name, elo, created_by) values (gh, 'Faux Goliath', 1400, R1);
  insert into races (id, admin_id, scheduled_at) values (r, R1, '2026-06-15 15:00:00+02');
  insert into participations (id, race_id, profile_id) values (p1, r, R1), (p2, r, R2);
  insert into participations (id, race_id, ghost_id) values (pg, r, gh);
  perform tests.call_submit(R1, r, array[p1, p2, pg]); -- R1 1er devant le fantôme +400

  perform tests.eq(tests.has_badge(R1, 'drs'), 0, 'battre un FANTÔME +400 ne donne pas DRS (adversaire non inscrit)');
  raise notice 'Scénario 11 (DRS : fantôme exclu) ✔';
end $$;

-- ═══ Scénario 12 : ANTI-TRICHE — 1 inscrit + fantômes : Elo figé, aucun badge de perf ═══
do $$
declare
  T uuid := 'b0000000-0000-0000-0000-000000000080'; -- 1000, « gagne » contre 3 fantômes
  g1 uuid := 'b0000000-0000-0000-0000-0000000000f1';
  g2 uuid := 'b0000000-0000-0000-0000-0000000000f2';
  g3 uuid := 'b0000000-0000-0000-0000-0000000000f3';
  r uuid := '22228000-0000-0000-0000-000000000001';
  pt uuid := 'cd000000-0000-0000-0000-000000000001';
  x1 uuid := 'cd000000-0000-0000-0000-000000000002';
  x2 uuid := 'cd000000-0000-0000-0000-000000000003';
  x3 uuid := 'cd000000-0000-0000-0000-000000000004';
begin
  perform tests.mk_user(T, 1000);
  insert into ghost_profiles (id, display_name, elo, created_by) values
    (g1, 'Bidon 1', 1000, T), (g2, 'Bidon 2', 1000, T), (g3, 'Bidon 3', 1000, T);
  insert into races (id, admin_id, scheduled_at) values (r, T, '2026-06-15 15:00:00+02');
  insert into participations (id, race_id, profile_id) values (pt, r, T);
  insert into participations (id, race_id, ghost_id) values (x1, r, g1), (x2, r, g2), (x3, r, g3);
  perform tests.call_submit(T, r, array[pt, x1, x2, x3]); -- T 1er contre 3 faux joueurs

  perform tests.eq((select elo from profiles where id = T), 1000, 'T : Elo INCHANGÉ (course non comptée)');
  perform tests.eq((select elo from ghost_profiles where id = g1), 1000, 'fantôme : Elo figé');
  perform tests.eq((select elo_delta from results r2 join participations p on p.id = r2.participation_id where p.profile_id = T), 0,
                   'T : Δ = 0 (aucun point volé aux fantômes)');
  perform tests.eq(tests.has_badge(T, 'kart_didentite'), 1, 'T : Kart d''identité (participation réelle)');
  perform tests.eq(tests.has_badge(T, 'champagne'), 0, 'T : PAS de Champagne (course ne compte pas)');
  perform tests.eq(tests.has_badge(T, 'push'), 0, 'T : PAS de Push (aucun Elo gagné)');
  perform tests.eq(tests.has_badge(T, 'drs'), 0, 'T : PAS de DRS (fantômes exclus)');
  raise notice 'Scénario 12 (anti-triche : farming par fantômes neutralisé) ✔';
end $$;

do $$ begin raise notice 'Tous les tests badges sont passés ✔'; end $$;

rollback;
