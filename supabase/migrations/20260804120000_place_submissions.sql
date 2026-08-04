-- Phase 4: crowdsourced place submissions. Regular users still cannot write
-- directly to `places` (public read only, per the original migration) --
-- a submission lands here first. A human reviews it (flip `status` to
-- 'approved' or 'rejected' in the Supabase table editor), then
-- scripts/promote-submissions.mjs copies approved rows into the real
-- `places` table. Nothing reaches the live map without that step.

create table place_submissions (
  id             bigint generated always as identity primary key,
  submitted_by   uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  category       text not null,
  aliases        text[] default '{}',
  description    text,
  photo_url      text,
  lat            double precision not null,
  lng            double precision not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderator_note text,
  promoted_at    timestamptz,
  created_at     timestamptz default now()
);

alter table place_submissions enable row level security;

-- A submitter can create a submission and check its status, but can't edit
-- or delete it once sent, and can't see anyone else's -- moderation and
-- promotion happen with the service role, outside normal user access.
create policy "Users insert their own submissions" on place_submissions
  for insert with check (auth.uid() = submitted_by);
create policy "Users read their own submissions" on place_submissions
  for select using (auth.uid() = submitted_by);
