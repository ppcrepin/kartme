-- Le BORNAGE ne crée ni ne détruit de points (dette du vérificateur, 2026-07-30).
--
-- L'arrondi à somme nulle porte sur `delta`. Mais ce n'est pas `delta` qui est
-- appliqué : c'est `clamp(elo_before + delta, 100, 2500)`. Tout l'écart entre
-- les deux est du point créé au plancher ou détruit au plafond — et c'est cet
-- écart qui est écrit dans `results.elo_delta` et `elo_history.delta`.
--
-- Ce n'est pas une coquetterie d'arrondi : la somme nulle entre inscrits est le
-- socle de l'anti-triche. Mesuré AVANT correctif : +14 points créés sur une
-- seule course à quatre dont deux au plancher.

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

-- Crée un pilote à l'Elo voulu, déjà SORTI de calibration (races = 20) pour
-- que le barème soit le K standard et les nombres lisibles.
create function tests.pilote(p uuid, pseudo text, elo int) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, pseudo || '@t');
  insert into public.profiles (id, username, elo, races) values (p, pseudo, elo, 20);
end $$;

-- Joue une course dans l'ordre donné et renvoie la SOMME des deltas
-- réellement appliqués (celle qui doit être nulle).
create function tests.somme_deltas(p_race uuid) returns bigint language sql stable as $$
  select coalesce(sum(elo_delta), 0)::bigint from public.results where race_id = p_race;
$$;

-- ═══ Scénario 1 : LE défaut — des pilotes au plancher font enfler le total ═══
-- Deux pilotes au plancher finissent derniers. Ils devraient perdre et ne le
-- peuvent pas ; leurs adversaires, eux, encaissaient quand même leurs gains.
do $$
declare
  a uuid := 'ba000000-0000-0000-0000-000000000001';
  b uuid := 'ba000000-0000-0000-0000-000000000002';
  c uuid := 'ba000000-0000-0000-0000-000000000003';
  d uuid := 'ba000000-0000-0000-0000-000000000004';
  r uuid := 'ba200000-0000-0000-0000-000000000001';
  pa uuid := 'ba400000-0000-0000-0000-000000000001';
  pb uuid := 'ba400000-0000-0000-0000-000000000002';
  pc uuid := 'ba400000-0000-0000-0000-000000000003';
  pd uuid := 'ba400000-0000-0000-0000-000000000004';
begin
  perform tests.pilote(a, 'PlancherUn', 100);
  perform tests.pilote(b, 'PlancherDeux', 100);
  perform tests.pilote(c, 'SolideUn', 1000);
  perform tests.pilote(d, 'SolideDeux', 1000);

  insert into races (id, admin_id, scheduled_at) values (r, c, now());
  insert into participations (id, race_id, profile_id) values
    (pa, r, a), (pb, r, b), (pc, r, c), (pd, r, d);
  perform tests.as_uid(c);
  perform public.submit_race_results(r, array[pc, pd, pa, pb], '{}');
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq(tests.somme_deltas(r), 0,
    'aucun point créé quand un pilote au plancher ne peut pas payer');
  -- `b`, DERNIER et déjà au plancher, devrait perdre et ne le peut pas : c'est
  -- lui la fuite. (`a`, 3ᵉ, a battu `b` : il gagne, le plancher ne le concerne
  -- pas — j'avais d'abord supposé le contraire, à tort.)
  perform tests.eq((select elo from profiles where id = b), 100,
    'le dernier, au plancher, ne descend pas');
  perform tests.eq((select elo_delta from results r2
                    join participations pp on pp.id = r2.participation_id
                    where r2.race_id = r and pp.profile_id = b), 0,
    'et son delta RÉEL est nul — c''est exactement ce qui fuyait');
  -- Personne n'est descendu sous la borne : le correctif redistribue, il ne
  -- fabrique pas d'Elo négatif.
  perform tests.eq((select count(*) from profiles
                    where id in (a, b, c, d) and (elo < 100 or elo > 2500)), 0,
    'aucun Elo hors bornes après redistribution');
  raise notice 'Scénario 1 (plancher : somme nulle préservée) ✔';
end $$;

-- ═══ Scénario 2 : même chose au PLAFOND ═══
-- Symétrique : deux pilotes à 2500 gagnent, ne peuvent pas monter, et les
-- points de leurs adversaires étaient DÉTRUITS.
do $$
declare
  a uuid := 'ba000000-0000-0000-0000-000000000011';
  b uuid := 'ba000000-0000-0000-0000-000000000012';
  c uuid := 'ba000000-0000-0000-0000-000000000013';
  d uuid := 'ba000000-0000-0000-0000-000000000014';
  r uuid := 'ba200000-0000-0000-0000-000000000002';
  pa uuid := 'ba400000-0000-0000-0000-000000000011';
  pb uuid := 'ba400000-0000-0000-0000-000000000012';
  pc uuid := 'ba400000-0000-0000-0000-000000000013';
  pd uuid := 'ba400000-0000-0000-0000-000000000014';
begin
  perform tests.pilote(a, 'PlafondUn', 2500);
  perform tests.pilote(b, 'PlafondDeux', 2500);
  perform tests.pilote(c, 'MilieuUn', 1500);
  perform tests.pilote(d, 'MilieuDeux', 1500);

  insert into races (id, admin_id, scheduled_at) values (r, a, now());
  insert into participations (id, race_id, profile_id) values
    (pa, r, a), (pb, r, b), (pc, r, c), (pd, r, d);
  perform tests.as_uid(a);
  perform public.submit_race_results(r, array[pa, pb, pc, pd], '{}');
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq(tests.somme_deltas(r), 0,
    'aucun point détruit quand deux pilotes au plafond ne peuvent pas encaisser');
  perform tests.eq((select elo from profiles where id = a), 2500, 'le plafond tient');
  raise notice 'Scénario 2 (plafond : somme nulle préservée) ✔';
end $$;

-- ═══ Scénario 3 : la règle NE gèle PAS un plateau entier au plancher ═══
-- Un premier correctif, strictement à somme nulle, annulait le gain du
-- vainqueur dès que le perdant ne pouvait pas payer — et gelait donc à vie un
-- groupe entièrement au plancher. La règle retenue épargne ceux qui sont déjà
-- collés à une borne : ils ne portent pas la correction.
do $$
declare
  w uuid := 'ba000000-0000-0000-0000-000000000021';
  l uuid := 'ba000000-0000-0000-0000-000000000022';
  r uuid := 'ba200000-0000-0000-0000-000000000003';
  pw uuid := 'ba400000-0000-0000-0000-000000000021';
  pl uuid := 'ba400000-0000-0000-0000-000000000022';
begin
  perform tests.pilote(w, 'VainqueurBas', 100);
  perform tests.pilote(l, 'PerdantBas', 100);
  insert into races (id, admin_id, scheduled_at) values (r, w, now());
  insert into participations (id, race_id, profile_id) values (pw, r, w), (pl, r, l);
  perform tests.as_uid(w);
  perform public.submit_race_results(r, array[pw, pl], '{}');
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq((select elo from profiles where id = w), 132,
    'au plancher, le vainqueur GAGNE quand même — sinon le groupe serait gelé à vie');
  perform tests.eq((select elo from profiles where id = l), 100, 'et le perdant reste au plancher');
  raise notice 'Scénario 3 (un groupe au plancher peut remonter) ✔';
end $$;

-- ═══ Scénario 4 : hors des bornes, RIEN ne change ═══
-- Le correctif ne doit pas exister pour les 99,9 % de courses ordinaires.
do $$
declare
  a uuid := 'ba000000-0000-0000-0000-000000000031';
  b uuid := 'ba000000-0000-0000-0000-000000000032';
  c uuid := 'ba000000-0000-0000-0000-000000000033';
  r uuid := 'ba200000-0000-0000-0000-000000000004';
  pa uuid := 'ba400000-0000-0000-0000-000000000031';
  pb uuid := 'ba400000-0000-0000-0000-000000000032';
  pc uuid := 'ba400000-0000-0000-0000-000000000033';
begin
  perform tests.pilote(a, 'NormalUn', 1200);
  perform tests.pilote(b, 'NormalDeux', 1000);
  perform tests.pilote(c, 'NormalTrois', 800);
  insert into races (id, admin_id, scheduled_at) values (r, a, now());
  insert into participations (id, race_id, profile_id) values (pa, r, a), (pb, r, b), (pc, r, c);
  perform tests.as_uid(a);
  perform public.submit_race_results(r, array[pc, pb, pa], '{}');
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq(tests.somme_deltas(r), 0, 'course ordinaire : somme nulle, comme toujours');
  -- Le dernier a bien perdu, le premier a bien gagné : le correctif ne s'est
  -- pas invité là où il n'avait rien à faire.
  perform tests.eq((select case when elo > 800 then 1 else 0 end from profiles where id = c), 1,
    'le vainqueur gagne réellement des points');
  perform tests.eq((select case when elo < 1200 then 1 else 0 end from profiles where id = a), 1,
    'le dernier en perd réellement');
  raise notice 'Scénario 4 (course ordinaire intacte) ✔';
end $$;

-- ═══ Scénario 5 : plancher ET abandons ═══
-- Les deux mécaniques se combinent : la redistribution des abandons (leur gain
-- est plafonné à 0, le surplus revient aux arrivants) puis celle du bornage.
do $$
declare
  a uuid := 'ba000000-0000-0000-0000-000000000041';
  b uuid := 'ba000000-0000-0000-0000-000000000042';
  c uuid := 'ba000000-0000-0000-0000-000000000043';
  d uuid := 'ba000000-0000-0000-0000-000000000044';
  r uuid := 'ba200000-0000-0000-0000-000000000005';
  pa uuid := 'ba400000-0000-0000-0000-000000000041';
  pb uuid := 'ba400000-0000-0000-0000-000000000042';
  pc uuid := 'ba400000-0000-0000-0000-000000000043';
  pd uuid := 'ba400000-0000-0000-0000-000000000044';
begin
  perform tests.pilote(a, 'AbandonBas', 100);
  perform tests.pilote(b, 'AbandonBasDeux', 100);
  perform tests.pilote(c, 'ArriveUn', 1400);
  perform tests.pilote(d, 'ArriveDeux', 1400);
  insert into races (id, admin_id, scheduled_at) values (r, c, now());
  insert into participations (id, race_id, profile_id) values
    (pa, r, a), (pb, r, b), (pc, r, c), (pd, r, d);
  perform tests.as_uid(c);
  perform public.submit_race_results(r, array[pc, pd, pa, pb], array[pa, pb]);
  perform set_config('kartsquad.elo_engine', '', true);

  perform tests.eq(tests.somme_deltas(r), 0,
    'plancher + abandons : la somme reste nulle');
  raise notice 'Scénario 5 (plancher + abandons) ✔';
end $$;

-- ═══ Scénario 6 : la CORRECTION à 24 h hérite du correctif ═══
-- `correct_race_results` rembobine puis rappelle le moteur : elle ne devait pas
-- avoir besoin d'être retouchée, et ce test le prouve plutôt que de le supposer.
do $$
declare
  a uuid := 'ba000000-0000-0000-0000-000000000051';
  b uuid := 'ba000000-0000-0000-0000-000000000052';
  c uuid := 'ba000000-0000-0000-0000-000000000053';
  r uuid := 'ba200000-0000-0000-0000-000000000006';
  pa uuid := 'ba400000-0000-0000-0000-000000000051';
  pb uuid := 'ba400000-0000-0000-0000-000000000052';
  pc uuid := 'ba400000-0000-0000-0000-000000000053';
begin
  perform tests.pilote(a, 'CorrigeBas', 100);
  perform tests.pilote(b, 'CorrigeMilieu', 1000);
  perform tests.pilote(c, 'CorrigeHaut', 1000);
  insert into races (id, admin_id, scheduled_at) values (r, b, now());
  insert into participations (id, race_id, profile_id) values (pa, r, a), (pb, r, b), (pc, r, c);
  perform tests.as_uid(b);
  perform public.submit_race_results(r, array[pb, pc, pa], '{}');
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq(tests.somme_deltas(r), 0, 'somme nulle à la saisie');

  -- On corrige l'ordre : le résultat doit rester à somme nulle.
  perform tests.as_uid(b);
  perform public.correct_race_results(r, array[pc, pb, pa], '{}');
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq(tests.somme_deltas(r), 0, 'somme nulle APRÈS correction');
  raise notice 'Scénario 6 (correction 24 h) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de bornage sont passés ✔'; end $$;

rollback;
