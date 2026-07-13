-- KartSquad — « Prendre les mêmes et on recommence » (revanche, atomique)
-- Une seule fonction serveur : crée la course + copie les pilotes dans une
-- même transaction (aucune course orpheline si ça échoue), applique la limite
-- quotidienne, exclut les pilotes bloqués, et réserve l'action aux pilotes de
-- la course source.

create or replace function public.rematch(p_source uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  src_circuit uuid;
  src_admin uuid;
  new_id uuid;
  cnt int;
begin
  select circuit_id, admin_id into src_circuit, src_admin from races where id = p_source;
  if src_admin is null then raise exception 'Course introuvable'; end if;

  -- Réservé à l'admin ou à un pilote (inscrit) de la course source.
  if src_admin <> me and not exists (
    select 1 from participations pp where pp.race_id = p_source and pp.profile_id = me
  ) then
    raise exception 'Seuls les pilotes de la course peuvent relancer';
  end if;

  -- Limite quotidienne (même règle que la création classique).
  select count(*) into cnt from races
    where admin_id = me and created_at >= date_trunc('day', now());
  if cnt >= 10 then raise exception 'Limite de courses par jour atteinte'; end if;

  insert into races (admin_id, circuit_id, scheduled_at)
    values (me, src_circuit, now())
    returning id into new_id;

  -- Copie des pilotes : les fantômes et moi toujours ; les autres comptes
  -- seulement s'il n'y a pas de blocage entre nous.
  insert into participations (race_id, profile_id, ghost_id)
  select new_id, pp.profile_id, pp.ghost_id
  from participations pp
  where pp.race_id = p_source
    and (
      pp.ghost_id is not null
      or pp.profile_id = me
      or not public.is_blocked(pp.profile_id, me)
    );

  return new_id;
end;
$$;

revoke all on function public.rematch(uuid) from public;
grant execute on function public.rematch(uuid) to authenticated;
