-- Tests du fil d'actualité (A15) — décisions PO 2026-07-30 :
-- 5 types · amis ACCEPTÉS seulement (jamais `pending`) · rétrogradations des
-- amis ANNONCÉES, dès la première course (pas de filtre de calibration) ·
-- visibilité RÉTROACTIVE à 90 jours (accepter une amitié ouvre le passé) ·
-- invités comptés jamais nommés · rien de ce que j'ai causé moi-même.

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
    raise exception 'ÉCHEC : % (attendu %, obtenu %)', msg, coalesce(expected, 'NULL'), coalesce(actual, 'NULL');
  end if;
end $$;

create function tests.as_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

-- Moi (M), un ami accepté (A), un pilote dont la demande est seulement
-- PENDING (P), un inconnu privé (X), un ami supprimé (S) et un suspendu (U).
insert into auth.users (id, email) values
  ('fd000000-0000-0000-0000-000000000001', 'm@t'),
  ('fd000000-0000-0000-0000-00000000000a', 'a@t'),
  ('fd000000-0000-0000-0000-000000000002', 'p@t'),
  ('fd000000-0000-0000-0000-000000000003', 'x@t'),
  ('fd000000-0000-0000-0000-000000000004', 's@t'),
  ('fd000000-0000-0000-0000-000000000005', 'u@t');
insert into public.profiles (id, username, elo, is_private) values
  ('fd000000-0000-0000-0000-000000000001', 'Moi_M', 1000, false),
  ('fd000000-0000-0000-0000-00000000000a', 'Ami_A', 1000, false),
  ('fd000000-0000-0000-0000-000000000002', 'Pend_P', 1000, false),
  ('fd000000-0000-0000-0000-000000000003', 'Inconnu_X', 1000, true),
  ('fd000000-0000-0000-0000-000000000004', 'Parti_S', 1000, false),
  ('fd000000-0000-0000-0000-000000000005', 'Susp_U', 1000, false);
update public.profiles set deleted_at = now() where id = 'fd000000-0000-0000-0000-000000000004';
-- La suspension passe par le drapeau de modération : un garde-fou interdit
-- de la poser directement (elle ne doit venir que de resolve_report).
select set_config('kartsquad.moderate_suspend', '1', true);
update public.profiles set suspended_at = now() where id = 'fd000000-0000-0000-0000-000000000005';
select set_config('kartsquad.moderate_suspend', '', true);

insert into public.ghost_profiles (id, display_name, elo, created_by) values
  ('fd000000-0000-0000-0000-0000000000f1', 'Tonton Gégé', 1000, 'fd000000-0000-0000-0000-00000000000a');

insert into public.friendships (requester_id, addressee_id, status) values
  ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-00000000000a', 'accepted'),
  ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000002', 'pending'),
  ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000004', 'accepted'),
  ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000005', 'accepted');

insert into public.circuits (id, name, city, is_official, lat, lon) values
  ('fd000000-0000-0000-0000-0000000000c1', 'Circuit du Fil', 'Filville', true, 47.0, 2.0);

-- ── Courses ───────────────────────────────────────────────────────────────
-- r1 : À VENIR, créée par l'ami A                → doit apparaître.
-- r2 : À VENIR, créée par MOI                    → non (je l'ai causée).
-- r3 : À VENIR, créée par P (demande pending)    → non (pas encore ami).
-- r4 : TERMINÉE, admin A, A + X + un invité      → doit apparaître.
-- r5 : TERMINÉE, admin MOI                       → non (j'ai saisi le classement).
-- r6 : TERMINÉE, admin X (inconnu), sans ami     → non (aucun ami dedans).
-- r7 : À VENIR, créée par A, mais DÉJÀ PASSÉE    → non (plus une actualité).
-- r8 : TERMINÉE, admin S (compte supprimé), l'ami A y a couru
--      → APPARAÎT : l'acteur est L'AMI, pas l'admin (revue adversariale) —
--      la course de mon ami ne disparaît pas parce qu'un inconnu s'efface.
insert into public.races (id, admin_id, circuit_id, scheduled_at, status, completed_at, created_at) values
  ('fd000000-0000-0000-0000-0000000000e1', 'fd000000-0000-0000-0000-00000000000a',
   'fd000000-0000-0000-0000-0000000000c1', now() + interval '3 days', 'upcoming', null, now() - interval '1 hour'),
  ('fd000000-0000-0000-0000-0000000000e2', 'fd000000-0000-0000-0000-000000000001',
   'fd000000-0000-0000-0000-0000000000c1', now() + interval '4 days', 'upcoming', null, now() - interval '2 hours'),
  ('fd000000-0000-0000-0000-0000000000e3', 'fd000000-0000-0000-0000-000000000002',
   'fd000000-0000-0000-0000-0000000000c1', now() + interval '5 days', 'upcoming', null, now() - interval '3 hours'),
  ('fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-00000000000a',
   'fd000000-0000-0000-0000-0000000000c1', now() - interval '2 days', 'completed', now() - interval '2 days', now() - interval '9 days'),
  ('fd000000-0000-0000-0000-0000000000e5', 'fd000000-0000-0000-0000-000000000001',
   'fd000000-0000-0000-0000-0000000000c1', now() - interval '3 days', 'completed', now() - interval '3 days', now() - interval '9 days'),
  ('fd000000-0000-0000-0000-0000000000e6', 'fd000000-0000-0000-0000-000000000003',
   'fd000000-0000-0000-0000-0000000000c1', now() - interval '4 days', 'completed', now() - interval '4 days', now() - interval '9 days'),
  ('fd000000-0000-0000-0000-0000000000e7', 'fd000000-0000-0000-0000-00000000000a',
   'fd000000-0000-0000-0000-0000000000c1', now() - interval '1 day', 'upcoming', null, now() - interval '8 days'),
  ('fd000000-0000-0000-0000-0000000000e8', 'fd000000-0000-0000-0000-000000000004',
   'fd000000-0000-0000-0000-0000000000c1', now() - interval '5 days', 'completed', now() - interval '5 days', now() - interval '9 days');

-- r4 : l'ami A (vainqueur), l'inconnue privée X, et un invité.
insert into public.participations (id, race_id, profile_id, ghost_id) values
  ('fd000000-0000-0000-0000-0000000000b1', 'fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-00000000000a', null),
  ('fd000000-0000-0000-0000-0000000000b2', 'fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-000000000003', null),
  ('fd000000-0000-0000-0000-0000000000b3', 'fd000000-0000-0000-0000-0000000000e4', null, 'fd000000-0000-0000-0000-0000000000f1'),
  -- r6 : X et P seulement — aucun ami accepté.
  ('fd000000-0000-0000-0000-0000000000b4', 'fd000000-0000-0000-0000-0000000000e6', 'fd000000-0000-0000-0000-000000000003', null),
  ('fd000000-0000-0000-0000-0000000000b5', 'fd000000-0000-0000-0000-0000000000e6', 'fd000000-0000-0000-0000-000000000002', null),
  -- r8 : l'ami A y était, mais l'admin S est un compte supprimé.
  ('fd000000-0000-0000-0000-0000000000b6', 'fd000000-0000-0000-0000-0000000000e8', 'fd000000-0000-0000-0000-00000000000a', null);

insert into public.results (race_id, participation_id, position, elo_before, elo_after, elo_delta) values
  ('fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-0000000000b1', 1, 1000, 1016, 16),
  ('fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-0000000000b2', 2, 1000, 984, -16);

-- ── Changements de grade ──────────────────────────────────────────────────
-- h1 : l'ami A MONTE (990 → 1010, bande 2 → 3)          → apparaît.
-- h2 : l'ami A DESCEND (1010 → 990)                     → apparaît AUSSI
--      (décision PO : les chutes des amis sont annoncées).
-- h3 : MOI je descends                                  → apparaît (grade_me).
-- h4 : l'ami A change d'Elo SANS changer de bande        → n'apparaît pas.
-- h5 : l'inconnue X monte                               → n'apparaît pas.
-- h6 : l'ami A monte, mais il y a 200 jours             → hors fenêtre.
insert into public.elo_history (profile_id, race_id, elo, delta, created_at) values
  ('fd000000-0000-0000-0000-00000000000a', null, 1010, 20, now() - interval '10 hours'),
  ('fd000000-0000-0000-0000-00000000000a', null, 990, -20, now() - interval '9 hours'),
  ('fd000000-0000-0000-0000-000000000001', null, 990, -20, now() - interval '8 hours'),
  ('fd000000-0000-0000-0000-00000000000a', null, 1100, 20, now() - interval '7 hours'),
  ('fd000000-0000-0000-0000-000000000003', null, 1010, 20, now() - interval '6 hours'),
  ('fd000000-0000-0000-0000-00000000000a', null, 1010, 20, now() - interval '200 days');

-- ── Badges ───────────────────────────────────────────────────────────────
-- b1 : l'ami A débloque                → apparaît (décision PO).
-- b2 : MOI je débloque                 → n'apparaît pas (toast déjà montré).
-- b3 : l'inconnue X débloque           → n'apparaît pas.
insert into public.user_badges (profile_id, badge_key, unlocked_at) values
  ('fd000000-0000-0000-0000-00000000000a', 'champagne', now() - interval '5 hours'),
  ('fd000000-0000-0000-0000-000000000001', 'champagne', now() - interval '4 hours'),
  ('fd000000-0000-0000-0000-000000000003', 'champagne', now() - interval '3 hours');

-- ═══════════════════════ Vérifications ═══════════════════════
select tests.as_uid('fd000000-0000-0000-0000-000000000001');

-- Le compte exact du fil : r1 (à venir de A) + r4 + r8 (résultats où l'ami A
-- a couru) + h1 + h2 (montée ET chute de A) + h3 (ma chute) + b1 (badge) = 7.
select tests.eq((select count(*) from public.get_feed(null, 50)), 7,
  'le fil de M contient exactement 7 items');

select tests.eq((select count(*) from public.get_feed(null, 50) where kind = 'race_upcoming'), 1,
  'une seule course à venir (celle de l''ami, ni la mienne ni celle du pending)');
select tests.eq((select count(*) from public.get_feed(null, 50) where kind = 'race_result'), 2,
  'deux résultats : r4 et r8 (l''ami y a couru) — ni ma course, ni celle sans ami');
-- L'ACTEUR de r8 est l'ami A, jamais l'admin supprimé : c'est le correctif
-- de la revue (l'admin peut être un inconnu privé, son nom ne sort pas).
select tests.eqt((select actor_username from public.get_feed(null, 50)
                  where race_id = 'fd000000-0000-0000-0000-0000000000e8'),
  'Ami_A', 'l''acteur d''un résultat est l''ami qui a couru, pas l''admin');
select tests.eq((select count(*) from public.get_feed(null, 50) where kind = 'grade_friend'), 2,
  'DEUX changements de grade de l''ami : la montée ET la chute (décision PO)');
select tests.eq((select count(*) from public.get_feed(null, 50) where kind = 'grade_me'), 1,
  'ma propre chute de grade');
select tests.eq((select count(*) from public.get_feed(null, 50) where kind = 'badge_friend'), 1,
  'le badge de l''ami, pas le mien ni celui de l''inconnue');

-- La chute d'un ami est bien une CHUTE (bande qui descend), pas une montée
-- déguisée : la décision PO se lit dans les données, pas seulement en compte.
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where kind = 'grade_friend' and band_to < band_from), 1,
  'la chute de grade de l''ami est présente avec band_to < band_from');

-- Un pilote dont la demande d'ami est seulement PENDING n'alimente rien :
-- piège documenté, `profiles_select` ouvre le profil dès `pending`.
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id = 'fd000000-0000-0000-0000-000000000002'), 0,
  'une demande d''ami PENDING ne donne aucun item');

-- Le compte supprimé et le suspendu ne sont JAMAIS acteurs d'un item.
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id in ('fd000000-0000-0000-0000-000000000004',
                                    'fd000000-0000-0000-0000-000000000005')), 0,
  'ni le compte supprimé ni le suspendu ne sont acteurs');

-- Invités : COMPTÉS, jamais nommés. Sur r4 : 2 inscrits + 1 invité.
select tests.eq((select pilots_count from public.get_feed(null, 50)
                 where race_id = 'fd000000-0000-0000-0000-0000000000e4'), 2,
  'r4 compte 2 inscrits au compte');
select tests.eq((select guests_count from public.get_feed(null, 50)
                 where race_id = 'fd000000-0000-0000-0000-0000000000e4'), 1,
  'r4 compte 1 invité');

-- Le vainqueur est nommé parce que c'est mon ami.
select tests.eqt((select winner_username from public.get_feed(null, 50)
                  where race_id = 'fd000000-0000-0000-0000-0000000000e4'),
  'Ami_A', 'le vainqueur ami est nommé');

-- Le circuit remonte, même pour un item de course à venir.
select tests.eqt((select circuit_name from public.get_feed(null, 50) where kind = 'race_upcoming'),
  'Circuit du Fil', 'le nom du circuit accompagne la course à venir');

-- Tri décroissant par date : le plus récent d'abord (r1, créée il y a 1 h).
select tests.eqt((select kind from public.get_feed(null, 50) limit 1), 'race_upcoming',
  'le fil est trié du plus récent au plus ancien');

-- Pagination par curseur : en repartant du `at` du premier item, on obtient
-- les 6 suivants et jamais deux fois le même. (En pratique le curseur ne
-- sert plus : une page de 50 couvre toute la fenêtre de 90 jours.)
select tests.eq((select count(*) from public.get_feed(
                   (select at from public.get_feed(null, 50) limit 1), 50)), 6,
  'le curseur exclut l''item déjà reçu');

-- ── Vue d'un vainqueur PRIVÉ, non-ami : le temps du fait reste, le nom part ──
-- X (privée) gagne une course où mon ami A a couru : l'item existe, mais le
-- vainqueur n'est pas nommable pour moi.
insert into public.races (id, admin_id, circuit_id, scheduled_at, status, completed_at, created_at) values
  ('fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-00000000000a',
   'fd000000-0000-0000-0000-0000000000c1', now() - interval '6 days', 'completed', now() - interval '6 days', now() - interval '9 days');
insert into public.participations (id, race_id, profile_id) values
  ('fd000000-0000-0000-0000-0000000000b7', 'fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-000000000003'),
  ('fd000000-0000-0000-0000-0000000000b8', 'fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-00000000000a');
insert into public.results (race_id, participation_id, position, elo_before, elo_after, elo_delta) values
  ('fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-0000000000b7', 1, 1000, 1016, 16),
  ('fd000000-0000-0000-0000-0000000000e9', 'fd000000-0000-0000-0000-0000000000b8', 2, 1000, 984, -16);

select tests.eqt((select winner_username from public.get_feed(null, 50)
                  where race_id = 'fd000000-0000-0000-0000-0000000000e9'),
  null, 'un vainqueur privé non-ami n''est PAS nommé (la course reste au fil)');
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where race_id = 'fd000000-0000-0000-0000-0000000000e9'), 1,
  'la course au vainqueur privé est bien AU fil (seul le nom manque)');

-- ── Ma place et mon delta transforment un fait en enjeu ──────────────────
insert into public.participations (id, race_id, profile_id) values
  ('fd000000-0000-0000-0000-0000000000b9', 'fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-000000000001');
insert into public.results (race_id, participation_id, position, elo_before, elo_after, elo_delta) values
  ('fd000000-0000-0000-0000-0000000000e4', 'fd000000-0000-0000-0000-0000000000b9', 3, 1000, 970, -30);
select tests.eq((select my_position from public.get_feed(null, 50) where race_id = 'fd000000-0000-0000-0000-0000000000e4'),
  3, 'ma place dans la course remonte');
select tests.eq((select my_elo_delta from public.get_feed(null, 50) where race_id = 'fd000000-0000-0000-0000-0000000000e4'),
  -30, 'mon delta d''Elo remonte');

-- ── Blocage : dans les deux sens ─────────────────────────────────────────
insert into public.blocks (blocker_id, blocked_id) values
  ('fd000000-0000-0000-0000-00000000000a', 'fd000000-0000-0000-0000-000000000001');
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id = 'fd000000-0000-0000-0000-00000000000a'), 0,
  'un ami qui m''a bloqué disparaît entièrement du fil');
delete from public.blocks where blocker_id = 'fd000000-0000-0000-0000-00000000000a';

-- ── Visibilité RÉTROACTIVE (décision PO) ────────────────────────────────
-- Une amitié nouée À L'INSTANT donne accès à l'activité DÉJÀ passée. C'est le
-- choix du PO, contre la recommandation inverse : le test le fige pour qu'un
-- futur plancher de date ne soit pas ajouté par accident.
insert into public.friendships (requester_id, addressee_id, status, created_at, updated_at) values
  ('fd000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000003', 'accepted', now(), now());
-- Cinq items d'un coup : sa montée de grade, son badge, sa course r6, et les
-- courses partagées r9 ET r4 dont elle devient l'acteur (le départage « ami
-- le plus ancien sur la grille, puis identifiant » la choisit). C'est
-- l'étendue de la rétroactivité voulue par le PO.
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id = 'fd000000-0000-0000-0000-000000000003'), 5,
  'une amitié toute neuve ouvre les cinq items passés de X');
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id = 'fd000000-0000-0000-0000-000000000003'
                   and kind = 'grade_friend'), 1,
  'dont sa montée de grade, antérieure à l''amitié');
delete from public.friendships
 where requester_id = 'fd000000-0000-0000-0000-000000000001'
   and addressee_id = 'fd000000-0000-0000-0000-000000000003';

-- ── Une course CLÔTURÉE reste « à venir » au fil ────────────────────────
-- L'accueil classe les 'locked' dans « à venir » : le fil fait pareil, sinon
-- l'item s'évapore quand l'admin fige la grille.
update public.races set status = 'locked'
 where id = 'fd000000-0000-0000-0000-0000000000e1';
select tests.eq((select count(*) from public.get_feed(null, 50) where kind = 'race_upcoming'), 1,
  'une course clôturée reste au fil comme course à venir');
update public.races set status = 'upcoming'
 where id = 'fd000000-0000-0000-0000-0000000000e1';

-- ── Compteur « ça bouge » et marquage ───────────────────────────────────
-- Tout est plus récent que feed_seen_at reculé à 30 jours → 6 nouveautés.
update public.profiles set feed_seen_at = now() - interval '30 days'
 where id = 'fd000000-0000-0000-0000-000000000001';
-- Huit : les 7 du départ + la course au vainqueur privé (r9) ajoutée depuis.
select tests.eq((select public.unread_feed_count()), 8, 'huit nouveautés avant lecture');

select public.mark_feed_seen();
select tests.eq((select public.unread_feed_count()), 0, 'plus aucune nouveauté après lecture');

-- Le marquage ne revient JAMAIS en arrière (deux onglets ouverts ne doivent
-- pas faire réapparaître des nouveautés déjà vues).
update public.profiles set feed_seen_at = now() + interval '1 day'
 where id = 'fd000000-0000-0000-0000-000000000001';
select public.mark_feed_seen();
select tests.eq((select count(*) from public.profiles
                 where id = 'fd000000-0000-0000-0000-000000000001'
                   and feed_seen_at > now()), 1,
  'mark_feed_seen ne recule pas la date déjà posée');

-- ── Le fil d'un pilote SANS ami est vide, pas en erreur ─────────────────
-- Sans ami, il reste MON propre fil : ma montée de grade. C'est justement le
-- repli qui évite l'écran vide au premier jour.
select tests.as_uid('fd000000-0000-0000-0000-000000000003');
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where kind <> 'grade_me'), 0,
  'sans ami accepté, aucun item d''ami — et pas d''erreur');
select tests.eq((select count(*) from public.get_feed(null, 50)), 1,
  'il reste mon propre changement de grade');

-- ── RGPD : la suppression de compte n'a RIEN à purger ───────────────────
-- L'argument central de l'architecture en lecture. `delete_my_account`
-- anonymise sans supprimer ; comme le fil ne stocke aucune copie, le retrait
-- est rétroactif par construction. Ici : l'ami A supprime son compte, et tout
-- ce qu'il alimentait disparaît du fil de M sans qu'aucune purge n'ait été
-- écrite.
select tests.as_uid('fd000000-0000-0000-0000-000000000001');
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id = 'fd000000-0000-0000-0000-00000000000a'), 7,
  'avant suppression, l''ami A alimente 7 items');
update public.profiles set deleted_at = now()
 where id = 'fd000000-0000-0000-0000-00000000000a';
select tests.eq((select count(*) from public.get_feed(null, 50)
                 where actor_id = 'fd000000-0000-0000-0000-00000000000a'), 0,
  'après suppression, plus rien de l''ami A — sans une ligne de purge');

do $$ begin raise notice 'Tous les tests du fil d''actualité sont passés ✔'; end $$;

rollback;
