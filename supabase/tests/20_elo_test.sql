-- Tests du moteur Elo (lot 1.3). Exécuté sur un vrai Postgres, transaction
-- annulée à la fin. Prérequis : bootstrap + migrations appliqués.

begin;

create schema tests;

create function tests.mk_user(p uuid, e int) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo) values (p, 'U' || substr(replace(p::text, '-', ''), 1, 6), e);
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

-- ═══ Scénario 1 : 5 joueurs à Elo égal (1000) → +16/+8/0/−8/−16 ═══
do $$
declare
  A uuid := 'e0000000-0000-0000-0000-000000000001';
  B uuid := 'e0000000-0000-0000-0000-000000000002';
  C uuid := 'e0000000-0000-0000-0000-000000000003';
  D uuid := 'e0000000-0000-0000-0000-000000000004';
  E uuid := 'e0000000-0000-0000-0000-000000000005';
  r uuid := '11110000-0000-0000-0000-000000000001';
  pa uuid := 'aa000000-0000-0000-0000-000000000001';
  pb uuid := 'aa000000-0000-0000-0000-000000000002';
  pc uuid := 'aa000000-0000-0000-0000-000000000003';
  pd uuid := 'aa000000-0000-0000-0000-000000000004';
  pe uuid := 'aa000000-0000-0000-0000-000000000005';
begin
  perform tests.mk_user(A, 1000); perform tests.mk_user(B, 1000); perform tests.mk_user(C, 1000);
  perform tests.mk_user(D, 1000); perform tests.mk_user(E, 1000);
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values
    (pa, r, A), (pb, r, B), (pc, r, C), (pd, r, D), (pe, r, E);

  perform tests.call_submit(A, r, array[pa, pb, pc, pd, pe]);

  perform tests.eq((select elo from profiles where id = A), 1016, 'A (1er) → 1016');
  perform tests.eq((select elo from profiles where id = B), 1008, 'B (2e) → 1008');
  perform tests.eq((select elo from profiles where id = C), 1000, 'C (3e) → 1000');
  perform tests.eq((select elo from profiles where id = D), 992,  'D (4e) → 992');
  perform tests.eq((select elo from profiles where id = E), 984,  'E (5e) → 984');
  perform tests.eq((select sum(elo_delta) from results where race_id = r), 0, 'somme des Δ nulle');
  perform tests.eq((select count(*) from results where race_id = r), 5, '5 résultats écrits');
  perform tests.eq((select elo_delta from results r2 join participations p on p.id = r2.participation_id where p.profile_id = A), 18 - 2, 'Δ du 1er');
  perform tests.eq((select count(*) from elo_history where race_id = r), 5, '5 lignes d''historique');
  perform tests.eq((select case when status = 'completed' then 1 else 0 end from races where id = r), 1, 'course clôturée');
  raise notice 'Scénario 1 (égalité 5 joueurs) ✔';
end $$;

-- ═══ Scénario 2 : un non-admin ne peut pas saisir ═══
do $$
declare
  denied boolean := false;
  A uuid := 'e0000000-0000-0000-0000-000000000001';
  B uuid := 'e0000000-0000-0000-0000-000000000002';
  r2 uuid := '11110000-0000-0000-0000-000000000002';
  pa uuid := 'bb000000-0000-0000-0000-000000000001';
  pb uuid := 'bb000000-0000-0000-0000-000000000002';
begin
  insert into races (id, admin_id, scheduled_at) values (r2, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r2, A), (pb, r2, B);
  begin
    perform tests.call_submit(B, r2, array[pa, pb]); -- B n'est pas l'admin
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : un non-admin a pu saisir le classement'; end if;
  raise notice 'Scénario 2 (non-admin refusé) ✔';
end $$;

-- ═══ Scénario 3 : plancher à 100 (le perdant ne descend pas sous 100) ═══
do $$
declare
  W uuid := 'e0000000-0000-0000-0000-000000000010';
  L uuid := 'e0000000-0000-0000-0000-000000000011';
  r3 uuid := '11110000-0000-0000-0000-000000000003';
  pw uuid := 'cc000000-0000-0000-0000-000000000001';
  pl uuid := 'cc000000-0000-0000-0000-000000000002';
begin
  perform tests.mk_user(W, 100); perform tests.mk_user(L, 100);
  insert into races (id, admin_id, scheduled_at) values (r3, W, now());
  insert into participations (id, race_id, profile_id) values (pw, r3, W), (pl, r3, L);
  perform tests.call_submit(W, r3, array[pw, pl]);
  perform tests.eq((select elo from profiles where id = W), 116, 'W (1er, 100) → 116');
  perform tests.eq((select elo from profiles where id = L), 100, 'L (2e, 100) reste au plancher 100');
  raise notice 'Scénario 3 (plancher) ✔';
end $$;

-- ═══ Scénario 4 : 12 joueurs égaux → somme des Δ nulle ═══
do $$
declare
  r4 uuid := '11110000-0000-0000-0000-000000000004';
  admin uuid;
  ids uuid[] := '{}';
  g int;
  uid uuid;
  paid uuid;
begin
  for g in 1..12 loop
    uid := ('d0000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    perform tests.mk_user(uid, 1000);
    if g = 1 then
      insert into races (id, admin_id, scheduled_at) values (r4, uid, now());
      admin := uid;
    end if;
    paid := ('ee000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid;
    insert into participations (id, race_id, profile_id) values (paid, r4, uid);
    ids := ids || paid;
  end loop;

  perform tests.call_submit(admin, r4, ids);
  perform tests.eq((select count(*) from results where race_id = r4), 12, '12 résultats');
  perform tests.eq((select sum(elo_delta) from results where race_id = r4), 0, 'somme des Δ nulle (12 joueurs)');
  raise notice 'Scénario 4 (12 joueurs, somme nulle) ✔';
end $$;

do $$ begin raise notice 'Tous les tests Elo sont passés ✔'; end $$;

rollback;
