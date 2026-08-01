-- ════════════════════════════════════════════════════════════════════════════
-- C13 — PROMOUVOIR LE KARTING ÉLECTRIQUE (décision PO 2026-08-01)
--
-- Deux choses, et une seule donnée nouvelle : AUCUNE. `circuits.motor_kind`
-- ('thermique' | 'electrique' | 'mixte') est déjà renseigné par l'import du
-- relevé PO (A16) — 33 circuits purement électriques, 157 thermiques.
--
--   1. Deux badges. « Sous tension » à la PREMIÈRE course sur une piste
--      électrique, « Haute tension » à la cinquième. Un badge de découverte
--      pousse à essayer ; un badge d'habitude récompense d'y revenir. Le
--      premier est celui qui compte pour la promotion : personne ne vise un
--      badge qu'il ne peut pas obtenir ce soir.
--
--   2. `nearby_circuits` rend `motor_kind`, pour que la carte puisse
--      distinguer les épingles (vert + éclair) sans un aller-retour par
--      circuit.
--
-- Anti-triche : les deux badges ne comptent que des courses CLASSÉES
-- (`race_is_ranked` — au moins deux inscrits). Sans cela, un pilote seul
-- créait cinq courses fantômes sur une piste électrique et décrochait les deux
-- badges dans la soirée, sans jamais avoir touché un kart.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ═══ 1. La contrainte de clé ══════════════════════════════════════════════
-- Élargie AVANT le moteur : dans l'autre ordre, la première course validée
-- après le collage se heurterait à une contrainte qui ne connaît pas encore
-- les deux clés, et l'insertion de TOUS les badges de cette course échouerait.
alter table public.user_badges drop constraint if exists badge_key_valid;
alter table public.user_badges add constraint badge_key_valid check (badge_key in (
  'kart_didentite', 'habitue_stands', 'champagne', 'chapeaux_de_roues',
  'midi_moins_le_kart', 'chef_ecurie', 'drs', 'safety_car', 'push',
  'sous_tension', 'haute_tension'
));

-- ═══ 2. Le moteur ═════════════════════════════════════════════════════════
-- Reprise FIDÈLE du moteur en vigueur (lot C3), plus deux blocs numérotés 13
-- et 14. La numérotation d'origine des commentaires est conservée pour que la
-- comparaison avec l'ancien reste immédiate.
create or replace function public.award_badges(p_race_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  n int;                -- nombre total de participants (inscrits + fantômes)
  v_ranked boolean;     -- la course compte-t-elle pour l'Elo ?
  v_morning boolean;    -- heure prévue le matin (6h–midi, Paris) ?
  v_electrique boolean; -- la course s'est-elle jouée sur une piste électrique ?
begin
  select count(*) into n from results where race_id = p_race_id;
  v_ranked := public.race_is_ranked(p_race_id);
  select extract(hour from scheduled_at at time zone 'Europe/Paris') between 6 and 11
    into v_morning from races where id = p_race_id;

  -- « electrique » STRICTEMENT : un circuit « mixte » loue aussi des karts
  -- thermiques, donc rien ne dit qu'on a roulé en électrique. Un badge qui se
  -- décroche sans avoir fait ce qu'il annonce ne vaut rien.
  -- `coalesce` : une course sans circuit renseigné n'est pas électrique.
  select coalesce(ci.motor_kind = 'electrique', false) into v_electrique
    from races ra left join circuits ci on ci.id = ra.circuit_id
   where ra.id = p_race_id;

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
        (select count(*) from elo_history eh where eh.profile_id = m.profile_id) as races,
        -- Courses ÉLECTRIQUES du pilote, celle-ci comprise. `distinct` sur la
        -- course : un pilote n'a qu'un résultat par course, mais la jointure
        -- ne le garantit pas structurellement.
        (select count(distinct rs.race_id)
           from results rs
           join participations p4 on p4.id = rs.participation_id
           join races ra4 on ra4.id = rs.race_id
           join circuits ci4 on ci4.id = ra4.circuit_id
          where p4.profile_id = m.profile_id
            and ci4.motor_kind = 'electrique'
            and public.race_is_ranked(rs.race_id)) as courses_elec
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
    union all
    -- 13 · Sous tension — 1ère course sur une piste ÉLECTRIQUE.
    --
    -- `v_electrique` en garde : sans elle, un pilote ayant déjà cinq courses
    -- électriques derrière lui décrocherait le badge au retour d'une soirée
    -- thermique — et le bandeau post-course annoncerait « badge gagné sur
    -- CETTE course » à propos d'une course qui n'y est pour rien.
    select profile_id, 'sous_tension' from counted
     where v_electrique and v_ranked and courses_elec >= 1
    union all
    -- 14 · Haute tension — 5 courses sur piste électrique.
    select profile_id, 'haute_tension' from counted
     where v_electrique and v_ranked and courses_elec >= 5
  ) b
  on conflict (profile_id, badge_key) do nothing;
end;
$$;
revoke all on function public.award_badges(uuid) from public, anon, authenticated;

-- `n` n'est plus lu depuis le retrait de « Voiture balai ». On le garde
-- déclaré : la variable est calculée d'une requête triviale, et la supprimer
-- rendrait le diff avec le moteur précédent illisible pour rien.

-- ═══ 3. La carte doit pouvoir distinguer les épingles ═════════════════════
-- `motor_kind` s'ajoute au retour. Changer le type de retour impose un
-- `drop` : `create or replace` refuse.
drop function if exists public.nearby_circuits(double precision, double precision, int, double precision);
create function public.nearby_circuits(
  p_lat double precision, p_lon double precision,
  p_limit int default 8, p_max_km double precision default 150
)
returns table (id uuid, name text, city text, is_official boolean,
               lat double precision, lon double precision, aliases text,
               motor_kind text, km double precision)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.is_official, c.lat, c.lon, c.aliases,
         c.motor_kind,
         public.km_between(p_lat, p_lon, c.lat, c.lon) as km
  from circuits c
  where c.lat is not null and c.lon is not null
    and p_lat between -90 and 90
    and p_lon between -180 and 180
    and public.km_between(p_lat, p_lon, c.lat, c.lon) <= greatest(coalesce(p_max_km, 150), 0)
  order by km, c.name
  limit greatest(coalesce(p_limit, 8), 0);
$$;
revoke all on function public.nearby_circuits(double precision, double precision, int, double precision)
  from public, anon;
grant execute on function public.nearby_circuits(double precision, double precision, int, double precision)
  to authenticated;

do $bilan$
declare e int; m int;
begin
  select count(*) into e from public.circuits where motor_kind = 'electrique';
  select count(*) into m from public.circuits where motor_kind = 'mixte';
  raise notice 'Circuits électriques : % · mixtes : %', e, m;
end $bilan$;

commit;
