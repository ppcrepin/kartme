-- KartSquad — C5 : les notifications d'amitié mènent à la FICHE du pilote.
--
-- L'onglet Amis a fusionné dans le classement (décision PO 2026-08-01) : la
-- liste d'amis ÉTAIT déjà ce classement en portée « Amis », et deux écrans
-- montraient les mêmes pilotes.
--
-- L'ancienne URL `amis` reste VALIDE — l'application garde une redirection vers
-- le classement, précisément parce que des notifications déjà envoyées la
-- portent et dorment dans les boîtes de réception. Cette migration ne répare
-- donc rien de cassé ; elle améliore les notifications à VENIR.
--
-- « Kévin veut t'ajouter à son garage » déposait sur un écran de liste, où il
-- fallait retrouver Kévin. En pointant sa fiche, le bouton « Accepter » est
-- sous le doigt à l'ouverture — un geste au lieu de trois. C'est le même
-- raisonnement que la correction de `settings/moderation` de juillet : une
-- notification doit mener à l'ENDROIT où l'on agit.

begin;

create or replace function public.notify_friend() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select username into v_name from profiles where id = new.requester_id;
    perform public.enqueue_push(
      'friend_request', new.addressee_id,
      'Demande d’ami', coalesce(v_name, 'Un pilote') || ' veut t’ajouter à son garage.',
      -- La fiche du DEMANDEUR : c'est elle qui porte « Accepter ».
      'pilot/' || new.requester_id,
      new.requester_id);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    select username into v_name from profiles where id = new.addressee_id;
    perform public.enqueue_push(
      'friend_request', new.requester_id,
      'Ami confirmé 🤝', coalesce(v_name, 'Un pilote') || ' a accepté ta demande.',
      -- La fiche de celui qui vient d'accepter : on va voir son Elo, pas une
      -- liste où il faudrait le chercher.
      'pilot/' || new.addressee_id,
      new.addressee_id);
  end if;
  return new;
end $$;

-- ═══ L'autre URL héritée : « amis?invite » ═══════════════════════════════
-- `accept_friend_invite` annonce à l'invitant que son lien a fonctionné, et
-- déposait sur la même liste. Le `?invite` n'est PAS décoratif : l'index de
-- déduplication porte sur (destinataire, type, url, acteur) parmi les non-lues,
-- et « Demande d'ami » utilise déjà cette clé. Sans décalage, l'annonce était
-- AVALÉE et l'invitant gardait sous les yeux « X veut t'ajouter » alors qu'ils
-- étaient déjà amis. On déplace donc la cible SANS toucher au discriminant.
--
-- Reprise fidèle de la fonction en vigueur (lot du lien d'ami) ; seules les
-- deux URL changent.
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
        'pilot/' || v_me || '?invite', v_me);
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
    'pilot/' || v_me || '?invite',
    v_me);

  return 'ok';
end $$;
revoke all on function public.accept_friend_invite(uuid) from public, anon;
grant execute on function public.accept_friend_invite(uuid) to authenticated;

commit;
