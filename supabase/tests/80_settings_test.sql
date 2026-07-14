-- Tests des réglages & de la suppression RGPD (lot 2.5). Transaction annulée.

begin;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.mk_user(p uuid, e int) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p, p::text || '@t');
  insert into public.profiles (id, username, elo) values (p, 'U' || substr(replace(p::text,'-',''),1,6), e);
end $$;

create function tests.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tests.as_super() returns void language plpgsql as $$
begin reset role; end $$;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.expect_denied(p_uid uuid, p_sql text, msg text) returns void language plpgsql as $$
declare denied boolean := false;
begin
  perform tests.as_user(p_uid);
  begin execute p_sql; exception when others then denied := true; end;
  perform tests.as_super();
  if not denied then raise exception 'ÉCHEC (aurait dû être refusé) : %', msg; end if;
end $$;

create function tests.call_submit(p_uid uuid, p_race uuid, p_order uuid[]) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform public.submit_race_results(p_race, p_order);
  perform set_config('kartsquad.elo_engine', '', true);
end $$;

-- ═══ Scénario 1 : suppression RGPD — anonymise, purge le perso, garde l'Elo ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a'; -- le compte supprimé
  B uuid := '90000000-0000-0000-0000-00000000000b'; -- co-pilote (son historique doit survivre)
  X uuid := '90000000-0000-0000-0000-00000000000c'; -- un tiers (ami, bloqué…)
  r uuid := '91110000-0000-0000-0000-000000000001';
  pa uuid := '92000000-0000-0000-0000-000000000001';
  pb uuid := '92000000-0000-0000-0000-000000000002';
begin
  perform tests.mk_user(A, 1000); perform tests.mk_user(B, 1000); perform tests.mk_user(X, 1000);

  -- Données perso & sociales de A.
  insert into friendships (requester_id, addressee_id, status) values (A, X, 'accepted');
  insert into blocks (blocker_id, blocked_id) values (A, X);   -- A a bloqué X (sortant)
  insert into blocks (blocker_id, blocked_id) values (X, A);   -- X a bloqué A (ENTRANT)
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values (A, 'https://push/x', 'p', 'a');
  insert into notification_preferences (profile_id) values (A);
  insert into reports (reporter_id, reported_profile_id, category) values (A, X, 'comportement');
  -- Identité de connexion de A (e-mail + OAuth) à neutraliser.
  update auth.users set email = 'anna@perso.fr', encrypted_password = 'secret' where id = A;
  insert into auth.identities (user_id, provider) values (A, 'google');

  -- Une vraie course A vs B → participations / results / elo_history pour les deux.
  insert into races (id, admin_id, scheduled_at) values (r, A, now());
  insert into participations (id, race_id, profile_id) values (pa, r, A), (pb, r, B);
  perform tests.call_submit(A, r, array[pa, pb]);            -- A gagne ; badges pour A aussi

  -- ── Suppression du compte de A ──
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform public.delete_my_account();
  perform set_config('request.jwt.claims', '', true);

  -- Profil anonymisé (mais toujours présent).
  perform tests.eq((select count(*) from profiles where id = A), 1, 'le profil de A subsiste (anonymisé)');
  perform tests.eq((select case when username = 'Joueur supprimé' and is_private and deleted_at is not null then 1 else 0 end
                    from profiles where id = A), 1, 'A anonymisé : « Joueur supprimé », privé, deleted_at');

  -- Données perso & sociales effacées (blocages SORTANTS et ENTRANTS).
  perform tests.eq((select count(*) from friendships where requester_id = A or addressee_id = A), 0, 'amitiés de A effacées');
  perform tests.eq((select count(*) from blocks where blocker_id = A or blocked_id = A), 0, 'blocages de A (sortants + entrants) effacés');
  perform tests.eq((select count(*) from push_subscriptions where profile_id = A), 0, 'abonnements push de A effacés');
  perform tests.eq((select count(*) from notification_preferences where profile_id = A), 0, 'préférences notif de A effacées');
  perform tests.eq((select count(*) from reports where reporter_id = A), 0, 'signalements émis par A effacés');
  perform tests.eq((select count(*) from user_badges where profile_id = A), 0, 'badges de A effacés');

  -- Identité de connexion neutralisée (PII e-mail / OAuth).
  perform tests.eq((select count(*) from auth.identities where user_id = A), 0, 'identités OAuth de A supprimées');
  perform tests.eq((select case when email like 'deleted+%@kartsquad.invalid' and encrypted_password is null then 1 else 0 end
                    from auth.users where id = A), 1, 'e-mail/mot de passe de A neutralisés');

  -- Intégrité Elo : l'historique de course de A ET de B est PRÉSERVÉ.
  perform tests.eq((select count(*) from results where race_id = r), 2, 'les 2 résultats de la course subsistent');
  perform tests.eq((select count(*) from elo_history where profile_id = A), 1, 'l''historique Elo de A subsiste (anonyme)');
  perform tests.eq((select count(*) from elo_history where profile_id = B), 1, 'l''historique Elo de B intact');
  perform tests.eq((select elo from profiles where id = B), 968, 'l''Elo de B (perdant) inchangé par la suppression de A');
  raise notice 'Scénario 1 (RGPD : anonymisation + purge + intégrité Elo) ✔';
end $$;

-- ═══ Scénario 2 : un compte supprimé disparaît de la recherche / fiche pilote ═══
do $$
declare
  A uuid := '90000000-0000-0000-0000-00000000000a';
  X uuid := '90000000-0000-0000-0000-00000000000c';
  n_search bigint; n_pilot bigint;
begin
  perform tests.as_user(X);
  select count(*) into n_search from public.search_pilots('Joueur');
  select count(*) into n_pilot from public.get_pilot(A);
  perform tests.as_super();
  perform tests.eq(n_search, 0, 'compte supprimé absent de la recherche');
  perform tests.eq(n_pilot, 0, 'fiche pilote d''un compte supprimé introuvable');
  raise notice 'Scénario 2 (compte supprimé masqué) ✔';
end $$;

-- ═══ Scénario 3 : pseudo & confidentialité — self-update permis, cross-update refusé ═══
do $$
declare
  M uuid := '90000000-0000-0000-0000-00000000000d';
  N uuid := '90000000-0000-0000-0000-00000000000e';
begin
  perform tests.mk_user(M, 1000); perform tests.mk_user(N, 1000);

  -- M change son pseudo et passe en privé (UPDATE client, RLS profiles_update_self).
  perform tests.as_user(M);
  update public.profiles set username = 'Renard', is_private = true where id = M;
  perform tests.as_super();
  perform tests.eq((select case when username = 'Renard' and is_private then 1 else 0 end from profiles where id = M), 1,
                   'M a changé pseudo + confidentialité');

  -- M ne peut PAS modifier le profil de N : la RLS filtre silencieusement
  -- l'UPDATE à 0 ligne (pas d'erreur) → on vérifie que N est inchangé.
  perform tests.as_user(M);
  update public.profiles set username = 'Pirate' where id = N;
  perform tests.as_super();
  perform tests.eq((select count(*) from profiles where id = N and username = 'Pirate'), 0,
                   'M ne peut pas renommer N (RLS)');
  raise notice 'Scénario 3 (pseudo & confidentialité) ✔';
end $$;

-- ═══ Scénario 4 : déblocage — le bloqueur retire son blocage, pas celui d'un autre ═══
do $$
declare
  M uuid := '90000000-0000-0000-0000-00000000000d';
  N uuid := '90000000-0000-0000-0000-00000000000e';
begin
  -- N est un profil PRIVÉ : le SECURITY DEFINER de list_blocked doit quand même
  -- montrer son pseudo à M (sinon M ne saurait pas qui il débloque).
  update public.profiles set is_private = true where id = N;
  perform tests.as_user(M);
  insert into blocks (blocker_id, blocked_id) values (M, N);
  perform tests.eq((select count(*) from public.list_blocked() where id = N), 1, 'list_blocked montre N (même privé)');
  perform tests.as_super();

  -- N ne peut pas supprimer le blocage posé par M (RLS → 0 ligne, pas d'erreur).
  perform tests.as_user(N);
  delete from blocks where blocker_id = M;
  perform tests.as_super();
  perform tests.eq((select count(*) from blocks where blocker_id = M and blocked_id = N), 1,
                   'N ne peut pas retirer le blocage de M');
  -- M débloque N.
  perform tests.as_user(M);
  delete from blocks where blocked_id = N;
  perform tests.as_super();
  perform tests.eq((select count(*) from blocks where blocker_id = M), 0, 'M a bien débloqué N');
  raise notice 'Scénario 4 (déblocage) ✔';
end $$;

-- ═══ Scénario 5 : un compte supprimé disparaît AUSSI des classements ═══
-- (verrou : aujourd'hui l'exclusion vient de is_private + amitiés purgées ;
-- ce test la fige pour détecter toute régression future.)
do $$
declare
  P uuid := '90000000-0000-0000-0000-000000000f01'; -- sera supprimé
  Q uuid := '90000000-0000-0000-0000-000000000f02'; -- son ami, qui consulte
  r uuid := '91110000-0000-0000-0000-000000000002';
  pp uuid := '92000000-0000-0000-0000-000000000021';
  pq uuid := '92000000-0000-0000-0000-000000000022';
  n_friends bigint; n_global bigint;
begin
  perform tests.mk_user(P, 1000); perform tests.mk_user(Q, 1000);
  insert into friendships (requester_id, addressee_id, status) values (P, Q, 'accepted');
  insert into races (id, admin_id, scheduled_at) values (r, P, now());
  insert into participations (id, race_id, profile_id) values (pp, r, P), (pq, r, Q);
  perform tests.call_submit(P, r, array[pp, pq]);

  perform set_config('request.jwt.claims', json_build_object('sub', P, 'role', 'authenticated')::text, true);
  perform public.delete_my_account();
  perform set_config('request.jwt.claims', '', true);

  -- Q consulte ses classements : P (supprimé) n'y figure plus.
  perform tests.as_user(Q);
  select count(*) into n_friends from public.get_leaderboard('friends', 100, 0) where profile_id = P;
  select count(*) into n_global from public.get_leaderboard('global', 100, 0) where profile_id = P;
  perform tests.as_super();
  perform tests.eq(n_friends, 0, 'compte supprimé absent du classement Amis');
  perform tests.eq(n_global, 0, 'compte supprimé absent du classement Global');
  raise notice 'Scénario 5 (compte supprimé hors classements) ✔';
end $$;

do $$ begin raise notice 'Tous les tests réglages/RGPD sont passés ✔'; end $$;

rollback;
