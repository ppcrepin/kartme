-- KartSquad — lot 2.4 : notifications push (Web Push).
--
-- Deux tables :
--   · notification_preferences — un enregistrement par pilote : les 3
--     interrupteurs MVP (invitation / résultat / demande d'ami) + la plage de
--     silence (défaut 22h→8h, décision G4). Absence de ligne = tout activé.
--   · push_subscriptions — un enregistrement par appareil/navigateur abonné
--     (endpoint + clés de chiffrement Web Push). Un pilote peut en avoir
--     plusieurs (téléphone + ordinateur).
-- L'ENVOI (Edge Function) lira ces tables avec le service_role (hors RLS).
-- Ici la RLS ne protège que l'accès client : chacun ne voit/écrit que le sien.

-- ── Préférences ────────────────────────────────────────────────────────────
create table public.notification_preferences (
  profile_id       uuid primary key references public.profiles (id) on delete cascade,
  invites          boolean not null default true,
  results          boolean not null default true,
  friend_requests  boolean not null default true,
  -- Heures pleines [0..23]. Plage de silence [quiet_start, quiet_end) en heure
  -- locale Europe/Paris ; 22→8 signifie « rien de 22h00 à 07h59 ».
  quiet_start      int not null default 22,
  quiet_end        int not null default 8,
  updated_at       timestamptz not null default now(),
  constraint quiet_start_range check (quiet_start between 0 and 23),
  constraint quiet_end_range check (quiet_end between 0 and 23)
);

alter table public.notification_preferences enable row level security;
grant select, insert, update on public.notification_preferences to authenticated;

create policy notif_prefs_select on public.notification_preferences for select to authenticated
  using (profile_id = auth.uid());
create policy notif_prefs_insert on public.notification_preferences for insert to authenticated
  with check (profile_id = auth.uid());
create policy notif_prefs_update on public.notification_preferences for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── Abonnements push ───────────────────────────────────────────────────────
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  constraint endpoint_len check (char_length(endpoint) between 1 and 1000)
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy push_sub_select on public.push_subscriptions for select to authenticated
  using (profile_id = auth.uid());
create policy push_sub_insert on public.push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());
-- Update permis (upsert on conflict endpoint) tant que la ligne reste la mienne
-- avant ET après — on ne peut pas voler l'abonnement d'un autre.
create policy push_sub_update on public.push_subscriptions for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_sub_delete on public.push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());

-- Confort : garder updated_at à jour sur les préférences.
create trigger notif_prefs_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Enregistrement d'un abonnement : l'endpoint identifie le NAVIGATEUR, pas le
-- compte. Celui qui le contrôle (la session courante) en devient l'unique
-- propriétaire — on purge d'abord toute attribution antérieure (ex. un compte
-- précédent resté abonné sur un appareil partagé), ce qu'un simple upsert
-- client ne peut pas faire (la RLS l'empêche de toucher la ligne d'autrui).
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent);
end $$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
