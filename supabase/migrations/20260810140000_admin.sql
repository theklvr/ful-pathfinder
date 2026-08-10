-- Admin role for the senior staff member who'll moderate content day to
-- day, instead of everyone continuing to use the raw Supabase table editor.
-- Deliberately just a boolean, not a separate roles/permissions system --
-- one moderator role is all this project needs right now.
alter table profiles add column is_admin boolean not null default false;

-- Admins can read every submission/suggestion, not just their own (the
-- existing owner-only policies on these tables stay as they are and
-- combine with this one via OR, per Postgres RLS's normal behavior for
-- multiple permissive policies).
create policy "Admins read all submissions" on place_submissions for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin));

create policy "Admins read all edit suggestions" on place_edit_suggestions for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin));

-- The actual approve/reject/promote actions run through api/admin/*.js
-- using the service role key (never exposed to the browser), which checks
-- admin status itself before doing anything -- these read policies exist so
-- the in-app admin UI can list pending items directly via the normal
-- client, without needing a serverless round trip just to display a queue.
