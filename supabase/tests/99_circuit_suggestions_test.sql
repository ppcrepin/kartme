-- Tests du signalement de karting manquant / à corriger (demande PO 2026-07-29).

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

-- Les assertions s'exécutent aussi sous `set local role authenticated` :
-- sans ces grants, c'est « permission denied for schema tests ».
grant usage on schema tests to public;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-00000000000a', 'a@t'),
  ('ee000000-0000-0000-0000-00000000000b', 'b@t'),
  ('ee000000-0000-0000-0000-00000000000e', 'm@t');
insert into public.profiles (id, username, elo) values
  ('ee000000-0000-0000-0000-00000000000a', 'Aroa', 1000),
  ('ee000000-0000-0000-0000-00000000000b', 'Brice', 1000);
insert into public.profiles (id, username, elo, is_moderator) values
  ('ee000000-0000-0000-0000-00000000000e', 'Modo', 1000, true);

-- ═══ Scénario 1 : signaler, et le modérateur est prévenu ═══
do $$
declare
  A uuid := 'ee000000-0000-0000-0000-00000000000a';
  M uuid := 'ee000000-0000-0000-0000-00000000000e';
  v_id uuid;
begin
  perform tests.as_uid(A);
  v_id := public.suggest_circuit('manquant', 'Karting du Bocage', 'Vire');

  perform tests.eq((select count(*) from circuit_suggestions
                    where id = v_id and author_id = A and kind = 'manquant'
                      and name = 'Karting du Bocage' and city = 'Vire' and status = 'open'),
                   1, 'le signalement est enregistré au nom de son auteur');

  -- La cloche du modérateur : une notification, portant l'auteur (RGPD) et le
  -- lien vers l'écran de modération. L'auteur, lui, n'est pas notifié.
  perform tests.eq((select count(*) from notifications
                    where profile_id = M and actor_id = A
                      and url = 'settings/moderation'
                      and body like '%Karting du Bocage%'),
                   1, 'le modérateur est notifié');
  perform tests.eq((select count(*) from notifications where profile_id = A), 0,
                   'l''auteur n''est pas notifié de son propre signalement');
  raise notice 'Scénario 1 (signalement + notification) ✔';
end $$;

-- ═══ Scénario 2 : les garde-fous ═══
do $$
declare
  A uuid := 'ee000000-0000-0000-0000-00000000000a';
  refuse boolean;
  v_circuit uuid;
begin
  perform tests.as_uid(A);

  -- Mot interdit : même filtre que les pseudos et les circuits.
  refuse := false;
  begin
    perform public.suggest_circuit('manquant', 'Karting de merde', 'Nulle part');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : nom insultant accepté'; end if;

  -- Doublon : même nom (normalisé) encore ouvert chez le même auteur.
  refuse := false;
  begin
    perform public.suggest_circuit('manquant', 'KARTING du bocage', null);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : doublon accepté'; end if;

  -- Correction sans cible : le modérateur recevrait « le nom est faux » sans
  -- savoir de quoi on parle.
  refuse := false;
  begin
    perform public.suggest_circuit('ferme', 'Un karting', 'Quelque part');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : correction sans circuit acceptée'; end if;

  -- Type inconnu.
  refuse := false;
  begin
    perform public.suggest_circuit('blague', 'Un karting', null);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : type inconnu accepté'; end if;

  -- Une correction sur un circuit réel passe, et un « manquant » qui traîne un
  -- identifiant est neutralisé (le CHECK l'exige).
  select id into v_circuit from circuits limit 1;
  perform public.suggest_circuit('ferme', 'Il a fermé', null, v_circuit);
  perform public.suggest_circuit('manquant', 'Karting sans cible', null, v_circuit);
  perform tests.eq((select count(*) from circuit_suggestions
                    where name = 'Karting sans cible' and circuit_id is null), 1,
                   'un « manquant » n''emporte jamais de cible');

  -- Plafond horaire : 3 lignes posées jusqu'ici dans l'heure (les rejets ne
  -- comptent pas — ils n'ont jamais été insérés). Les 4e et 5e passent, la 6e
  -- non.
  perform public.suggest_circuit('manquant', 'Quatrième karting', null);
  perform public.suggest_circuit('manquant', 'Cinquième karting', null);
  refuse := false;
  begin
    perform public.suggest_circuit('manquant', 'Sixième karting', null);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : plafond horaire non appliqué'; end if;
  raise notice 'Scénario 2 (garde-fous) ✔';
end $$;

-- ═══ Scénario 3 : qui voit quoi ═══
do $$
declare
  A uuid := 'ee000000-0000-0000-0000-00000000000a';
  B uuid := 'ee000000-0000-0000-0000-00000000000b';
begin
  -- L'auteur voit les siens (RLS directe sur la table).
  perform tests.as_uid(A);
  set local role authenticated;
  perform tests.eq((select count(*) > 0 from circuit_suggestions where author_id = A)::int, 1,
                   'l''auteur voit ses signalements');
  reset role;

  -- Un tiers ne voit rien.
  perform tests.as_uid(B);
  set local role authenticated;
  perform tests.eq((select count(*) from circuit_suggestions), 0,
                   'un tiers ne voit aucun signalement');
  reset role;

  -- La liste de modération : tout pour le modérateur, rien pour un pilote.
  perform tests.as_uid('ee000000-0000-0000-0000-00000000000e');
  perform tests.eq((select count(*) > 3 from public.list_circuit_suggestions())::int, 1,
                   'le modérateur voit la file complète');
  perform tests.as_uid(B);
  perform tests.eq((select count(*) from public.list_circuit_suggestions()), 0,
                   'un pilote n''a pas accès à la file');
  raise notice 'Scénario 3 (visibilité) ✔';
end $$;

-- ═══ Scénario 4 : classement par la modération ═══
do $$
declare
  A uuid := 'ee000000-0000-0000-0000-00000000000a';
  B uuid := 'ee000000-0000-0000-0000-00000000000b';
  M uuid := 'ee000000-0000-0000-0000-00000000000e';
  v_id uuid;
  refuse boolean := false;
begin
  select id into v_id from circuit_suggestions where name = 'Karting du Bocage';

  -- Un pilote ne classe pas.
  perform tests.as_uid(B);
  begin
    perform public.resolve_circuit_suggestion(v_id, true);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : un pilote a classé un signalement'; end if;

  -- Le modérateur classe, et la trace dit qui.
  perform tests.as_uid(M);
  perform public.resolve_circuit_suggestion(v_id, true);
  perform tests.eq((select count(*) from circuit_suggestions
                    where id = v_id and status = 'done' and resolved_by = M
                      and resolved_at is not null), 1,
                   'classé « traité », signé et daté');

  -- Une fois classé, le même karting peut être re-signalé : la déduplication
  -- ne porte que sur les signalements ENCORE OUVERTS. On vieillit d'abord les
  -- lignes du scénario 2 (en superutilisateur), sinon c'est le plafond
  -- horaire — un AUTRE garde, déjà testé — qui répondrait à la place.
  update circuit_suggestions set created_at = now() - interval '2 hours'
   where author_id = A;
  perform tests.as_uid(A);
  perform public.suggest_circuit('manquant', 'Karting du Bocage', 'Vire');
  raise notice 'Scénario 4 (classement) ✔';
end $$;

-- ═══ Scénario 5 : RGPD — le signalement part avec son auteur ═══
do $$
declare A uuid := 'ee000000-0000-0000-0000-00000000000a';
begin
  perform tests.as_uid(A);
  perform public.delete_my_account();
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ee000000-0000-0000-0000-00000000000e', 'role', 'authenticated')::text, true);
  perform tests.eq((select count(*) from circuit_suggestions
                    where author_id = 'ee000000-0000-0000-0000-00000000000a'), 0,
                   'les signalements suivent le compte supprimé');
  raise notice 'Scénario 5 (RGPD) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de signalement de circuits sont passés ✔'; end $$;
