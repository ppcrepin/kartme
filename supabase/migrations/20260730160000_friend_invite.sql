-- KartSquad — A19 : lien d'amitié partageable.
--
-- Demande PO 2026-07-30 : « un lien qu'on puisse partager à quelqu'un pour
-- qu'il rejoigne l'application en tant qu'ami directement », y compris à
-- quelqu'un qui n'a pas encore l'app.
--
-- ── Décisions PO, appliquées telles quelles ───────────────────────────────
--   · UN TAP à l'arrivée : l'invité voit QUI l'invite et confirme lui-même.
--     Pas d'amitié créée à son insu, et aucun aller-retour de validation côté
--     invitant (il a consenti en fabriquant le lien).
--   · LIEN PERMANENT porté par l'identifiant du compte (pas de jeton
--     révocable). ⚠️ Conséquence assumée, consignée en dette : le lien ne peut
--     pas être coupé, et il est DÉDUCTIBLE de tout lien de course déjà partagé
--     (ceux-ci portent `?ref=<uid>` pour le parrainage). Restent le tap de
--     l'invité, le plafond horaire ci-dessous, la suppression d'amitié et le
--     blocage.
--   · Le MÊME lien sert aux nouveaux venus et aux pilotes déjà inscrits.
--
-- ── Pourquoi une RPC et pas un simple insert ──────────────────────────────
-- La RLS n'autorise l'insertion que `requester_id = auth.uid()` et le passage à
-- `accepted` que par le destinataire. Ici la relation naît directement
-- acceptée : légitime (les deux consentements existent) mais hors des règles
-- générales. On l'isole donc dans une fonction, avec ses propres garde-fous,
-- plutôt que d'élargir la RLS pour tout le monde.

begin;

-- ── 1. Qui m'invite ? ────────────────────────────────────────────────────
-- Affiché AVANT le tap : accepter une invitation sans savoir de qui elle vient
-- serait devenir l'ami d'un inconnu. `security definer` assumé et MINIMAL :
-- pseudo + photo d'un identifiant que l'appelant a déjà (il est dans l'URL),
-- rien d'autre — ni Elo, ni statistiques. Un profil privé est nommé ici, et
-- c'est voulu : il a fabriqué le lien lui-même.
--
-- `is_me` plutôt qu'une ligne absente : la première version filtrait
-- `p_inviter <> auth.uid()`, si bien que le PO ouvrant SON PROPRE lien pour le
-- vérifier lisait « Cette invitation n'est plus valable » — et l'écran « c'est
-- ton lien » était du code mort, inatteignable. Or c'est exactement le premier
-- geste de quiconque vient de générer un lien.
drop function if exists public.get_inviter(uuid);
create function public.get_inviter(p_inviter uuid)
returns table (id uuid, username text, avatar_path text, is_me boolean)
language sql stable security definer set search_path = public as $$
  -- `avatar_path` masqué pour un profil privé non-ami, comme le fait
  -- `get_pilot` : la règle du dépôt est de ne pas révéler au passage qu'un
  -- profil privé A une photo. Aucune fuite d'image n'était possible
  -- (`can_read_avatar` exige non-privé ou amitié acceptée, donc l'écran
  -- retombait déjà sur les initiales) — mais deux fonctions qui appliquent des
  -- règles différentes au même champ finissent par diverger pour de bon.
  select p.id, p.username,
         case when p.is_private and p.id <> auth.uid()
                   and not exists (
                     select 1 from friendships f
                      where f.status = 'accepted'
                        and ((f.requester_id = auth.uid() and f.addressee_id = p.id)
                          or (f.requester_id = p.id and f.addressee_id = auth.uid()))
                   )
              then null else p.avatar_path end,
         (p.id = auth.uid())
  from profiles p
  where p.id = p_inviter
    and p.deleted_at is null
    and p.suspended_at is null
    -- Un blocage reste indistinguable d'un lien mort : le serveur n'a pas à
    -- dire « ce compte existe mais te bloque ».
    and not public.is_blocked(p_inviter, auth.uid());
$$;
revoke all on function public.get_inviter(uuid) from public, anon;
grant execute on function public.get_inviter(uuid) to authenticated;

-- ── 2. Devenir ami en un tap ─────────────────────────────────────────────
-- Renvoie un CODE pour tout ce qui est un ÉTAT de l'invitation — 'ok',
-- 'already' (double tap, lien rouvert, deux onglets), 'self', 'gone' (lien
-- mort). Aucun n'est une panne : l'écran a une chose juste à afficher dans
-- chaque cas, et pour 'gone' il doit RETIRER le bouton, pas le laisser sous un
-- message d'erreur qui invite à retaper.
--
-- Deux chemins lèvent encore, et tous deux à bon droit :
--   · le plafond horaire — TRANSITOIRE, message actionnable (« réessaie dans un
--     moment »), et l'invitation reste valable ;
--   · l'invité lui-même SUSPENDU — le trigger `friendships_guard_suspended` est
--     `before insert`, il coupe avant l'écriture avec « Compte suspendu :
--     action impossible. ». Message français, donc l'écran le sert tel quel.
-- (« pas de session » lève aussi, mais la RPC n'est ouverte qu'à
-- `authenticated` : ce cas n'arrive que sur un jeton expiré entre le
-- chargement de l'écran et le tap.)
create or replace function public.accept_friend_invite(p_inviter uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_exist  record;
  v_name   text;
  v_recent int;
begin
  if v_me is null then
    raise exception 'Connexion requise.';
  end if;
  if p_inviter is null or p_inviter = v_me then
    -- Son propre lien : ce n'est pas une faute, mais il n'y a rien à faire.
    return 'self';
  end if;

  -- L'invitant doit être un compte vivant. Un compte supprimé est ANONYMISÉ et
  -- non effacé (leçon A5/A13) : sans ce filtre, on nouerait une amitié avec un
  -- fantôme réglementaire.
  --
  -- ⚠️ UNE SEULE réponse pour « inconnu », « parti », « suspendu » ET « te
  -- bloque ». Des réponses distinctes formaient un oracle FIN : « ce pilote
  -- n'est plus joignable » d'un côté, « impossible d'ajouter ce pilote » de
  -- l'autre, et l'on savait lequel des quatre cas s'appliquait.
  --
  -- Précision honnête sur ce que cela protège : `get_inviter` renvoie 0 ou 1
  -- ligne pour EXACTEMENT le même prédicat, donc le bit « ce compte est-il
  -- ajoutable ? » est de toute façon lisible par tout inscrit sur n'importe
  -- quel identifiant. Ce qui disparaît ici, c'est la DISTINCTION entre les
  -- quatre causes — la seule information réellement sensible, puisque c'est
  -- elle qui révèle un blocage.
  select username into v_name from profiles
   where id = p_inviter
     and deleted_at is null
     and suspended_at is null
     and not public.is_blocked(p_inviter, v_me);
  if v_name is null then
    return 'gone';
  end if;

  -- Relation déjà là, dans un sens ou l'autre ? TESTÉ AVANT le plafond :
  -- sinon un pilote qui a légitimement rempli son quota de l'heure ne peut même
  -- plus rouvrir un lien pour lire « vous étiez déjà amis ».
  select * into v_exist from friendships f
   where (f.requester_id = p_inviter and f.addressee_id = v_me)
      or (f.requester_id = v_me and f.addressee_id = p_inviter);

  if v_exist.id is not null then
    if v_exist.status = 'accepted' then
      return 'already';
    end if;
    -- Une demande dormait : le lien vaut acceptation, quel que soit le sens.
    update friendships set status = 'accepted' where id = v_exist.id;
    -- Dans CE sens (c'est l'invité qui avait demandé), `notify_friend` prévient
    -- l'invité — pas l'invitant, qui resterait dans le noir alors que c'est son
    -- lien qui vient de fonctionner. On le prévient donc explicitement.
    if v_exist.requester_id = v_me then
      perform public.enqueue_push(
        'friend_request', p_inviter, 'Ami confirmé 🤝',
        coalesce((select username from profiles where id = v_me), 'Un pilote')
          || ' a rejoint sur ton invitation.',
        'amis?invite', v_me);
    end if;
    return 'ok';
  end if;

  -- Anti-inondation : le lien est permanent et déductible d'autres liens
  -- (décision PO) — sans plafond, un script pourrait tenter des identifiants en
  -- masse. 20 acceptations par heure suffisent à une soirée karting et coupent
  -- l'usage automatisé.
  select count(*) into v_recent from friendships f
   where (f.requester_id = v_me or f.addressee_id = v_me)
     and f.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'Trop d''ajouts d''un coup. Réessaie dans un moment.';
  end if;

  -- L'INVITÉ est le demandeur, et non l'invitant. Deux raisons :
  --   · le trigger `friendships_rate_limit` du lot de durcissement plafonne à
  --     30 par heure PAR DEMANDEUR : avec l'invitant en demandeur, un lien
  --     partagé à une soirée épuisait SON quota, et le 31ᵉ invité lisait
  --     « Trop de demandes d'amis en une heure » — un message qui accuse
  --     quelqu'un n'ayant rien demandé, dans le scénario viral justement voulu ;
  --   · c'est l'invité qui agit ici : son quota, sa responsabilité.
  --
  -- `on conflict do nothing` : deux onglets ou deux appareils simultanés
  -- heurtaient l'index de paire, et le tap échouait en annonçant un refus alors
  -- que l'amitié venait d'être créée.
  insert into friendships (requester_id, addressee_id, status)
  values (v_me, p_inviter, 'accepted')
  on conflict do nothing;

  -- ⚠️ `notify_friend` ne réagit qu'à une demande `pending` puis à son
  -- acceptation : une amitié créée directement en `accepted` ne préviendrait
  -- PERSONNE. L'invitant doit savoir que son lien a fonctionné — c'est ce
  -- retour qui donne envie d'en partager d'autres.
  --
  -- URL « amis?invite » et non « amis » : l'index de déduplication porte sur
  -- (destinataire, type, url, acteur) parmi les non-lues, et « Demande d'ami »
  -- utilise déjà exactement cette clé. Sans ce décalage, l'annonce était AVALÉE
  -- et l'invitant gardait sous les yeux « X veut t'ajouter à son garage » alors
  -- qu'ils étaient déjà amis. Même parade que le lot A13.
  perform public.enqueue_push(
    'friend_request', p_inviter,
    'Ami confirmé 🤝',
    coalesce((select username from profiles where id = v_me), 'Un pilote')
      || ' a rejoint sur ton invitation.',
    'amis?invite',
    v_me);

  return 'ok';
end $$;
revoke all on function public.accept_friend_invite(uuid) from public, anon;
grant execute on function public.accept_friend_invite(uuid) to authenticated;

commit;
