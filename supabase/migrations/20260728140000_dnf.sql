-- KartSquad — A6 : abandons (DNF).
--
-- Au karting, un pilote sort de piste, casse une chaîne, ou rentre au stand.
-- Jusqu'ici l'admin n'avait qu'un mauvais choix : le RETIRER de la course
-- (son Elo ne bouge pas, mais il disparaît de l'histoire — alors qu'il était
-- bien là) ou lui inventer une place qu'il n'a pas faite.
--
-- Décision PO 2026-07-28 : **un abandon est classé DERNIER**.
--   · Plusieurs abandons sont EX ÆQUO derniers entre eux : leur duel vaut 0,5
--     de part et d'autre, donc l'échange reste symétrique et la SOMME NULLE
--     entre inscrits est préservée (l'invariant anti-triche tient).
--
-- LIMITE ASSUMÉE, à ne pas romancer. « Abandon coûte exactement ce que coûte
-- une dernière place » n'est vrai que pour un abandon UNIQUE. À plusieurs,
-- l'égalité redistribue : 4 pilotes à 1000, C et D abandonnent → −21 chacun au
-- lieu de −32 pour le dernier réel (il économise 11 points, C en paie 10 de
-- trop). Deux pilotes peuvent donc amortir la perte du dernier en se déclarant
-- tous deux « abandon ». Les départager supposerait de classer deux pilotes
-- qu'aucun classement ne sépare — on assume.
--
-- En revanche, un abandon ne peut JAMAIS gagner d'Elo (décision PO, voir le
-- plafonnement dans _delta) : c'était le seul cas vraiment indéfendable.
-- L'interface ne doit pour autant pas promettre que « l'abandon coûte des
-- points » : à plusieurs, il peut ne rien coûter du tout.
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
-- Balayage de TOUTES les variantes du moteur avant recréation.
--
-- Énumérer les signatures à la main (2 arguments, puis 3) ne suffit pas : il
-- suffit qu'une base porte une variante oubliée — un DEFAULT différent, un
-- paramètre nommé autrement, un essai resté en place — pour que la création
-- échoue avec « function already exists with same argument types », et le
-- script devient alors impossible à rejouer, donc impossible à corriger.
-- On interroge le catalogue : ce qui existe est supprimé, quoi que ce soit.
do $sweep$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('submit_race_results', 'correct_race_results')
  loop
    execute 'drop function ' || f.sig;
  end loop;
end $sweep$;

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

  -- Doublon dans le classement : à deux pilotes, le self-join ne produit aucune
  -- ligne → course marquée « terminée », zéro résultat, un pilote effacé de
  -- l'histoire, et plus rejouable. À trois ou plus, erreur de contrainte brute.
  if (select count(distinct o.id) from unnest(p_order) as o(id)) <> n then
    raise exception 'Classement invalide (un pilote figure deux fois)';
  end if;

  if (select count(*) from participations where race_id = p_race_id) <> n
     or exists (
       select 1 from unnest(p_order) as o(id)
       where not exists (select 1 from participations pp where pp.id = o.id and pp.race_id = p_race_id)
     ) then
    raise exception 'Classement invalide (pilotes incohérents)';
  end if;

  -- Liste d'abandons bien formée. Un NULL ou un doublon fausserait `n_fin`
  -- (count(*) les compte) : le rang égalisé descendrait d'un cran et un pilote
  -- ARRIVÉ se retrouverait ex æquo avec un abandon — un transfert d'Elo
  -- déclenché par un champ que le serveur est censé valider.
  if array_position(p_dnf, null) is not null
     or (select count(*) from unnest(p_dnf)) is distinct from
        (select count(distinct id) from unnest(p_dnf) as d(id)) then
    raise exception 'Liste d''abandons invalide (doublon ou valeur vide)';
  end if;

  -- Un abandon doit faire partie du classement soumis.
  if exists (select 1 from unnest(coalesce(p_dnf, '{}'::uuid[])) as d(id)
             where not (d.id = any(p_order))) then
    raise exception 'Abandon invalide (pilote hors classement)';
  end if;

  -- …et être placé DERRIÈRE tous les pilotes à l'arrivée. Le rang d'affichage
  -- (`results.position`) est pris tel quel dans p_order : sans ce contrôle, un
  -- abandon envoyé en tête serait « ABD » sur l'écran course mais position 1
  -- partout ailleurs — podium, partage, badge « Champagne », victoires du
  -- profil. Un appel direct à l'API suffirait à se fabriquer des victoires.
  if exists (
    select 1 from unnest(p_order) with ordinality as o(pid, rk)
    where o.pid = any(coalesce(p_dnf, '{}'::uuid[]))
      and o.rk < (select max(o2.rk) from unnest(p_order) with ordinality as o2(pid, rk)
                  where not (o2.pid = any(coalesce(p_dnf, '{}'::uuid[]))))
  ) then
    raise exception 'Un abandon ne peut pas être classé devant un pilote à l''arrivée';
  end if;
  -- Une course où personne ne finit n'a pas de sens : elle ne classe rien et
  -- ferait 100 % d'ex æquo (aucun point échangé, mais un compteur de courses
  -- incrémenté pour rien).
  if (select count(*) from unnest(coalesce(p_dnf, '{}'::uuid[]))) >= n then
    raise exception 'Il faut au moins un pilote à l''arrivée';
  end if;

  -- …et, dès que l'Elo est en jeu (au moins deux INSCRITS), au moins un inscrit
  -- doit avoir fini. Le contrôle ci-dessus compte les participants fantômes
  -- compris : sans celui-ci, deux inscrits pouvaient tous deux abandonner
  -- derrière un invité, se retrouver ex æquo, et s'échanger des points.
  if (select count(*) from participations pp
      where pp.race_id = p_race_id and pp.profile_id is not null) >= 2
     and not exists (
       select 1 from participations pp
       where pp.race_id = p_race_id and pp.profile_id is not null
         and not (pp.id = any(coalesce(p_dnf, '{}'::uuid[])))
     ) then
    raise exception 'Il faut au moins un pilote inscrit à l''arrivée';
  end if;

  n_fin := n - (select count(distinct id) from unnest(coalesce(p_dnf, '{}'::uuid[])) as d(id)
                where d.id is not null);

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
  with reg as (
    select * from _raw where profile_id is not null
  ),
  -- Décision PO 2026-07-28 : **un abandon ne rapporte JAMAIS de points**.
  -- L'égalité entre abandons pouvait faire GAGNER de l'Elo au plus faible
  -- (0,5 face à un adversaire dont l'espérance frôlait 0,95) : « ABD Kevin +4 »
  -- partagé sur WhatsApp est indéfendable. On plafonne donc son gain à 0 et on
  -- rend ce qu'il aurait pris aux pilotes qui ont FINI — la somme reste nulle,
  -- et la phrase tient en une ligne pour la FAQ.
  surplus as (
    select coalesce(sum(greatest(raw, 0)) filter (where is_dnf), 0) as s,
           count(*) filter (where not is_dnf) as n_fin_reg
    from reg
  ),
  adj as (
    select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before,
      case when is_dnf then least(raw, 0)
           else raw + (select case when n_fin_reg > 0 then s / n_fin_reg else 0 end
                       from surplus)
      end as raw
    from reg
  ),
  r as (
    select participation_id, profile_id, ghost_id, rank, is_dnf, elo_before, raw,
           round(raw)::int as base, (round(raw) - raw) as up_err
    from adj
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
-- (Déjà supprimée par le balayage en tête de fichier.)
create function public.correct_race_results(
  p_race_id uuid, p_order uuid[], p_dnf uuid[] default null
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

  -- p_dnf ABSENT (null) ≠ p_dnf VIDE. Un client dont le bundle n'a pas été
  -- rechargé (PWA en cache) appelle encore la fonction à deux arguments : sans
  -- cette reprise, corriger une place effacerait TOUS les abandons en silence
  -- et repromouvrait en pilotes arrivés ceux qui n'avaient jamais fini.
  -- Même logique que le snapshot des temps au tour, juste au-dessus.
  if p_dnf is null then
    select coalesce(array_agg(participation_id), '{}'::uuid[]) into p_dnf
    from results where race_id = p_race_id and dnf;
  end if;

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


-- ── Badges : un abandon n'a battu personne ────────────────────────────────
-- Les badges raisonnaient sur `position`, qui existe toujours pour un abandon.
-- Sans garde, un abandon décrochait « DRS » pour avoir « battu » un autre
-- abandon plus fort, « Safety car » pour avoir « fini devant » les pilotes
-- au-dessus de lui, et un seul des deux ex æquo prenait la « Voiture balai »
-- selon l'ordre arbitraire dans lequel le client les avait empilés.
-- (Reprise fidèle du moteur 12 badges ; seuls les blocs 3, 6, 10 et 11 changent.)
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
    union all
    -- 5 · Kart-astrophe — perdre au moins 45 Elo (hors calibration : les gros
    -- écarts y sont attendus, le badge perdrait son sens)
    select c.profile_id, 'kart_astrophe' from counted c
    join profiles pf on pf.id = c.profile_id
    where c.elo_delta <= -45 and pf.races > 5
    union all
    -- 6 · Voiture balai — finir dernier d'une course d'au moins 3 pilotes
    select c.profile_id, 'voiture_balai' from counted c
    where n >= 3 and not c.dnf
      and c.position = (select max(r4.position) from results r4
                        where r4.race_id = p_race_id and not r4.dnf)
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
    -- 12 · Push — gagner au moins 45 Elo (hors calibration, même logique que 5)
    select c.profile_id, 'push' from counted c
    join profiles pf on pf.id = c.profile_id
    where c.elo_delta >= 45 and pf.races > 5
  ) b
  on conflict (profile_id, badge_key) do nothing;
end;
$$;
revoke all on function public.award_badges(uuid) from public, anon, authenticated;

-- ── M5 : results n'est plus écrivable directement par un client ───────────
-- Les policies INSERT/UPDATE datent d'avant le moteur serveur : plus aucun
-- écran n'écrit dans `results` (l'app ne fait que lire), tout passe par des
-- fonctions SECURITY DEFINER. Tant qu'elles existaient, un admin pouvait, via
-- l'API, coller l'étiquette « Abandon » à n'importe qui après coup et gonfler
-- son propre `elo_delta` : `profiles.elo` restait juste, mais la fiche de
-- course et la somme nulle TELLES QUE VUES PAR LES PILOTES devenaient fausses.
drop policy if exists results_insert_admin on public.results;
drop policy if exists results_update_admin on public.results;
revoke insert, update, delete on public.results from authenticated, anon;
-- La lecture reste ouverte (policy results_select inchangée).

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
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'Format de saisie invalide';
  end if;

  for e in
    -- `x ? 'ms'` distingue « effacer » (ms explicitement null) d'une clé
    -- oubliée, qui effaçait le temps sans que personne l'ait demandé.
    select (x ->> 'participation_id')::uuid as pid,
           nullif(x ->> 'ms', '')::int as ms,
           (x ? 'ms') as has_ms
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as x
  loop
    if not e.has_ms then
      raise exception 'Entrée invalide (temps manquant)';
    end if;
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
    update results set best_lap_ms = e.ms
      where participation_id = e.pid and race_id = p_race_id;
  end loop;
end $$;
revoke all on function public.set_lap_times(uuid, jsonb) from public, anon;
grant execute on function public.set_lap_times(uuid, jsonb) to authenticated;
