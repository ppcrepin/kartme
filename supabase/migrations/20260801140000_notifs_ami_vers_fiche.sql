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

commit;
