-- KartSquad — moteur Elo (lot 1.3)
-- Calcul et écriture atomiques côté serveur (anti-triche). Le client n'envoie
-- que l'ordre d'arrivée ; la base lit les Elo, calcule les variations par
-- comparaisons de paires normalisées (K=32, diviseur 400, plancher 100,
-- plafond 2500), écrit résultats + nouveaux Elo + historique, et clôt la course.

-- ── Garde Elo v2 ─────────────────────────────────────────────────────────
-- On autorise en plus la modification d'Elo quand le moteur (fonction
-- SECURITY DEFINER) a posé le drapeau de session. Un client via l'API REST ne
-- peut pas poser ce drapeau : ses UPDATE directs restent bloqués.
create or replace function public.guard_elo()
returns trigger language plpgsql as $$
begin
  if new.elo is distinct from old.elo
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') <> 'service_role'
     and current_user <> 'service_role'
     and coalesce(current_setting('kartsquad.elo_engine', true), '') <> '1' then
    raise exception 'Elo non modifiable directement (réservé au moteur Elo)';
  end if;
  return new;
end;
$$;

-- ── Soumission du classement ─────────────────────────────────────────────
-- p_order : les ids de participation, dans l'ordre d'arrivée (1er en premier).
create or replace function public.submit_race_results(p_race_id uuid, p_order uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_status text;
  n int;
begin
  select admin_id, status into v_admin, v_status from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then
    raise exception 'Seul l''admin peut saisir le classement';
  end if;
  if v_status <> 'upcoming' then raise exception 'Classement déjà saisi'; end if;

  n := array_length(p_order, 1);
  if n is null or n < 2 then raise exception 'Il faut au moins 2 pilotes'; end if;

  -- p_order doit être exactement l'ensemble des participations de la course.
  if (select count(*) from participations where race_id = p_race_id) <> n
     or exists (
       select 1 from unnest(p_order) as o(id)
       where not exists (select 1 from participations pp where pp.id = o.id and pp.race_id = p_race_id)
     ) then
    raise exception 'Classement invalide (pilotes incohérents)';
  end if;

  -- Participants dans l'ordre d'arrivée, avec leur Elo courant.
  create temp table _calc on commit drop as
  select ord.rank::int as rank, pp.id as participation_id, pp.profile_id, pp.ghost_id,
         coalesce(pr.elo, gh.elo) as elo_before
  from unnest(p_order) with ordinality as ord(pid, rank)
  join participations pp on pp.id = ord.pid
  left join profiles pr on pr.id = pp.profile_id
  left join ghost_profiles gh on gh.id = pp.ghost_id;

  -- ΔElo brut par pilote (comparaisons de paires normalisées).
  create temp table _raw on commit drop as
  select a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before,
         (32.0 / (n - 1)) * sum(
           (case when a.rank < b.rank then 1 else 0 end)
           - 1.0 / (1 + power(10, (b.elo_before - a.elo_before) / 400.0))
         ) as raw
  from _calc a join _calc b on a.participation_id <> b.participation_id
  group by a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before;

  -- Arrondi à somme nulle (plus forts restes) : les Δ entiers somment à 0.
  create temp table _delta on commit drop as
  with r as (
    select participation_id, profile_id, ghost_id, rank, elo_before, raw,
           round(raw)::int as base, (round(raw) - raw) as up_err
    from _raw
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
  from ranked;

  -- Autorise le moteur à écrire l'Elo, puis applique tout d'un bloc.
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

  update races set status = 'completed' where id = p_race_id;

  drop table _calc;
  drop table _raw;
  drop table _delta;
end;
$$;

revoke all on function public.submit_race_results(uuid, uuid[]) from public;
grant execute on function public.submit_race_results(uuid, uuid[]) to authenticated;
