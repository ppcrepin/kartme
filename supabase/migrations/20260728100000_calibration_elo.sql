-- KartSquad — A3 : calibration des nouveaux joueurs (retour beta, 2026-07-28).
--
-- Problème : un nouveau démarre à 1000 et converge lentement (K=64) → il reste
-- des semaines « Rookie · 1000 » au milieu de pilotes installés, et le
-- classement paraît faux.
--
-- Solution (inspirée du barème de KartMe/Maggie — débutant 40 / standard 20,
-- soit un facteur ×2) : pendant ses 5 PREMIÈRES courses, un pilote est « en
-- calibration » et son K double (128 au lieu de 64). Le K appliqué à chaque
-- DUEL est la MOYENNE des K des deux pilotes → l'échange reste parfaitement
-- SYMÉTRIQUE, donc la somme des deltas entre inscrits reste NULLE : l'invariant
-- anti-triche et la FAQ (« à somme nulle entre inscrits ») restent vrais.
--   · nouveau vs nouveau  : K=128 → ±64 sur un duel équilibré
--   · nouveau vs installé : K=96  → le nouveau converge vite, le vétéran
--     assume un peu de volatilité face à un adversaire au niveau inconnu
--   · installé vs installé : K=64 → rien ne change.
-- Un nouveau atteint sa zone de niveau en 3-4 courses au lieu de ~20.
--
-- Support : compteur dénormalisé `profiles.races` (nombre de courses jouées =
-- lignes elo_history), maintenu par le moteur, protégé comme l'Elo. Il sert au
-- barème ET à l'affichage « En calibration ».
--
-- Badges : pendant la calibration les gros écarts sont NORMAUX → les badges de
-- variation « Push » (Δ ≥ +45) et « Kart-astrophe » (Δ ≤ −45) ne s'attribuent
-- qu'aux pilotes SORTIS de calibration (sinon tout premier vainqueur les
-- décrocherait mécaniquement, diluant leur valeur).

-- ── 1. Compteur de courses ─────────────────────────────────────────────────
alter table public.profiles add column if not exists races integer not null default 0;

-- Backfill depuis l'historique (guard_elo ne surveille pas encore cette colonne).
update public.profiles p
set races = c.n
from (select profile_id, count(*)::int as n from public.elo_history
      where profile_id is not null group by profile_id) c
where c.profile_id = p.id;

-- ── 2. Protection : races n'est modifiable que par le moteur ───────────────
-- guard_elo est partagé profiles/ghost_profiles → accès au champ via to_jsonb
-- (ghost_profiles n'a pas de colonne races ; ->> renvoie null des deux côtés).
create or replace function public.guard_elo()
returns trigger language plpgsql as $$
begin
  if (new.elo is distinct from old.elo
      or (to_jsonb(new) ->> 'races') is distinct from (to_jsonb(old) ->> 'races'))
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') <> 'service_role'
     and current_user <> 'service_role'
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    raise exception 'Elo non modifiable directement (réservé au moteur Elo)';
  end if;
  return new;
end;
$$;

-- À l'insertion d'un profil : jamais de compteur choisi par le client.
create or replace function public.guard_profile_insert() returns trigger
language plpgsql as $$
declare v_priv boolean;
begin
  v_priv := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') = 'service_role'
            or current_user = 'service_role'
            or coalesce((select rolsuper from pg_roles where rolname = current_user), false);
  -- Elo : jamais choisi par le client (réservé au moteur / seed).
  if new.elo is distinct from 1000 and not v_priv
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    new.elo := 1000;
  end if;
  -- Compteur de courses : toujours 0 à l'inscription côté client.
  if new.races is distinct from 0 and not v_priv
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    new.races := 0;
  end if;
  -- Modérateur : jamais à l'inscription.
  if new.is_moderator and not v_priv
     and coalesce(current_setting('kartsquad.grant_moderator', true), '') <> '1' then
    new.is_moderator := false;
  end if;
  -- Consentement obligatoire (RGPD) : pas de profil client sans acceptation
  -- horodatée ET versionnée (preuve de la version acceptée).
  if (new.terms_accepted_at is null or new.terms_version is null) and not v_priv then
    raise exception 'Consentement aux conditions requis pour créer un compte';
  end if;
  return new;
end $$;

-- ── 3. Moteur : K par paire (moyenne), calibration ×2 sur 5 courses ────────
-- (Reprise fidèle de la fonction du lot 2.6 ; changements : barème K par duel
--  + incrément du compteur races.)
create or replace function public.submit_race_results(p_race_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid;
  v_status text;
  n int;
  n_reg int;                          -- comptes inscrits dans la course
  K_STD constant numeric := 64;       -- pilote installé
  K_CAL constant numeric := 128;      -- pilote en calibration (< CAL_RACES courses)
  CAL_RACES constant int := 5;
  DIV constant numeric := 800;
begin
  select admin_id, status into v_admin, v_status from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then
    raise exception 'Seul l''admin peut saisir le classement';
  end if;
  if v_status not in ('upcoming', 'locked') then raise exception 'Classement déjà saisi'; end if;

  n := array_length(p_order, 1);
  if n is null or n < 2 then raise exception 'Il faut au moins 2 pilotes'; end if;

  if (select count(*) from participations where race_id = p_race_id) <> n
     or exists (
       select 1 from unnest(p_order) as o(id)
       where not exists (select 1 from participations pp where pp.id = o.id and pp.race_id = p_race_id)
     ) then
    raise exception 'Classement invalide (pilotes incohérents)';
  end if;

  create temp table _calc on commit drop as
  select ord.rank::int as rank, pp.id as participation_id, pp.profile_id, pp.ghost_id,
         coalesce(pr.elo, gh.elo) as elo_before,
         -- K du pilote : double pendant la calibration (races = courses DÉJÀ jouées).
         case when pr.id is null then null
              when pr.races < CAL_RACES then K_CAL
              else K_STD end as k
  from unnest(p_order) with ordinality as ord(pid, rank)
  join participations pp on pp.id = ord.pid
  left join profiles pr on pr.id = pp.profile_id
  left join ghost_profiles gh on gh.id = pp.ghost_id;

  select count(*) into n_reg from _calc where profile_id is not null;

  -- Contribution brute : seuls les DUELS entre inscrits comptent (fantômes
  -- figés). K appliqué à un duel = MOYENNE des K des deux pilotes → échange
  -- symétrique par duel → somme GLOBALE nulle conservée.
  create temp table _raw on commit drop as
  select a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before,
    case when a.profile_id is null or n_reg < 2 then 0
    else (1.0 / (n_reg - 1)) * sum(
           ((a.k + b.k) / 2.0) *
           ((case when a.rank < b.rank then 1 else 0 end)
            - 1.0 / (1 + power(10, (b.elo_before - a.elo_before) / DIV)))
         ) filter (where b.profile_id is not null)
    end as raw
  from _calc a join _calc b on a.participation_id <> b.participation_id
  group by a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before, a.k;

  -- Arrondi à somme nulle (plus grand reste) UNIQUEMENT sur les inscrits ;
  -- les fantômes reçoivent delta 0.
  create temp table _delta on commit drop as
  with r as (
    select participation_id, profile_id, ghost_id, rank, elo_before, raw,
           round(raw)::int as base, (round(raw) - raw) as up_err
    from _raw where profile_id is not null
  ),
  resid as (select coalesce(sum(base), 0)::int as s from r),
  ranked as (
    select r.*,
      row_number() over (order by up_err desc, elo_before asc, participation_id) as rn_up,
      row_number() over (order by up_err asc, elo_before asc, participation_id) as rn_down
    from r
  )
  select participation_id, profile_id, ghost_id, rank, elo_before,
    base
      - (case when (select s from resid) > 0 and rn_up <= (select s from resid) then 1 else 0 end)
      + (case when (select s from resid) < 0 and rn_down <= -(select s from resid) then 1 else 0 end)
      as delta
  from ranked
  union all
  select participation_id, profile_id, ghost_id, rank, elo_before, 0 as delta
  from _raw where profile_id is null;

  perform set_config('kartsquad.elo_engine', '1', true);

  update profiles p set elo = greatest(100, least(2500, d.elo_before + d.delta))
  from _delta d where d.profile_id = p.id;

  update ghost_profiles g set elo = greatest(100, least(2500, d.elo_before + d.delta))
  from _delta d where d.ghost_id = g.id;

  insert into results (race_id, participation_id, position, elo_before, elo_after, elo_delta)
  select p_race_id, d.participation_id, d.rank, d.elo_before,
         greatest(100, least(2500, d.elo_before + d.delta)),
         greatest(100, least(2500, d.elo_before + d.delta)) - d.elo_before
  from _delta d;

  insert into elo_history (profile_id, ghost_id, race_id, elo, delta)
  select d.profile_id, d.ghost_id, p_race_id,
         greatest(100, least(2500, d.elo_before + d.delta)),
         greatest(100, least(2500, d.elo_before + d.delta)) - d.elo_before
  from _delta d;

  -- Compteur de courses : +1 par inscrit (aligné sur elo_history).
  update profiles p set races = p.races + 1
  from _delta d where d.profile_id = p.id;

  -- completed_at ancré à la PREMIÈRE validation (coalesce) : une correction qui
  -- rejoue cette fonction ne redémarre pas la fenêtre 24 h.
  update races set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_race_id;

  drop table _calc;
  drop table _raw;
  drop table _delta;

  perform public.award_badges(p_race_id);
end;
$$;

-- ── 4. Correction 24 h : décrémenter races avant le rejeu ──────────────────
-- (Reprise fidèle de la version « temps au tour préservés » + décrément : le
--  rejeu via submit ré-incrémente → sans décrément, chaque correction
--  gonflerait le compteur.)
create or replace function public.correct_race_results(p_race_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid; v_status text; v_completed timestamptz; v_ref timestamptz;
begin
  select admin_id, status, completed_at into v_admin, v_status, v_completed
    from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then raise exception 'Seul l''admin peut corriger'; end if;
  if v_status <> 'completed' then raise exception 'Course non terminée'; end if;
  if v_completed is null or now() >= v_completed + interval '24 hours' then
    raise exception 'Fenêtre de correction expirée (24 h)';
  end if;

  v_ref := (select max(created_at) from elo_history where race_id = p_race_id);
  if exists (
    select 1
    from results rr
    join participations pp on pp.id = rr.participation_id
    join elo_history eh on eh.profile_id = pp.profile_id
    where rr.race_id = p_race_id
      and pp.profile_id is not null
      and eh.race_id is distinct from p_race_id
      and eh.created_at >= v_ref
  ) then
    raise exception 'Correction impossible : un pilote a couru une autre course depuis.';
  end if;

  -- Snapshot des temps au tour avant l'effacement des résultats.
  create temp table _laps on commit drop as
    select participation_id, best_lap_ms from results
    where race_id = p_race_id and best_lap_ms is not null;

  perform set_config('kartsquad.elo_engine', '1', true);

  update profiles p set elo = rr.elo_before
    from results rr join participations pp on pp.id = rr.participation_id
    where rr.race_id = p_race_id and pp.profile_id = p.id;
  update ghost_profiles g set elo = rr.elo_before
    from results rr join participations pp on pp.id = rr.participation_id
    where rr.race_id = p_race_id and pp.ghost_id = g.id;
  delete from elo_history where race_id = p_race_id;
  delete from results where race_id = p_race_id;
  delete from user_badges where race_id = p_race_id;

  -- Annuler l'incrément de cette course (le rejeu le re-créditera).
  update profiles p set races = greatest(0, p.races - 1)
    from participations pp
    where pp.race_id = p_race_id and pp.profile_id = p.id;

  update races set status = 'upcoming' where id = p_race_id;
  perform public.submit_race_results(p_race_id, p_order);

  -- Restauration des temps au tour (le roster est figé → participation_id stable).
  update results r set best_lap_ms = l.best_lap_ms
    from _laps l
    where r.race_id = p_race_id and r.participation_id = l.participation_id;
  drop table _laps;
end $$;
revoke all on function public.correct_race_results(uuid, uuid[]) from public, anon;
grant execute on function public.correct_race_results(uuid, uuid[]) to authenticated;

-- ── 5. Suppression modération : décrémenter races quand l'Elo est réversé ──
-- (Reprise fidèle de la fonction du lot 3.1b + décrément dans la branche
--  « course terminée » — l'historique de cette course disparaît.)
create or replace function public.moderate_delete_race(p_race_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text; v_ref timestamptz;
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  select status into v_status from races where id = p_race_id;
  if v_status is null then raise exception 'Course introuvable'; end if;

  if v_status = 'completed' then
    v_ref := (select max(created_at) from elo_history where race_id = p_race_id);
    if exists (
      select 1 from results rr
      join participations pp on pp.id = rr.participation_id
      join elo_history eh on eh.profile_id = pp.profile_id
      where rr.race_id = p_race_id and pp.profile_id is not null
        and eh.race_id is distinct from p_race_id and eh.created_at >= v_ref
    ) then
      raise exception 'Suppression impossible : un pilote a couru une autre course depuis (Elo non réversible).';
    end if;

    perform set_config('kartsquad.elo_engine', '1', true);
    update profiles p set elo = rr.elo_before
      from results rr join participations pp on pp.id = rr.participation_id
      where rr.race_id = p_race_id and pp.profile_id = p.id;
    update ghost_profiles g set elo = rr.elo_before
      from results rr join participations pp on pp.id = rr.participation_id
      where rr.race_id = p_race_id and pp.ghost_id = g.id;
    delete from user_badges where race_id = p_race_id;
    -- ⚠️ elo_history.race_id est ON DELETE SET NULL (pas cascade) : sans purge
    -- explicite, les lignes deviendraient orphelines et le compteur races
    -- divergerait de l'historique (point de courbe fantôme inclus).
    delete from elo_history where race_id = p_race_id;
    update profiles p set races = greatest(0, p.races - 1)
      from participations pp
      where pp.race_id = p_race_id and pp.profile_id = p.id;
  end if;

  delete from races where id = p_race_id;   -- cascade : participations, results
end $$;
revoke all on function public.moderate_delete_race(uuid) from public, anon;
grant execute on function public.moderate_delete_race(uuid) to authenticated;

-- ── 6. Badges Push / Kart-astrophe : hors calibration seulement ────────────
-- (Reprise fidèle du moteur 12 badges ; seuls les blocs 5 et 12 changent :
--  jointure profiles + garde « sorti de calibration ». Au moment de
--  l'attribution, races a déjà été incrémenté pour CETTE course → un pilote
--  était en calibration pendant la course ssi races <= 5.)
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
      select pp.profile_id, r.position, r.elo_before, r.elo_after, r.elo_delta
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
    select profile_id, 'champagne' from counted where position = 1 and v_ranked
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
    union all
    -- 5 · Kart-astrophe — perdre au moins 45 Elo (hors calibration : les gros
    -- écarts y sont attendus, le badge perdrait son sens)
    select c.profile_id, 'kart_astrophe' from counted c
    join profiles pf on pf.id = c.profile_id
    where c.elo_delta <= -45 and pf.races > 5
    union all
    -- 6 · Voiture balai — finir dernier d'une course d'au moins 3 pilotes
    select profile_id, 'voiture_balai' from counted where position = n and n >= 3
    union all
    -- 7 · Tête-à-queue — perdre un palier de grade entier
    select profile_id, 'tete_a_queue' from counted
    where public.grade_band(elo_after) < public.grade_band(elo_before)
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
    where exists (
      select 1 from results r3
      join participations p3 on p3.id = r3.participation_id
      where r3.race_id = p_race_id and p3.profile_id is not null
        and r3.elo_before >= c.elo_before + 300
        and c.position < r3.position
    )
    union all
    -- 11 · Safety car — finir DEVANT tous les pilotes inscrits partis avec un
    -- Elo plus élevé (il faut qu'au moins un inscrit soit au-dessus de moi).
    select c.profile_id, 'safety_car' from counted c
    where exists (
      select 1 from results rh
      join participations ph on ph.id = rh.participation_id
      where rh.race_id = p_race_id and ph.profile_id is not null
        and rh.elo_before > c.elo_before
    )
    and not exists (
      select 1 from results rh2
      join participations ph2 on ph2.id = rh2.participation_id
      where rh2.race_id = p_race_id and ph2.profile_id is not null
        and rh2.elo_before > c.elo_before
        and rh2.position < c.position   -- un mieux classé (Elo) a fini devant moi
    )
    union all
    -- 12 · Push — gagner au moins 45 Elo (hors calibration, même logique que 5)
    select c.profile_id, 'push' from counted c
    join profiles pf on pf.id = c.profile_id
    where c.elo_delta >= 45 and pf.races > 5
  ) b
  on conflict (profile_id, badge_key) do nothing;
end;
$$;
revoke all on function public.award_badges(uuid) from public, anon, authenticated;
