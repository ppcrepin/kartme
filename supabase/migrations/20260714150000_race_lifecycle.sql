-- KartSquad — lot 2.6 : cycle de vie de course.
--
-- Trois apports (décisions PO 2026-07-14) :
--   1. Verrou OPTIONNEL « Clôturer les invitations » : nouvel état 'locked'
--      (grille figée) → 1 rappel aux inscrits. Réversible (reopen_race).
--      Le rappel ne part QU'UNE fois (garde reminded_at), et réutilise le canal
--      'invite' (aucun redéploiement de l'Edge Function, aucun nouveau réglage).
--   2. Gel du roster côté serveur : la RLS des participations n'autorise
--      l'écriture que tant que la course est 'upcoming'. La saisie spontanée
--      (sans clôturer) reste possible — le verrou n'est jamais obligatoire.
--   3. Fenêtre de correction 24 h (version SÛRE restreinte) : l'admin peut
--      re-saisir le classement dans les 24 h suivant la validation, UNIQUEMENT
--      si aucun des inscrits n'a couru une autre course depuis. Sinon l'Elo
--      « à chemin » d'une course ultérieure serait faussé → refus explicite.

-- ── Nouvel état + horodatages ──────────────────────────────────────────────
alter table public.races add column if not exists reminded_at  timestamptz; -- rappel envoyé (une seule fois)
alter table public.races add column if not exists completed_at timestamptz; -- ancre de la fenêtre 24 h

-- Le CHECK doit être remplacé AVANT toute écriture du nouvel état 'locked'.
alter table public.races drop constraint if exists race_status;
alter table public.races
  add constraint race_status check (status in ('upcoming', 'locked', 'completed'));

-- ── Gel du roster : écriture des participations réservée à 'upcoming' ───────
-- La clôture (ou la fin de course) fige la grille. Les suppressions en cascade
-- (delete d'une course) passent par l'intégrité référentielle et ignorent la
-- RLS : elles restent possibles quel que soit l'état.
-- On conserve l'enforcement des blocages (migration amitiés) et on ajoute la
-- condition status='upcoming' (gel dès que la course est clôturée ou terminée).
drop policy if exists participations_write_admin on public.participations;
create policy participations_write_admin on public.participations for all to authenticated
  using (exists (select 1 from public.races r
                 where r.id = race_id and r.admin_id = auth.uid() and r.status = 'upcoming'))
  with check (
    exists (select 1 from public.races r
            where r.id = race_id and r.admin_id = auth.uid() and r.status = 'upcoming')
    and (profile_id is null or profile_id = auth.uid() or not public.is_blocked(profile_id, auth.uid()))
  );

-- ── Verrou + rappel ────────────────────────────────────────────────────────
create or replace function public.lock_race(p_race_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid; v_status text; v_when timestamptz; v_circuit text;
  v_reminded timestamptz; v_label text;
begin
  select r.admin_id, r.status, r.scheduled_at, r.reminded_at, c.name
    into v_admin, v_status, v_when, v_reminded, v_circuit
    from races r left join circuits c on c.id = r.circuit_id
    where r.id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then raise exception 'Seul l''admin peut clôturer'; end if;
  if v_status <> 'upcoming' then raise exception 'Course déjà clôturée'; end if;
  if (select count(*) from participations where race_id = p_race_id) < 2 then
    raise exception 'Il faut au moins 2 pilotes';
  end if;

  update races set status = 'locked', reminded_at = coalesce(reminded_at, now())
    where id = p_race_id;

  -- Rappel envoyé une seule fois (à la PREMIÈRE clôture). Re-clôturer après une
  -- réouverture ne renvoie rien.
  if v_reminded is null then
    v_label := coalesce(' pour ' || v_circuit, '')
      || coalesce(' le ' || to_char(v_when at time zone 'Europe/Paris', 'DD/MM à HH24hMI'), '');
    perform public.enqueue_push('invite', pp.profile_id,
        'Course bientôt 🏁',
        'Tu es sur la grille' || v_label || '.',
        'race/' || p_race_id)
    from participations pp
    where pp.race_id = p_race_id and pp.profile_id is not null and pp.profile_id <> v_admin;
  end if;
end $$;
revoke all on function public.lock_race(uuid) from public, anon;
grant execute on function public.lock_race(uuid) to authenticated;

create or replace function public.reopen_race(p_race_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_status text;
begin
  select admin_id, status into v_admin, v_status from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if auth.uid() is distinct from v_admin then raise exception 'Seul l''admin peut rouvrir'; end if;
  if v_status <> 'locked' then raise exception 'Course non clôturée'; end if;
  -- reminded_at conservé : la réouverture ne réarme pas le rappel.
  update races set status = 'upcoming' where id = p_race_id;
end $$;
revoke all on function public.reopen_race(uuid) from public, anon;
grant execute on function public.reopen_race(uuid) to authenticated;

-- ── Saisie du classement : accepte 'upcoming' OU 'locked' + ancre 24 h ──────
-- (Reprise fidèle de la fonction du lot anti-triche, avec deux seuls
--  changements : l'état accepté et l'horodatage completed_at.)
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

-- ── Correction du classement (fenêtre 24 h, version sûre restreinte) ───────
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

  -- Sûreté : correction interdite si un inscrit a couru une AUTRE course depuis
  -- (son Elo « à chemin » a déjà servi ailleurs → l'annulation le fausserait).
  v_ref := (select max(created_at) from elo_history where race_id = p_race_id);
  if exists (
    select 1
    from results rr
    join participations pp on pp.id = rr.participation_id
    join elo_history eh on eh.profile_id = pp.profile_id
    where rr.race_id = p_race_id
      and pp.profile_id is not null
      and eh.race_id is distinct from p_race_id
      and eh.created_at >= v_ref   -- >= : durci contre une égalité d'horodatage (la course elle-même est déjà exclue par race_id)
  ) then
    raise exception 'Correction impossible : un pilote a couru une autre course depuis.';
  end if;

  perform set_config('kartsquad.elo_engine', '1', true);

  -- Annulation : restaurer l'Elo d'avant la course, effacer résultats + historique.
  update profiles p set elo = rr.elo_before
    from results rr join participations pp on pp.id = rr.participation_id
    where rr.race_id = p_race_id and pp.profile_id = p.id;
  update ghost_profiles g set elo = rr.elo_before
    from results rr join participations pp on pp.id = rr.participation_id
    where rr.race_id = p_race_id and pp.ghost_id = g.id;
  delete from elo_history where race_id = p_race_id;
  delete from results where race_id = p_race_id;
  -- Rembobiner aussi les badges gagnés SUR CETTE course, sinon un admin
  -- pourrait saisir un faux ordre favorable, encaisser les badges de perf,
  -- puis « corriger » vers la vérité en les conservant (badge-farming).
  -- award_badges les reconstruira à partir du classement corrigé.
  delete from user_badges where race_id = p_race_id;

  -- Re-saisie : repasser 'upcoming' puis rejouer le moteur (completed_at
  -- conservé via coalesce → la fenêtre 24 h reste ancrée à la validation initiale).
  update races set status = 'upcoming' where id = p_race_id;
  perform public.submit_race_results(p_race_id, p_order);
end $$;
revoke all on function public.correct_race_results(uuid, uuid[]) from public, anon;
grant execute on function public.correct_race_results(uuid, uuid[]) to authenticated;
