-- Tests du centre de notifications (A5) : alimentation par les déclencheurs
-- existants, cloison entre destinataires, contenu immuable, marquage ciblé,
-- anti-inondation, blocage rétroactif, purge de rétention, RGPD dans les deux
-- sens (notifications reçues ET émises), et isolation transactionnelle.

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

-- Plusieurs scénarios assertent DEPUIS le rôle « authenticated » (c'est le
-- point du test : ce que voit un vrai client). Les helpers doivent donc lui
-- être accessibles.
grant usage on schema tests to public;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email) values
  ('bb000000-0000-0000-0000-00000000000a', 'a@t'),
  ('bb000000-0000-0000-0000-00000000000b', 'b@t'),
  ('bb000000-0000-0000-0000-00000000000c', 'c@t'),
  ('bb000000-0000-0000-0000-00000000000d', 'd@t');
insert into public.profiles (id, username, elo) values
  ('bb000000-0000-0000-0000-00000000000a', 'Anna', 1000),
  ('bb000000-0000-0000-0000-00000000000b', 'Bruno', 1000),
  ('bb000000-0000-0000-0000-00000000000c', 'Chloé', 1000),
  ('bb000000-0000-0000-0000-00000000000d', 'Driss', 1000);

-- ═══ Scénario 1 : une invitation alimente la boîte, avec son ÉMETTEUR ═══
-- Aucun déclencheur n'a eu besoin de connaître la boîte : c'est enqueue_push
-- qui insère. Si ce test passe, TOUS les événements l'alimentent.
do $$
declare
  A uuid := 'bb000000-0000-0000-0000-00000000000a';
  B uuid := 'bb000000-0000-0000-0000-00000000000b';
  r uuid := 'bb200000-0000-0000-0000-000000000001';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (race_id, profile_id) values (r, A), (r, B);

  perform tests.eq((select count(*) from notifications where profile_id = B and type = 'invite'), 1,
                   'Bruno invité : une notification en boîte');
  perform tests.eq((select count(*) from notifications where profile_id = A), 0,
                   'l''admin ne se notifie pas lui-même');
  perform tests.eq((select count(*) from notifications where profile_id = B and actor_id = A), 1,
                   'l''émetteur (l''admin) est enregistré');
  if (select url from notifications where profile_id = B) <> 'race/' || r then
    raise exception 'ÉCHEC : la notification doit pointer vers la course';
  end if;
  perform tests.eq((select count(*) from notifications where profile_id = B and read_at is null), 1,
                   'notification neuve = non lue');
  raise notice 'Scénario 1 (les déclencheurs alimentent la boîte) ✔';
end $$;

-- ═══ Scénario 2 : cloison — je ne vois que ma boîte ═══
do $$
declare
  B uuid := 'bb000000-0000-0000-0000-00000000000b';
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
begin
  perform tests.as_uid(C);
  set local role authenticated;
  perform tests.eq((select count(*) from notifications), 0, 'Chloé ne voit pas la boîte de Bruno');
  perform tests.eq((select count(*) from list_notifications()), 0, 'list_notifications cloisonnée');
  perform tests.eq(public.unread_notifications_count()::bigint, 0, 'compteur cloisonné');
  reset role;

  perform tests.as_uid(B);
  set local role authenticated;
  perform tests.eq((select count(*) from list_notifications()), 1, 'Bruno voit la sienne');
  perform tests.eq(public.unread_notifications_count()::bigint, 1, 'compteur = 1');
  reset role;
  raise notice 'Scénario 2 (cloison entre destinataires) ✔';
end $$;

-- ═══ Scénario 3 : un client ne peut ni forger, ni réécrire, ni transférer ═══
do $$
declare
  B uuid := 'bb000000-0000-0000-0000-00000000000b';
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  v_id uuid;
  denied boolean := false;
begin
  select id into v_id from notifications where profile_id = B;

  -- INSERT : aucune policy et privilège révoqué → refusé.
  perform tests.as_uid(B);
  set local role authenticated;
  begin
    insert into notifications (profile_id, type, title, body)
      values (B, 'invite', 'Faux', 'Message forgé');
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un client a inséré une notification'; end if;

  -- Appel direct d'enqueue_push (forge de texte « officiel ») : refusé.
  denied := false;
  perform tests.as_uid(B);
  set local role authenticated;
  begin
    perform public.enqueue_push('invite', B, 'Compte suspendu', 'Clique ici', 'race/x', null);
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un client a pu appeler enqueue_push'; end if;

  -- UPDATE : tout est figé sauf read_at — y compris la CLÉ PRIMAIRE.
  perform tests.as_uid(B);
  set local role authenticated;
  update notifications set id = 'bbdead00-0000-0000-0000-000000000001',
                           profile_id = C,
                           title = 'Ton compte est suspendu', body = 'Clique ici',
                           url = 'https://arnaque.example',
                           created_at = now() + interval '10 years',
                           read_at = now()
    where profile_id = B;
  reset role;
  perform tests.eq((select count(*) from notifications where id = v_id), 1, 'la clé primaire est figée');
  perform tests.eq((select count(*) from notifications where profile_id = C), 0,
                   'une notification ne se transfère pas à un tiers');
  if (select title from notifications where id = v_id) = 'Ton compte est suspendu' then
    raise exception 'ÉCHEC : le contenu d''une notification a été réécrit par le client';
  end if;
  if (select url from notifications where id = v_id) = 'https://arnaque.example' then
    raise exception 'ÉCHEC : la destination a été détournée par le client';
  end if;
  if (select created_at from notifications where id = v_id) > now() then
    raise exception 'ÉCHEC : rajeunissement accepté (échappatoire à la purge)';
  end if;
  perform tests.eq((select count(*) from notifications where id = v_id and read_at is not null), 1,
                   'read_at, lui, a bien été accepté');

  -- « Lu » est irréversible : on ne remet pas une notification en gras.
  perform tests.as_uid(B);
  set local role authenticated;
  update notifications set read_at = null where id = v_id;
  reset role;
  perform tests.eq((select count(*) from notifications where id = v_id and read_at is not null), 1,
                   'read_at ne redevient pas nul');

  -- Toucher la boîte d'un AUTRE : filtré par la RLS.
  perform tests.as_uid(C);
  set local role authenticated;
  update notifications set read_at = now() where profile_id = B;
  reset role;
  raise notice 'Scénario 3 (forge, réécriture et transfert impossibles) ✔';
end $$;

-- ═══ Scénario 4 : anti-inondation — rejoindre/quitter en boucle ═══
-- Avant A5 le débordement ne produisait que des pushs éphémères ; il produit
-- désormais des lignes en base que la victime ne peut pas empêcher.
do $$
declare
  A uuid := 'bb000000-0000-0000-0000-00000000000a';
  D uuid := 'bb000000-0000-0000-0000-00000000000d';
  r uuid := 'bb200000-0000-0000-0000-000000000002';
  v_token text;
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  -- Le jeton du lien de partage : rejoindre l'exige depuis le 2026-08-01
  -- (« seul l'admin invite »). D l'a reçu une fois ; ce scénario mesure ce
  -- qu'il se passe s'il entre et ressort trente fois avec.
  select invite_token into v_token from races where id = r;
  perform tests.as_uid(D);
  for i in 1..30 loop
    perform public.join_race(r, v_token);
    delete from participations where race_id = r and profile_id = D;
  end loop;

  perform tests.eq((select count(*) from notifications where profile_id = A and actor_id = D), 1,
                   '30 aller-retours → UNE seule notification pour l''admin');
  raise notice 'Scénario 4 (anti-inondation par déduplication) ✔';
end $$;

-- ═══ Scénario 5 : marquage CIBLÉ + compteur plafonné + pagination ═══
-- Le marquage ne porte que sur les lignes affichées : la boîte n'en montre
-- que 50 alors que le compteur va à 100 — un marquage global effacerait des
-- notifications jamais vues.
do $$
declare
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  vus uuid[];
  curseur timestamptz;
begin
  -- 120 notifications distinctes (urls différentes → la déduplication ne joue pas).
  insert into notifications (profile_id, type, title, body, url, created_at)
  -- URL « pilot/… » volontairement : le scénario 7 teste la RÉTENTION, pas le
  -- nettoyage des liens de course morts (couvert séparément).
  select C, 'result', 'Classement tombé', 'Ton Elo a bougé.', 'pilot/x' || i,
         now() - (i || ' minutes')::interval
  from generate_series(1, 120) i;

  perform tests.as_uid(C);
  set local role authenticated;
  perform tests.eq(public.unread_notifications_count()::bigint, 100, 'compteur plafonné à 100 (pastille « 99+ »)');
  perform tests.eq((select count(*) from list_notifications()), 50, 'la boîte renvoie au plus 50 lignes');

  select array_agg(id), min(created_at) into vus, curseur from list_notifications();
  perform public.mark_notifications_read(vus);
  perform tests.eq(public.unread_notifications_count()::bigint, 70, 'seules les 50 AFFICHÉES sont marquées lues');

  -- Page suivante : l'historique au-delà de 50 reste atteignable.
  perform tests.eq((select count(*) from list_notifications(curseur)), 50, 'pagination : page 2');
  reset role;
  raise notice 'Scénario 5 (marquage ciblé, plafond, pagination) ✔';
end $$;

-- ═══ Scénario 6 : bloquer quelqu'un ferme AUSSI ce canal, rétroactivement ═══
do $$
declare
  A uuid := 'bb000000-0000-0000-0000-00000000000a';
  B uuid := 'bb000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_uid(B);
  set local role authenticated;
  perform tests.eq((select count(*) from list_notifications() where url like 'race/%'), 1,
                   'prépa : Bruno voit l''invitation d''Anna');
  reset role;

  insert into blocks (blocker_id, blocked_id) values (B, A);
  perform tests.as_uid(B);
  set local role authenticated;
  perform tests.eq((select count(*) from list_notifications() where url like 'race/%'), 0,
                   'Anna bloquée : sa notification disparaît de la boîte');
  reset role;
  delete from blocks where blocker_id = B;
  raise notice 'Scénario 6 (blocage rétroactif) ✔';
end $$;

-- ═══ Scénario 7 : rétention 90 jours, purge GLOBALE (comptes dormants inclus) ═══
do $$
declare C uuid := 'bb000000-0000-0000-0000-00000000000c';
begin
  update notifications set created_at = now() - interval '100 days'
    where profile_id = C and id in (select id from notifications where profile_id = C limit 60);
  perform public.purge_notifications();
  perform tests.eq((select count(*) from notifications where profile_id = C), 60,
                   'les 60 notifications de plus de 90 jours ont été purgées');
  raise notice 'Scénario 7 (rétention 90 jours) ✔';
end $$;

-- ═══ Scénario 7bis : les liens vers une course supprimée sont nettoyés ═══
-- `url` ne peut pas être une clé étrangère (elle vise une route) : sans ce
-- balai, la boîte garderait 90 jours des liens menant à un écran vide.
do $$
declare
  D uuid := 'bb000000-0000-0000-0000-00000000000d';
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  r uuid := 'bb200000-0000-0000-0000-00000000000f';
begin
  insert into races (id, admin_id, scheduled_at) values (r, D, now());
  insert into participations (race_id, profile_id) values (r, C);
  perform tests.eq((select count(*) from notifications where url = 'race/' || r), 1, 'prépa : lien vers la course');

  delete from races where id = r;
  perform public.purge_notifications();
  perform tests.eq((select count(*) from notifications where url = 'race/' || r), 0,
                   'lien mort nettoyé après suppression de la course');
  raise notice 'Scénario 7bis (liens morts) ✔';
end $$;

-- ═══ Scénario 8 : suppression de compte → boîtes REÇUES **et** ÉMISES ═══
-- Le profil est ANONYMISÉ (pas supprimé) : la cascade FK ne joue pas. Et le
-- pseudo est FIGÉ dans le corps des notifications distribuées aux autres —
-- sans purge des notifications émises, l'anonymisation serait cosmétique.
do $$
declare
  A uuid := 'bb000000-0000-0000-0000-00000000000a';
  B uuid := 'bb000000-0000-0000-0000-00000000000b';
begin
  perform tests.eq((select count(*) from notifications where body like '%Anna%'), 1,
                   'prépa : le pseudo d''Anna est figé dans la boîte de Bruno');
  perform tests.as_uid(A);
  perform public.delete_my_account();
  perform tests.eq((select count(*) from notifications where profile_id = A), 0,
                   'boîte REÇUE purgée');
  perform tests.eq((select count(*) from notifications where body like '%Anna%'), 0,
                   'notifications ÉMISES purgées : plus de PII chez les autres');
  perform tests.eq((select count(*) from profiles where id = A), 1,
                   'le profil, lui, SURVIT (intégrité Elo des autres)');
  perform tests.eq((select count(*) from notifications where profile_id = B), 0,
                   'Bruno n''a plus de trace de l''ancien pseudo');
  raise notice 'Scénario 8 (purge RGPD dans les deux sens) ✔';
end $$;

-- ═══ Scénario 9 : la boîte ne fait JAMAIS échouer l'action métier ═══
-- enqueue_push est appelée depuis des triggers AFTER INSERT : une écriture en
-- boîte qui échoue ne doit pas annuler l'inscription à la course.
do $$
declare
  D uuid := 'bb000000-0000-0000-0000-00000000000d';
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  r uuid := 'bb200000-0000-0000-0000-000000000003';
begin
  create function tests.boom() returns trigger language plpgsql as $b$
  begin raise exception 'panne simulée côté notifications'; end $b$;
  create trigger tests_boom before insert on public.notifications
    for each row execute function tests.boom();

  insert into races (id, admin_id, scheduled_at) values (r, D, now());
  insert into participations (race_id, profile_id) values (r, D), (r, C);

  perform tests.eq((select count(*) from participations where race_id = r), 2,
                   'les inscriptions survivent à une panne de la boîte');
  perform tests.eq((select count(*) from notifications where profile_id = C and url = 'race/' || r), 0,
                   '…et aucune notification n''a été écrite');
  drop trigger tests_boom on public.notifications;
  raise notice 'Scénario 9 (la boîte n''est pas sur le chemin critique) ✔';
end $$;

-- ═══ Scénario 10 : destinataire supprimé → aucune notification écrite ═══
do $$
declare
  D uuid := 'bb000000-0000-0000-0000-00000000000d';
  A uuid := 'bb000000-0000-0000-0000-00000000000a';   -- supprimée au scénario 8
  r uuid := 'bb200000-0000-0000-0000-000000000004';
begin
  insert into races (id, admin_id, scheduled_at) values (r, D, now());
  insert into participations (race_id, profile_id) values (r, A);
  perform tests.eq((select count(*) from notifications where profile_id = A), 0,
                   'aucune notification écrite pour un compte supprimé');
  raise notice 'Scénario 10 (destinataire supprimé ignoré) ✔';
end $$;

-- ═══ Scénario 11 : modération — renommer efface le pseudo abusif des boîtes ═══
do $$
declare
  D uuid := 'bb000000-0000-0000-0000-00000000000d';
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  M uuid := 'bb000000-0000-0000-0000-00000000000e';
  r uuid := 'bb200000-0000-0000-0000-000000000005';
begin
  insert into auth.users (id, email) values (M, 'mod@t');
  insert into public.profiles (id, username, elo, is_moderator) values (M, 'Mod', 1000, true);

  insert into races (id, admin_id, scheduled_at) values (r, D, now());
  insert into participations (race_id, profile_id) values (r, C);
  perform tests.eq((select count(*) from notifications where profile_id = C and actor_id = D), 1,
                   'prépa : Chloé a une notification émise par Driss');

  perform tests.as_uid(M);
  perform public.moderate_rename_pilot(D, 'Pilote 1234');
  perform tests.eq((select count(*) from notifications where actor_id = D), 0,
                   'le pseudo modéré ne survit pas dans les boîtes');
  raise notice 'Scénario 11 (modération effective jusque dans la boîte) ✔';
end $$;

-- ═══ Scénario 12 : l'URL de modération pointe vers une route qui existe ═══
do $$
declare
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  M uuid := 'bb000000-0000-0000-0000-00000000000e';
begin
  perform tests.as_uid(C);
  insert into reports (reporter_id, reported_profile_id, category)
    values (C, 'bb000000-0000-0000-0000-00000000000d', 'comportement');
  perform tests.eq((select count(*) from notifications
                    where profile_id = M and url = 'settings/moderation'), 1,
                   'signalement : lien vers settings/moderation (et non « moderation », route inexistante)');
  raise notice 'Scénario 12 (lien de modération valide) ✔';
end $$;

do $$ begin raise notice 'Tous les tests du centre de notifications sont passés ✔'; end $$;

rollback;
