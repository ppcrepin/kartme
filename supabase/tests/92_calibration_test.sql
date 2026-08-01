-- Tests de la calibration des nouveaux (A3) : K doublé (moyenne par duel) sur
-- les 5 premières courses, compteur profiles.races protégé et maintenu par le
-- moteur (submit +1, correction neutre, suppression modération −1), badges de
-- variation (Push / Kart-astrophe) réservés aux pilotes sortis de calibration.

begin;

create schema tests;

create function tests.mk_user(p uuid, e int, r int default 0) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo, races) values
    (p, 'U' || substr(replace(p::text, '-', ''), 1, 6), e, r);
end $$;

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

-- ═══ Scénario 1 : deux nouveaux → K=128, duel équilibré = ±64 ═══
do $$
declare
  A uuid := 'ca000000-0000-0000-0000-00000000000a';
  B uuid := 'ca000000-0000-0000-0000-00000000000b';
  r uuid := 'ca200000-0000-0000-0000-000000000001';
  pa uuid := 'ca400000-0000-0000-0000-000000000011';
  pb uuid := 'ca400000-0000-0000-0000-000000000012';
begin
  perform tests.mk_user(A, 1000);   -- races = 0 → en calibration
  perform tests.mk_user(B, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.call_submit(A, r, array[pa, pb]);

  perform tests.eq((select elo from profiles where id = A), 1064, 'nouveau vainqueur : +64 (K=128)');
  perform tests.eq((select elo from profiles where id = B), 936,  'nouveau perdant : −64');
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0, 'somme nulle conservée');
  perform tests.eq((select races from profiles where id = A), 1, 'compteur races incrémenté (A)');
  perform tests.eq((select races from profiles where id = B), 1, 'compteur races incrémenté (B)');
  raise notice 'Scénario 1 (deux nouveaux, K=128) ✔';
end $$;

-- ═══ Scénario 2 : nouveau vs installé → K moyen = 96, ±48, somme nulle ═══
do $$
declare
  V uuid := 'ca000000-0000-0000-0000-00000000000c';   -- vétéran (races=100)
  N uuid := 'ca000000-0000-0000-0000-00000000000d';   -- nouveau
  r uuid := 'ca200000-0000-0000-0000-000000000002';
  pv uuid := 'ca400000-0000-0000-0000-000000000021';
  pn uuid := 'ca400000-0000-0000-0000-000000000022';
begin
  perform tests.mk_user(V, 1000, 100);
  perform tests.mk_user(N, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, V, now());
  insert into participations (id, race_id, profile_id) values (pv, r, V), (pn, r, N);
  perform tests.call_submit(V, r, array[pn, pv]);   -- le nouveau gagne

  perform tests.eq((select elo from profiles where id = N), 1048, 'nouveau vainqueur vs vétéran : +48 (K moyen 96)');
  perform tests.eq((select elo from profiles where id = V), 952,  'vétéran : −48 (échange symétrique)');
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0, 'somme nulle conservée (mixte)');
  raise notice 'Scénario 2 (mixte, K moyen 96) ✔';
end $$;

-- ═══ Scénario 3 : badges Push / Kart-astrophe muets pendant la calibration ═══
do $$
declare
  A uuid := 'ca000000-0000-0000-0000-00000000000a';   -- 1 course (scénario 1) : toujours en calibration
  B uuid := 'ca000000-0000-0000-0000-00000000000b';
  r uuid := 'ca200000-0000-0000-0000-000000000003';
  pa uuid := 'ca400000-0000-0000-0000-000000000031';
  pb uuid := 'ca400000-0000-0000-0000-000000000032';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.call_submit(A, r, array[pa, pb]);   -- ±~60 : au-delà des seuils ±45

  perform tests.eq((select abs(elo_delta) >= 45 from results rr join participations pp on pp.id = rr.participation_id
                    where rr.race_id = r and pp.profile_id = A)::int::bigint, 1, 'prépa : le delta dépasse bien ±45');
  perform tests.eq((select count(*) from user_badges where profile_id = A and badge_key = 'push'), 0,
                   'pas de badge Push en calibration');
  -- Kart-astrophe a été RETIRÉ : l'assertion garde son sens (personne ne doit
  -- l'avoir), elle ne prouve simplement plus la règle de calibration.
  perform tests.eq((select count(*) from user_badges where badge_key = 'kart_astrophe'), 0,
                   'Kart-astrophe ne tombe plus du tout');
  perform tests.eq((select count(*) from user_badges where profile_id = A and badge_key = 'champagne'), 1,
                   'Champagne (non filtré) toujours attribué');
  raise notice 'Scénario 3 (badges de variation muets en calibration) ✔';
end $$;

-- ═══ Scénario 4 : sorti de calibration, Push s'attribue à nouveau ═══
do $$
declare
  V uuid := 'ca000000-0000-0000-0000-00000000000c';   -- vétéran, 101 courses
  W uuid := 'ca000000-0000-0000-0000-00000000000e';   -- vétéran costaud
  r uuid := 'ca200000-0000-0000-0000-000000000004';
  pv uuid := 'ca400000-0000-0000-0000-000000000041';
  pw uuid := 'ca400000-0000-0000-0000-000000000042';
begin
  -- W partu très au-dessus : battre plus fort rapporte gros (> 45 avec K=64).
  perform tests.mk_user(W, 1900, 100);
  insert into races (id, admin_id, scheduled_at) values (r, V, now());
  insert into participations (id, race_id, profile_id) values (pv, r, V), (pw, r, W);
  perform tests.call_submit(V, r, array[pv, pw]);   -- V (≈952) bat W (1900)

  perform tests.eq((select count(*) from user_badges where profile_id = V and badge_key = 'push'), 1,
                   'Push attribué hors calibration');
  raise notice 'Scénario 4 (Push hors calibration) ✔';
end $$;

-- ═══ Scénario 5 : le compteur races est protégé (client) et cohérent (correction / suppression) ═══
do $$
declare
  A uuid := 'ca000000-0000-0000-0000-00000000000a';
  B uuid := 'ca000000-0000-0000-0000-00000000000b';
  M uuid := 'ca000000-0000-0000-0000-00000000000f';   -- modérateur
  r uuid := 'ca200000-0000-0000-0000-000000000005';
  pa uuid := 'ca400000-0000-0000-0000-000000000051';
  pb uuid := 'ca400000-0000-0000-0000-000000000052';
  races_avant int;
  denied boolean := false;
begin
  -- Un client ne peut pas gonfler son compteur.
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update profiles set races = 999 where id = A;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un client a modifié son compteur races'; end if;

  -- Correction 24 h : le compteur ne bouge pas (décrément + rejeu = neutre).
  select races into races_avant from profiles where id = A;
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.call_submit(A, r, array[pa, pb]);
  perform tests.eq((select races from profiles where id = A), races_avant + 1, 'submit : +1');

  -- now() est constant dans la transaction : on rétrodate l'historique des
  -- courses PRÉCÉDENTES pour que le garde « a couru depuis » ne se déclenche pas.
  update elo_history set created_at = now() - interval '2 hours' where race_id <> r;
  update races set completed_at = now() - interval '1 hour' where id = r;
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform public.correct_race_results(r, array[pb, pa]);
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq((select races from profiles where id = A), races_avant + 1, 'correction : compteur inchangé');

  -- Suppression modération : la course disparaît → −1.
  insert into auth.users (id, email) values (M, 'mod@t');
  insert into public.profiles (id, username, elo, is_moderator, races) values (M, 'Mod', 1000, true, 100);
  perform set_config('request.jwt.claims', json_build_object('sub', M, 'role', 'authenticated')::text, true);
  perform public.moderate_delete_race(r);
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq((select races from profiles where id = A), races_avant, 'suppression : −1 (retour à l''état antérieur)');
  -- elo_history est ON DELETE SET NULL : la purge doit être EXPLICITE, sinon
  -- lignes orphelines + compteur désynchronisé (M1 du vérificateur).
  perform tests.eq((select count(*) from elo_history where race_id = r or race_id is null), 0,
                   'aucune ligne d''historique orpheline après suppression');
  perform tests.eq((select count(*) from elo_history where profile_id = A),
                   (select races from profiles where id = A)::bigint,
                   'compteur races = lignes elo_history (cohérence)');
  raise notice 'Scénario 5 (compteur protégé et cohérent) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de calibration sont passés ✔'; end $$;

rollback;
