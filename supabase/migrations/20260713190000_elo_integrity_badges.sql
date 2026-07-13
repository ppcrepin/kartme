-- KartSquad — intégrité de l'Elo + refonte des badges (décisions PO 2026-07-13).
--
-- 1) ANTI-TRICHE : l'Elo ne s'échange QU'ENTRE COMPTES INSCRITS. Les fantômes
--    participent (position, historique) mais leur Elo est figé (delta 0) et ils
--    ne donnent/reçoivent aucun point → le « farming » en battant de faux
--    joueurs ne rapporte plus rien. Une course à < 2 inscrits ne fait bouger
--    aucun Elo. Les fantômes sortent aussi du classement Global.
-- 2) BADGES : passage à 12 badges (renommages, nouveaux seuils, 2 ajouts),
--    et notion « course qui compte » (≥ 2 inscrits) pour les badges de perf.

-- ─────────────────────────────────────────────────────────────────────────
-- A. « Course qui compte » : au moins 2 comptes inscrits.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.race_is_ranked(p_race_id uuid)
returns boolean language sql stable set search_path = public as $$
  select count(*) filter (where profile_id is not null) >= 2
  from participations where race_id = p_race_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- B. Classement sans les fantômes (décision A du 2026-07-13). On reprend à
--    l'identique les fonctions du lot 2.2 (rank(), ex æquo, pagination stable,
--    get_my_rank par comptage) en RETIRANT toute la logique fantômes.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_leaderboard(p_scope text, p_limit int default 100, p_offset int default 0)
returns table (
  rank bigint, profile_id uuid, ghost_id uuid, username text,
  elo integer, races bigint, is_me boolean
)
language plpgsql security definer set search_path = public stable
as $$
begin
  if p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', p_scope;
  end if;

  return query
  with pilots as (
    select p.id as profile_id, null::uuid as ghost_id, p.username, p.elo,
           h.races, (p.id = auth.uid()) as is_me
    from profiles p
    join lateral (
      select count(*) as races from elo_history eh where eh.profile_id = p.id
    ) h on true
    where h.races > 0
      and not public.is_blocked(p.id, auth.uid())
      and (
        p.id = auth.uid()
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.requester_id = p.id and f.addressee_id = auth.uid())
              or (f.addressee_id = p.id and f.requester_id = auth.uid()))
        )
        or (p_scope = 'global' and not p.is_private)
      )
    -- (plus de branche fantômes : ils n'ont plus d'Elo compétitif)
  )
  select rank() over (order by pl.elo desc) as rank,
         pl.profile_id, pl.ghost_id, pl.username, pl.elo, pl.races, pl.is_me
  from pilots pl
  order by 1, pl.races desc, pl.username asc, coalesce(pl.profile_id, pl.ghost_id) asc
  limit greatest(coalesce(p_limit, 100), 0) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.get_my_rank(p_scope text)
returns table (rank bigint, elo integer, races bigint)
language plpgsql security definer set search_path = public stable
as $$
declare
  v_elo integer;
  v_races bigint;
begin
  if p_scope not in ('friends', 'global') then
    raise exception 'Portée inconnue : %', p_scope;
  end if;

  select p.elo into v_elo from profiles p where p.id = auth.uid();
  if v_elo is null then return; end if;
  select count(*) into v_races from elo_history eh where eh.profile_id = auth.uid();
  if v_races = 0 then return; end if;

  return query
  select 1
    + (select count(*)
       from profiles p
       where p.id <> auth.uid()
         and p.elo > v_elo
         and exists (select 1 from elo_history eh where eh.profile_id = p.id)
         and not public.is_blocked(p.id, auth.uid())
         and (
           exists (
             select 1 from friendships f
             where f.status = 'accepted'
               and ((f.requester_id = p.id and f.addressee_id = auth.uid())
                 or (f.addressee_id = p.id and f.requester_id = auth.uid()))
           )
           or (p_scope = 'global' and not p.is_private)
         )),
    v_elo, v_races;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- C. Refonte des clés de badges (12). On renomme les clés existantes pour ne
--    pas perdre les badges déjà obtenus (pré-beta), puis on élargit le check.
-- ─────────────────────────────────────────────────────────────────────────
update public.user_badges set badge_key = 'voiture_balai'      where badge_key = 'lanterne_rouge';
update public.user_badges set badge_key = 'midi_moins_le_kart' where badge_key = 'deux_h_moins_le_kart';
update public.user_badges set badge_key = 'drs'                 where badge_key = 'david_goliath';

alter table public.user_badges drop constraint badge_key_valid;
alter table public.user_badges add constraint badge_key_valid check (badge_key in (
  'kart_didentite', 'habitue_stands', 'champagne', 'chapeaux_de_roues',
  'kart_astrophe', 'voiture_balai', 'tete_a_queue', 'midi_moins_le_kart',
  'chef_ecurie', 'drs', 'safety_car', 'push'
));

-- ─────────────────────────────────────────────────────────────────────────
-- D. Moteur de déblocage — 12 badges.
--    « course qui compte » (≥ 2 inscrits) exigée pour les badges de perf.
-- ─────────────────────────────────────────────────────────────────────────
-- L'ancienne signature (uuid, timestamptz) est remplacée par (uuid) : on la
-- supprime, sinon l'appel award_badges(race) devient ambigu (défaut du 2e arg).
drop function if exists public.award_badges(uuid, timestamptz);

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
    -- 5 · Kart-astrophe — perdre PLUS de 30 Elo en une course (Δ ≤ −31)
    select profile_id, 'kart_astrophe' from counted where elo_delta <= -31
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
    -- 11 · Safety car — 10 courses qui comptent sans JAMAIS avoir fini dernier
    select c.profile_id, 'safety_car' from counted c
    where (
      select count(*) from results r4
      join participations p4 on p4.id = r4.participation_id
      where p4.profile_id = c.profile_id and public.race_is_ranked(r4.race_id)
    ) >= 10
    and not exists (
      select 1 from results r5
      join participations p5 on p5.id = r5.participation_id
      where p5.profile_id = c.profile_id
        and r5.position = (select count(*) from results r6 where r6.race_id = r5.race_id)
    )
    union all
    -- 12 · Push — gagner PLUS de 30 Elo en une course (Δ ≥ +31)
    select profile_id, 'push' from counted where elo_delta >= 31
  ) b
  on conflict (profile_id, badge_key) do nothing;
end;
$$;

revoke all on function public.award_badges(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- E. Moteur Elo — l'Elo ne s'échange qu'entre inscrits ; fantômes figés.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.submit_race_results(p_race_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid;
  v_status text;
  n int;
  n_reg int;                    -- comptes inscrits dans la course
  K constant numeric := 64;
  DIV constant numeric := 800;
begin
  select admin_id, status into v_admin, v_status from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then
    raise exception 'Seul l''admin peut saisir le classement';
  end if;
  if v_status <> 'upcoming' then raise exception 'Classement déjà saisi'; end if;

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
         coalesce(pr.elo, gh.elo) as elo_before
  from unnest(p_order) with ordinality as ord(pid, rank)
  join participations pp on pp.id = ord.pid
  left join profiles pr on pr.id = pp.profile_id
  left join ghost_profiles gh on gh.id = pp.ghost_id;

  select count(*) into n_reg from _calc where profile_id is not null;

  -- Contribution brute : seuls les DUELS entre inscrits comptent. Un fantôme
  -- (ou un inscrit sans autre inscrit en face) reste à 0 → Elo figé.
  create temp table _raw on commit drop as
  select a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before,
    case when a.profile_id is null or n_reg < 2 then 0
    else (K / (n_reg - 1)) * sum(
           (case when a.rank < b.rank then 1 else 0 end)
           - 1.0 / (1 + power(10, (b.elo_before - a.elo_before) / DIV))
         ) filter (where b.profile_id is not null)
    end as raw
  from _calc a join _calc b on a.participation_id <> b.participation_id
  group by a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before;

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

  update races set status = 'completed' where id = p_race_id;

  drop table _calc;
  drop table _raw;
  drop table _delta;

  perform public.award_badges(p_race_id);
end;
$$;
