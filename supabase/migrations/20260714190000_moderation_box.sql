-- KartSquad — lot 3.1b : boîte de modération (super-admin in-app).
--
-- Décisions PO 2026-07-14 : actions = marquer traité/rejeté · renommer le
-- pilote signalé · suspendre/réactiver (blocage SERVEUR dur) · supprimer la
-- course signalée (avec remise à zéro Elo si c'est sûr) ; accès réservé aux
-- modérateurs ; un push part vers les modérateurs à chaque signalement.

-- ── Statut de traitement des signalements ──────────────────────────────────
alter table public.reports add column if not exists status     text not null default 'open';
alter table public.reports add column if not exists handled_by uuid references public.profiles (id) on delete set null;
alter table public.reports add column if not exists handled_at timestamptz;
alter table public.reports drop constraint if exists report_status;
alter table public.reports add constraint report_status check (status in ('open', 'handled', 'dismissed'));

-- ── Suspension de compte (blocage serveur) ─────────────────────────────────
alter table public.profiles add column if not exists suspended_at timestamptz;

-- Helpers (SECURITY DEFINER : lisent des colonnes hors de la RLS de l'appelant).
create or replace function public.is_moderator(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_uid and is_moderator);
$$;
revoke all on function public.is_moderator(uuid) from public, anon;
grant execute on function public.is_moderator(uuid) to authenticated;

create or replace function public.is_suspended(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_uid and suspended_at is not null);
$$;
revoke all on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;

-- La colonne suspended_at n'est modifiable QUE par moderate_suspend (qui pose le
-- drapeau) ou le service_role : sinon un compte suspendu se dé-suspendrait via
-- un simple update de sa propre ligne (profiles_update_self l'autorise).
create or replace function public.guard_suspension() returns trigger
language plpgsql as $$
begin
  if new.suspended_at is distinct from old.suspended_at
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') <> 'service_role'
     and current_user <> 'service_role'
     and coalesce(current_setting('kartsquad.moderate_suspend', true), '') <> '1' then
    raise exception 'La suspension ne peut pas être modifiée directement';
  end if;
  return new;
end $$;
create trigger profiles_guard_suspension before update of suspended_at on public.profiles
  for each row execute function public.guard_suspension();

-- Blocage serveur : un compte suspendu ne peut plus agir — ni créer NI modifier
-- (créer/éditer/supprimer une course, ajouter/retirer un pilote, saisir/corriger
-- un classement, clôturer/rouvrir, demander/accepter un ami, créer un
-- circuit/fantôme, signaler). auth.uid() NULL (seed/service) → passe.
-- return coalesce(new, old) : sur un DELETE, `new` est NULL — renvoyer NULL
-- ANNULERAIT la suppression ; on renvoie `old` pour la laisser passer.
create or replace function public.guard_not_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_suspended(auth.uid()) then
    raise exception 'Compte suspendu : action impossible.';
  end if;
  return coalesce(new, old);
end $$;

create trigger races_guard_suspended before insert or update or delete on public.races
  for each row execute function public.guard_not_suspended();
create trigger participations_guard_suspended before insert or update or delete on public.participations
  for each row execute function public.guard_not_suspended();
create trigger results_guard_suspended before insert or update or delete on public.results
  for each row execute function public.guard_not_suspended();
create trigger friendships_guard_suspended before insert or update on public.friendships
  for each row execute function public.guard_not_suspended();
create trigger circuits_guard_suspended before insert on public.circuits
  for each row execute function public.guard_not_suspended();
create trigger ghost_guard_suspended before insert on public.ghost_profiles
  for each row execute function public.guard_not_suspended();
create trigger reports_guard_suspended before insert on public.reports
  for each row execute function public.guard_not_suspended();

-- ── Lecture des signalements (modérateur only) ─────────────────────────────
create or replace function public.list_reports(p_only_open boolean default false)
returns table (
  id uuid, category text, message text, status text, created_at timestamptz,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text, reported_suspended boolean,
  race_id uuid, race_circuit text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.category, r.message, r.status, r.created_at,
         r.reporter_id, rep.username,
         r.reported_profile_id, tgt.username, (tgt.suspended_at is not null),
         r.race_id, c.name
  from reports r
  left join profiles rep on rep.id = r.reporter_id
  left join profiles tgt on tgt.id = r.reported_profile_id
  left join races ra on ra.id = r.race_id
  left join circuits c on c.id = ra.circuit_id
  where public.is_moderator(auth.uid())
    and (not p_only_open or r.status = 'open')
  order by (r.status = 'open') desc, r.created_at desc;
$$;
revoke all on function public.list_reports(boolean) from public, anon;
grant execute on function public.list_reports(boolean) to authenticated;

-- Compteur pour la pastille « Modération (n) » dans les Réglages.
create or replace function public.count_open_reports() returns integer
language sql stable security definer set search_path = public as $$
  select case when public.is_moderator(auth.uid())
              then (select count(*)::int from reports where status = 'open')
              else 0 end;
$$;
revoke all on function public.count_open_reports() from public, anon;
grant execute on function public.count_open_reports() to authenticated;

-- ── Actions de modération (toutes gardées par is_moderator) ────────────────
create or replace function public.moderate_resolve(p_report_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if p_status not in ('handled', 'dismissed', 'open') then raise exception 'Statut invalide'; end if;
  update reports set status = p_status,
                     handled_by = case when p_status = 'open' then null else auth.uid() end,
                     handled_at = case when p_status = 'open' then null else now() end
    where id = p_report_id;
end $$;
revoke all on function public.moderate_resolve(uuid, text) from public, anon;
grant execute on function public.moderate_resolve(uuid, text) to authenticated;

-- Renomme le pseudo d'un pilote (nom neutre imposé, filtre de mots appliqué par
-- le trigger clean_name). On force is_private inchangé.
create or replace function public.moderate_rename_pilot(p_profile_id uuid, p_new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if p_profile_id is null then raise exception 'Pilote introuvable'; end if;
  update profiles set username = p_new_name where id = p_profile_id;
end $$;
revoke all on function public.moderate_rename_pilot(uuid, text) from public, anon;
grant execute on function public.moderate_rename_pilot(uuid, text) to authenticated;

-- Suspend / réactive un compte. Impossible de suspendre un modérateur (garde-fou).
create or replace function public.moderate_suspend(p_profile_id uuid, p_suspend boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Réservé à la modération'; end if;
  if p_suspend and exists (select 1 from profiles where id = p_profile_id and is_moderator) then
    raise exception 'Impossible de suspendre un modérateur';
  end if;
  perform set_config('kartsquad.moderate_suspend', '1', true);   -- autorise l'écriture de suspended_at
  update profiles set suspended_at = case when p_suspend then now() else null end
    where id = p_profile_id;
  perform set_config('kartsquad.moderate_suspend', '', true);    -- referme aussitôt (pas de fuite)
end $$;
revoke all on function public.moderate_suspend(uuid, boolean) from public, anon;
grant execute on function public.moderate_suspend(uuid, boolean) to authenticated;

-- Supprime une course signalée. Si elle est terminée, on remet l'Elo à zéro
-- (restauration elo_before) UNIQUEMENT si aucun pilote n'a couru depuis — sinon
-- refus (l'Elo « à chemin » serait corrompu). La cascade retire participations,
-- résultats, historique ; on efface aussi les badges gagnés sur cette course.
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
  end if;

  delete from races where id = p_race_id;   -- cascade : participations, results, elo_history
end $$;
revoke all on function public.moderate_delete_race(uuid) from public, anon;
grant execute on function public.moderate_delete_race(uuid) to authenticated;

-- ── Push au(x) modérateur(s) à chaque nouveau signalement ──────────────────
create or replace function public.notify_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat text;
begin
  v_cat := case new.category
             when 'comportement' then 'Comportement'
             when 'fausse_course' then 'Fausse course'
             when 'classement' then 'Classement truqué'
             when 'usurpation' then 'Usurpation'
             else 'Signalement'
           end;
  perform public.enqueue_push('report', p.id,
      'Nouveau signalement 🚩',
      v_cat || ' à examiner.',
      'moderation')
  from profiles p
  where p.is_moderator and p.id <> new.reporter_id;   -- pas de push si un modérateur se signale lui-même
  return new;
end $$;

create trigger reports_notify_moderators after insert on public.reports
  for each row execute function public.notify_report();
