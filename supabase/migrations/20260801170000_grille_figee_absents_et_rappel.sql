-- ════════════════════════════════════════════════════════════════════════════
-- C11bis — DEUX conséquences de « valider la grille avant de saisir »
--
-- Depuis C11, figer la grille n'est plus une option discrète : c'est le SEUL
-- chemin vers la saisie du classement. Deux comportements qui étaient
-- inoffensifs quand personne ne clôturait deviennent la règle.
--
--   1. `lock_race` envoyait un rappel « Course bientôt 🏁 » à tous les
--      inscrits à la première clôture. Le parcours nominal est désormais :
--      on court, PUIS on valide la grille, PUIS on saisit. Tous les
--      participants recevaient donc une alerte poussée annonçant une course
--      « bientôt » qui a eu lieu deux heures plus tôt, avec sa date au passé
--      dans le corps du message.
--
--   2. Retirer un pilote qui n'est finalement pas venu était impossible sur
--      une grille figée (la policy exige `status = 'upcoming'`). L'étape
--      « Qui était présent ? » devenait donc inatteignable, et l'organisateur
--      dont trois invités sur huit ne se sont pas présentés n'avait plus que
--      « abandon » — ce qui est FAUX, ils n'ont pas couru — ou un
--      aller-retour par la réouverture des invitations.
--
-- La grille figée veut dire « elle ne GROSSIT plus ». Elle n'a jamais voulu
-- dire « on ne peut plus en retirer un absent ».
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ═══ 1. Le rappel ne part que si la course est ENCORE À VENIR ═════════════
-- Reprise fidèle de la fonction du lot « cycle de vie » (20260714150000), avec
-- une seule condition ajoutée : `v_when > now()`.
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

  -- Rappel envoyé une seule fois (à la PREMIÈRE clôture), et SEULEMENT si la
  -- course n'a pas encore eu lieu. `reminded_at` est posé dans tous les cas :
  -- c'est le drapeau « on a déjà eu l'occasion de prévenir », et le reposer à
  -- null ferait partir le rappel à la réouverture suivante.
  if v_reminded is null and v_when > now() then
    v_label := coalesce(' pour ' || v_circuit, '')
      || coalesce(' le ' || to_char(v_when at time zone 'Europe/Paris', 'DD/MM à HH24hMI'), '');
    perform public.enqueue_push('invite', pp.profile_id,
        'Course bientôt 🏁',
        'Tu es sur la grille' || v_label || '.',
        'race/' || p_race_id,
        v_admin)
    from participations pp
    where pp.race_id = p_race_id
      and pp.profile_id is not null
      and pp.profile_id <> v_admin;
  end if;
end;
$$;
revoke all on function public.lock_race(uuid) from public, anon;
grant execute on function public.lock_race(uuid) to authenticated;

-- ═══ 2. L'organisateur peut RETIRER un absent d'une grille figée ══════════
-- Une policy SÉPARÉE, et seulement pour `delete` : la policy générale continue
-- d'exiger `status = 'upcoming'` pour insérer et modifier, donc la grille ne
-- peut toujours pas grossir une fois figée. Postgres combine les policies d'une
-- même commande par OU.
drop policy if exists participations_admin_remove_locked on public.participations;
create policy participations_admin_remove_locked on public.participations
  for delete to authenticated
  using (exists (select 1 from public.races r
                 where r.id = race_id
                   and r.admin_id = auth.uid()
                   and r.status = 'locked'));

commit;
