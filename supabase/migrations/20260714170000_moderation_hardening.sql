-- KartSquad — lot 3.1a : durcissement (modération à venir en 3.1b).
--
-- Trois apports (décisions PO 2026-07-14) :
--   1. Drapeau `is_moderator` sur profiles (super-admin in-app), non
--      auto-attribuable : un trigger empêche un client de se l'octroyer.
--   2. Filtre de mots interdits CÔTÉ SERVEUR (en plus du client) sur les
--      pseudos, les fantômes et les circuits → non contournable.
--   3. Garde-fous anti-spam (rate-limits) : fantômes 30/h, circuits 10/h,
--      demandes d'amis 30/h, signalements 20/j (par personne).

-- ── 1. Drapeau modérateur (non auto-attribuable) ───────────────────────────
alter table public.profiles add column if not exists is_moderator boolean not null default false;

-- Empêche un inscrit de se déclarer modérateur via un UPDATE direct (la RLS
-- profiles_update_self autorise l'écriture de sa propre ligne). Seul le
-- service_role, ou une session qui pose explicitement le drapeau ci-dessous
-- (éditeur SQL du PO), peut changer is_moderator. Même principe que guard_elo.
create or replace function public.guard_moderator() returns trigger
language plpgsql as $$
begin
  if new.is_moderator is distinct from old.is_moderator
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') <> 'service_role'
     and current_user <> 'service_role'
     and coalesce(current_setting('kartsquad.grant_moderator', true), '') <> '1' then
    raise exception 'Le statut modérateur ne peut pas être modifié directement';
  end if;
  return new;
end $$;

create trigger profiles_guard_moderator before update on public.profiles
  for each row execute function public.guard_moderator();

-- guard_moderator ne couvre que l'UPDATE ; or le profil est créé par un INSERT
-- client direct (profiles_insert_self ne filtre pas les colonnes). Sans garde à
-- l'insertion, on pourrait s'inscrire avec is_moderator=true — ET avec elo=2500
-- (même trou sur le socle anti-triche, guard_elo étant aussi update-only). On
-- FORCE donc les deux à l'insertion, sauf service_role / drapeau explicite.
create or replace function public.guard_profile_insert() returns trigger
language plpgsql as $$
declare v_priv boolean;
begin
  -- Exempté : service_role, ou un superutilisateur (migrations / seed / éditeur
  -- SQL du dashboard). Les clients (rôle authenticated) ne sont jamais superuser
  -- → le trou d'auto-attribution reste fermé côté application.
  v_priv := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') = 'service_role'
            or current_user = 'service_role'
            or coalesce((select rolsuper from pg_roles where rolname = current_user), false);
  -- Elo : jamais choisi par le client (réservé au moteur / seed).
  if new.elo is distinct from 1000 and not v_priv
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    new.elo := 1000;
  end if;
  -- Modérateur : jamais à l'inscription.
  if new.is_moderator and not v_priv
     and coalesce(current_setting('kartsquad.grant_moderator', true), '') <> '1' then
    new.is_moderator := false;
  end if;
  return new;
end $$;

create trigger profiles_guard_insert before insert on public.profiles
  for each row execute function public.guard_profile_insert();

-- ── 2. Filtre de mots interdits côté serveur ───────────────────────────────
-- Normalisation alignée sur src/lib/username.ts : minuscules, sans accents,
-- lettres/chiffres seulement (empêche les contournements simples). Sans
-- dépendance d'extension (translate des accents fréquents).
create or replace function public.kart_normalize(p text) returns text
language sql immutable as $$
  select regexp_replace(
    translate(lower(coalesce(p, '')),
      'àâäáãçéèêëíìîïñóòôöõúùûüÿ',
      'aaaaaceeeeiiiinooooouuuuy'),
    '[^a-z0-9]', '', 'g');
$$;

-- Filtre à DEUX passes (aligné avec src/lib/username.ts) :
--   · tokens longs/sans ambiguïté → sous-chaîne sur la forme collée (attrape
--     aussi les contournements espacés type « n a z i ») ;
--   · tokens courts/ambigus (con, pute, fdp, ntm) → MOT ISOLÉ seulement, pour
--     ne pas bloquer des noms légitimes (Concarneau, Concorde, député…).
create or replace function public.contains_banned_word(p text) returns boolean
language sql immutable as $$
  with folded as (
    select translate(lower(coalesce(p, '')),
             'àâäáãçéèêëíìîïñóòôöõúùûüÿ', 'aaaaaceeeeiiiinooooouuuuy') as t
  ),
  collapsed as (select regexp_replace(t, '[^a-z0-9]', '', 'g') as c from folded),
  toks as (
    select regexp_split_to_array(trim(regexp_replace(t, '[^a-z0-9]+', ' ', 'g')), ' ') as arr
    from folded
  )
  select
    exists (select 1 from unnest(array['connard','salope','encule','nazi','merde']) as w
            where (select c from collapsed) like '%' || w || '%')
    or exists (select 1 from unnest((select arr from toks)) as tok
               where tok in ('con', 'pute', 'fdp', 'ntm'));
$$;

-- Trigger générique : bloque un nom interdit à l'insertion / au renommage.
-- Une seule fonction pour trois tables : on extrait le nom via to_jsonb(new)
-- (référencer new.username directement échouerait sur une ligne circuits, qui
-- n'a pas ce champ — PL/pgSQL résout toutes les branches d'un même CASE).
-- Chaque table n'a qu'une de ces trois colonnes → coalesce non ambigu.
create or replace function public.guard_clean_name() returns trigger
language plpgsql as $$
declare v text;
begin
  v := coalesce(
    to_jsonb(new) ->> 'username',
    to_jsonb(new) ->> 'display_name',
    to_jsonb(new) ->> 'name'
  );
  if public.contains_banned_word(v) then
    raise exception 'Ce nom n''est pas autorisé.';
  end if;
  return new;
end $$;

-- `update of <col>` : ne se déclenche qu'au renommage (pas sur un update d'Elo,
-- de confidentialité, etc.) → aucun faux positif sur les lignes existantes.
create trigger profiles_clean_name before insert or update of username on public.profiles
  for each row execute function public.guard_clean_name();
create trigger ghost_clean_name before insert or update of display_name on public.ghost_profiles
  for each row execute function public.guard_clean_name();
create trigger circuits_clean_name before insert or update of name on public.circuits
  for each row execute function public.guard_clean_name();

-- ── 3. Garde-fous anti-spam (rate-limits par personne) ─────────────────────
-- SECURITY DEFINER : la fonction compte des lignes de `reports` (lecture
-- réservée à la modération, aucun droit SELECT pour authenticated) ; elle doit
-- donc s'exécuter avec les droits du propriétaire, pas de l'appelant.
create or replace function public.guard_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if tg_table_name = 'ghost_profiles' then
    select count(*) into v_count from ghost_profiles
      where created_by = new.created_by and created_at > now() - interval '1 hour';
    if v_count >= 30 then raise exception 'Trop de pilotes invités créés en une heure. Réessaie plus tard.'; end if;

  elsif tg_table_name = 'circuits' then
    select count(*) into v_count from circuits
      where created_by = new.created_by and created_at > now() - interval '1 hour';
    if v_count >= 10 then raise exception 'Trop de circuits créés en une heure. Réessaie plus tard.'; end if;

  elsif tg_table_name = 'friendships' then
    select count(*) into v_count from friendships
      where requester_id = new.requester_id and created_at > now() - interval '1 hour';
    if v_count >= 30 then raise exception 'Trop de demandes d''amis en une heure. Réessaie plus tard.'; end if;

  elsif tg_table_name = 'reports' then
    select count(*) into v_count from reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 day';
    if v_count >= 20 then raise exception 'Trop de signalements aujourd''hui. Réessaie demain.'; end if;
  end if;
  return new;
end $$;

create trigger ghost_rate_limit before insert on public.ghost_profiles
  for each row execute function public.guard_rate_limit();
create trigger circuits_rate_limit before insert on public.circuits
  for each row execute function public.guard_rate_limit();
create trigger friendships_rate_limit before insert on public.friendships
  for each row execute function public.guard_rate_limit();
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.guard_rate_limit();
