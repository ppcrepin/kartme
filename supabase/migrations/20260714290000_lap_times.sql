-- KartSquad — lot « Temps au tour » (informatif / prestige, HORS Elo).
--
-- Décisions PO 2026-07-14 : chaque pilote peut renseigner/éditer SON meilleur
-- tour ; l'admin peut aussi renseigner celui de n'importe quel pilote de sa
-- course (saisie facultative). Le temps N'AFFECTE PAS l'Elo (positions seules) —
-- il sert à l'affichage et aux records (perso + record du circuit).

-- Meilleur tour de ce pilote sur cette course (millisecondes). Bornes larges :
-- 10 s → 20 min (garde-fou anti-saisie absurde).
alter table public.results add column if not exists best_lap_ms integer;
alter table public.results drop constraint if exists result_lap_range;
alter table public.results add constraint result_lap_range
  check (best_lap_ms is null or best_lap_ms between 10000 and 1200000);

-- Saisie du temps : autorisée au PROPRIÉTAIRE de la participation (son propre
-- temps) ou à l'ADMIN de la course. La RLS de results réserve l'écriture à
-- l'admin ; ce RPC ouvre proprement le cas « chacun son temps ». La suspension
-- est déjà bloquée par guard_not_suspended sur l'update de results.
create or replace function public.set_lap_time(p_participation_id uuid, p_ms integer) returns void
language plpgsql security definer set search_path = public as $$
declare v_race uuid; v_owner uuid; v_admin uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  select res.race_id, pp.profile_id into v_race, v_owner
    from results res join participations pp on pp.id = res.participation_id
    where res.participation_id = p_participation_id;
  if v_race is null then raise exception 'Résultat introuvable'; end if;
  select admin_id into v_admin from races where id = v_race;
  if v_uid <> v_admin and v_uid is distinct from v_owner then
    raise exception 'Tu ne peux modifier que ton propre temps';
  end if;
  if p_ms is not null and (p_ms < 10000 or p_ms > 1200000) then
    raise exception 'Temps invalide';
  end if;
  update results set best_lap_ms = p_ms where participation_id = p_participation_id;
end $$;
revoke all on function public.set_lap_time(uuid, integer) from public, anon;
grant execute on function public.set_lap_time(uuid, integer) to authenticated;

-- Record du circuit : meilleur tour jamais enregistré sur ce circuit + son auteur.
create or replace function public.get_circuit_record(p_circuit_id uuid)
returns table (best_lap_ms integer, holder text)
language sql stable security definer set search_path = public as $$
  select res.best_lap_ms, coalesce(pr.username, gh.display_name)
  from results res
  join races ra on ra.id = res.race_id
  join participations pp on pp.id = res.participation_id
  left join profiles pr on pr.id = pp.profile_id
  left join ghost_profiles gh on gh.id = pp.ghost_id
  where ra.circuit_id = p_circuit_id and res.best_lap_ms is not null
  order by res.best_lap_ms asc
  limit 1;
$$;
revoke all on function public.get_circuit_record(uuid) from public, anon;
grant execute on function public.get_circuit_record(uuid) to authenticated;
-- NB : get_circuit_record est SECURITY DEFINER et renvoie le pseudo du détenteur
-- même s'il est privé. Contournement RLS VOLONTAIRE : un temps au tour est une
-- donnée de course (comme un résultat), pas une donnée personnelle.

-- ── Correction de classement : préserver les temps au tour ─────────────────
-- correct_race_results efface puis réinsère les résultats (via submit) → sans
-- garde, best_lap_ms repartait à null (perte de données + record faussé). Les
-- temps sont indépendants des positions : on les capture avant, on les restaure
-- après. (Reprise fidèle de la fonction du lot 2.6 + snapshot/restore.)
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
