-- KartSquad — A5 : centre de notifications in-app (cloche + boîte de réception).
--
-- Jusqu'ici, un événement (invitation, classement, demande d'ami, signalement)
-- ne partait QU'EN PUSH. Trois trous :
--   · le push web n'existe pas sur iOS hors PWA installée, et beaucoup de
--     pilotes refusent l'autorisation → l'événement est perdu, définitivement ;
--   · une notification poussée puis balayée n'est plus consultable ;
--   · aucun repère « il s'est passé quelque chose depuis ma dernière visite ».
--
-- On persiste donc chaque événement dans une BOÎTE DE RÉCEPTION. Point
-- d'injection unique : enqueue_push(), déjà appelée par TOUS les déclencheurs
-- (invitation, résultat, ami, signalement) — aucun trigger n'est réécrit, et
-- tout futur événement alimentera la boîte gratuitement.
--
-- Choix produit : la boîte enregistre TOUT, y compris les types désactivés dans
-- les préférences. Les préférences gouvernent l'INTRUSION (push sur l'écran de
-- verrouillage), pas la consultation passive. Couper « résultats » ne doit pas
-- effacer l'historique de ses propres courses.

-- ── 1. Table ───────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  -- Destination in-app (ex. « race/<uuid> », « amis »). Null = pas de cible.
  url         text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Index de la boîte : « mes notifications, récentes d'abord ».
create index if not exists notifications_inbox
  on public.notifications (profile_id, created_at desc);
-- Index partiel : le compteur de la cloche (non lues) est appelé à chaque
-- ouverture d'écran — il doit rester une lecture d'index, pas un scan.
create index if not exists notifications_unread
  on public.notifications (profile_id) where read_at is null;

alter table public.notifications enable row level security;

-- Lecture : les siennes uniquement.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (profile_id = auth.uid());

-- Marquage « lu » : autorisé sur les siennes. Le contenu reste figé (trigger
-- ci-dessous) — sans quoi un client pourrait réécrire title/body et se
-- fabriquer un faux message d'apparence officielle en vue d'une capture d'écran.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Suppression : on peut vider sa propre boîte.
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (profile_id = auth.uid());

-- Droits de table (la RLS restreint ensuite aux SIENNES). Pas d'INSERT :
-- seules les fonctions SECURITY DEFINER écrivent ici — sans quoi n'importe
-- quel client pourrait se forger un message d'allure officielle.
grant select, update, delete on public.notifications to authenticated;
revoke insert on public.notifications from authenticated, anon;
revoke all on public.notifications from anon;

-- ── 2. Immuabilité du contenu ──────────────────────────────────────────────
-- Seul read_at est modifiable par le destinataire ; le reste appartient au
-- serveur. On restaure silencieusement plutôt que de lever une exception :
-- l'app légitime ne touche jamais ces colonnes, une erreur ne servirait
-- qu'à faire échouer un marquage « lu » par ailleurs valide.
create or replace function public.guard_notification_update() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'authenticated') = 'service_role'
     or current_user = 'service_role' then
    return new;
  end if;
  new.profile_id := old.profile_id;
  new.type       := old.type;
  new.title      := old.title;
  new.body       := old.body;
  new.url        := old.url;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update before update on public.notifications
  for each row execute function public.guard_notification_update();

-- ── 3. Point d'injection unique : enqueue_push écrit AUSSI dans la boîte ───
-- (Reprise fidèle de la fonction du lot 2.4 ; l'insertion précède le garde
--  « config vide » : la boîte doit fonctionner même sans push configuré, c'est
--  précisément le cas des pilotes qui ont refusé l'autorisation.)
create or replace function public.enqueue_push(
  p_type text, p_recipient uuid, p_title text, p_body text, p_url text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  -- Boîte de réception (in-app) — inconditionnelle.
  -- On ignore les destinataires supprimés/anonymisés : la FK cascaderait de
  -- toute façon, autant ne pas écrire.
  insert into public.notifications (profile_id, type, title, body, url)
  select p_recipient, p_type, p_title, p_body, p_url
  from public.profiles pr
  where pr.id = p_recipient and pr.deleted_at is null;

  -- Push (intrusif) — seulement si l'Edge Function est configurée.
  select function_url, hook_secret into v_url, v_secret from public.push_config where id = 1;
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', coalesce(v_secret, '')),
    body := jsonb_build_object(
      'type', p_type, 'recipient', p_recipient,
      'title', p_title, 'body', p_body, 'url', p_url
    )
  );
end $$;
revoke all on function public.enqueue_push(text, uuid, text, text, text) from public, anon, authenticated;

-- ── 4. Compteur de la cloche ───────────────────────────────────────────────
-- Un RPC plutôt qu'un count() côté client : une seule requête, plafonnée à 99
-- (au-delà, la pastille affiche « 99+ » — inutile de compter 4 000 lignes).
create or replace function public.unread_notifications_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select 1 from public.notifications
    where profile_id = auth.uid() and read_at is null
    limit 100
  ) capped;
$$;
revoke all on function public.unread_notifications_count() from public, anon;
grant execute on function public.unread_notifications_count() to authenticated;

-- ── 5. Tout marquer comme lu ───────────────────────────────────────────────
-- Un RPC ensembliste : l'UPDATE client équivalent marcherait via RLS, mais
-- exigerait de connaître tous les ids et ferait autant d'allers-retours.
create or replace function public.mark_notifications_read()
returns void
language sql volatile security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where profile_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- ── 6. Purge : la boîte ne grossit pas indéfiniment ────────────────────────
-- Appelée à l'ouverture de la boîte (coût négligeable, index sur created_at) :
-- pas de cron à configurer, et la rétention est bornée côté RGPD
-- (« conservation limitée à ce qui est nécessaire »).
create or replace function public.list_notifications()
returns table (id uuid, type text, title text, body text, url text,
               read_at timestamptz, created_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
begin
  -- Alias obligatoire : « created_at » est aussi un paramètre OUT de cette
  -- fonction — sans qualification, PL/pgSQL lève « ambiguous ».
  delete from public.notifications n
  where n.profile_id = auth.uid() and n.created_at < now() - interval '90 days';

  return query
    select n.id, n.type, n.title, n.body, n.url, n.read_at, n.created_at
    from public.notifications n
    where n.profile_id = auth.uid()
    order by n.created_at desc
    limit 50;
end $$;
revoke all on function public.list_notifications() from public, anon;
grant execute on function public.list_notifications() to authenticated;

-- ── 7. RGPD : la boîte disparaît avec le compte ────────────────────────────
-- delete_my_account ANONYMISE en place (le profil SURVIT — le supprimer
-- cascaderait sur les résultats des autres pilotes et fausserait leur Elo) →
-- la cascade FK de notifications ne se déclenche JAMAIS. Purge explicite, au
-- même titre que les amitiés, blocages et abonnements push.
-- (Reprise fidèle de la fonction du lot 2.5 + une ligne au point 2.)
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non authentifié'; end if;

  -- 1) Anonymiser le profil (NE PAS le supprimer : ses résultats servent
  --    l'historique Elo des autres pilotes).
  update public.profiles
    set username = 'Joueur supprimé', is_private = true, deleted_at = now()
    where id = uid and deleted_at is null;

  -- 2) Effacer les données personnelles & sociales.
  delete from public.friendships where requester_id = uid or addressee_id = uid;
  delete from public.blocks where blocker_id = uid or blocked_id = uid;
  delete from public.push_subscriptions where profile_id = uid;
  delete from public.notification_preferences where profile_id = uid;
  delete from public.notifications where profile_id = uid;
  delete from public.reports where reporter_id = uid;
  delete from public.user_badges where profile_id = uid;

  -- 3) Neutraliser l'identité de connexion (best effort ; PII e-mail / OAuth).
  begin
    delete from auth.identities where user_id = uid;
    update auth.users
      set email = 'deleted+' || uid::text || '@kartsquad.invalid',
          encrypted_password = null,
          raw_user_meta_data = '{}'::jsonb
      where id = uid;
  exception when others then
    -- On NE masque PAS l'échec en silence : on le journalise. L'accès est déjà
    -- coupé (deleted_at + garde AuthProvider), mais un échec de purge de la PII
    -- e-mail/OAuth doit être visible dans les logs pour être corrigé (droits auth).
    raise warning 'delete_my_account : nettoyage de l''identité auth impossible pour % (%). deleted_at fait foi ; vérifier les droits sur le schéma auth.', uid, sqlerrm;
  end;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
