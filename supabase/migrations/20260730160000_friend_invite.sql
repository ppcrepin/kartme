-- KartSquad — A19 : lien d'amitié partageable.
--
-- Demande PO 2026-07-30 : « un lien qu'on puisse partager à quelqu'un pour
-- qu'il rejoigne l'application en tant qu'ami directement », y compris à
-- quelqu'un qui n'a pas encore l'app.
--
-- ── Décisions PO, appliquées telles quelles ───────────────────────────────
--   · UN TAP à l'arrivée : l'invité voit QUI l'invite et confirme lui-même.
--     Pas d'amitié créée à son insu, et aucun aller-retour de validation
--     côté invitant (il a consenti en fabriquant le lien).
--   · LIEN PERMANENT porté par l'identifiant du compte (pas de jeton
--     révocable). ⚠️ Conséquence assumée et consignée en dette : le lien ne
--     peut pas être coupé, et il est DÉDUCTIBLE de tout lien de course déjà
--     partagé (ceux-ci portent `?ref=<uid>` pour le parrainage). La
--     protection restante est le tap de l'invité, plus la suppression
--     d'amitié et le blocage, tous deux déjà en place.
--   · Le MÊME lien sert aux nouveaux venus et aux pilotes déjà inscrits.
--
-- ── Pourquoi une RPC et pas un simple insert ──────────────────────────────
-- La RLS n'autorise l'insertion que `requester_id = auth.uid()` (« je suis le
-- demandeur ») et le passage à `accepted` que par le destinataire. Ici,
-- l'invité crée une relation où l'INVITANT est le demandeur, et directement
-- acceptée : c'est légitime (les deux consentements existent) mais hors des
-- règles générales. On l'isole donc dans une fonction, avec ses propres
-- garde-fous, plutôt que d'élargir la RLS pour tout le monde.

begin;

-- ── 1. Qui m'invite ? ────────────────────────────────────────────────────
-- Affiché AVANT le tap : accepter une invitation sans savoir de qui elle
-- vient serait devenir l'ami d'un inconnu. `security definer` assumé et
-- MINIMAL : pseudo + photo d'un identifiant déjà connu de l'appelant (il est
-- dans l'URL), rien d'autre — ni Elo, ni statistiques. Un profil privé est
-- nommé ici, et c'est voulu : il a fabriqué le lien lui-même.
create or replace function public.get_inviter(p_inviter uuid)
returns table (id uuid, username text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_path
  from profiles p
  where p.id = p_inviter
    and p.deleted_at is null
    and p.suspended_at is null
    and p_inviter <> auth.uid()
    and not public.is_blocked(p_inviter, auth.uid());
$$;
revoke all on function public.get_inviter(uuid) from public, anon;
grant execute on function public.get_inviter(uuid) to authenticated;

-- ── 2. Devenir ami en un tap ─────────────────────────────────────────────
-- Renvoie un CODE, pas une exception, pour les cas normaux : « déjà amis »
-- n'est pas une erreur (double tap, lien réouvert, deux onglets). Les vrais
-- refus (soi-même, compte parti, blocage, inondation) lèvent, eux, pour que
-- l'écran affiche un message et n'annonce pas une amitié qui n'existe pas.
create or replace function public.accept_friend_invite(p_inviter uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_exist record;
  v_name  text;
  v_recent int;
begin
  if v_me is null then
    raise exception 'Connexion requise.';
  end if;
  if p_inviter is null or p_inviter = v_me then
    -- Son propre lien : ce n'est pas une faute, mais rien à faire.
    return 'self';
  end if;

  -- L'invitant doit être un compte vivant. Un compte supprimé est ANONYMISÉ
  -- et non effacé (leçon A5/A13) : sans ce filtre, on nouerait une amitié
  -- avec un fantôme réglementaire.
  select username into v_name from profiles
   where id = p_inviter and deleted_at is null and suspended_at is null;
  if v_name is null then
    raise exception 'Ce pilote n’est plus joignable.';
  end if;

  if public.is_blocked(p_inviter, v_me) then
    raise exception 'Impossible d’ajouter ce pilote.';
  end if;

  -- Anti-inondation : le lien est permanent et déductible d'autres liens
  -- (décision PO) — sans plafond, un script pourrait tenter des identifiants
  -- en masse. 20 acceptations par heure suffisent largement à une soirée
  -- karting, et coupent l'usage automatisé.
  select count(*) into v_recent from friendships f
   where (f.requester_id = v_me or f.addressee_id = v_me)
     and f.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'Trop d’ajouts d’un coup. Réessaie dans un moment.';
  end if;

  -- Relation déjà là, dans un sens ou l'autre ?
  select * into v_exist from friendships f
   where (f.requester_id = p_inviter and f.addressee_id = v_me)
      or (f.requester_id = v_me and f.addressee_id = p_inviter);

  if v_exist.id is not null then
    if v_exist.status = 'accepted' then
      return 'already';
    end if;
    -- Une demande dormait : le lien vaut acceptation, quel que soit le sens.
    -- (Le trigger notify_friend prévient alors le demandeur d'origine.)
    update friendships set status = 'accepted' where id = v_exist.id;
    return 'ok';
  end if;

  -- L'INVITANT est le demandeur : c'est lui qui a lancé l'invitation.
  insert into friendships (requester_id, addressee_id, status)
  values (p_inviter, v_me, 'accepted');

  -- ⚠️ notify_friend ne réagit qu'à une demande `pending` puis à son
  -- acceptation : une amitié créée directement en `accepted` ne préviendrait
  -- PERSONNE. L'invitant doit savoir que son lien a fonctionné — c'est le
  -- retour qui donne envie d'en partager d'autres.
  perform public.enqueue_push(
    'friend_request', p_inviter,
    'Ami confirmé 🤝',
    coalesce((select username from profiles where id = v_me), 'Un pilote')
      || ' a rejoint sur ton invitation.',
    'amis',
    v_me);

  return 'ok';
end $$;
revoke all on function public.accept_friend_invite(uuid) from public, anon;
grant execute on function public.accept_friend_invite(uuid) to authenticated;

commit;
