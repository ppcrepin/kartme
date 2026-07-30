-- Tests du lien d'amitié (A19) — décisions PO 2026-07-30 :
-- un tap à l'arrivée · lien permanent porté par l'identifiant · le même lien
-- pour les nouveaux venus et les inscrits.

begin;

create schema tests;

create function tests.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, expected, actual;
  end if;
end $$;

create function tests.eqt(actual text, expected text, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, coalesce(expected,'NULL'), coalesce(actual,'NULL');
  end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

create function tests.leve(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
    raise exception 'ÉCHEC : % (aucune exception levée)', msg;
  exception when others then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

-- I = l'invitant, N = le nouveau venu, B = un pilote qui a bloqué I,
-- S = un compte supprimé, U = un suspendu.
insert into auth.users (id, email) values
  ('fe000000-0000-0000-0000-00000000000e', 'i@t'),
  ('fe000000-0000-0000-0000-000000000001', 'n@t'),
  ('fe000000-0000-0000-0000-000000000002', 'b@t'),
  ('fe000000-0000-0000-0000-000000000003', 's@t'),
  ('fe000000-0000-0000-0000-000000000004', 'u@t');
insert into public.profiles (id, username, elo, is_private) values
  ('fe000000-0000-0000-0000-00000000000e', 'Invitant_I', 1000, true),  -- PRIVÉ exprès
  ('fe000000-0000-0000-0000-000000000001', 'Nouveau_N', 1000, false),
  ('fe000000-0000-0000-0000-000000000002', 'Bloqueur_B', 1000, false),
  ('fe000000-0000-0000-0000-000000000003', 'Parti_S', 1000, false),
  ('fe000000-0000-0000-0000-000000000004', 'Susp_U', 1000, false);
update public.profiles set deleted_at = now() where id = 'fe000000-0000-0000-0000-000000000003';
select set_config('kartsquad.moderate_suspend', '1', true);
update public.profiles set suspended_at = now() where id = 'fe000000-0000-0000-0000-000000000004';
select set_config('kartsquad.moderate_suspend', '', true);

-- ═══ Scénario 1 : le nouveau venu ouvre le lien et confirme ═══
select tests.as_uid('fe000000-0000-0000-0000-000000000001');

-- Il voit QUI l'invite — même si l'invitant est un profil PRIVÉ : il a
-- fabriqué le lien lui-même, le masquer rendrait l'invitation absurde.
select tests.eqt((select username from public.get_inviter('fe000000-0000-0000-0000-00000000000e')),
  'Invitant_I', 'l''invité voit le pseudo de l''invitant, même privé');

select tests.eqt((select public.accept_friend_invite('fe000000-0000-0000-0000-00000000000e')),
  'ok', 'le tap crée l''amitié');

-- Amitié ACCEPTÉE d'emblée, avec l'INVITANT comme demandeur (c'est lui qui a
-- lancé l'invitation) — aucune demande à valider de part ni d'autre.
select tests.eq((select count(*) from public.friendships
                 where requester_id = 'fe000000-0000-0000-0000-00000000000e'
                   and addressee_id = 'fe000000-0000-0000-0000-000000000001'
                   and status = 'accepted'), 1,
  'l''amitié est acceptée, l''invitant est le demandeur');

-- L'invitant est PRÉVENU : notify_friend ne réagit pas à un insert déjà
-- « accepted », la fonction doit donc notifier elle-même.
select tests.eq((select count(*) from public.notifications
                 where profile_id = 'fe000000-0000-0000-0000-00000000000e'
                   and type = 'friend_request'
                   and actor_id = 'fe000000-0000-0000-0000-000000000001'), 1,
  'l''invitant est notifié que son lien a fonctionné');

-- Rejouer le lien (double tap, deux onglets, lien rouvert) : pas d'erreur,
-- pas de doublon.
select tests.eqt((select public.accept_friend_invite('fe000000-0000-0000-0000-00000000000e')),
  'already', 'rejouer le lien ne casse rien et ne duplique pas');
select tests.eq((select count(*) from public.friendships
                 where (requester_id = 'fe000000-0000-0000-0000-00000000000e'
                        and addressee_id = 'fe000000-0000-0000-0000-000000000001')
                    or (requester_id = 'fe000000-0000-0000-0000-000000000001'
                        and addressee_id = 'fe000000-0000-0000-0000-00000000000e')), 1,
  'une seule relation pour la paire');

-- ═══ Scénario 2 : son propre lien ═══
select tests.as_uid('fe000000-0000-0000-0000-00000000000e');
select tests.eqt((select public.accept_friend_invite('fe000000-0000-0000-0000-00000000000e')),
  'self', 'son propre lien ne fait rien, sans erreur');
select tests.eq((select count(*) from public.get_inviter('fe000000-0000-0000-0000-00000000000e')), 0,
  'on ne s''invite pas soi-même');

-- ═══ Scénario 3 : une demande DORMANTE vaut acceptation ═══
-- N2 avait envoyé une demande à I, restée en attente ; I lui envoie son lien.
insert into auth.users (id, email) values ('fe000000-0000-0000-0000-000000000005', 'n2@t');
insert into public.profiles (id, username, elo) values
  ('fe000000-0000-0000-0000-000000000005', 'Nouveau2', 1000);
insert into public.friendships (requester_id, addressee_id, status) values
  ('fe000000-0000-0000-0000-000000000005', 'fe000000-0000-0000-0000-00000000000e', 'pending');
select tests.as_uid('fe000000-0000-0000-0000-000000000005');
select tests.eqt((select public.accept_friend_invite('fe000000-0000-0000-0000-00000000000e')),
  'ok', 'le lien accepte une demande déjà en attente, quel que soit le sens');
select tests.eq((select count(*) from public.friendships
                 where requester_id = 'fe000000-0000-0000-0000-000000000005'
                   and status = 'accepted'), 1,
  'la demande dormante passe à accepted sans créer de seconde ligne');

-- ═══ Scénario 4 : les refus ═══
-- Blocage (dans ce sens-là : B a bloqué I).
insert into public.blocks (blocker_id, blocked_id) values
  ('fe000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-00000000000e');
select tests.as_uid('fe000000-0000-0000-0000-000000000002');
select tests.eq((select count(*) from public.get_inviter('fe000000-0000-0000-0000-00000000000e')), 0,
  'un pilote bloqué ne voit même pas l''invitant');
select tests.leve(
  $$select public.accept_friend_invite('fe000000-0000-0000-0000-00000000000e')$$,
  'un blocage empêche l''amitié par lien');

-- Compte supprimé et compte suspendu : injoignables.
select tests.as_uid('fe000000-0000-0000-0000-000000000001');
select tests.leve(
  $$select public.accept_friend_invite('fe000000-0000-0000-0000-000000000003')$$,
  'le lien d''un compte supprimé est refusé');
select tests.leve(
  $$select public.accept_friend_invite('fe000000-0000-0000-0000-000000000004')$$,
  'le lien d''un compte suspendu est refusé');
select tests.eq((select count(*) from public.get_inviter('fe000000-0000-0000-0000-000000000003')), 0,
  'un compte supprimé n''est pas nommé comme invitant');

-- Identifiant inconnu (lien bricolé à la main) : refus net.
select tests.leve(
  $$select public.accept_friend_invite('fe000000-0000-0000-0000-0000000000ff')$$,
  'un identifiant inconnu est refusé');

-- ═══ Scénario 5 : plafond anti-inondation ═══
-- Le lien est permanent et déductible d'autres liens (décision PO) : sans
-- plafond, un script pourrait tenter des identifiants en masse.
do $$
declare i int; v_id uuid;
begin
  perform tests.as_uid('fe000000-0000-0000-0000-000000000001');
  for i in 1..25 loop
    v_id := ('fe000000-0000-0000-0000-0000001' || lpad(i::text, 5, '0'))::uuid;
    insert into auth.users (id, email) values (v_id, 'flood' || i || '@t');
    insert into public.profiles (id, username, elo) values (v_id, 'Flood' || i, 1000);
  end loop;
end $$;

do $$
declare i int; v_id uuid; v_ok int := 0; v_ko int := 0;
begin
  perform tests.as_uid('fe000000-0000-0000-0000-000000000001');
  for i in 1..25 loop
    v_id := ('fe000000-0000-0000-0000-0000001' || lpad(i::text, 5, '0'))::uuid;
    begin
      perform public.accept_friend_invite(v_id);
      v_ok := v_ok + 1;
    exception when others then
      v_ko := v_ko + 1;
    end;
  end loop;
  -- N avait déjà 2 amitiés de l'heure : le plafond de 20 tombe avant les 25.
  if v_ko = 0 then
    raise exception 'ÉCHEC : le plafond anti-inondation n''a jamais coupé (% acceptées)', v_ok;
  end if;
  raise notice 'Plafond : % acceptées puis % refusées ✔', v_ok, v_ko;
end $$;

do $$ begin raise notice 'Tous les tests du lien d''amitié sont passés ✔'; end $$;

rollback;
