-- KartSquad — C3 : on retire les badges qui punissent, et on ouvre un champ
-- libre (modéré, jamais public) sur les signalements de karting.
--
-- Décisions PO du 2026-08-01, après un test utilisateur :
--   « Les badges négatifs, on les supprime — moteur ET historique. »
--   « Champ libre sur le signalement de circuit : modéré, et jamais public. »
--
-- Trois badges disparaissent : Kart-astrophe (perdre 45 Elo), Voiture balai
-- (finir dernier), Tête-à-queue (perdre un palier de grade). Ils décrivaient
-- tous une mauvaise soirée, et l'application les affichait au même endroit,
-- dans la même vitrine, que les douze trophées à décrocher. Une vitrine où
-- l'on collectionne ses défaites n'invite personne à revenir.
--
-- L'HISTORIQUE part avec : les laisser en base sans les afficher aurait gardé
-- des lignes que plus rien n'explique, et fait mentir le compteur « %u sur %t
-- débloqués » de l'écran des badges.

begin;

-- ═══ 1. Historique ════════════════════════════════════════════════════════
-- L'ordre compte : on efface AVANT de resserrer la contrainte, sinon une ligne
-- existante la violerait et toute la migration serait annulée. (C'est le piège
-- déjà rencontré au renommage des badges de juillet.)
delete from public.user_badges
 where badge_key in ('kart_astrophe', 'voiture_balai', 'tete_a_queue');

alter table public.user_badges drop constraint if exists badge_key_valid;
alter table public.user_badges add constraint badge_key_valid check (badge_key in (
  'kart_didentite', 'habitue_stands', 'champagne', 'chapeaux_de_roues',
  'midi_moins_le_kart', 'chef_ecurie', 'drs', 'safety_car', 'push'
));

-- ═══ 2. Moteur ════════════════════════════════════════════════════════════
-- Reprise fidèle du moteur en vigueur (lot « abandons »), amputé des blocs 5,
-- 6 et 7. Rien d'autre ne bouge : la numérotation d'origine est conservée dans
-- les commentaires, pour que la comparaison avec l'ancien reste immédiate.
create or replace function public.award_badges(p_race_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  n int;             -- nombre total de participants (inscrits + fantômes)
  v_ranked boolean;  -- la course compte-t-elle pour l'Elo ?
  v_morning boolean; -- heure prévue le matin (6h–midi, Paris) ?
begin
  select count(*) into n from results where race_id = p_race_id;
  v_ranked := public.race_is_ranked(p_race_id);
  select extract(hour from scheduled_at at time zone 'Europe/Paris') between 6 and 11
    into v_morning from races where id = p_race_id;

  insert into user_badges (profile_id, badge_key, race_id)
  select b.profile_id, b.badge_key, p_race_id
  from (
    with mine as (
      select pp.profile_id, r.position, r.dnf, r.elo_before, r.elo_after, r.elo_delta
      from results r
      join participations pp on pp.id = r.participation_id
      where r.race_id = p_race_id and pp.profile_id is not null
    ),
    counted as (
      select m.*,
        (select count(*) from elo_history eh where eh.profile_id = m.profile_id) as races
      from mine m
    )
    -- 1 · Kart d'identité — 1ère course jouée
    select profile_id, 'kart_didentite' as badge_key from counted
    union all
    -- 2 · Habitué des stands — 10 courses jouées
    select profile_id, 'habitue_stands' from counted where races >= 10
    union all
    -- 3 · Champagne ! — 1ère victoire (dans une course qui compte)
    select profile_id, 'champagne' from counted where position = 1 and not dnf and v_ranked
    union all
    -- 4 · Sur les chapeaux de roues — 3 victoires d'affilée, dans des courses
    -- qui comptent, par ordre de validation (results.created_at).
    select c.profile_id, 'chapeaux_de_roues'
    from counted c
    where c.position = 1 and v_ranked
      and (
        select count(*) from (
          select r2.position
          from results r2
          join participations p2 on p2.id = r2.participation_id
          where p2.profile_id = c.profile_id and public.race_is_ranked(r2.race_id)
          order by r2.created_at desc, r2.id desc
          limit 3
        ) last3
        where last3.position = 1
      ) = 3
    -- 5 · Kart-astrophe, 6 · Voiture balai, 7 · Tête-à-queue : RETIRÉS.
    union all
    -- 8 · Midi moins le kart — participer à une course du matin (qui compte)
    select profile_id, 'midi_moins_le_kart' from counted where v_morning and v_ranked
    union all
    -- 9 · Chef d'écurie — organiser 10 courses QUI COMPTENT (anti-farming)
    select ra.admin_id, 'chef_ecurie'
    from races ra
    where ra.id = p_race_id
      and (select count(*) from races r2
           where r2.admin_id = ra.admin_id and r2.status = 'completed'
             and public.race_is_ranked(r2.id)) >= 10
    union all
    -- 10 · DRS — battre un pilote INSCRIT parti 300+ Elo au-dessus
    select c.profile_id, 'drs' from counted c
    where not c.dnf and exists (
      select 1 from results r3
      join participations p3 on p3.id = r3.participation_id
      where r3.race_id = p_race_id and p3.profile_id is not null
        and not r3.dnf
        and r3.elo_before >= c.elo_before + 300
        and c.position < r3.position
    )
    union all
    -- 11 · Safety car — finir DEVANT tous les pilotes inscrits partis avec un
    -- Elo plus élevé (il faut qu'au moins un inscrit soit au-dessus de moi).
    select c.profile_id, 'safety_car' from counted c
    where not c.dnf and exists (
      select 1 from results rh
      join participations ph on ph.id = rh.participation_id
      where rh.race_id = p_race_id and ph.profile_id is not null
        and not rh.dnf
        and rh.elo_before > c.elo_before
    )
    and not exists (
      select 1 from results rh2
      join participations ph2 on ph2.id = rh2.participation_id
      where rh2.race_id = p_race_id and ph2.profile_id is not null
        and not rh2.dnf
        and rh2.elo_before > c.elo_before
        and rh2.position < c.position   -- un mieux classé (Elo) a fini devant moi
    )
    union all
    -- 12 · Push — gagner au moins 45 Elo (hors calibration)
    select c.profile_id, 'push' from counted c
    join profiles pf on pf.id = c.profile_id
    where c.elo_delta >= 45 and pf.races > 5
  ) b
  on conflict (profile_id, badge_key) do nothing;
end;
$$;
revoke all on function public.award_badges(uuid) from public, anon, authenticated;

-- `n` n'est plus lu depuis le retrait de « Voiture balai » (seul bloc qui
-- comptait les participants). On le garde déclaré : la variable est calculée
-- d'une requête triviale, et la supprimer rendrait le diff avec le moteur
-- d'origine bien plus difficile à relire qu'il ne l'est.

-- ═══ 3. Champ libre sur les signalements de karting ═══════════════════════
-- Le lot d'origine avait délibérément REFUSÉ ce champ : « un texte ouvert est
-- une porte d'entrée pour les insultes, et le filtre de mots ne rattrape pas
-- tout ». Le test utilisateur a montré l'autre bout du problème — un nom et
-- une ville ne disent pas CE QUI cloche, et le modérateur reçoit un
-- signalement qu'il ne peut pas traiter.
--
-- L'arbitrage PO lève l'objection plutôt que de l'ignorer : le commentaire
-- n'est JAMAIS public. Il n'apparaît que dans la file de modération et pour
-- son auteur, exactement comme le reste de la ligne — les policies existantes
-- (`suggestions_select_own`, `suggestions_select_mod`) le couvrent déjà, et
-- aucune fonction publique ne le lit. S'y ajoutent les trois garde-fous du
-- lot d'origine, qu'il hérite sans qu'on ait à les réécrire : filtre de mots,
-- plafond de cinq signalements par heure, déduplication.
alter table public.circuit_suggestions
  add column if not exists comment text;

alter table public.circuit_suggestions drop constraint if exists suggestion_comment_len;
alter table public.circuit_suggestions add constraint suggestion_comment_len
  check (comment is null or char_length(comment) between 1 and 200);

-- Le trigger de garde reprend le commentaire : sans cela, le champ le plus
-- ouvert du formulaire serait le seul à ne pas passer le filtre de mots.
create or replace function public.guard_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_recent int;
begin
  new.name := trim(new.name);
  new.city := nullif(trim(coalesce(new.city, '')), '');
  -- `nullif(trim(...))` AVANT le CHECK de longueur : un commentaire fait
  -- d'espaces deviendrait sinon une chaîne vide, que le CHECK rejetterait avec
  -- une erreur Postgres brute à l'écran du pilote.
  new.comment := nullif(trim(coalesce(new.comment, '')), '');
  -- Coupé, pas rejeté : le champ est plafonné à 200 côté écran, et refuser un
  -- signalement pour deux caractères de trop ferait perdre le seul message
  -- qu'un pilote a pris la peine d'écrire.
  if new.comment is not null and char_length(new.comment) > 200 then
    new.comment := left(new.comment, 200);
  end if;

  if public.contains_banned_word(new.name)
     or public.contains_banned_word(coalesce(new.city, ''))
     or public.contains_banned_word(coalesce(new.comment, '')) then
    raise exception 'Nom ou ville non conforme';
  end if;

  -- Plafond horaire : sans lui, un pilote agacé remplit la boîte des
  -- modérateurs en trente secondes, et le vrai signalement se perd dedans.
  select count(*) into v_recent from public.circuit_suggestions
   where author_id = new.author_id and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Trop de signalements en une heure — réessaie plus tard';
  end if;

  -- Déduplication : le même karting signalé deux fois par la même personne
  -- n'apporte rien. On regarde le nom NORMALISÉ (accents, casse, ponctuation).
  if exists (
    select 1 from public.circuit_suggestions s
     where s.author_id = new.author_id
       and s.status = 'open'
       and public.kart_normalize(s.name) = public.kart_normalize(new.name)
  ) then
    raise exception 'Tu as déjà signalé ce karting — il est en attente';
  end if;

  return new;
end $$;

-- L'ancienne signature part : la garder ferait deux fonctions homonymes, et
-- PostgREST choisirait par les noms d'arguments — un appel du client sans
-- `p_comment` tomberait silencieusement sur l'ancienne, qui ignore le champ.
drop function if exists public.suggest_circuit(text, text, text, uuid);

create or replace function public.suggest_circuit(
  p_kind text, p_name text, p_city text default null,
  p_circuit_id uuid default null, p_comment text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if p_kind not in ('manquant', 'ferme', 'erreur') then
    raise exception 'Type de signalement inconnu : %', p_kind;
  end if;
  if p_kind <> 'manquant' then
    if p_circuit_id is null then
      raise exception 'Indique le karting concerné';
    end if;
    if not exists (select 1 from public.circuits c where c.id = p_circuit_id) then
      raise exception 'Fiche introuvable — elle a peut-être été retirée';
    end if;
  end if;

  insert into public.circuit_suggestions (author_id, kind, name, city, circuit_id, comment)
  values (auth.uid(), p_kind, p_name, p_city,
          case when p_kind = 'manquant' then null else p_circuit_id end,
          p_comment)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.suggest_circuit(text, text, text, uuid, text) from public, anon;
grant execute on function public.suggest_circuit(text, text, text, uuid, text) to authenticated;

-- La file de modération montre le commentaire. `drop` obligatoire : on ajoute
-- une colonne au type de retour, et `create or replace` ne sait pas le changer.
drop function if exists public.list_circuit_suggestions(boolean);
create or replace function public.list_circuit_suggestions(p_only_open boolean default true)
returns table (
  id uuid, kind text, name text, city text, comment text, status text,
  created_at timestamptz, author_id uuid, author_name text,
  circuit_id uuid, circuit_name text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.name, s.city, s.comment, s.status, s.created_at,
         s.author_id, a.username, s.circuit_id, c.name
  from public.circuit_suggestions s
  join public.profiles a on a.id = s.author_id
  left join public.circuits c on c.id = s.circuit_id
  where public.is_moderator(auth.uid())
    -- `coalesce` conservé de l'original : un `p_only_open` nul rendrait tout le
    -- prédicat NULL, donc la file vide, sans la moindre erreur.
    and (not coalesce(p_only_open, true) or s.status = 'open')
  order by s.created_at desc
  limit 200;
$$;
revoke all on function public.list_circuit_suggestions(boolean) from public, anon;
grant execute on function public.list_circuit_suggestions(boolean) to authenticated;

-- ═══ 4. « Seul l'admin invite » : une RÈGLE, pas un bouton masqué ═════════
-- Masquer la ligne « Inviter la bande » aux non-admins ne retirait AUCUNE
-- capacité, et la relecture adversariale l'a montré : le lien partagé était
-- `…/race/<id>`, c'est-à-dire l'URL de la page elle-même, lisible dans la barre
-- d'adresse de n'importe quel inscrit. `join_race` est `security definer`,
-- contourne donc la RLS, et ne vérifiait ni jeton, ni parrain, ni amitié. Un
-- inscrit copiait l'URL, l'envoyait, et le destinataire entrait — l'admin ne
-- l'apprenant qu'après coup.
--
-- La grille est le socle de l'Elo : qui la remplit décide avec qui l'on échange
-- des points. C'est une question d'intégrité, pas seulement de confort.
--
-- Deux verrous, et il faut les deux :
--   a) le JETON d'invitation cesse d'être lisible par tout le monde ;
--   b) `join_race` l'exige.

-- a) `grant select` s'applique à TOUTES les colonnes : on redescend au niveau
--    colonne pour tout sauf `invite_token`. Sans cela, un non-admin lit le
--    jeton par l'API et fabrique lui-même le lien — le verrou (b) ne servirait
--    à rien.
revoke select on public.races from authenticated, anon;
grant select (id, admin_id, circuit_id, scheduled_at, status,
              created_at, updated_at, reminded_at, completed_at)
  on public.races to authenticated;

/**
 * Le jeton d'invitation d'une course. RÉSERVÉ à son admin — c'est la seule
 * porte vers lui maintenant que la colonne n'est plus lisible.
 */
create or replace function public.race_invite_token(p_race_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_token text; v_admin uuid;
begin
  select invite_token, admin_id into v_token, v_admin from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if v_admin <> auth.uid() then
    raise exception 'Seul l''organisateur peut inviter sur cette course';
  end if;
  return v_token;
end $$;
revoke all on function public.race_invite_token(uuid) from public, anon;
grant execute on function public.race_invite_token(uuid) to authenticated;

-- b) L'ancienne signature part : la garder laisserait le trou ouvert pour un
--    client qui appelle encore à un seul argument.
drop function if exists public.join_race(uuid);

/**
 * Rejoindre une course sur invitation de son ADMIN.
 *
 * `p_token` est le jeton porté par le lien de partage. Sans lui, on ne rejoint
 * pas : c'est ce qui fait de « seul l'admin invite » une règle tenue par le
 * serveur et non un bouton caché.
 *
 * Deux exceptions, et elles ne rouvrent rien :
 *   · l'admin lui-même (il se remet sur sa propre grille depuis l'écran) ;
 *   · un pilote DÉJÀ inscrit, qui rappelle la fonction — retour silencieux,
 *     l'appel reste idempotent comme avant.
 */
create or replace function public.join_race(p_race_id uuid, p_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_status text; v_token text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  select admin_id, status, invite_token into v_admin, v_status, v_token
    from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if exists (select 1 from participations where race_id = p_race_id and profile_id = v_uid) then
    return; -- déjà inscrit : idempotent, et sans exiger de jeton
  end if;
  if v_status <> 'upcoming' then raise exception 'Les inscriptions sont closes'; end if;
  -- La comparaison est faite AVANT le blocage : un jeton faux et un blocage ne
  -- doivent pas se distinguer par leur message, sinon l'un renseigne sur
  -- l'autre. Les deux `is null` sont explicites parce qu'une comparaison avec
  -- NULL ne vaut PAS « faux » en SQL — elle vaut NULL, et la garde s'ouvrirait.
  if v_uid <> v_admin and (p_token is null or v_token is null or p_token <> v_token) then
    raise exception 'Seul l''organisateur peut inviter sur cette course';
  end if;
  if public.is_blocked(v_uid, v_admin) then
    raise exception 'Impossible de rejoindre cette course';
  end if;
  insert into participations (race_id, profile_id) values (p_race_id, v_uid);
end $$;
revoke all on function public.join_race(uuid, text) from public, anon;
grant execute on function public.join_race(uuid, text) to authenticated;

commit;
