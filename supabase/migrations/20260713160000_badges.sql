-- KartSquad — lot 2.3 : badges & gamification (BADGES.md, écrans R3/R4).
--
-- Les 10 badges MVP se débloquent CÔTÉ SERVEUR, au moment où l'admin valide
-- le classement (même transaction que le calcul Elo → atomique, anti-triche).
-- Un badge ne se débloque qu'une fois (contrainte d'unicité) ; les fantômes
-- ne collectionnent pas de badges (pas de compte).
--
-- Seuils PROVISOIRES à faire acter par le PO (documentés ici) :
--   · « Kart-astrophe » (plus grosse chute d'Elo) : Δ ≤ −48 en une course
--     (aux trois quarts de la perte maximale possible avec K=64).
--   · « Lanterne rouge » : dernier d'une course d'AU MOINS 3 pilotes (perdre
--     un duel à 2 n'est pas « finir dernier »).
--   · « Il est 2h moins le kart » : classement validé entre 00h00 et 04h59,
--     heure de Paris (l'app est FR-only au MVP).

-- ── Table des badges débloqués ────────────────────────────────────────────
create table public.user_badges (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  badge_key    text not null,
  race_id      uuid references public.races (id) on delete set null,
  unlocked_at  timestamptz not null default now(),
  constraint user_badge_uniq unique (profile_id, badge_key),
  constraint badge_key_valid check (badge_key in (
    'kart_didentite', 'habitue_stands', 'champagne', 'chapeaux_de_roues',
    'kart_astrophe', 'lanterne_rouge', 'tete_a_queue', 'deux_h_moins_le_kart',
    'chef_ecurie', 'david_goliath'
  ))
);

create index user_badges_profile_idx on public.user_badges (profile_id);

alter table public.user_badges enable row level security;
grant select on public.user_badges to authenticated;

-- Visibilité (A6) : public, soi-même, ou ami ACCEPTÉ. Volontairement plus
-- strict que profiles_select (qui s'ouvre aussi sur une demande « pending ») :
-- on s'aligne sur get_pilot.elo_exact (accepted-only), donc l'écran pilote
-- masque déjà tout le détail — stats, Elo exact, badges — tant que l'amitié
-- n'est pas acceptée. Plus restrictif = aucune fuite.
-- Aucune policy d'écriture : seul le moteur (security definer) insère.
create policy user_badges_select on public.user_badges for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = profile_id and not p.is_private)
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = profile_id and f.addressee_id = auth.uid())
          or (f.addressee_id = profile_id and f.requester_id = auth.uid()))
    )
  );

-- ── Palier de grade (miroir SQL de src/lib/grade.ts) ─────────────────────
create or replace function public.grade_band(p_elo integer)
returns integer
language sql immutable as $$
  select case
    when p_elo >= 2100 then 6
    when p_elo >= 1700 then 5
    when p_elo >= 1300 then 4
    when p_elo >= 1000 then 3
    when p_elo >= 700  then 2
    else 1
  end;
$$;

-- ── Moteur de déblocage ───────────────────────────────────────────────────
-- p_validated_at est passé par submit_race_results (now()) ; paramètre
-- explicite pour rester testable (badge « après minuit »).
create or replace function public.award_badges(p_race_id uuid, p_validated_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  after_midnight boolean;
begin
  select count(*) into n from results where race_id = p_race_id;
  after_midnight := extract(hour from p_validated_at at time zone 'Europe/Paris') < 5;

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
    -- 1 · Kart d'identité — 1ère course jouée (l'unicité absorbe les suivantes)
    select profile_id, 'kart_didentite' as badge_key from counted
    union all
    -- 2 · Habitué des stands — 10 courses jouées
    select profile_id, 'habitue_stands' from counted where races >= 10
    union all
    -- 3 · Champagne ! — 1ère victoire
    select profile_id, 'champagne' from counted where position = 1
    union all
    -- 4 · Sur les chapeaux de roues — 3 victoires d'affilée
    -- « d'affilée » = dans l'ORDRE DE VALIDATION (results.created_at), pas la
    -- date de course : scheduled_at est saisi/éditable par l'admin et peut être
    -- à égalité entre deux manches d'une soirée — s'y fier rendrait la série
    -- non déterministe.
    select c.profile_id, 'chapeaux_de_roues'
    from counted c
    where c.position = 1
      and (
        select count(*) from (
          select r2.position
          from results r2
          join participations p2 on p2.id = r2.participation_id
          where p2.profile_id = c.profile_id
          order by r2.created_at desc, r2.id desc
          limit 3
        ) last3
        where last3.position = 1
      ) = 3
    union all
    -- 5 · Kart-astrophe — chute d'Elo ≤ −48 en une course (seuil provisoire)
    select profile_id, 'kart_astrophe' from counted where elo_delta <= -48
    union all
    -- 6 · Lanterne rouge — dernier d'une course d'au moins 3 pilotes
    select profile_id, 'lanterne_rouge' from counted where position = n and n >= 3
    union all
    -- 7 · Tête-à-queue — perdre un palier de grade entier
    select profile_id, 'tete_a_queue' from counted
    where public.grade_band(elo_after) < public.grade_band(elo_before)
    union all
    -- 8 · Il est 2h moins le kart — classement validé entre minuit et 5h (Paris)
    select profile_id, 'deux_h_moins_le_kart' from counted where after_midnight
    union all
    -- 9 · Chef d'écurie — organiser 10 courses terminées (l'admin l'obtient
    -- même s'il ne pilote pas : on l'évalue sur races.admin_id, hors « counted »
    -- qui ne contient que les participants)
    select ra.admin_id, 'chef_ecurie'
    from races ra
    where ra.id = p_race_id
      and (select count(*) from races r2
           where r2.admin_id = ra.admin_id and r2.status = 'completed') >= 10
    union all
    -- 10 · David contre Goliath — battre un pilote parti 300+ Elo au-dessus
    -- (ma propre ligne ne peut pas être 300 au-dessus de moi-même : pas
    -- besoin de l'exclure ; l'adversaire peut être un fantôme)
    select c.profile_id, 'david_goliath' from counted c
    where exists (
      select 1 from results r3
      where r3.race_id = p_race_id
        and r3.elo_before >= c.elo_before + 300
        and c.position < r3.position
    )
  ) b
  on conflict (profile_id, badge_key) do nothing;
end;
$$;

revoke all on function public.award_badges(uuid, timestamptz) from public;
-- Pas de grant : seul le moteur de validation (security definer) l'appelle.

-- ── Le moteur Elo appelle le déblocage en fin de validation ───────────────
-- (fonction identique au barème K=64/div 800 du 2026-07-13, plus l'appel
-- à award_badges juste après la clôture de la course)
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
  K constant numeric := 64;    -- facteur d'amplitude des mouvements
  DIV constant numeric := 800; -- diviseur (écart de niveau → probabilité)
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

  create temp table _raw on commit drop as
  select a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before,
         (K / (n - 1)) * sum(
           (case when a.rank < b.rank then 1 else 0 end)
           - 1.0 / (1 + power(10, (b.elo_before - a.elo_before) / DIV))
         ) as raw
  from _calc a join _calc b on a.participation_id <> b.participation_id
  group by a.participation_id, a.profile_id, a.ghost_id, a.rank, a.elo_before;

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

  -- Badges : après la clôture, dans la même transaction.
  perform public.award_badges(p_race_id, now());
end;
$$;
