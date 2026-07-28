-- Tests de la photo de profil (A7) — partie SQL.
--
-- Les policies de `storage.objects` ne sont PAS couvertes ici : le schéma
-- storage n'existe que sur Supabase et le harnais ne l'émule pas. Ce qui est
-- testé, c'est tout le reste : propriété du chemin, retrait par la modération,
-- purge RGPD, exposition du chemin dans les fiches pilote.

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

insert into auth.users (id, email) values
  ('ff000000-0000-0000-0000-00000000000a', 'a@t'),
  ('ff000000-0000-0000-0000-00000000000b', 'b@t'),
  ('ff000000-0000-0000-0000-00000000000e', 'm@t');
insert into public.profiles (id, username, elo) values
  ('ff000000-0000-0000-0000-00000000000a', 'Alia', 1000),
  ('ff000000-0000-0000-0000-00000000000b', 'Bilal', 1000);
insert into public.profiles (id, username, elo, is_moderator) values
  ('ff000000-0000-0000-0000-00000000000e', 'Mod', 1000, true);

-- ═══ Scénario 1 : on n'écrit que dans SON dossier ═══
-- Sans ce garde, n'importe qui pointerait avatar_path vers le fichier d'un
-- autre pilote — donc afficherait sa photo sous son propre pseudo.
do $$
declare
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
  denied boolean := false;
begin
  perform tests.as_uid(A);
  set local role authenticated;
  update profiles set avatar_path = A::text || '/photo1.jpg' where id = A;
  reset role;
  perform tests.eq((select count(*) from profiles where id = A and avatar_path is not null), 1,
                   'Alia enregistre sa propre photo');

  -- Le dossier d'un autre : refusé.
  perform tests.as_uid(A);
  set local role authenticated;
  begin
    update profiles set avatar_path = B::text || '/vole.jpg' where id = A;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : chemin hors du dossier accepté'; end if;

  -- Un chemin sans dossier du tout : refusé aussi.
  denied := false;
  perform tests.as_uid(A);
  set local role authenticated;
  begin
    update profiles set avatar_path = 'photo.jpg' where id = A;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : chemin sans dossier accepté'; end if;

  -- Retirer sa photo reste libre.
  perform tests.as_uid(A);
  set local role authenticated;
  update profiles set avatar_path = null where id = A;
  update profiles set avatar_path = A::text || '/photo1.jpg' where id = A;
  reset role;
  raise notice 'Scénario 1 (propriété du chemin) ✔';
end $$;

-- ═══ Scénario 1bis : les exploits trouvés par le Reviewer ═══
do $$
declare
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  V uuid := 'ff000000-0000-0000-0000-000000000099';
  denied boolean := false;
begin
  -- Traversée « .. » : le chemin commence bien par MON identifiant, donc un
  -- contrôle de préfixe l'acceptait — et il retournait la policy de lecture
  -- contre elle-même (c'est MA visibilité qui aurait été évaluée).
  perform tests.as_uid(B);
  set local role authenticated;
  begin
    update profiles set avatar_path = B::text || '/../' || A::text || '/vol.jpg' where id = B;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : traversée « .. » acceptée'; end if;

  -- INSERT : le profil est créé par un INSERT client direct, qu'un garde
  -- BEFORE UPDATE ne voit jamais. Le chemin d'autrui doit être NEUTRALISÉ.
  insert into auth.users (id, email) values (V, 'v@t');
  perform tests.as_uid(V);
  set local role authenticated;
  insert into public.profiles (id, username, elo, avatar_path, terms_accepted_at, terms_version)
    values (V, 'Voleur', 1000, A::text || '/photo1.jpg', now(), 1);
  reset role;
  perform tests.eq((select count(*) from profiles where id = V and avatar_path is null), 1,
                   'chemin d''autrui neutralisé à l''inscription');
  raise notice 'Scénario 1bis (usurpation et traversée) ✔';
end $$;

-- ═══ Scénario 1ter : le prédicat de lecture suit EXACTEMENT le profil ═══
-- La policy est la seule barrière entre une photo privée et le reste du monde,
-- et le harnais n'a pas de schéma storage : c'est pour ça que le prédicat vit
-- dans une fonction.
do $$
declare
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
  M uuid := 'ff000000-0000-0000-0000-00000000000e';
  chemin text;
begin
  perform tests.as_uid(A);
  set local role authenticated;
  update profiles set avatar_path = A::text || '/pub.jpg' where id = A;
  reset role;
  chemin := A::text || '/pub.jpg';

  -- Profil public : visible de tous.
  perform tests.as_uid(B);
  if not public.can_read_avatar(chemin) then raise exception 'ÉCHEC : photo publique illisible'; end if;

  -- Profil privé non-ami : masqué, comme get_pilot.
  update profiles set is_private = true where id = A;
  perform tests.as_uid(B);
  if public.can_read_avatar(chemin) then raise exception 'ÉCHEC : photo d''un profil privé lisible par un non-ami'; end if;
  -- …mais la modération doit pouvoir la voir, sinon elle retire à l'aveugle.
  perform tests.as_uid(M);
  if not public.can_read_avatar(chemin) then raise exception 'ÉCHEC : la modération ne voit pas la photo signalée'; end if;
  update profiles set is_private = false where id = A;

  -- Compte SUSPENDU : get_pilot l'exclut, la photo doit suivre.
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = A;
  perform set_config('kartsquad.moderate_suspend', '', true);
  perform tests.as_uid(B);
  if public.can_read_avatar(chemin) then raise exception 'ÉCHEC : photo d''un compte suspendu encore lisible'; end if;
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = null where id = A;
  perform set_config('kartsquad.moderate_suspend', '', true);

  -- Bloqué : rien.
  insert into blocks (blocker_id, blocked_id) values (B, A);
  perform tests.as_uid(B);
  if public.can_read_avatar(chemin) then raise exception 'ÉCHEC : photo d''un pilote bloqué lisible'; end if;
  delete from blocks where blocker_id = B;

  -- Chemin qui n'est plus celui du profil : illisible, même pour son auteur.
  perform tests.as_uid(A);
  if public.can_read_avatar(A::text || '/ancienne.jpg') then
    raise exception 'ÉCHEC : une photo remplacée reste lisible';
  end if;
  raise notice 'Scénario 1ter (lecture alignée sur le profil) ✔';
end $$;

-- ═══ Scénario 1quater : le fichier remplacé part en file de suppression ═══
do $$
declare A uuid := 'ff000000-0000-0000-0000-00000000000a';
begin
  perform tests.as_uid(A);
  set local role authenticated;
  update profiles set avatar_path = A::text || '/nouvelle.jpg' where id = A;
  reset role;
  perform tests.eq((select count(*) from avatar_gc where path = A::text || '/pub.jpg'), 1,
                   'l''ancien fichier est mis en file de suppression');
  raise notice 'Scénario 1quater (ramasse-miettes) ✔';
end $$;

-- ═══ Scénario 2 : la modération retire une photo ═══
do $$
declare
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
  M uuid := 'ff000000-0000-0000-0000-00000000000e';
  denied boolean := false;
begin
  -- Un pilote ordinaire ne modère pas.
  perform tests.as_uid(B);
  begin
    perform public.moderate_remove_avatar(A);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : un non-modérateur a retiré une photo'; end if;

  perform tests.as_uid(M);
  perform public.moderate_remove_avatar(A);
  perform tests.eq((select count(*) from profiles where id = A and avatar_path is null), 1,
                   'le modérateur a retiré la photo');

  -- La sanction TIENT : sans ça, le pilote reposait le même chemin dans la
  -- seconde et la modération de photo ne servait à rien.
  denied := false;
  perform tests.as_uid(A);
  set local role authenticated;
  begin
    update profiles set avatar_path = A::text || '/photo1.jpg' where id = A;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : le pilote a reposé sa photo après sanction'; end if;

  -- Un identifiant inconnu ne doit pas passer pour un succès.
  denied := false;
  perform tests.as_uid(M);
  begin
    perform public.moderate_remove_avatar('ff000000-0000-0000-0000-0000000000ff');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ÉCHEC : pilote inexistant accepté en silence'; end if;

  -- Et elle se lève (erreur de modération, photo corrigée hors ligne).
  perform tests.as_uid(M);
  perform public.moderate_allow_avatar(A);
  perform tests.as_uid(A);
  set local role authenticated;
  update profiles set avatar_path = A::text || '/photo1.jpg' where id = A;
  reset role;
  perform tests.eq((select count(*) from profiles where id = A and avatar_path is not null), 1,
                   'sanction levée : le pilote peut remettre une photo');
  raise notice 'Scénario 2 (retrait persistant et levable) ✔';
end $$;

-- ═══ Scénario 3 : une photo se signale ═══
do $$
declare
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_uid(B);
  insert into reports (reporter_id, reported_profile_id, category) values (B, A, 'photo');
  perform tests.eq((select count(*) from reports where category = 'photo'), 1,
                   'catégorie « photo » acceptée');
  raise notice 'Scénario 3 (signalement d''une photo) ✔';
end $$;

-- ═══ Scénario 4 : le chemin est exposé aux écrans, pas la photo ═══
-- Le chemin seul ne donne accès à rien (il faut un lien signé, soumis à la
-- policy de lecture) : le renvoyer permet de demander tous les liens d'un
-- écran en UNE fois au lieu d'un par pilote.
do $$
declare
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_uid(A);
  set local role authenticated;
  update profiles set avatar_path = A::text || '/photo2.jpg' where id = A;
  reset role;

  perform tests.as_uid(B);
  perform tests.eq((select count(*) from get_pilot(A) where avatar_path is not null), 1,
                   'get_pilot renvoie le chemin');
  perform tests.eq((select count(*) from search_pilots('Alia') where avatar_path is not null), 1,
                   'search_pilots renvoie le chemin');
  raise notice 'Scénario 4 (chemin exposé) ✔';
end $$;

-- ═══ Scénario 4bis : le classement porte la photo (A7b) ═══
-- Le grief PO : « j'ajoute une photo mais dans le classement je ne la vois
-- pas ». Le classement est justement l'écran où l'on parcourt le plus de
-- monde ; sans le chemin, le client n'a rien à signer.
do $$
declare
  A uuid := 'ff000000-0000-0000-0000-00000000000a';
  B uuid := 'ff000000-0000-0000-0000-00000000000b';
begin
  perform tests.as_uid(B);
  set local role authenticated;
  update profiles set avatar_path = B::text || '/photo3.jpg' where id = B;
  reset role;
  -- Un pilote n'entre au classement qu'avec au moins une course jouée.
  insert into elo_history (profile_id, elo, delta) values (A, 1000, 0), (B, 1000, 0);

  -- Aucune amitié A–B à ce stade : B ne sort en Global QUE parce qu'il est
  -- public. L'assertion perdrait son sens si un scénario amont les liait, d'où
  -- la vérification explicite.
  perform tests.eq((select count(*) from friendships
                    where (requester_id, addressee_id) in ((A, B), (B, A))), 0,
                   'préalable : A et B ne sont pas amis');

  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global')
                    where profile_id = B and avatar_path = B::text || '/photo3.jpg'),
                   1, 'get_leaderboard renvoie le chemin');

  -- Portée « Amis » : c'est celle par défaut de l'écran, donc celle que le PO
  -- voit en premier. Un non-ami n'y figure pas, un ami y figure AVEC sa photo.
  perform tests.eq((select count(*) from get_leaderboard('friends') where profile_id = B), 0,
                   'portée amis : un non-ami ne figure pas');
  insert into friendships (requester_id, addressee_id, status) values (A, B, 'accepted');
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('friends')
                    where profile_id = B and avatar_path is not null),
                   1, 'portée amis : un ami figure avec sa photo');

  -- Et il reste sous la même clause de visibilité que le reste de la ligne :
  -- un profil privé non-ami ne figure pas au classement du tout, donc son
  -- chemin n'en sort pas non plus.
  delete from friendships where requester_id = A and addressee_id = B;
  update profiles set is_private = true where id = B;
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global') where profile_id = B), 0,
                   'profil privé non-ami : ni ligne ni chemin');
  update profiles set is_private = false where id = B;

  -- Bloqué : ni ligne ni chemin, dans les deux sens (is_blocked est
  -- symétrique — sinon bloquer quelqu'un le laisserait dans mon classement).
  insert into blocks (blocker_id, blocked_id) values (A, B);
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global') where profile_id = B), 0,
                   'pilote que j''ai bloqué : hors classement');
  delete from blocks where blocker_id = A and blocked_id = B;
  insert into blocks (blocker_id, blocked_id) values (B, A);
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global') where profile_id = B), 0,
                   'pilote qui m''a bloqué : hors classement');
  delete from blocks where blocker_id = B and blocked_id = A;

  -- Suspendu : le classement ne l'a JAMAIS filtré (comportement du lot 2.2,
  -- inchangé ici). On fige donc l'état réel — la ligne sort, le chemin aussi,
  -- mais can_read_avatar refusera de le signer : l'écran montre les initiales.
  -- Le jour où l'on voudra sortir les suspendus du classement, ce test dira
  -- exactement ce qui change.
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = now() where id = B;
  perform set_config('kartsquad.moderate_suspend', '', true);
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global') where profile_id = B), 1,
                   'suspendu : encore au classement (comportement historique)');
  if public.can_read_avatar(B::text || '/photo3.jpg') then
    raise exception 'ÉCHEC : la photo d''un suspendu serait signée';
  end if;
  perform set_config('kartsquad.moderate_suspend', '1', true);
  update profiles set suspended_at = null where id = B;
  perform set_config('kartsquad.moderate_suspend', '', true);

  -- Fantômes : la règle anti-triche du 2026-07-13 les sort du Global. Ce lot
  -- rouvre la fonction, c'est ici la régression la plus coûteuse.
  insert into ghost_profiles (id, display_name, elo, created_by)
    values ('ff000000-0000-0000-0000-0000000000f1', 'Fantôme', 1400, A);
  insert into elo_history (ghost_id, elo, delta)
    values ('ff000000-0000-0000-0000-0000000000f1', 1400, 0);
  perform tests.as_uid(A);
  perform tests.eq((select count(*) from get_leaderboard('global') where ghost_id is not null), 0,
                   'fantômes toujours hors du classement Global');
  delete from elo_history where ghost_id = 'ff000000-0000-0000-0000-0000000000f1';
  delete from ghost_profiles where id = 'ff000000-0000-0000-0000-0000000000f1';

  delete from elo_history where profile_id in (A, B);
  update profiles set avatar_path = null where id = B;
  raise notice 'Scénario 4bis (photo au classement) ✔';
end $$;

-- ═══ Scénario 5 : RGPD — la photo part avec le compte, et n'y revient pas ═══
do $$
declare A uuid := 'ff000000-0000-0000-0000-00000000000a'; denied boolean := false;
begin
  perform tests.as_uid(A);
  perform public.delete_my_account();
  perform tests.eq((select count(*) from profiles where id = A and avatar_path is null), 1,
                   'photo effacée à la suppression de compte');

  -- Le jeton reste valide un moment après la suppression : sans garde, le
  -- compte supprimé reposait une photo, et le second appel de purge ne la
  -- voyait plus (sa clause excluait les lignes déjà supprimées).
  perform tests.as_uid(A);
  set local role authenticated;
  begin
    update profiles set avatar_path = A::text || '/revenant.jpg' where id = A;
  exception when others then denied := true;
  end;
  reset role;
  if not denied then raise exception 'ÉCHEC : un compte supprimé a reposé une photo'; end if;
  perform tests.eq((select count(*) from profiles where id = A), 1,
                   'le profil, lui, SURVIT (intégrité Elo des autres)');
  raise notice 'Scénario 5 (purge RGPD) ✔';
end $$;

do $$ begin raise notice 'Tous les tests de photo de profil sont passés ✔'; end $$;

rollback;
