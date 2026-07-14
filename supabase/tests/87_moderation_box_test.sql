-- Tests de la boîte de modération (lot 3.1b) : accès réservé, actions
-- (résoudre / renommer / suspendre / supprimer course), blocage serveur des
-- comptes suspendus, push aux modérateurs.

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

update public.push_config set function_url = 'http://edge/push', hook_secret = 'shh' where id = 1;

-- M = modérateur (is_moderator posé à l'INSERT, autorisé en contexte superuser).
insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-00000000000e', 'm@t'),
  ('b0000000-0000-0000-0000-00000000000a', 'a@t'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@t');
insert into public.profiles (id, username, elo, is_moderator) values
  ('b0000000-0000-0000-0000-00000000000e', 'Mod', 1000, true);
insert into public.profiles (id, username, elo) values
  ('b0000000-0000-0000-0000-00000000000a', 'Alan', 1000),
  ('b0000000-0000-0000-0000-00000000000b', 'Bea', 1000);

-- ═══ Scénario 1 : accès réservé aux modérateurs ═══
do $$
declare
  A uuid := 'b0000000-0000-0000-0000-00000000000a';
  B uuid := 'b0000000-0000-0000-0000-00000000000b';
  rep uuid;
  denied boolean := false;
begin
  insert into reports (id, reporter_id, reported_profile_id, category)
    values (gen_random_uuid(), A, B, 'comportement') returning id into rep;

  perform tests.as_uid(A);   -- Alan n'est pas modérateur
  perform tests.eq((select count(*) from list_reports(false)), 0, 'non-modérateur : aucune ligne visible');
  begin perform public.moderate_resolve(rep, 'handled');
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : non-modérateur a pu résoudre'; end if;
  raise notice 'Scénario 1 (accès réservé) ✔';
end $$;

-- ═══ Scénario 2 : le modérateur liste, compte et résout ═══
do $$
declare
  M uuid := 'b0000000-0000-0000-0000-00000000000e';
  A uuid := 'b0000000-0000-0000-0000-00000000000a';
  B uuid := 'b0000000-0000-0000-0000-00000000000b';
  rep uuid;
begin
  perform tests.as_uid(M);
  perform tests.eq(count_open_reports()::bigint, 1, 'un signalement ouvert');
  perform tests.eq((select count(*) from list_reports(true)), 1, 'liste des ouverts');
  select id into rep from reports limit 1;
  perform public.moderate_resolve(rep, 'handled');
  perform tests.eq(count_open_reports()::bigint, 0, 'plus de signalement ouvert après résolution');
  perform tests.eq((select case when status = 'handled' and handled_by = M then 1 else 0 end from reports where id = rep), 1, 'statut + auteur du traitement');
  raise notice 'Scénario 2 (liste / compte / résolution) ✔';
end $$;

-- ═══ Scénario 3 : renommer un pilote (filtre de mots appliqué) ═══
do $$
declare
  M uuid := 'b0000000-0000-0000-0000-00000000000e';
  B uuid := 'b0000000-0000-0000-0000-00000000000b';
  denied boolean := false;
begin
  perform tests.as_uid(M);
  perform public.moderate_rename_pilot(B, 'Pilote 42');
  perform tests.eq((select case when username = 'Pilote 42' then 1 else 0 end from profiles where id = B), 1, 'pseudo renommé');
  -- Un nom interdit reste refusé (trigger clean_name).
  begin perform public.moderate_rename_pilot(B, 'connard');
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : renommage vers un mot interdit accepté'; end if;
  raise notice 'Scénario 3 (renommer) ✔';
end $$;

-- ═══ Scénario 4 : suspension → blocage serveur des écritures ═══
do $$
declare
  M uuid := 'b0000000-0000-0000-0000-00000000000e';
  B uuid := 'b0000000-0000-0000-0000-00000000000b';
  rB uuid := 'b2000000-0000-0000-0000-0000000000b1';
  denied boolean := false;
begin
  -- Course existante de B (créée AVANT suspension).
  insert into races (id, admin_id, scheduled_at) values (rB, B, now());

  perform tests.as_uid(M);
  perform public.moderate_suspend(B, true);
  perform tests.eq((select case when suspended_at is not null then 1 else 0 end from profiles where id = B), 1, 'compte suspendu');

  -- B suspendu ne peut plus éditer NI supprimer sa course existante (M1).
  perform tests.as_uid(B);
  set local role authenticated;
  begin update races set scheduled_at = now() + interval '1 day' where id = rB;
  exception when others then denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un suspendu a pu éditer une course existante'; end if;
  denied := false;
  perform tests.as_uid(B);
  set local role authenticated;
  begin delete from races where id = rB;
  exception when others then denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un suspendu a pu supprimer une course existante'; end if;

  -- B suspendu tente de créer une course → refusé par le garde serveur.
  perform tests.as_uid(B);
  set local role authenticated;
  begin insert into races (admin_id, scheduled_at) values (B, now());
  exception when others then denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un compte suspendu a pu créer une course'; end if;

  -- B suspendu tente de se dé-suspendre lui-même → refusé (B1).
  denied := false;
  perform tests.as_uid(B);
  set local role authenticated;
  begin update profiles set suspended_at = null where id = B;
  exception when others then denied := true; end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un compte suspendu a pu se dé-suspendre'; end if;
  perform tests.eq((select case when suspended_at is not null then 1 else 0 end from profiles where id = B), 1, 'B toujours suspendu');

  -- Réactivation → écriture de nouveau possible.
  perform tests.as_uid(M);
  perform public.moderate_suspend(B, false);
  perform tests.as_uid(B);
  set local role authenticated;
  insert into races (admin_id, scheduled_at) values (B, now());
  reset role;
  -- rB (créée avant suspension) + la nouvelle → 2.
  perform tests.eq((select count(*) from races where admin_id = B), 2, 'écriture rétablie après réactivation');

  -- On ne peut pas suspendre un modérateur.
  denied := false;
  perform tests.as_uid(M);
  begin perform public.moderate_suspend(M, true);
  exception when others then denied := true; end;
  if not denied then raise exception 'ÉCHEC : un modérateur a pu être suspendu'; end if;
  raise notice 'Scénario 4 (suspension / blocage serveur) ✔';
end $$;

-- ═══ Scénario 5 : push aux modérateurs à chaque signalement ═══
do $$
declare
  M uuid := 'b0000000-0000-0000-0000-00000000000e';
  A uuid := 'b0000000-0000-0000-0000-00000000000a';
  B uuid := 'b0000000-0000-0000-0000-00000000000b';
begin
  truncate net._calls;
  insert into reports (reporter_id, reported_profile_id, category) values (A, B, 'usurpation');
  perform tests.eq((select count(*) from net._calls where body ->> 'type' = 'report' and body ->> 'recipient' = M::text), 1, 'le modérateur reçoit le push');
  perform tests.eq((select count(*) from net._calls where body ->> 'type' = 'report'), 1, 'un seul push (pas le rapporteur)');
  raise notice 'Scénario 5 (push modérateur) ✔';
end $$;

-- ═══ Scénario 6 : supprimer une course signalée → Elo remis à zéro ═══
do $$
declare
  M uuid := 'b0000000-0000-0000-0000-00000000000e';
  A uuid := 'b0000000-0000-0000-0000-00000000000a';
  B uuid := 'b0000000-0000-0000-0000-00000000000b';
  r uuid := 'b2000000-0000-0000-0000-000000000061';
  pa uuid := 'b4000000-0000-0000-0000-000000000611';
  pb uuid := 'b4000000-0000-0000-0000-000000000612';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.as_uid(A);
  perform public.submit_race_results(r, array[pa, pb]);
  perform set_config('kartsquad.elo_engine', '', true);
  if (select elo from profiles where id = A) = 1000 then raise exception 'ÉCHEC prépa : Elo non bougé'; end if;

  perform tests.as_uid(M);
  perform public.moderate_delete_race(r);
  perform set_config('kartsquad.elo_engine', '', true);
  perform tests.eq((select count(*) from races where id = r), 0, 'course supprimée');
  perform tests.eq((select elo from profiles where id = A), 1000, 'Elo de A remis à zéro');
  perform tests.eq((select elo from profiles where id = B), 1000, 'Elo de B remis à zéro');
  perform tests.eq((select count(*) from elo_history where race_id = r), 0, 'historique effacé');
  raise notice 'Scénario 6 (supprimer course + Elo réversé) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de la boîte de modération sont passés ✔'; end $$;

rollback;
