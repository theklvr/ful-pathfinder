-- Location sharing via link: a signed-in user starts a share, gets a link
-- built from this row's id (a UUID, unguessable -- the id itself is the
-- access control, same model Google Maps' own location-sharing links use),
-- and anyone with that link can view the position without needing an
-- account. Auto-expires (default 4 hours) rather than sharing indefinitely.

create extension if not exists pgcrypto;

create table location_shares (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  active     boolean not null default true,
  expires_at timestamptz not null default (now() + interval '4 hours'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table location_shares enable row level security;

-- Anyone with the link can read it, but only while it's genuinely still
-- active and not expired -- the link stops working on its own, not just
-- when the app happens to check.
create policy "Public read of active, unexpired shares" on location_shares
  for select using (active = true and expires_at > now());

-- The owner can also see their own shares even after they've stopped or
-- expired (e.g. to show "you're not currently sharing" state), and is the
-- only one who can create/update/stop one.
create policy "Owners manage their own shares" on location_shares for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
