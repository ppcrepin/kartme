-- KartSquad — amis, blocage, signalements (lot 2.1)
-- friendships (demande → acceptée), blocks (empêche demandes & ajouts),
-- reports (boîte de modération), recherche de pilotes respectueuse de la
-- confidentialité, et visibilité « profil privé lisible par ses amis » (A6).

-- ── friendships ──────────────────────────────────────────────────────────
create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint friendship_not_self check (requester_id <> addressee_id),
  constraint friendship_status check (status in ('pending', 'accepted'))
);

-- Une seule relation par paire, quel que soit le sens.
create unique index friendships_pair_uniq on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create trigger friendships_updated_at before update on public.friendships
  for each row execute function public.set_updated_at();

-- ── blocks ───────────────────────────────────────────────────────────────
create table public.blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint block_not_self check (blocker_id <> blocked_id)
);

create unique index blocks_pair_uniq on public.blocks (blocker_id, blocked_id);

-- Vérifie un blocage dans un sens ou l'autre, en contournant la RLS
-- (l'utilisateur ne voit pas les blocages dont il est la cible).
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function public.is_blocked(uuid, uuid) from public;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

-- ── reports (boîte de modération, lue via le dashboard jusqu'au lot 3.1) ──
create table public.reports (
  id                   uuid primary key default gen_random_uuid(),
  reporter_id          uuid not null references public.profiles (id) on delete cascade,
  reported_profile_id  uuid references public.profiles (id) on delete set null,
  race_id              uuid references public.races (id) on delete set null,
  category             text not null,
  message              text,
  created_at           timestamptz not null default now(),
  constraint report_category check (category in ('comportement', 'fausse_course', 'classement', 'usurpation', 'autre')),
  constraint report_message_len check (message is null or char_length(message) <= 500)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.friendships enable row level security;
grant select, insert, update, delete on public.friendships to authenticated;

create policy friendships_select on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Envoi : je suis le demandeur, pas de blocage entre nous.
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and not public.is_blocked(requester_id, addressee_id));

-- Acceptation : seul le destinataire modifie la relation.
create policy friendships_update on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

-- Refus / annulation / retrait : chacun des deux peut supprimer.
create policy friendships_delete on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

alter table public.blocks enable row level security;
grant select, insert, delete on public.blocks to authenticated;

create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

alter table public.reports enable row level security;
grant insert on public.reports to authenticated;

-- Écriture seule : la lecture reste réservée à la modération (dashboard).
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- ── Blocage appliqué aux courses ─────────────────────────────────────────
-- Quelqu'un qui t'a bloqué (ou que tu as bloqué) ne peut pas t'ajouter
-- comme participant à ses courses.
drop policy participations_write_admin on public.participations;
create policy participations_write_admin on public.participations for all to authenticated
  using (exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid()))
  with check (
    exists (select 1 from public.races r where r.id = race_id and r.admin_id = auth.uid())
    and (profile_id is null or profile_id = auth.uid() or not public.is_blocked(profile_id, auth.uid()))
  );

-- ── Visibilité des profils privés (A6, complétée) ────────────────────────
-- Un profil privé devient lisible par ses amis ; une demande envoyée révèle
-- aussi le profil au destinataire (envoyer = consentir à être vu par lui).
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    not is_private
    or id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = profiles.id and f.addressee_id = auth.uid())
         or (f.addressee_id = profiles.id and f.requester_id = auth.uid())
    )
  );

-- L'historique d'Elo suit la même visibilité que le profil : on délègue à la
-- RLS de profiles (une seule source de vérité).
drop policy elo_history_select on public.elo_history;
create policy elo_history_select on public.elo_history for select to authenticated
  using (
    ghost_id is not null
    or exists (select 1 from public.profiles p where p.id = profile_id)
  );

-- ── Recherche & fiche pilote (privés : grade seulement, Elo bandé) ────────
-- elo renvoyé = exact pour un profil public/ami, sinon le plancher de son
-- grade (le grade reste affichable sans révéler le chiffre).
create or replace function public.search_pilots(q text)
returns table (id uuid, username text, elo integer, elo_exact boolean, is_private boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.username,
    case when p.is_private and p.id <> auth.uid() and not exists (
           select 1 from friendships f where f.status = 'accepted'
             and ((f.requester_id = p.id and f.addressee_id = auth.uid())
               or (f.addressee_id = p.id and f.requester_id = auth.uid()))
         )
      then case
        when p.elo >= 2100 then 2100
        when p.elo >= 1700 then 1700
        when p.elo >= 1300 then 1300
        when p.elo >= 1000 then 1000
        when p.elo >= 700 then 700
        else 100 end
      else p.elo
    end as elo,
    (not p.is_private) or p.id = auth.uid() or exists (
      select 1 from friendships f where f.status = 'accepted'
        and ((f.requester_id = p.id and f.addressee_id = auth.uid())
          or (f.addressee_id = p.id and f.requester_id = auth.uid()))
    ) as elo_exact,
    p.is_private
  from profiles p
  where p.id <> auth.uid()
    and not public.is_blocked(p.id, auth.uid())
    and p.username ilike '%' || q || '%'
  order by p.username
  limit 20;
$$;
revoke all on function public.search_pilots(text) from public;
grant execute on function public.search_pilots(text) to authenticated;

create or replace function public.get_pilot(p_id uuid)
returns table (id uuid, username text, elo integer, elo_exact boolean, is_private boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.username,
    case when p.is_private and p.id <> auth.uid() and not exists (
           select 1 from friendships f where f.status = 'accepted'
             and ((f.requester_id = p.id and f.addressee_id = auth.uid())
               or (f.addressee_id = p.id and f.requester_id = auth.uid()))
         )
      then case
        when p.elo >= 2100 then 2100
        when p.elo >= 1700 then 1700
        when p.elo >= 1300 then 1300
        when p.elo >= 1000 then 1000
        when p.elo >= 700 then 700
        else 100 end
      else p.elo
    end as elo,
    (not p.is_private) or p.id = auth.uid() or exists (
      select 1 from friendships f where f.status = 'accepted'
        and ((f.requester_id = p.id and f.addressee_id = auth.uid())
          or (f.addressee_id = p.id and f.requester_id = auth.uid()))
    ) as elo_exact,
    p.is_private
  from profiles p
  where p.id = p_id
    and not public.is_blocked(p.id, auth.uid());
$$;
revoke all on function public.get_pilot(uuid) from public;
grant execute on function public.get_pilot(uuid) to authenticated;
