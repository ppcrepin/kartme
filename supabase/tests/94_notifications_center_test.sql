-- Tests du centre de notifications (A5) : alimentation par les déclencheurs
-- existants, cloison entre destinataires, contenu immuable, marquage « lu »,
-- compteur plafonné, purge à la suppression de compte.

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
  ('bb000000-0000-0000-0000-00000000000c', 'c@t');
insert into public.profiles (id, username, elo) values
  ('bb000000-0000-0000-0000-00000000000a', 'Anna', 1000),
  ('bb000000-0000-0000-0000-00000000000b', 'Bruno', 1000),
  ('bb000000-0000-0000-0000-00000000000c', 'Chloé', 1000);

-- ═══ Scénario 1 : une invitation alimente la boîte du pilote invité ═══
-- Aucun déclencheur n'a été réécrit : c'est enqueue_push qui insère. Si ce
-- test passe, TOUS les événements existants alimentent la boîte.
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

-- ═══ Scénario 3 : un client ne peut ni forger ni réécrire une notification ═══
do $$
declare
  B uuid := 'bb000000-0000-0000-0000-00000000000b';
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
  denied boolean := false;
begin
  -- INSERT : aucune policy → refusé.
  perform tests.as_uid(B);
  set local role authenticated;
  begin
    insert into notifications (profile_id, type, title, body)
      values (B, 'invite', 'Faux', 'Message forgé');
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un client a inséré une notification'; end if;

  -- UPDATE : le contenu est figé, seul read_at bouge.
  perform tests.as_uid(B);
  set local role authenticated;
  update notifications set title = 'Ton compte est suspendu', body = 'Clique ici',
                           url = 'https://arnaque.example', read_at = now()
    where profile_id = B;
  reset role;
  if (select title from notifications where profile_id = B) = 'Ton compte est suspendu' then
    raise exception 'ÉCHEC : le contenu d''une notification a été réécrit par le client';
  end if;
  if (select url from notifications where profile_id = B) = 'https://arnaque.example' then
    raise exception 'ÉCHEC : la destination a été détournée par le client';
  end if;
  perform tests.eq((select count(*) from notifications where profile_id = B and read_at is not null), 1,
                   'read_at, lui, a bien été accepté');

  -- Marquer lue la notification d'un AUTRE : filtré par RLS.
  perform tests.as_uid(C);
  set local role authenticated;
  update notifications set read_at = null where profile_id = B;
  reset role;
  perform tests.eq((select count(*) from notifications where profile_id = B and read_at is not null), 1,
                   'Chloé n''a pas pu toucher la boîte de Bruno');
  raise notice 'Scénario 3 (contenu immuable, pas de forge) ✔';
end $$;

-- ═══ Scénario 4 : « tout marquer comme lu » + compteur plafonné à 100 ═══
do $$
declare
  C uuid := 'bb000000-0000-0000-0000-00000000000c';
begin
  -- 120 notifications non lues (au-delà du plafond du compteur).
  insert into notifications (profile_id, type, title, body, url)
  select C, 'result', 'Classement tombé', 'Ton Elo a bougé.', null
  from generate_series(1, 120);

  perform tests.as_uid(C);
  set local role authenticated;
  perform tests.eq(public.unread_notifications_count()::bigint, 100, 'compteur plafonné à 100 (pastille « 99+ »)');
  perform tests.eq((select count(*) from list_notifications()), 50, 'la boîte renvoie au plus 50 lignes');
  perform public.mark_notifications_read();
  perform tests.eq(public.unread_notifications_count()::bigint, 0, 'tout marqué comme lu');
  reset role;
  perform tests.eq((select count(*) from notifications where profile_id = C and read_at is null), 0,
                   'plus aucune non lue en base');
  raise notice 'Scénario 4 (marquage global, compteur plafonné) ✔';
end $$;

-- ═══ Scénario 5 : purge à 90 jours à l'ouverture de la boîte ═══
do $$
declare C uuid := 'bb000000-0000-0000-0000-00000000000c';
begin
  -- Rétrodatage : il faut passer en service_role, sinon le garde
  -- d'immuabilité restaure created_at (comportement voulu — c'est justement ce
  -- qui empêche un client de rajeunir ses notifications pour échapper à la purge).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update notifications set created_at = now() - interval '100 days'
    where profile_id = C and id in (select id from notifications where profile_id = C limit 60);
  perform tests.as_uid(C);
  set local role authenticated;
  perform (select count(*) from list_notifications());
  reset role;
  perform tests.eq((select count(*) from notifications where profile_id = C), 60,
                   'les 60 notifications de plus de 90 jours ont été purgées');
  raise notice 'Scénario 5 (rétention 90 jours) ✔';
end $$;

-- ═══ Scénario 6 : suppression de compte → boîte effacée ═══
-- Le profil est ANONYMISÉ (pas supprimé) : la cascade FK ne joue pas, la purge
-- doit être explicite dans delete_my_account.
do $$
declare B uuid := 'bb000000-0000-0000-0000-00000000000b';
begin
  perform tests.eq((select count(*) from notifications where profile_id = B), 1, 'prépa : Bruno a une notification');
  perform tests.as_uid(B);
  perform public.delete_my_account();
  perform tests.eq((select count(*) from notifications where profile_id = B), 0,
                   'boîte purgée à la suppression de compte (RGPD)');
  perform tests.eq((select count(*) from profiles where id = B), 1,
                   'le profil, lui, SURVIT (intégrité Elo des autres)');
  raise notice 'Scénario 6 (purge RGPD) ✔';
end $$;

-- ═══ Scénario 7 : pas de notification pour un compte supprimé ═══
do $$
declare
  A uuid := 'bb000000-0000-0000-0000-00000000000a';
  B uuid := 'bb000000-0000-0000-0000-00000000000b';   -- supprimé au scénario 6
  r uuid := 'bb200000-0000-0000-0000-000000000002';
begin
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (race_id, profile_id) values (r, B);
  perform tests.eq((select count(*) from notifications where profile_id = B), 0,
                   'aucune notification écrite pour un compte supprimé');
  raise notice 'Scénario 7 (destinataire supprimé ignoré) ✔';
end $$;

do $$ begin raise notice 'Tous les tests du centre de notifications sont passés ✔'; end $$;

rollback;
