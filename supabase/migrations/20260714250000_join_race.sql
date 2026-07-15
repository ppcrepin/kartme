-- KartSquad — UX : un invité peut REJOINDRE lui-même une course ouverte.
--
-- La RLS réserve l'écriture des participations à l'admin de la course ; sans ce
-- RPC, un pilote qui reçoit un lien de course ne peut que la regarder. Ici, un
-- inscrit s'ajoute lui-même à une course « à venir » (non clôturée), s'il n'est
-- pas déjà présent et qu'aucun blocage n'existe avec l'admin. La suspension est
-- déjà bloquée par le trigger guard_not_suspended sur l'insert de participation.
create or replace function public.join_race(p_race_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  select admin_id, status into v_admin, v_status from races where id = p_race_id;
  if v_admin is null then raise exception 'Course introuvable'; end if;
  if v_status <> 'upcoming' then raise exception 'Les inscriptions sont closes'; end if;
  if exists (select 1 from participations where race_id = p_race_id and profile_id = v_uid) then
    return; -- déjà inscrit : idempotent
  end if;
  if public.is_blocked(v_uid, v_admin) then
    raise exception 'Impossible de rejoindre cette course';
  end if;
  insert into participations (race_id, profile_id) values (p_race_id, v_uid);
end $$;
revoke all on function public.join_race(uuid) from public, anon;
grant execute on function public.join_race(uuid) to authenticated;

-- notify_invite adapté à l'auto-inscription : quand un pilote se rejoint lui-même
-- (new.profile_id = auth.uid()), on ne s'auto-notifie pas — on prévient l'ADMIN
-- qu'un pilote a rejoint sa course. Le reste (admin ajoute un ami) est inchangé.
create or replace function public.notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_circuit text; v_admin_name text; v_joiner text;
begin
  if new.profile_id is null then return new; end if;                -- fantôme : pas de compte
  select r.admin_id, c.name into v_admin, v_circuit
    from races r left join circuits c on c.id = r.circuit_id
    where r.id = new.race_id;
  if new.profile_id = v_admin then return new; end if;             -- l'admin s'ajoute lui-même
  if new.profile_id = auth.uid() then
    -- Auto-inscription (join_race) : prévenir l'admin, pas le joignant.
    select username into v_joiner from profiles where id = new.profile_id;
    perform public.enqueue_push(
      'invite', v_admin,
      'Nouveau pilote 🏎️',
      coalesce(v_joiner, 'Un pilote') || ' a rejoint ta course'
        || coalesce(' à ' || v_circuit, '') || '.',
      'race/' || new.race_id);
    return new;
  end if;
  -- Cas classique : l'admin a ajouté un pilote → on prévient ce pilote.
  select username into v_admin_name from profiles where id = v_admin;
  perform public.enqueue_push(
    'invite', new.profile_id,
    'Nouvelle course 🏁',
    coalesce(v_admin_name, 'Un pilote') || ' t’a mis sur la grille'
      || coalesce(' à ' || v_circuit, '') || '.',
    'race/' || new.race_id);
  return new;
end $$;
