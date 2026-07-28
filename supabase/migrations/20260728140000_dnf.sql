-- KartSquad — A6 : abandons (DNF).
--
-- Au karting, un pilote sort de piste, casse une chaîne, ou rentre au stand.
-- Jusqu'ici l'admin n'avait qu'un mauvais choix : le RETIRER de la course
-- (son Elo ne bouge pas, mais il disparaît de l'histoire — alors qu'il était
-- bien là) ou lui inventer une place qu'il n'a pas faite.
--
-- Décision PO 2026-07-28 : **un abandon est classé DERNIER**.
--   · C'est la règle la plus simple à expliquer, et la seule INEXPLOITABLE :
--     un pilote en train de finir dernier n'a aucun intérêt à se faire noter
--     « abandon » pour protéger son Elo (le coût est identique).
--   · Plusieurs abandons sont EX ÆQUO derniers entre eux : leur duel vaut 0,5
--     de part et d'autre, donc l'échange reste symétrique et la SOMME NULLE
--     entre inscrits est préservée (l'invariant anti-triche tient).
--
-- Détail d'implémentation : `results.position` garde des valeurs DISTINCTES
-- (l'index unique (race_id, position) existe depuis le schéma initial et sert
-- de garde-fou). L'égalité entre abandons n'existe que dans le calcul d'Elo ;
-- à l'affichage, le drapeau `dnf` remplace le numéro par « Abandon ».

alter table public.results add column if not exists dnf boolean not null default false;

-- ── Moteur : rang de calcul distinct du rang d'affichage ──────────────────
-- (Reprise fidèle de la fonction de la vague calibration ; changements : le
--  paramètre p_dnf, le rang égalisé des abandons et le score 0,5 en cas
--  d'égalité.)
drop function if exists public.submit_race_results(uuid, uuid[]);
create function public.submit_race_results(
  p_race_id uuid, p_order uuid[], p_dnf uuid[] default '{}'::uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid;
  v_status text;
  n int;
  n_reg int;                          -- comptes inscrits dans la course
  n_fin int;                          -- pilotes ayant TERMINÉ
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

  -- Un abandon doit faire partie du classement soumis.
  if exists (select 1 from unnest(coalesce(p_dnf, '{}'::uuid[])) as d(id)
             where not (d.id = any(p_order))) then
    raise exception 'Abandon invalide (pilote hors classement)';
  end if;
  -- Une course où personne ne finit n'a pas de sens : elle ne classe rien et
  -- ferait 100 % d'ex æquo (aucun point échangé, mais un compteur de courses
  -- incrémenté pour rien).
  if (select count(*) from unnest(coalesce(p_dnf, '{}'::uuid[]))) >= n then
    raise exception 'Il faut au moins un pilote à l''arrivée';
  end if;

  n_fin := n - (select count(*) from unnest(coalesce(p_dnf, '{}'::uuid[])));

  create temp table _calc on commit drop as
  select
    ord.rank::int as rank,                       -- rang D'AFFICHAGE (unique)
    -- Rang DE CALCUL : tous les abandons partagent la place suivant le dernier
    -- pilote à l'arrivée → ils sont ex æquo entre eux, et derrière tout le monde.
    (case when ord.pid = any(coalesce(p_dnf, '{}'::uuid[]))
          then n_fin + 1 else ord.rank::int end) as crank,
    (ord.pid = any(coalesce(p_dnf, '{}'::uuid[]))) as is_dnf,
    pp.id as participation_id, pp.profile_id, pp.ghost_id,
    coalesce(pr.elo, gh.elo) as elo_before,
    case when pr.id is null then null
         when pr.races < CAL_RACES then K_CAL
         else K_STD end as k
  from unnest(p_order) with ordinality as ord(pid, rank)
  join participations pp on pp.id = ord.pid
  left join profiles pr on pr.id = pp.profile_id
  left join ghost_profiles gh on gh.id = pp.ghost_id;

  select count(*) into n_reg from _calc where profile_id is not null;

  -- Contribution brute : seuls les DUELS entre inscrits comptent (fantômes
  -- figés). K appliqué à un duel = MOYENNE des K des deux pilotes. Le score
  -- vaut 1 / 0,5 / 0 — l'égalité (deux abandons) est symétrique, donc la somme
  -- globale reste nulle.
  create temp table _raw on commit drop as
  select a.participation_id, a.profile_id, a.ghost_id, a.rank, a.is_dnf, a.elo_before,
    case when a.profile_id is null or n_reg < 2 then 0
    else (1.0 / (n_reg - 1)) * sum(
           ((a.k + b.k) / 2.0) *
           ((case when a.crank < b.crank then 1.0
                  when a.crank = b.crank then 0.5
                  else 0.0 end)
            - 1.0 / (1 + power(10, (b.elo_before - a.elo_before) / DIV)))
         ) filter (where b.profile_id is not null)
    end as raw
  from _calc a join _calc b on a.participation_id <> b.participation_id
  group by a.participation_id, a.profile_id, a.ghost_id, a.rank, a.is_dnf, a.elo_before, a.k;

  -- Arrondi à somme nulle (plus grand reste) UNIQUEMENT sur les inscrits ;
  -- les fantômes reçoivent delta 0.
  create temp table _delta on commit drop as
  with r as (
    select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before, raw,
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
  select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before,
    base
      - (case when (select s from resid) > 0 and rn_up <= (select s from resid) then 1 else 0 end)
      + (case when (select s from resid) < 0 and rn_down <= -(select s from resid) then 1 else 0 end)
      as delta
  from ranked
  union all
  select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before, 0 as delta
  from _raw where profile_id is null;

  perform set_config('kartsquad.elo_engine', '1', true);

  update profiles p set elo = greatest(100, least(2500, d.elo_before + d.delta))
  from _delta d where d.profile_id = p.id;

  update ghost_profiles g set elo = greatest(100, least(2500, d.elo_before + d.delta))
  from _delta d where d.ghost_id = g.id;

  insert into results (race_id, participation_id, position, dnf, elo_before, elo_after, elo_delta)
  select p_race_id, d.participation_id, d.rank, d.is_dnf, d.elo_before,
         greatest(100, least(2500, d.elo_before + d.delta)),
         greatest(100, least(2500, d.elo_before + d.delta)) - d.elo_before
  from _delta d;

  insert into elo_history (profile_id, ghost_id, race_id, elo, delta)
  select d.profile_id, d.ghost_id, p_race_id,
         greatest(100, least(2500, d.elo_before + d.delta)),
         greatest(100, least(2500, d.elo_before + d.delta)) - d.elo_before
  from _delta d;

  -- Compteur de courses : +1 par inscrit (aligné sur elo_history). Un abandon
  -- reste une course jouée : il était sur la piste.
  update profiles p set races = p.races + 1
  from _delta d where d.profile_id = p.id;

  update races set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_race_id;

  drop table _calc;
  drop table _raw;
  drop table _delta;

  perform public.award_badges(p_race_id);
end;
$$;
revoke all on function public.submit_race_results(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.submit_race_results(uuid, uuid[], uuid[]) to authenticated;

-- ── Correction 24 h : les abandons se corrigent aussi ─────────────────────
-- (Reprise fidèle de la version « temps au tour préservés » + p_dnf.)
drop function if exists public.correct_race_results(uuid, uuid[]);
create function public.correct_race_results(
  p_race_id uuid, p_order uuid[], p_dnf uuid[] default '{}'::uuid[]
)
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

  update profiles p set races = greatest(0, p.races - 1)
    from participations pp
    where pp.race_id = p_race_id and pp.profile_id = p.id;

  update races set status = 'upcoming' where id = p_race_id;
  perform public.submit_race_results(p_race_id, p_order, p_dnf);

  update results r set best_lap_ms = l.best_lap_ms
    from _laps l
    where r.race_id = p_race_id and r.participation_id = l.participation_id;
  drop table _laps;
end $$;
revoke all on function public.correct_race_results(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.correct_race_results(uuid, uuid[], uuid[]) to authenticated;

-- ── A9 : saisie GROUPÉE des temps au tour ─────────────────────────────────
-- L'admin d'une course de 8 pilotes devait ouvrir 8 fois le même champ. On
-- accepte désormais tous les temps d'un coup. Mêmes règles qu'unitairement :
-- l'admin peut saisir pour tout le monde, chacun pour soi (ici, le lot n'a de
-- sens que pour l'admin, mais on garde la vérification pilote par pilote).
create or replace function public.set_lap_times(p_race_id uuid, p_entries jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid; v_uid uuid := auth.uid(); e record;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  select admin_id into v_admin from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;

  for e in
    select (x ->> 'participation_id')::uuid as pid,
           nullif(x ->> 'ms', '')::int as ms
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as x
  loop
    -- La participation doit appartenir à CETTE course : sans ce contrôle, un
    -- admin pourrait écrire les temps d'une course qui n'est pas la sienne.
    if not exists (select 1 from results res
                   join participations pp on pp.id = res.participation_id
                   where res.participation_id = e.pid and res.race_id = p_race_id) then
      raise exception 'Résultat introuvable dans cette course';
    end if;
    if v_uid <> v_admin
       and v_uid is distinct from (select pp.profile_id from participations pp where pp.id = e.pid) then
      raise exception 'Tu ne peux modifier que ton propre temps';
    end if;
    if e.ms is not null and (e.ms < 10000 or e.ms > 1200000) then
      raise exception 'Temps invalide';
    end if;
    update results set best_lap_ms = e.ms where participation_id = e.pid;
  end loop;
end $$;
revoke all on function public.set_lap_times(uuid, jsonb) from public, anon;
grant execute on function public.set_lap_times(uuid, jsonb) to authenticated;
